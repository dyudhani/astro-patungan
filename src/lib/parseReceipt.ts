/**
 * Parser untuk teks struk Indonesia.
 * Heuristik-based — bukan AI, tapi cukup ampuh untuk format struk umum di ID.
 */

export interface ParsedItem {
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface ParsedReceipt {
  items: ParsedItem[];
  subtotal: number;
  tax: number;
  service: number;
  discount: number;
  total: number;
}

// Parse angka Indonesia: "25.000", "25,000", "25.000,50", "Rp 25.000"
export function parseIDR(s: string): number | null {
  if (!s) return null;
  // Hapus semua kecuali digit, titik, koma, dan minus
  let cleaned = s.replace(/[^\d.,\-]/g, '').trim();
  if (!cleaned) return null;

  const isNegative = cleaned.startsWith('-');
  if (isNegative) cleaned = cleaned.slice(1);

  // Tentukan separator desimal vs ribuan
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  let normalized: string;
  if (lastDot === -1 && lastComma === -1) {
    normalized = cleaned;
  } else if (lastDot > lastComma) {
    // titik adalah desimal (format US) ATAU ribuan (format ID tanpa desimal)
    const afterDot = cleaned.length - lastDot - 1;
    if (afterDot <= 2 && lastComma !== -1) {
      // koma=ribuan, titik=desimal
      normalized = cleaned.replace(/,/g, '').replace(/\./g, (m, i) =>
        i === lastDot ? '.' : ''
      );
    } else {
      // titik=ribuan
      normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
    }
  } else {
    // koma adalah desimal (format ID)
    const afterComma = cleaned.length - lastComma - 1;
    if (afterComma <= 2) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '').replace(/\./g, '');
    }
  }

  const n = parseFloat(normalized);
  if (isNaN(n)) return null;
  return Math.round(isNegative ? -n : n);
}

// Keyword (lowercase) yang menandakan baris bukan item
const SKIP_KEYWORDS = [
  'subtotal', 'sub total', 'sub-total',
  'total', 'grand total', 'jumlah',
  'tax', 'pajak', 'ppn', 'pb1',
  'service', 'svc', 'service charge', 'biaya layanan',
  'discount', 'diskon', 'potongan', 'voucher',
  'cash', 'tunai', 'change', 'kembali', 'kembalian',
  'bayar', 'payment', 'visa', 'mastercard', 'debit', 'credit', 'kredit',
  'qris', 'gopay', 'ovo', 'dana', 'shopeepay',
  'tanggal', 'date', 'jam', 'time',
  'kasir', 'cashier', 'meja', 'table', 'pax', 'guest', 'tamu',
  'struk', 'receipt', 'invoice', 'nota', 'bill',
  'terima kasih', 'thank you', 'thanks',
  'npwp', 'nomor', 'no.', 'no :', 'no:',
  'rounding', 'pembulatan',
];

function looksLikeMetadata(line: string): boolean {
  const lc = line.toLowerCase();
  return SKIP_KEYWORDS.some((kw) => lc.includes(kw));
}

// =============== PERBAIKAN LOGIKA CLEAN NAME ===============
function cleanName(raw: string): string {
  let name = raw.trim();
  
  // 1. Buang trailing qty pattern dari nama (contoh: "Nasi Goreng 2x")
  name = name.replace(/\s*\d{1,2}\s*[xX×]\s*$/, '').trim();
  
  // 2. Buang pola "@Rp25.000 Rp" atau "@ 25.000" di akhir nama.
  // Regex ini membersihkan format seperti "@Rp18.612 Rp" yang dibaca oleh OCR aplikasi online delivery
  name = name.replace(/@\s*(Rp)?\s*[\d.,]+\s*(Rp)?\s*$/i, '').trim();
  
  // 3. Buang kata "Rp" yang mungkin masih tertinggal sendirian di akhir
  name = name.replace(/\s+Rp\s*$/i, '').trim();
  
  // 4. Hapus karakter "@" yang mungkin nyangkut di akhir teks
  name = name.replace(/@+$/, '').trim();

  // 5. Buang spasi ganda menjadi spasi tunggal
  name = name.replace(/\s{2,}/g, ' ');

  // 6. Buang trailing punctuation (koma, titik, strip di ujung kalimat)
  name = name.replace(/[.,;:|\-_]+$/, '').trim();
  
  return name;
}
// ===========================================================

// Cari baris yang match keyword tertentu lalu ambil angkanya
function findAmount(lines: string[], keywords: string[]): number {
  for (const line of lines) {
    const lc = line.toLowerCase();
    if (keywords.some((kw) => lc.includes(kw))) {
      // Ambil angka terakhir di baris ini
      const matches = line.match(/[\d.,]+/g);
      if (matches && matches.length > 0) {
        // Coba dari kanan
        for (let i = matches.length - 1; i >= 0; i--) {
          const n = parseIDR(matches[i]);
          if (n !== null && n > 0) return n;
        }
      }
    }
  }
  return 0;
}

