// Core data types for the bill-splitting calculation.

export interface BillItem {
  id: number;
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface Bill {
  items: BillItem[];
  tax: number;
  service: number;
  discount: number;
}

export interface Person {
  id: number;
  name: string;
  /** Map itemId -> number of shares this person took. */
  items: Record<number, number>;
}

export interface PersonResult {
  name: string;
  items: { name: string; share: number; qty: number; totalShares: number }[];
  subtotal: number;
  taxShare: number;
  serviceShare: number;
  discountShare: number;
  totalRaw: number;
  totalRounded: number;
}
