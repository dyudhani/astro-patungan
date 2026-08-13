import { describe, it, expect } from "vitest";
import { calculateSplit, applyReconcile, itemSharersCount, itemTotalShares } from "./calc";
import type { Bill, Person } from "./types";

// Money-math correctness matters most here — a bug means someone gets
// charged the wrong amount. Had zero test coverage before this file.

function bill(items: Bill["items"], tax = 0, service = 0, discount = 0): Bill {
  return { items, tax, service, discount };
}

describe("calculateSplit", () => {
  it("splits an item evenly between people who share it", () => {
    const b = bill([{ id: 1, name: "Nasi Goreng", qty: 2, price: 25000, total: 50000 }]);
    const people: Person[] = [
      { id: 1, name: "A", items: { 1: 1 } },
      { id: 2, name: "B", items: { 1: 1 } },
    ];
    const { results, grandTotal } = calculateSplit(b, people);
    expect(grandTotal).toBe(50000);
    expect(results[0].subtotal).toBe(25000);
    expect(results[1].subtotal).toBe(25000);
  });

  it("splits an item proportionally when shares are uneven", () => {
    const b = bill([{ id: 1, name: "Pizza", qty: 1, price: 90000, total: 90000 }]);
    const people: Person[] = [
      { id: 1, name: "A", items: { 1: 2 } }, // ate 2 slices worth
      { id: 2, name: "B", items: { 1: 1 } }, // ate 1 slice worth
    ];
    const { results } = calculateSplit(b, people);
    expect(results[0].subtotal).toBe(60000);
    expect(results[1].subtotal).toBe(30000);
  });

  it("distributes tax/service/discount proportionally to each person's subtotal share", () => {
    const b = bill(
      [
        { id: 1, name: "Room VIP 2 Jam", qty: 1, price: 99000, total: 99000 },
        { id: 2, name: "Mie Goreng", qty: 1, price: 30000, total: 30000 },
      ],
      12900, // 10% tax on 129000
      0,
      0,
    );
    const people: Person[] = [
      { id: 1, name: "A", items: { 1: 1 } }, // only the room
      { id: 2, name: "B", items: { 2: 1 } }, // only the food
    ];
    const { results } = calculateSplit(b, people);
    const a = results.find((r) => r.name === "A")!;
    const bResult = results.find((r) => r.name === "B")!;
    expect(a.taxShare).toBeCloseTo((99000 / 129000) * 12900, 5);
    expect(bResult.taxShare).toBeCloseTo((30000 / 129000) * 12900, 5);
    expect(a.taxShare + bResult.taxShare).toBeCloseTo(12900, 5);
  });

  it("gives a person with no items a zero total, not NaN/undefined", () => {
    const b = bill([{ id: 1, name: "Kopi", qty: 1, price: 20000, total: 20000 }], 2000);
    const people: Person[] = [
      { id: 1, name: "A", items: { 1: 1 } },
      { id: 2, name: "B", items: {} },
    ];
    const { results } = calculateSplit(b, people);
    const bResult = results.find((r) => r.name === "B")!;
    expect(bResult.subtotal).toBe(0);
    expect(bResult.taxShare).toBe(0);
    expect(bResult.totalRounded).toBe(0);
  });

  it("never lets the grand total go negative even if discount exceeds the subtotal", () => {
    const b = bill([{ id: 1, name: "Snack", qty: 1, price: 5000, total: 5000 }], 0, 0, 999999);
    const { grandTotal } = calculateSplit(b, []);
    expect(grandTotal).toBe(0);
  });

  it("falls back to an even split (not NaN) when an item has zero total shares claimed", () => {
    // itemTotalShares(...) || 1 in calc.ts guards this — if this regresses,
    // a person's share divides by zero and the bill silently breaks.
    const b = bill([{ id: 1, name: "Lonely item", qty: 1, price: 10000, total: 10000 }]);
    const people: Person[] = [{ id: 1, name: "A", items: {} }];
    const { results } = calculateSplit(b, people);
    expect(results[0].subtotal).toBe(0);
    expect(Number.isFinite(results[0].totalRaw)).toBe(true);
  });
});

describe("itemSharersCount / itemTotalShares", () => {
  const people: Person[] = [
    { id: 1, name: "A", items: { 1: 2, 2: 0 } },
    { id: 2, name: "B", items: { 1: 1 } },
  ];

  it("counts only people with qty > 0", () => {
    expect(itemSharersCount(people, 1)).toBe(2);
    expect(itemSharersCount(people, 2)).toBe(0);
  });

  it("sums total shares across everyone", () => {
    expect(itemTotalShares(people, 1)).toBe(3);
  });
});

describe("applyReconcile", () => {
  it("pushes the rounding difference onto the payer, so totals match the bill exactly", () => {
    const results = [
      { name: "A", items: [], subtotal: 0, taxShare: 0, serviceShare: 0, discountShare: 0, totalRaw: 33333, totalRounded: 33000 },
      { name: "B", items: [], subtotal: 0, taxShare: 0, serviceShare: 0, discountShare: 0, totalRaw: 33333, totalRounded: 33000 },
      { name: "C", items: [], subtotal: 0, taxShare: 0, serviceShare: 0, discountShare: 0, totalRaw: 33334, totalRounded: 33000 },
    ];
    applyReconcile(results, 100000, true, "B");
    const sum = results.reduce((s, r) => s + r.totalRounded, 0);
    expect(sum).toBe(100000);
    expect(results.find((r) => r.name === "B")!.totalRounded).toBe(34000);
  });

  it("does nothing when reconcile is off", () => {
    const results = [
      { name: "A", items: [], subtotal: 0, taxShare: 0, serviceShare: 0, discountShare: 0, totalRaw: 33000, totalRounded: 33000 },
    ];
    applyReconcile(results, 999999, false, "A");
    expect(results[0].totalRounded).toBe(33000);
  });

  it("falls back to the largest share when the named payer isn't in the results", () => {
    const results = [
      { name: "A", items: [], subtotal: 0, taxShare: 0, serviceShare: 0, discountShare: 0, totalRaw: 10000, totalRounded: 10000 },
      { name: "B", items: [], subtotal: 0, taxShare: 0, serviceShare: 0, discountShare: 0, totalRaw: 20000, totalRounded: 20000 },
    ];
    applyReconcile(results, 31000, true, "Someone Not Here");
    expect(results.find((r) => r.name === "B")!.totalRounded).toBe(21000);
  });
});