// Detect apakah baris kemungkinan adalah item: ada nama (huruf) DAN angka harga
function tryParseItemLine(line: string): ParsedItem | null {
  const trimmed = line.trim();
  if (trimmed.length < 3) return null;
  if (looksLikeMetadata(trimmed)) return null;

  // Cari semua angka di baris
  const numberMatches = [...trimmed.matchAll(/[\d][\d.,]*/g)];
  if (numberMatches.length === 0) return null;

  // Harus ada huruf (nama item) — bukan cuma angka
  const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (letterCount < 2) return null;

  // Ambil angka terakhir sebagai total/harga
  const lastNum = numberMatches[numberMatches.length - 1];
  const lastNumValue = parseIDR(lastNum[0]);
  if (lastNumValue === null || lastNumValue < 100) return null;
  // Skip kalau angka terlalu besar (kemungkinan no struk, dll)
  if (lastNumValue > 10_000_000) return null;

  const lastNumIndex = lastNum.index ?? 0;

  // Cek apakah ada qty: pattern seperti "2x", "2 x", "(2)" di awal
  let qty = 1;
  let nameStart = 0;
  let nameEnd = lastNumIndex;

  // Pattern A: "Nasi 2 x 25.000  50.000" — qty di tengah, harga satuan & total
  // Cari pola "(qty)x(price)" sebelum angka terakhir
  const beforeLast = trimmed.slice(0, lastNumIndex);
  const qtyMid = beforeLast.match(/(\d{1,2})\s*[xX×@]\s*([\d.,]+)\s*$/);
  if (qtyMid) {
    const q = parseInt(qtyMid[1]);
    const unitPrice = parseIDR(qtyMid[2]);
    if (q >= 1 && q <= 50 && unitPrice !== null && unitPrice > 0) {
      qty = q;
      // Nama berakhir sebelum pattern qty x price
      nameEnd = (qtyMid.index ?? 0);
      const total = lastNumValue;
      // Sanity check: qty * unitPrice ≈ total (toleransi 10%)
      if (Math.abs(q * unitPrice - total) / Math.max(total, 1) < 0.1) {
        const name = cleanName(trimmed.slice(nameStart, nameEnd));
        if (name.length >= 2 && (name.match(/[a-zA-Z]/g) || []).length >= 2) {
          return { name, qty, price: unitPrice, total };
        }
      }
    }
  }

  // Pattern B: "2x Nasi" atau "2 x Nasi" di awal
  const qtyPrefix = trimmed.match(/^(\d{1,2})\s*[xX×@]\s+/);
  if (qtyPrefix) {
    qty = parseInt(qtyPrefix[1]);
    nameStart = qtyPrefix[0].length;
  } else {
    // Pattern C: "Nasi 2x  50.000" — qty di akhir nama sebelum harga
    const qtyEnd = beforeLast.match(/(\d{1,2})\s*[xX×]\s*$/);
    if (qtyEnd) {
      qty = parseInt(qtyEnd[1]);
      nameEnd = (qtyEnd.index ?? lastNumIndex);
    } else {
      // Pattern D: angka pertama di awal = qty (misal "2 Nasi Goreng 50.000")
      const firstNum = numberMatches[0];
      if (firstNum && firstNum.index !== undefined && firstNum.index < 4) {
        const v = parseInt(firstNum[0]);
        if (!isNaN(v) && v >= 1 && v <= 20 && numberMatches.length >= 2) {
          qty = v;
          nameStart = firstNum.index + firstNum[0].length;
        }
      }
    }
  }

  let name = cleanName(trimmed.slice(nameStart, nameEnd));

  if (name.length < 2) return null;

  // Validasi: nama harus ada minimal 2 huruf
  if ((name.match(/[a-zA-Z]/g) || []).length < 2) return null;

  const total = lastNumValue;
  const price = qty > 0 ? Math.round(total / qty) : total;

  return { name, qty, price, total };
}

export function parseReceipt(rawText: string): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Cari tax/service/discount/total dulu
  const tax = findAmount(lines, ['pajak', 'tax', 'ppn', 'pb1', 'pb 1']);
  
  // Karena GoFood pakai "Biaya penanganan", "Biaya lainnya" kita gabung ke service charge
  const service = findAmount(lines, ['service', 'svc', 'layanan', 'penanganan', 'ongkir', 'biaya lainnya']);
  
  const discount = findAmount(lines, ['diskon', 'discount', 'potongan', 'voucher']);
  const subtotalFound = findAmount(lines, ['subtotal', 'sub total', 'sub-total', 'total harga']);
  const totalFound = findAmount(lines, ['grand total', 'total bayar', 'total pembayaran']);

  // Parse items
  const items: ParsedItem[] = [];
  for (const line of lines) {
    const item = tryParseItemLine(line);
    if (item) items.push(item);
  }

  // Hitung subtotal dari items
  const calculatedSubtotal = items.reduce((s, i) => s + i.total, 0);
  const subtotal = subtotalFound > 0 ? subtotalFound : calculatedSubtotal;
  const total =
    totalFound > 0 ? totalFound : subtotal + tax + service - discount;

  return { items, subtotal, tax, service, discount, total };
}