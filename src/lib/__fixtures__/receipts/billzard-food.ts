// Struk makanan dari venue sama (Billzard) — ground truth dari foto struk asli.
// Regression test: "2 NASI GORENG BILLZARD" tidak lagi ke-skip gara-gara
// venue-nya sendiri mengandung substring kata kunci "bill".
export const billzardFoodReceipt = {
  label: "Billzard — pesanan makanan (11 item)",
  rawText: `BILLZARD
Jl. Cokroaminoto No. 404, Ubung
Denpasar Utara, Bali
087761827947
Reff No. : 0010100025
Tanggal : 29-07-2026 22:19:3
Tipe pesanan: DINE IN
Nama meja : VIP 1
2 Mie Goreng 30.000
1 Ayam Geprek 28.000
1 Chiken Pomfrench 28.000
2 Mineral Water 24.000
1 Iced Tea 17.000
2 Mie Goreng 30.000
2 Nasi Goreng Billzard 70.000
1 Mineral Water 12.000
1 Lemon tea 25.000
1 Ice Chocolate 27.000
1 Mie Goreng 15.000
Subtotal 306.000
Service 15.300
Tax 32.130
TOTAL 353.430
PAYMENT BY QRIS EDC`,
  expected: {
    itemCount: 11,
    subtotal: 306000,
    tax: 32130,
    service: 15300,
    discount: 0,
    total: 353430,
  },
};
