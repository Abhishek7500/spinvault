import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import QRCode from 'qrcode';
import { Receipt, ReceiptService } from './core/services/receipt.service';
import { analyzeSpend, buildDisputeEmail, getReturnWindowDays, makeReceiptQrPayload } from './core/receipt-tools';
import { PriceDropTracker } from './core/price-drop-tracker';

type View = 'tracker' | 'insights' | 'warranties' | 'profile';
type Period = 'week' | 'month';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly receiptsApi = inject(ReceiptService);
  private readonly priceDropTracker = new PriceDropTracker();

  readonly views: { id: View; label: string; icon: string }[] = [
    { id: 'tracker', label: 'Tracker', icon: '▤' },
    { id: 'insights', label: 'Insights', icon: '↗' },
    { id: 'warranties', label: 'Warranties', icon: '⬡' },
    { id: 'profile', label: 'Profile', icon: '◎' }
  ];
  activeView: View = 'tracker';
  period: Period = 'week';
  receipts: Receipt[] = [];
  selectedReceipt: Receipt | null = null;
  receiptQr = '';
  loading = true;
  scanning = false;
  error = '';
  success = '';
  email = '';
  emailSent = false;
  customDeadline = '';
  readonly today = new Date();
  private pollingHandle: number | null = null;
  private polling = false;

  get totalSpend(): number {
    return this.receipts.reduce((sum, receipt) => sum + receipt.total_amount, 0);
  }

  get refundTotal(): number {
    return this.receipts.reduce((sum, receipt) => {
      const returnWindowOpen = receipt.status === 'active' && receipt.return_deadline !== null &&
        new Date(`${receipt.return_deadline}T23:59:59`) >= this.today;
      if (!returnWindowOpen) return sum;
      return sum + receipt.items.reduce((itemSum, item) => {
        const alert = item.price_alert;
        return itemSum + (alert?.status === 'active' ? Math.max(alert.original_price - alert.lowest_found_price, 0) * item.quantity : 0);
      }, 0);
    }, 0);
  }

  get maxCategorySpend(): number {
    return Math.max(...this.spendSummary.map((entry) => entry.current), 1);
  }

  get currentPeriodSpend(): number {
    return this.spendSummary.reduce((sum, entry) => sum + entry.current, 0);
  }

  get activeReturns(): Receipt[] {
    return this.receipts.filter((receipt) => receipt.return_deadline && new Date(`${receipt.return_deadline}T23:59:59`) >= this.today);
  }

  get activeWarranties(): Receipt[] {
    return this.receipts.filter((receipt) => receipt.warranty_expiration && new Date(`${receipt.warranty_expiration}T23:59:59`) >= this.today);
  }

  get spendSummary() {
    return analyzeSpend(this.receipts, this.period);
  }

  get alias(): string {
    return this.receiptsApi.profile?.unique_email_alias ?? 'Sign in to generate your alias';
  }

  get isSignedIn(): boolean {
    return Boolean(this.receiptsApi.profile);
  }

  ngOnInit(): void {
    void this.loadReceipts();
    this.pollingHandle = window.setInterval(() => {
      if (this.receiptsApi.user && !this.polling && !this.loading) {
        void this.pollPriceDrops().catch((error: unknown) => {
          this.error = this.errorMessage(error);
        });
      }
    }, 6 * 60 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.pollingHandle !== null) window.clearInterval(this.pollingHandle);
  }

  async loadReceipts(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.receipts = await this.receiptsApi.loadReceipts();
      if (this.receiptsApi.user) {
        await this.pollPriceDrops();
      }
    } catch (error) {
      this.error = this.errorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  setView(view: View): void {
    this.activeView = view;
    this.success = '';
  }

  sortLatest(): void {
    this.receipts = this.receipts.slice().sort((left, right) =>
      right.purchase_date.localeCompare(left.purchase_date)
    );
  }

  openCamera(input: HTMLInputElement): void {
    input.click();
  }

  async onImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const image = input.files?.[0];
    if (!image) return;
    input.value = '';
    if (!this.isSignedIn) {
      this.error = 'Sign in from Profile before scanning and saving receipts.';
      this.activeView = 'profile';
      return;
    }
    if (!image.type.startsWith('image/')) {
      this.error = 'Choose a receipt photo in an image format.';
      return;
    }
    this.scanning = true;
    this.error = '';
    this.success = '';
    try {
      const scanned = await this.receiptsApi.scanReceipt(image);
      this.receipts = [scanned, ...this.receipts];
      this.selectedReceipt = scanned;
      this.customDeadline = scanned.return_deadline ?? '';
      this.success = 'Receipt scanned and saved. Check the return and warranty dates below.';
      await this.refreshQr(scanned);
      await this.pollPriceDrops();
    } catch (error) {
      this.error = this.errorMessage(error);
    } finally {
      this.scanning = false;
    }
  }

  async selectReceipt(receipt: Receipt): Promise<void> {
    this.selectedReceipt = receipt;
    this.customDeadline = receipt.return_deadline ?? '';
    this.error = '';
    await this.refreshQr(receipt);
  }

  closeReceipt(): void {
    this.selectedReceipt = null;
    this.receiptQr = '';
  }

  async saveCustomWindow(): Promise<void> {
    const receipt = this.selectedReceipt;
    if (!receipt || !this.customDeadline) {
      this.error = 'Choose a return deadline on the calendar.';
      return;
    }
    const days = Math.round((new Date(`${this.customDeadline}T12:00:00`).getTime() - new Date(`${receipt.purchase_date}T12:00:00`).getTime()) / 86_400_000);
    if (!Number.isInteger(days) || days < 0 || days > 3650) {
      this.error = 'Choose a date on or after the purchase date, within 10 years.';
      return;
    }
    try {
      const updated = await this.receiptsApi.updateReturnWindow(receipt.id, days, receipt.purchase_date);
      this.receipts = this.receipts.map((item) => item.id === updated.id ? updated : item);
      this.selectedReceipt = updated;
      this.customDeadline = updated.return_deadline ?? '';
      await this.refreshQr(updated);
      this.success = 'Custom return window saved.';
      this.error = '';
    } catch (error) {
      this.error = this.errorMessage(error);
    }
  }

  async signIn(): Promise<void> {
    this.error = '';
    this.success = '';
    try {
      await this.receiptsApi.sendSignInLink(this.email);
      this.emailSent = true;
    } catch (error) {
      this.error = this.errorMessage(error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.receiptsApi.signOut();
      this.receipts = [];
      this.selectedReceipt = null;
      this.emailSent = false;
      this.success = 'You have been signed out.';
    } catch (error) {
      this.error = this.errorMessage(error);
    }
  }

  async copyAlias(): Promise<void> {
    if (!this.isSignedIn) return;
    try {
      await navigator.clipboard.writeText(this.alias);
      this.success = 'Email alias copied.';
    } catch (error) {
      this.error = `Could not copy the alias: ${this.errorMessage(error)}`;
    }
  }

  async packageDispute(receipt: Receipt): Promise<void> {
    const message = buildDisputeEmail(receipt);
    try {
      await navigator.clipboard.writeText(message.body);
      this.success = 'Dispute evidence copied. Your email draft is ready to open.';
    } catch (error) {
      this.error = `Could not copy dispute evidence: ${this.errorMessage(error)}`;
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
  }

  getReturnDays(receipt: Receipt): number | null {
    if (!receipt.return_deadline) return null;
    return this.calendarDaysUntil(receipt.return_deadline);
  }

  getWarrantyDays(receipt: Receipt): number | null {
    if (!receipt.warranty_expiration) return null;
    return this.calendarDaysUntil(receipt.warranty_expiration);
  }

  retailerWindow(receipt: Receipt): number | null {
    return getReturnWindowDays(receipt.store_name);
  }

  categoryIcon(category: string): string {
    const key = category.toLowerCase();
    if (key.includes('elect')) return '⌘';
    if (key.includes('groc')) return '◒';
    if (key.includes('cloth') || key.includes('apparel')) return '✳';
    if (key.includes('home')) return '⌂';
    return '✦';
  }

  categoryColor(index: number): string {
    return ['#9df0c6', '#d2b7ff', '#ffd29e', '#f4a8ba', '#9eddf4'][index % 5];
  }

  private async refreshQr(receipt: Receipt): Promise<void> {
    try {
      this.receiptQr = await QRCode.toDataURL(JSON.stringify(makeReceiptQrPayload(receipt)), {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 220,
        color: { dark: '#17221d', light: '#ffffff' }
      });
    } catch (error) {
      this.receiptQr = '';
      this.error = `Could not create the return pass QR code: ${this.errorMessage(error)}`;
    }
  }

  private async pollPriceDrops(): Promise<void> {
    if (this.polling) return;
    const alerts = this.priceDropTracker.check(this.receipts);
    if (alerts.length === 0) return;
    this.polling = true;
    try {
      const updates = await this.receiptsApi.savePriceAlerts(alerts);
      this.receipts = this.receipts.map((receipt) => ({
        ...receipt,
        items: receipt.items.map((item) => {
          const alert = updates.find((entry) => entry.receipt_item_id === item.id);
          return alert ? { ...item, price_alert: alert } : item;
        })
      }));
    } finally {
      this.polling = false;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  }

  private calendarDaysUntil(date: string): number {
    const deadline = new Date(`${date}T12:00:00`);
    const today = new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate(), 12);
    return Math.max(Math.round((deadline.getTime() - today.getTime()) / 86_400_000), 0);
  }
}
