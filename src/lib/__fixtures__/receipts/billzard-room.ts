// Struk sewa meja billiard VIP — dari foto struk asli (dibaca manual, bukan
// hasil OCR). Dipakai sebagai "ground truth" buat regression test parser:
// pastikan "1 NEW PACKAGE VIP 2 JAM" tidak lagi ke-skip gara-gara kata "jam".
export const billzardRoomReceipt = {
  label: "Billzard — sewa meja VIP (2 jam + normal)",
  rawText: `BILLZARD
Jl. Cokroaminoto No. 404, Ubung
Denpasar Utara, Bali
087761827947
Reff No. : 0010100045
Tanggal : 29-07-2026 22:12:5
Tipe pesanan: DINE IN
Nama meja : VIP 1
1 NEW PACKAGE VIP 2 JAM 99.000
Promo(24.000) (24.000)
1 NEW NORMAL VIP 59.000
Subtotal 134.000
Tax 13.400
TOTAL 147.400
PAYMENT BY QRIS EDC`,
  expected: {
    itemCount: 2,
    subtotal: 134000,
    tax: 13400,
    service: 0,
    discount: 24000,
    total: 147400,
  },
};
