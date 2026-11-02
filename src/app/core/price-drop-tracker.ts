import { PriceAlertUpdate, Receipt } from './services/receipt.service';

export class PriceDropTracker {
  check(receipts: Receipt[], now = new Date()): PriceAlertUpdate[] {
    const updates: PriceAlertUpdate[] = [];
    for (const receipt of receipts) {
      const returnWindowOpen = receipt.status === 'active' && receipt.return_deadline !== null &&
        new Date(`${receipt.return_deadline}T23:59:59`) >= now;
      for (const item of receipt.items) {
        if (!returnWindowOpen) {
          if (item.price_alert?.status === 'active') {
            updates.push({
              receipt_item_id: item.id,
              original_price: item.price,
              lowest_found_price: item.price_alert.lowest_found_price,
              status: 'expired'
            });
          }
          continue;
        }
        if (item.price <= 0) continue;
        const simulatedPrice = this.mockDealPrice(item.item_name, item.price);
        const lowest = Math.min(item.price, item.price_alert?.lowest_found_price ?? item.price);
        const candidate = Math.min(lowest, simulatedPrice);
        if (candidate < item.price) {
          updates.push({
            receipt_item_id: item.id,
            original_price: item.price,
            lowest_found_price: candidate,
            status: 'active'
          });
        }
      }
    }
    return updates;
  }

  private mockDealPrice(itemName: string, originalPrice: number): number {
    let hash = 0;
    for (const character of itemName.toLowerCase()) {
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }
    if (hash % 3 !== 0) return originalPrice;
    const discount = 0.05 + (hash % 16) / 100;
    return Math.round(originalPrice * (1 - discount) * 100) / 100;
  }
}
