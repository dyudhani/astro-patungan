// Tipe data inti untuk perhitungan patungan.

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
  /** Map itemId -> jumlah porsi yang diambil orang ini. */
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
