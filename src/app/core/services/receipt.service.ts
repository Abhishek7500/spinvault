import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { addDays, getReturnWindowDays } from '../receipt-tools';

export interface PriceAlert {
  id: string;
  receipt_item_id: string;
  original_price: number;
  lowest_found_price: number;
  last_checked: string;
  status: 'active' | 'claimed' | 'expired';
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  item_name: string;
  quantity: number;
  price: number;
  price_alert?: PriceAlert | null;
}

export interface Receipt {
  id: string;
  user_id: string;
  store_name: string;
  total_amount: number;
  tax_amount: number | null;
  purchase_date: string;
  return_deadline: string | null;
  warranty_expiration: string | null;
  category: string;
  ocr_raw_text: string | null;
  image_url: string | null;
  status: 'active' | 'returned' | 'expired' | 'archived';
  transaction_id: string | null;
  return_window_days: number | null;
  items: ReceiptItem[];
  price_match_refund?: number;
}

export interface UserProfile {
  id: string;
  email: string;
  unique_email_alias: string;
  created_at: string;
}

export interface PriceAlertUpdate {
  receipt_item_id: string;
  original_price: number;
  lowest_found_price: number;
  status: PriceAlert['status'];
}

interface ReceiptStructure {
  store_name: string;
  total_amount: number;
  purchase_date: string;
  warranty_expiration?: string | null;
  category: string;
  items: { name: string; price: number }[];
  tax_amount?: number | null;
  ocr_raw_text: string;
  transaction_id?: string | null;
}

const demoReceipts: Receipt[] = [
  {
    id: 'demo-receipt-1', user_id: 'demo', store_name: 'Target', total_amount: 184.67, tax_amount: 13.42,
    purchase_date: addDays(new Date(), -12), return_deadline: addDays(new Date(), 78), warranty_expiration: null,
    category: 'Home', ocr_raw_text: null, image_url: null, status: 'active', transaction_id: 'TGT-2048',
    return_window_days: 90,
    items: [
      { id: 'demo-item-1', receipt_id: 'demo-receipt-1', item_name: 'Stoneware dinner set', quantity: 1, price: 89.99 },
      { id: 'demo-item-2', receipt_id: 'demo-receipt-1', item_name: 'Linen duvet cover', quantity: 1, price: 81.26 }
    ]
  },
  {
    id: 'demo-receipt-2', user_id: 'demo', store_name: 'Apple', total_amount: 799, tax_amount: 58.18,
    purchase_date: addDays(new Date(), 0), return_deadline: addDays(new Date(), 14), warranty_expiration: addDays(new Date(), 365),
    category: 'Electronics', ocr_raw_text: null, image_url: null, status: 'active', transaction_id: 'APL-7742',
    return_window_days: 14,
    items: [{ id: 'demo-item-3', receipt_id: 'demo-receipt-2', item_name: 'AirPods Pro', quantity: 1, price: 799 }]
  },
  {
    id: 'demo-receipt-3', user_id: 'demo', store_name: 'Whole Foods Market', total_amount: 62.43, tax_amount: 3.21,
    purchase_date: addDays(new Date(), -3), return_deadline: null, warranty_expiration: null,
    category: 'Groceries', ocr_raw_text: null, image_url: null, status: 'active', transaction_id: 'WFM-0813',
    return_window_days: null,
    items: [{ id: 'demo-item-4', receipt_id: 'demo-receipt-3', item_name: 'Pantry and produce', quantity: 1, price: 62.43 }]
  }
];

@Injectable({ providedIn: 'root' })
export class ReceiptService {
  readonly client: SupabaseClient;
  user: User | null = null;
  profile: UserProfile | null = null;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  async loadReceipts(): Promise<Receipt[]> {
    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw sessionError;
    this.user = sessionData.session?.user ?? null;
    if (!this.user) {
      this.profile = null;
      return demoReceipts.map((receipt) => ({ ...receipt, items: receipt.items.map((item) => ({ ...item })) }));
    }

    const { data: profile, error: profileError } = await this.client
      .from('profiles')
      .select('id,email,unique_email_alias,created_at')
      .eq('id', this.user.id)
      .single();
    if (profileError) throw new Error(`Could not load your profile: ${profileError.message}`);
    this.profile = profile as UserProfile;

    const { data, error } = await this.client
      .from('receipts')
      .select('*, items:receipt_items(*, price_alert:price_alerts(*))')
      .order('purchase_date', { ascending: false });
    if (error) throw new Error(`Could not load receipts: ${error.message}`);

    return (data as Receipt[]).map((receipt) => ({
      ...receipt,
      items: receipt.items ?? [],
      price_match_refund: (receipt.items ?? []).reduce((sum, item) => {
        const alert = item.price_alert;
        return sum + (alert?.status === 'active' ? Math.max(alert.original_price - alert.lowest_found_price, 0) * item.quantity : 0);
      }, 0)
    }));
  }

