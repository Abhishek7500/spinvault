import { Receipt } from './services/receipt.service';

const retailerWindows: ReadonlyArray<readonly [string, number]> = [
  ['target', 90],
  ['walmart', 90],
  ['apple', 14],
  ['best buy', 15],
  ['bestbuy', 15],
  ['amazon', 30],
  ['costco', 90],
  ['home depot', 90],
  ['the home depot', 90],
  ['lowe', 90],
  ['nordstrom', 30],
  ['kohls', 30],
  ["kohl's", 30],
  ['macys', 30],
  ["macy's", 30]
];

export function getReturnWindowDays(storeName: string): number | null {
  const store = storeName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = retailerWindows.find(([name]) => store.includes(name.replace(/[^a-z0-9]/g, '')));
  return match?.[1] ?? null;
}

export function addDays(date: Date, days: number): string {
  const adjusted = new Date(date.getTime());
  adjusted.setDate(adjusted.getDate() + days);
  return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, '0')}-${String(adjusted.getDate()).padStart(2, '0')}`;
}

export interface SpendCategory {
  category: string;
  current: number;
  previous: number;
  variance: number | null;
  warning: boolean;
}

function localDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function analyzeSpend(receipts: Receipt[], period: 'week' | 'month', now = new Date()): SpendCategory[] {
  const today = localDay(now);
  const currentEnd = new Date(today);
  currentEnd.setHours(23, 59, 59, 999);
  const currentStart = new Date(today);
  const previousStart = new Date(today);
  let previousEnd = new Date(today);
  if (period === 'week') {
    const weekday = (today.getDay() + 6) % 7;
    currentStart.setDate(today.getDate() - weekday);
    previousStart.setDate(currentStart.getDate() - 7);
    previousEnd = new Date(currentEnd);
    previousEnd.setDate(previousEnd.getDate() - 7);
  } else {
    currentStart.setDate(1);
    previousStart.setMonth(currentStart.getMonth() - 1, 1);
    const previousMonthLength = new Date(previousStart.getFullYear(), previousStart.getMonth() + 1, 0).getDate();
    previousEnd = new Date(previousStart.getFullYear(), previousStart.getMonth(), Math.min(today.getDate(), previousMonthLength), 23, 59, 59, 999);
  }
  const current: Record<string, number> = {};
  const previous: Record<string, number> = {};
  for (const receipt of receipts) {
    const purchase = new Date(`${receipt.purchase_date}T12:00:00`);
    const target = purchase >= currentStart && purchase <= currentEnd ? current :
      purchase >= previousStart && purchase <= previousEnd ? previous : null;
    if (target) target[receipt.category] = (target[receipt.category] ?? 0) + receipt.total_amount;
  }
  const categories = new Set([...Object.keys(current), ...Object.keys(previous)]);
  return [...categories].map((category) => {
    const currentSpend = current[category] ?? 0;
    const previousSpend = previous[category] ?? 0;
    const variance = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null;
    return {
      category,
      current: currentSpend,
      previous: previousSpend,
      variance,
      warning: currentSpend > 0 && (variance === null || variance > 10)
    };
  }).sort((a, b) => b.current - a.current);
}

export function makeReceiptQrPayload(receipt: Receipt) {
  return {
    version: 1,
    transaction_id: receipt.transaction_id ?? receipt.id,
    receipt_id: receipt.id,
    store: receipt.store_name,
    items: receipt.items.map((item) => ({
      name: item.item_name,
      quantity: item.quantity,
      price: item.price
    })),
    purchase_verification: {
      purchase_date: receipt.purchase_date,
      total_amount: receipt.total_amount,
      tax_amount: receipt.tax_amount
    }
  };
}

export function buildDisputeEmail(receipt: Receipt): { subject: string; body: string } {
  const returnStatus = receipt.return_deadline
    ? new Date(`${receipt.return_deadline}T23:59:59`) >= new Date()
      ? `The return window is currently open through ${receipt.return_deadline}.`
      : `The listed return window ended on ${receipt.return_deadline}.`
    : 'No retailer return deadline is currently recorded.';
  const lines = receipt.items.map((item) =>
    `- ${item.item_name} (quantity ${item.quantity}) — $${(item.price * item.quantity).toFixed(2)}`
  );
  return {
    subject: `Transaction dispute request — ${receipt.store_name} — ${receipt.purchase_date}`,
    body: [
      'To whom it may concern,',
      '',
      'I am requesting your assistance with a transaction and ask that you review the attached purchase evidence.',
      '',
      `Merchant: ${receipt.store_name}`,
      `Transaction ID: ${receipt.transaction_id ?? receipt.id}`,
      `Transaction date: ${receipt.purchase_date}`,
      `Total paid: $${receipt.total_amount.toFixed(2)}`,
      'Items:',
      ...(lines.length ? lines : ['- Item details were not available.']),
      '',
      `Return-window status: ${returnStatus}`,
      '',
      'Please review this transaction, advise me of the next steps, and process any remedy for which I am eligible. I can provide additional documentation upon request.',
      '',
      'Sincerely,',
      '[Your name]'
    ].join('\n')
  };
}
