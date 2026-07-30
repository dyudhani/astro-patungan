// Hasil OCR NYATA (Tesseract) dari foto struk yang sama seperti
// billzard-room.ts, tapi fontnya dot-matrix POS printer — Tesseract salah
// baca total. Ini BUKAN test "parser harus benerin angkanya" (parser tidak
// bisa menyulap teks yang salah kebaca jadi benar), tapi test SAFETY NET-nya:
// begitu subtotal/total tidak match, harus muncul warning, bukan diam-diam
// lanjut dengan angka yang salah.
export const billzardRoomBadOcr = {
  label: "Billzard — sama seperti billzard-room, tapi OCR font dot-matrix gagal baca",
  rawText: `a PACKAGE VIP 9 JAN 995
SN 49400`,
  // Catatan: baris Subtotal/Tax/TOTAL di struk asli juga gagal terbaca sama
  // sekali oleh OCR di kasus nyata ini (bukan cuma item), jadi tidak
  // dimasukkan di sini — itu justru skenario yang mau di-test.
  expectWarnings: true,
};
