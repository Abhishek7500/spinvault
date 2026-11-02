import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractReceiptFromContent, ReceiptExtractionError } from '../_shared/receipt-extraction.ts';

interface InboundAttachment {
  filename: string;
  contentType: string;
  base64: string;
}

interface InboundEmail {
  to: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  attachments?: InboundAttachment[];
}

const responseHeaders = { 'Content-Type': 'application/json' };
const allowedAttachmentTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'
]);
const retailerWindows: ReadonlyArray<readonly [string, number]> = [
  ['target', 90], ['walmart', 90], ['apple', 14], ['best buy', 15], ['bestbuy', 15],
  ['amazon', 30], ['costco', 90], ['home depot', 90], ['lowe', 90],
  ['nordstrom', 30], ['kohls', 30], ["kohl's", 30], ['macys', 30], ["macy's", 30]
];

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let mismatch = leftBytes.length ^ rightBytes.length;
  const size = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < size; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function returnWindow(storeName: string): number | null {
  const normalizedStore = storeName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = retailerWindows.find(([name]) => normalizedStore.includes(name.replace(/[^a-z0-9]/g, '')));
  return match?.[1] ?? null;
}

function isInboundAttachment(value: unknown): value is InboundAttachment {
  if (!value || typeof value !== 'object') return false;
  const attachment = value as Partial<InboundAttachment>;
  return typeof attachment.filename === 'string' &&
    typeof attachment.contentType === 'string' &&
    typeof attachment.base64 === 'string';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });

  const webhookSecret = Deno.env.get('INBOUND_EMAIL_WEBHOOK_SECRET');
  const receivedSecret = request.headers.get('x-inbound-email-secret');
  if (!webhookSecret) return respond(500, { error: 'Inbound email processing is not configured.' });
  if (!receivedSecret || !constantTimeEqual(webhookSecret, receivedSecret)) {
    return respond(401, { error: 'Invalid inbound email webhook credentials.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!supabaseUrl || !serviceRoleKey || !geminiApiKey) {
    return respond(500, { error: 'Inbound email processing is not configured.' });
  }

  let payloadBody: unknown;
  try {
    payloadBody = await request.json();
  } catch {
    return respond(400, { error: 'Expected a JSON email payload.' });
  }
  if (!payloadBody || typeof payloadBody !== 'object') return respond(400, { error: 'Expected a JSON email payload.' });
  const payload = payloadBody as InboundEmail;
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const aliases = recipients.flatMap((recipient) =>
    typeof recipient === 'string'
      ? recipient.match(/[a-z0-9._+-]+@yourreceipt\.app/gi) ?? []
      : []
  );
  const alias = aliases[0]?.toLowerCase();
  if (!alias) return respond(400, { error: 'No SmartReceipt inbox alias was found in the recipient field.' });

  const attachments = Array.isArray(payload.attachments) ? payload.attachments.filter(isInboundAttachment) : [];
  const attachment = attachments.find((item) =>
    allowedAttachmentTypes.has(item.contentType.toLowerCase()) &&
    item.base64.length > 100 && item.base64.length <= 14_000_000
  );
  const oversizedAttachment = attachments.find((item) =>
    allowedAttachmentTypes.has(item.contentType.toLowerCase()) && item.base64.length > 14_000_000
  );
  if (oversizedAttachment) return respond(413, { error: 'Receipt attachments must be 10 MB or smaller.' });
  let attachmentBytes: Uint8Array | null = null;
  if (attachment) {
    try {
      attachmentBytes = Uint8Array.from(atob(attachment.base64), (character) => character.charCodeAt(0));
    } catch {
      return respond(400, { error: 'The receipt attachment is not valid base64 data.' });
    }
  }
  const emailText = [
    typeof payload.subject === 'string' ? payload.subject : '',
    typeof payload.text === 'string' ? payload.text : '',
    typeof payload.html === 'string' ? stripHtml(payload.html) : ''
  ].filter(Boolean).join('\n').slice(0, 40_000);
  if (!emailText && !attachment) {
    return respond(400, { error: 'The email has no readable text or supported receipt attachment.' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id')
    .eq('unique_email_alias', alias)
    .single();
  if (profileError || !profile) return respond(404, { error: 'No SmartReceipt account owns that inbound alias.' });

  let receipt;
  try {
    receipt = await extractReceiptFromContent(
      emailText,
      attachment?.contentType.toLowerCase() ?? null,
      attachment?.base64 ?? null,
      geminiApiKey
    );
  } catch (error) {
    if (error instanceof ReceiptExtractionError) return respond(502, { error: error.message });
    throw error;
  }

  let imagePath: string | null = null;
  if (attachment) {
    const safeFilename = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    imagePath = `${profile.id}/inbound-${crypto.randomUUID()}-${safeFilename}`;
    if (!attachmentBytes) return respond(500, { error: 'The receipt attachment could not be decoded.' });
    const { error: uploadError } = await admin.storage.from('receipt-images').upload(imagePath, attachmentBytes, {
      contentType: attachment.contentType.toLowerCase(),
      upsert: false
    });
    if (uploadError) return respond(500, { error: `Could not save the receipt attachment: ${uploadError.message}` });
  }

  const windowDays = returnWindow(receipt.store_name);
  const { data: receiptRow, error: receiptError } = await admin.from('receipts').insert({
    user_id: profile.id,
    store_name: receipt.store_name,
    total_amount: receipt.total_amount,
    tax_amount: receipt.tax_amount,
    purchase_date: receipt.purchase_date,
    return_deadline: windowDays === null ? null : addDays(receipt.purchase_date, windowDays),
    warranty_expiration: receipt.warranty_expiration,
    category: receipt.category,
    ocr_raw_text: receipt.ocr_raw_text,
    image_url: imagePath,
    transaction_id: `SMR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    return_window_days: windowDays,
    status: 'active'
  }).select('id').single();
  if (receiptError) {
    const cleanupError = imagePath
      ? (await admin.storage.from('receipt-images').remove([imagePath])).error
      : null;
    const cleanupMessage = cleanupError ? ` Image cleanup also failed: ${cleanupError.message}` : '';
    return respond(500, { error: `Could not save the receipt: ${receiptError.message}.${cleanupMessage}` });
  }

  const itemRows = receipt.items.map((item) => ({
    receipt_id: receiptRow.id,
    item_name: item.name,
    quantity: 1,
    price: item.price
  }));
  if (itemRows.length > 0) {
    const { error: itemsError } = await admin.from('receipt_items').insert(itemRows);
    if (itemsError) {
      const { error: cleanupError } = await admin.from('receipts').delete().eq('id', receiptRow.id);
      const { error: imageCleanupError } = imagePath
        ? await admin.storage.from('receipt-images').remove([imagePath])
        : { error: null };
      const cleanup = [
        cleanupError ? `Receipt cleanup also failed: ${cleanupError.message}` : '',
        imageCleanupError ? `Image cleanup also failed: ${imageCleanupError.message}` : ''
      ].filter(Boolean).join(' ');
      return respond(500, { error: `Could not save receipt items: ${itemsError.message}.${cleanup}` });
    }
  }

  return respond(201, { receipt_id: receiptRow.id, user_id: profile.id });
});
