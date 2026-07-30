// Bill-splitting calculation logic — PURE functions (no DOM / no global
// state), so they're easy to test and reuse.

import type { Bill, Person, PersonResult } from "./types";
import { roundTotal } from "./format";

/** How many people share a given item (qty > 0). */
export const itemSharersCount = (people: Person[], itemId: number): number =>
  people.filter((p) => (p.items[itemId] || 0) > 0).length;

/** Total shares of an item across everyone (for proportional splitting). */
export const itemTotalShares = (people: Person[], itemId: number): number =>
  people.reduce((sum, p) => sum + (p.items[itemId] || 0), 0);

export interface SplitResult {
  results: PersonResult[];
  billSubtotal: number;
  grandTotal: number;
}

/**
 * Compute each person's share. Every item is split proportionally by share
 * (person's qty / item's total shares), then tax/service/discount are split
 * proportionally against each person's subtotal.
 */
export function calculateSplit(bill: Bill, people: Person[]): SplitResult {
  const billSubtotal = bill.items.reduce((s, i) => s + i.price * i.qty, 0);
  const grandTotal = Math.max(
    0,
    billSubtotal + bill.tax + bill.service - bill.discount,
  );

  const results: PersonResult[] = people.map((p) => {
    const personItems: PersonResult["items"] = [];
    let subtotal = 0;

    Object.entries(p.items).forEach(([idStr, qty]) => {
      const iid = Number(idStr);
      if (qty <= 0) return;
      const item = bill.items.find((i) => i.id === iid);
      if (!item) return;

      const totalShares = itemTotalShares(people, iid) || 1;
      const share = item.price * item.qty * (qty / totalShares);
      subtotal += share;
      personItems.push({ name: item.name || "(item)", share, qty, totalShares });
    });

    const ratio = billSubtotal > 0 ? subtotal / billSubtotal : 0;
    const taxShare = bill.tax * ratio;
    const serviceShare = bill.service * ratio;
    const discountShare = bill.discount * ratio;
    const totalRaw = subtotal + taxShare + serviceShare - discountShare;
    const totalRounded = roundTotal(Math.max(0, totalRaw));

    return {
      name: p.name || "Tanpa nama",
      items: personItems,
      subtotal,
      taxShare,
      serviceShare,
      discountShare,
      totalRaw,
      totalRounded,
    };
  });

  return { results, billSubtotal, grandTotal };
}

/**
 * Reconcile: apply the rounding difference to one person so the collected
 * total EXACTLY matches the bill (prefer the payer, otherwise the largest
 * share). Mutates the results array in place.
 */
export function applyReconcile(
  results: PersonResult[],
  grandTotal: number,
  reconcile: boolean,
  payerName: string,
) {
  if (!reconcile || results.length === 0) return;
  const sum = results.reduce((s, r) => s + r.totalRounded, 0);
  const diff = grandTotal - sum;
  if (diff === 0) return;
  const target =
    (payerName &&
      results.find((r) => r.name === payerName && r.totalRounded > 0)) ||
    results.reduce((a, b) => (b.totalRounded > a.totalRounded ? b : a));
  target.totalRounded = Math.max(0, target.totalRounded + diff);
}
