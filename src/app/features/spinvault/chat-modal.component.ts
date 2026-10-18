import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  SpinVaultIdentity,
  SpinVaultMessage,
  SpinVaultPaymentMethod,
  SpinVaultService
} from '../../core/services/spinvault.service';

@Component({
  selector: 'app-chat-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (open) {
      <div class="chat-backdrop" (click)="close()">
        <section class="chat-panel" role="dialog" aria-modal="true" aria-labelledby="chat-heading" (click)="$event.stopPropagation()">
          <header class="chat-header">
            <div class="chat-avatar">S<span></span></div>
            <div class="chat-heading"><h2 id="chat-heading">{{ identity ? 'SpinVault support' : 'Welcome to SpinVault' }}</h2><p>{{ identity ? 'We’re here and ready to help' : 'Sign in to start a private chat' }}</p></div>
            <button class="chat-close" type="button" aria-label="Close chat" (click)="close()">×</button>
          </header>

          @if (!identity) {
            <div class="auth-content">
              <div class="auth-tabs"><button type="button" [class.active]="mode === 'login'" (click)="mode = 'login'; error = ''">Log in</button><button type="button" [class.active]="mode === 'signup'" (click)="mode = 'signup'; error = ''">Create account</button></div>
              <p class="auth-intro">{{ mode === 'login' ? 'Sign in to message our team directly.' : 'Create an account and get connected with our team.' }}</p>
              @if (mode === 'signup') {
                <label>Username<input [(ngModel)]="username" name="username" autocomplete="username" placeholder="Your player name" /></label>
              }
              <label>Email address<input [(ngModel)]="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" /></label>
              <label>Password<input [(ngModel)]="password" name="password" type="password" [autocomplete]="mode === 'login' ? 'current-password' : 'new-password'" placeholder="At least 8 characters" /></label>
              @if (error) { <p class="chat-error" role="alert">{{ error }}</p> }
              <button class="chat-submit" type="button" [disabled]="busy" (click)="submitAuth()">{{ busy ? 'Please wait…' : mode === 'login' ? 'Log in and chat' : 'Create account' }} <span>→</span></button>
              <p class="auth-note">Your conversation is private and only visible to you and the SpinVault team.</p>
            </div>
          } @else if (identity.role === 'admin') {
            <div class="chat-state"><span class="state-icon">✦</span><h3>You’re signed in as an admin.</h3><p>Open the admin dashboard to manage player conversations.</p><a routerLink="/admin">Go to admin dashboard →</a></div>
          } @else {
            <div class="chat-body">
              @if (error) { <p class="chat-error chat-inline-error" role="alert">{{ error }}</p> }
              <div class="chat-messages" aria-live="polite">
                @if (!messages.length && !busy) {
                  <div class="chat-empty"><span>✦</span><p>Hey {{ identity.username }}! What can we help you with?</p><small>Only you and our support team can see this chat.</small></div>
                }
                @for (message of messages; track message.id) {
                  <article class="message-row" [class.message-mine]="message.sender_id === identity.id">
                    <div class="message-bubble">
                      @if (message.request_type) { <span class="request-tag">{{ message.request_type === 'load' ? 'LOAD REQUEST' : 'CASH-OUT REQUEST' }}</span> }
                      <p>{{ message.content }}</p>
                      @if (message.attachment_url) { <a class="chat-image-link" [href]="message.attachment_url" target="_blank" rel="noopener noreferrer"><img class="chat-image" [src]="message.attachment_url" [alt]="message.attachment_name || 'Chat image'" loading="lazy" /></a> }
                      @if (message.request_status) { <span class="request-status">Status: {{ message.request_status.replace('_', ' ') }}</span> }
                      <time>{{ message.created_at | date:'shortTime' }}</time>
                    </div>
                  </article>
                }
                @if (busy && !messages.length) { <p class="chat-loading">Connecting to your private chat…</p> }
              </div>
              <div class="quick-actions">
                <button type="button" [class.selected]="requestType === 'load'" (click)="toggleRequest('load')">＋ Request load</button>
                <button type="button" [class.selected]="requestType === 'cashout'" (click)="toggleRequest('cashout')">↗ Request cash-out</button>
              </div>
              @if (paymentMethods.length) {
                <details class="payment-details">
                  <summary>Available payment options <span>⌄</span></summary>
                  @for (method of paymentMethods; track method.id) {
                    <article class="payment-option">
                      <div><strong>{{ method.name }}</strong><p>{{ method.instructions }}</p></div>
                      @if (method.qr_code_url) { <a [href]="method.qr_code_url" target="_blank" rel="noopener noreferrer"><img [src]="method.qr_code_url" [alt]="method.name + ' QR code'" loading="lazy" /></a> }
                    </article>
                  }
                </details>
              }
              @if (requestType) {
                <form class="request-form" (ngSubmit)="sendRequest()">
                  <label>Amount ($)<input name="amount" [(ngModel)]="requestAmount" inputmode="decimal" type="number" min="0.01" step="0.01" /></label>
                  <button type="submit" [disabled]="busy">Send {{ requestType === 'load' ? 'load' : 'cash-out' }} request</button>
                </form>
              } @else {
                <form class="chat-composer" (ngSubmit)="sendText()">
                  <input name="draft" [(ngModel)]="draft" placeholder="Write a message…" aria-label="Write a message" autocomplete="off" />
                  <label class="chat-image-button" [class.uploading]="uploading" title="Attach an image">
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" (change)="sendImage($event)" [disabled]="busy || uploading" />
                    {{ uploading ? '…' : '▧' }}
                  </label>
                  <button type="submit" [disabled]="busy || !draft.trim()" aria-label="Send message">↑</button>
                </form>
              }
            </div>
          }
        </section>
      </div>
    }
  `,
  styles: [`
    :host{font-family:Inter,ui-sans-serif,system-ui,sans-serif}.chat-backdrop{position:fixed;inset:0;z-index:50;background:rgba(4,5,16,.78);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;padding:0}.chat-panel{width:100%;height:min(720px,94dvh);border:1px solid rgba(0,243,255,.24);border-bottom:0;border-radius:20px 20px 0 0;background:#111226;color:#f8f7ff;box-shadow:0 0 60px rgba(0,243,255,.08);display:flex;flex-direction:column;overflow:hidden}
    .chat-header{height:76px;flex:none;padding:0 19px;display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(100deg,rgba(255,0,127,.08),rgba(0,243,255,.025))}
    .chat-avatar{width:39px;height:39px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(145deg,#ff007f,#8632c5);font-size:17px;font-weight:850;position:relative}.chat-avatar span{position:absolute;width:9px;height:9px;bottom:-2px;right:-2px;border:2px solid #111226;border-radius:50%;background:#2de6a3}
    .chat-heading{flex:1}.chat-heading h2{font-size:14px;margin:0}.chat-heading p{font-size:10px;color:#9291a9;margin:5px 0 0}.chat-close{width:31px;height:31px;border-radius:50%;border:1px solid rgba(255,255,255,.11);background:#1a1b31;color:#b9b8ca;font-size:23px;line-height:22px;cursor:pointer}
    .auth-content{padding:22px 21px 24px;overflow:auto}.auth-tabs{display:grid;grid-template-columns:1fr 1fr;padding:4px;border-radius:9px;background:#1a1b31}.auth-tabs button{height:35px;border:0;background:transparent;border-radius:7px;color:#9291a9;font-size:11px;font-weight:700;cursor:pointer}.auth-tabs button.active{background:#292a45;color:#fff;box-shadow:0 2px 9px #0a0b18}
    .auth-intro{color:#a3a2b7;font-size:11px;margin:18px 0}.auth-content label{display:block;color:#c6c5d6;font-size:10px;font-weight:650;margin-top:13px}.auth-content input{display:block;width:100%;height:43px;margin-top:7px;padding:0 12px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#17182d;color:#fff;font:inherit;font-size:12px;outline:none}.auth-content input:focus{border-color:#00cbd8}
    .chat-submit{width:100%;height:44px;margin-top:19px;display:flex;justify-content:space-between;align-items:center;padding:0 14px;border:0;border-radius:8px;background:linear-gradient(100deg,#ff007f,#cc079c);color:#fff;font-size:11px;font-weight:800;cursor:pointer}.chat-submit:disabled{opacity:.6}.auth-note{text-align:center;color:#77768d;font-size:9px;line-height:1.6;margin:14px 8px 0}
    .chat-error{padding:10px;border:1px solid rgba(255,100,120,.2);border-radius:7px;background:rgba(255,60,90,.07);color:#ff9baa;font-size:10px;line-height:1.5}.chat-state{margin:auto;padding:25px;text-align:center}.state-icon{font-size:30px;color:#00f3ff}.chat-state h3{font-size:16px}.chat-state p{color:#9a99ae;font-size:12px;line-height:1.6}.chat-state a{color:#00e7ef;font-size:12px;text-decoration:none}
    .chat-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:0 14px 12px}.chat-inline-error{margin:10px 0 0}.chat-messages{flex:1;overflow-y:auto;padding:15px 3px}.chat-empty{margin:58px auto 0;max-width:240px;text-align:center}.chat-empty>span{font-size:27px;color:#ff399e}.chat-empty p{font-size:13px;line-height:1.6}.chat-empty small{font-size:10px;color:#75748b;line-height:1.5}.chat-loading{text-align:center;color:#8f8ea4;font-size:10px;margin:25px 0}
    .message-row{display:flex;justify-content:flex-start;margin:9px 0}.message-row.message-mine{justify-content:flex-end}.message-bubble{max-width:84%;padding:10px 12px;border:1px solid rgba(255,255,255,.07);border-radius:12px 12px 12px 3px;background:#1b1d35}.message-mine .message-bubble{border-color:rgba(255,0,127,.22);border-radius:12px 12px 3px 12px;background:linear-gradient(130deg,rgba(255,0,127,.15),rgba(107,30,117,.2))}.message-bubble p{margin:0;font-size:11px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.message-bubble time{display:block;color:#818098;text-align:right;font-size:8px;margin-top:5px}.request-tag{display:inline-block;color:#00e1e9;font-size:8px;font-weight:850;letter-spacing:.8px;margin-bottom:6px}.request-status{display:block;margin-top:6px;color:#b8b5cd;font-size:8px;text-transform:capitalize}
    .quick-actions{display:flex;gap:7px;margin-bottom:9px}.quick-actions button{height:34px;flex:1;border:1px solid rgba(0,243,255,.2);border-radius:7px;background:rgba(0,243,255,.045);color:#83edf1;font-size:9px;font-weight:700;cursor:pointer}.quick-actions button.selected{border-color:#ff2c93;background:rgba(255,0,127,.1);color:#ff85c1}
    .chat-composer{display:flex;gap:8px;padding:7px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#18192e}.chat-composer input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#fff;padding:0 5px;font:inherit;font-size:11px}.chat-composer input::placeholder{color:#77768c}.chat-composer button{height:33px;width:36px;border:0;border-radius:7px;background:#ff168b;color:white;font-size:17px;font-weight:800;cursor:pointer}.chat-composer button:disabled{opacity:.4}
    .chat-image-link{display:block;margin-top:7px}.chat-image{display:block;max-width:210px;max-height:180px;border-radius:7px;object-fit:contain}.chat-image-button{height:33px;width:34px;flex:none;display:grid;place-items:center;border:1px solid rgba(0,243,255,.16);border-radius:7px;color:#7cebf0;font-size:16px;cursor:pointer}.chat-image-button input{display:none}.chat-image-button.uploading{opacity:.55}
    .payment-details{flex:none;max-height:115px;overflow:auto;margin:0 0 9px;border:1px solid rgba(255,255,255,.075);border-radius:8px;background:rgba(255,255,255,.02)}.payment-details summary{display:flex;justify-content:space-between;padding:9px 10px;color:#00e1e9;font-size:9px;font-weight:700;cursor:pointer;list-style:none}.payment-details summary::-webkit-details-marker{display:none}.payment-option{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.06)}.payment-option strong{font-size:9px}.payment-option p{margin:4px 0 0;color:#9796aa;font-size:8px;white-space:pre-wrap}.payment-option img{width:42px;height:42px;border-radius:5px;object-fit:cover}
    .request-form{display:flex;align-items:flex-end;gap:8px}.request-form label{flex:1;color:#aaa9bb;font-size:9px}.request-form input{height:37px;width:100%;margin-top:5px;padding:0 9px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#18192e;color:#fff}.request-form button{height:37px;padding:0 10px;border:0;border-radius:7px;background:#ff168b;color:white;font-size:9px;font-weight:750;cursor:pointer}.request-form button:disabled{opacity:.5}
    @media(min-width:620px){.chat-backdrop{align-items:center;padding:20px}.chat-panel{height:min(700px,calc(100dvh - 40px));max-width:430px;border:1px solid rgba(0,243,255,.24);border-radius:18px}.chat-body{padding:0 17px 14px}.auth-content{padding:25px}}
  `]
})
export class ChatModalComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Output() readonly closed = new EventEmitter<void>();

  identity: SpinVaultIdentity | null = this.spinVault.currentIdentity;
  mode: 'login' | 'signup' = 'login';
  email = '';
  username = '';
  password = '';
  draft = '';
  requestAmount = '25';
  requestType: 'load' | 'cashout' | null = null;
  paymentMethods: SpinVaultPaymentMethod[] = [];
  messages: SpinVaultMessage[] = [];
  error = '';
  busy = false;
  uploading = false;
  private adminId: string | null = null;
  private chatStarted = false;
  private unsubscribeMessages: (() => void) | null = null;
  private identitySubscription: Subscription;

  constructor(private readonly spinVault: SpinVaultService, private readonly router: Router) {
    this.identitySubscription = this.spinVault.identity$.subscribe((identity) => {
      this.identity = identity;
      if (this.open && identity) void this.startChat();
      if (!identity) this.resetChat();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open']) return;
    if (this.open) {
      this.error = '';
      if (this.identity) void this.startChat();
    } else {
      this.resetChat();
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeMessages?.();
    this.identitySubscription.unsubscribe();
  }

  async submitAuth(): Promise<void> {
    if (!this.email.trim() || !this.password) {
      this.error = 'Enter your email address and password to continue.';
      return;
    }
    if (this.mode === 'signup' && this.username.trim().length < 3) {
      this.error = 'Your username must be at least 3 characters.';
      return;
    }
    if (this.mode === 'signup' && this.password.length < 8) {
      this.error = 'Use a password with at least 8 characters.';
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      if (this.mode === 'login') {
        await this.spinVault.signIn(this.email.trim(), this.password);
      } else {
        const signedIn = await this.spinVault.signUp(this.email.trim(), this.username.trim(), this.password);
        if (!signedIn) {
          this.error = 'Account created. Check your email to confirm your account, then log in.';
        }
      }
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.busy = false;
    }
  }

  toggleRequest(type: 'load' | 'cashout'): void {
    this.requestType = this.requestType === type ? null : type;
  }

  async sendText(): Promise<void> {
    const content = this.draft.trim();
    if (!content || !this.adminId) return;
    this.busy = true;
    this.error = '';
    try {
      const message = await this.spinVault.sendMessage(this.adminId, content);
      this.upsertMessage(message);
      this.draft = '';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.busy = false;
    }
  }

  async sendRequest(): Promise<void> {
    const amount = Number(this.requestAmount);
    if (!this.requestType || !this.adminId || !Number.isFinite(amount) || amount <= 0) {
      this.error = 'Enter an amount greater than $0.';
      return;
    }
    const type = this.requestType;
    const content = `${type === 'load' ? 'Load' : 'Cash-out'} request — $${amount.toFixed(2)}`;
    this.busy = true;
    this.error = '';
    try {
      const message = await this.spinVault.sendMessage(this.adminId, content, type, amount);
      this.upsertMessage(message);
      this.requestType = null;
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.busy = false;
    }
  }

  close(): void {
    this.closed.emit();
  }

  async sendImage(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length || !this.adminId) return;
    this.uploading = true;
    this.error = '';
    try {
      this.upsertMessage(await this.spinVault.uploadChatImage(this.adminId, input.files[0]));
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.uploading = false;
      input.value = '';
    }
  }

  private async startChat(): Promise<void> {
    if (!this.identity || this.chatStarted) return;
    if (this.identity.role === 'admin') {
      this.close();
      void this.router.navigateByUrl('/admin');
      return;
    }
    this.chatStarted = true;
    this.busy = true;
    this.error = '';
    try {
      const admin = await this.spinVault.findAdmin();
      this.adminId = admin.id;
      this.messages = await this.spinVault.loadConversation(admin.id);
      this.paymentMethods = await this.spinVault.loadPaymentMethods();
      this.unsubscribeMessages = this.spinVault.subscribeToMessages(async (message) => {
        if (
          (message.sender_id === admin.id && message.receiver_id === this.identity?.id) ||
          (message.sender_id === this.identity?.id && message.receiver_id === admin.id)
        ) {
          try {
            this.upsertMessage(await this.spinVault.resolveMessageAttachment(message));
          } catch (error) {
            this.error = this.message(error);
          }
        }
      }, (message) => (this.error = message));
    } catch (error) {
      this.chatStarted = false;
      this.error = this.message(error);
    } finally {
      this.busy = false;
    }
  }

  private upsertMessage(message: SpinVaultMessage): void {
    const byId = new Map(this.messages.map((item) => [item.id, item]));
    byId.set(message.id, { ...byId.get(message.id), ...message });
    this.messages = [...byId.values()].sort(
      (first, second) => Date.parse(first.created_at) - Date.parse(second.created_at)
    );
  }

  private resetChat(): void {
    this.unsubscribeMessages?.();
    this.unsubscribeMessages = null;
    this.adminId = null;
    this.chatStarted = false;
    this.messages = [];
    this.paymentMethods = [];
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to complete this request.';
  }
}