  async sendSignInLink(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('Enter a valid email address.');
    }
    const { error } = await this.client.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) throw new Error(`Could not send sign-in link: ${error.message}`);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(`Could not sign out: ${error.message}`);
    this.user = null;
    this.profile = null;
  }

  async scanReceipt(image: File): Promise<Receipt> {
    if (!this.user) throw new Error('Sign in before scanning a receipt.');
    if (image.size > 10 * 1024 * 1024) throw new Error('Receipt images must be 10 MB or smaller.');
    const bytes = new Uint8Array(await image.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    const imageBase64 = btoa(binary);
    const { data: structured, error: invokeError } = await this.client.functions.invoke<ReceiptStructure>('scan-receipt', {
      body: { mimeType: image.type, imageBase64 }
    });
    if (invokeError) throw new Error(`Receipt scan failed: ${invokeError.message}`);
    if (!structured) throw new Error('The scanner returned no receipt data.');
    if (!structured.store_name || !Number.isFinite(structured.total_amount) || !structured.purchase_date || !Array.isArray(structured.items)) {
      throw new Error('The scanned receipt did not match the required receipt format. Try a clearer photo.');
    }

    const objectPath = `${this.user.id}/${crypto.randomUUID()}-${image.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await this.client.storage.from('receipt-images').upload(objectPath, image, {
      contentType: image.type,
      upsert: false
    });
    if (uploadError) throw new Error(`Could not save receipt image: ${uploadError.message}`);

    const standardWindow = getReturnWindowDays(structured.store_name);
    const { data: receiptData, error: receiptError } = await this.client.from('receipts').insert({
      user_id: this.user.id,
      store_name: structured.store_name.trim(),
      total_amount: structured.total_amount,
      tax_amount: structured.tax_amount ?? null,
      purchase_date: structured.purchase_date,
      return_deadline: standardWindow === null ? null : addDays(new Date(`${structured.purchase_date}T12:00:00`), standardWindow),
      warranty_expiration: structured.warranty_expiration ?? null,
      category: structured.category || 'Other',
      ocr_raw_text: structured.ocr_raw_text,
      image_url: objectPath,
      transaction_id: structured.transaction_id ?? `SMR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      return_window_days: standardWindow,
      status: 'active'
    }).select('*').single();
    if (receiptError) {
      const { error: cleanupError } = await this.client.storage.from('receipt-images').remove([objectPath]);
      const cleanupMessage = cleanupError ? ` Image cleanup also failed: ${cleanupError.message}` : '';
      throw new Error(`Could not save receipt: ${receiptError.message}.${cleanupMessage}`);
    }

    const itemRows = structured.items.map((item) => ({
      receipt_id: receiptData.id,
      item_name: item.name.trim(),
      quantity: 1,
      price: item.price
    }));
    if (itemRows.length > 0) {
      const { data: items, error: itemsError } = await this.client.from('receipt_items').insert(itemRows).select('*');
      if (itemsError) {
        const { error: cleanupError } = await this.client.from('receipts').delete().eq('id', receiptData.id);
        const { error: imageCleanupError } = await this.client.storage.from('receipt-images').remove([objectPath]);
        const cleanupMessage = [
          cleanupError ? `Receipt cleanup also failed: ${cleanupError.message}` : '',
          imageCleanupError ? `Image cleanup also failed: ${imageCleanupError.message}` : ''
        ].filter(Boolean).join(' ');
        throw new Error(`Could not save receipt items: ${itemsError.message}.${cleanupMessage ? ` ${cleanupMessage}` : ''}`);
      }
      return { ...(receiptData as Receipt), items: items as ReceiptItem[], price_match_refund: 0 };
    }
    return { ...(receiptData as Receipt), items: [], price_match_refund: 0 };
  }

  async updateReturnWindow(receiptId: string, days: number, purchaseDate: string): Promise<Receipt> {
    const { data, error } = await this.client.from('receipts')
      .update({ return_window_days: days, return_deadline: addDays(new Date(`${purchaseDate}T12:00:00`), days) })
      .eq('id', receiptId).select('*').single();
    if (error) throw new Error(`Could not update return window: ${error.message}`);
    const existing = (await this.loadReceipts()).find((receipt) => receipt.id === receiptId);
    return { ...(data as Receipt), items: existing?.items ?? [] };
  }

  async savePriceAlerts(updates: PriceAlertUpdate[]): Promise<PriceAlert[]> {
    if (!this.user || updates.length === 0) return [];
    const rows = updates.map((update) => ({
      ...update,
      last_checked: new Date().toISOString(),
      status: update.status
    }));
    const { data, error } = await this.client.from('price_alerts')
      .upsert(rows, { onConflict: 'receipt_item_id' })
      .select('*');
    if (error) throw new Error(`Could not save price alerts: ${error.message}`);
    return data as PriceAlert[];
  }
}
