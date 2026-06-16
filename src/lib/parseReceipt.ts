/**
 * Parser untuk teks struk Indonesia & Inggris.
 * Heuristik-based — bukan AI, tapi cukup ampuh untuk format struk umum.
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

export function parseIDR(s: string): number | null {
  if (!s) return null;
  let cleaned = s.replace(/[^\d.,\-]/g, '').trim();
  if (!cleaned) return null;

  const isNegative = cleaned.startsWith('-');
  if (isNegative) cleaned = cleaned.slice(1);

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  let normalized: string;
  if (lastDot === -1 && lastComma === -1) {
    normalized = cleaned;
  } else if (lastDot > lastComma) {
    const afterDot = cleaned.length - lastDot - 1;
    if (afterDot <= 2 && lastComma !== -1) {
      normalized = cleaned.replace(/,/g, '').replace(/\./g, (m, i) =>
        i === lastDot ? '.' : ''
      );
    } else {
      normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
    }
  } else {
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

const SKIP_KEYWORDS = [
  'subtotal', 'sub total', 'sub-total', 'amount',
  'total', 'grand total', 'jumlah', 'balance', 'due',
  'tax', 'pajak', 'ppn', 'pb1', 'vat', 'gst',
  'service', 'svc', 'service charge', 'biaya layanan', 'gratuity', 'tip', 'delivery',
  'discount', 'diskon', 'potongan', 'voucher', 'promo', 'coupon',
  'cash', 'tunai', 'change', 'kembali', 'kembalian',
  'bayar', 'payment', 'visa', 'mastercard', 'debit', 'credit', 'kredit', 'amex', 'card',
  'qris', 'gopay', 'ovo', 'dana', 'shopeepay',
  'tanggal', 'date', 'jam', 'time',
  'kasir', 'cashier', 'meja', 'table', 'pax', 'guest', 'tamu',
  'struk', 'receipt', 'invoice', 'nota', 'bill',
  'terima kasih', 'thank you', 'thanks',
  'npwp', 'nomor', 'no.', 'no :', 'no:',
  'rounding', 'pembulatan',
  // Noise umum di struk POS Indonesia (Moka, Pawoon, Olsera, Majoo, Qasir, iSeller, ESB, GoBiz)
  'poin', 'point', 'member', 'membership', 'saldo',
  'powered', 'www', 'http', '.com', 'telp', 'telepon', 'hotline',
  'cabang', 'outlet', 'alamat', 'gerai',
  'approval', 'batch', 'trace', 'antrian', 'queue', 'operator', 'shift', 'reprint',
  'order id', 'order#', 'no urut', 'no. urut', 'order no', 'order :',
  'dine in', 'dine-in', 'take away', 'takeaway', 'pesanan diterima'
];

// Logika Cerdas: Mencegah tabrakan kata (Contoh: "Tipat" vs "Tip")
function isKeywordMatch(text: string, kw: string): boolean {
  const lc = text.toLowerCase();
  
  // Untuk kata kunci super pendek, gunakan Exact Word Boundary (\b)
  if (['tip', 'tax', 'vat', 'gst', 'svc', 'pb1', 'pax', 'due', 'card'].includes(kw)) {
    return new RegExp(`\\b${kw}\\b`, 'i').test(lc);
  }
  
  // Cegah kata "total" bertabrakan dengan "subtotal"
  if (kw === 'total') {
    return new RegExp(`\\btotal\\b`, 'i').test(lc) && !lc.includes('subtotal') && !lc.includes('sub total');
  }
  
  return lc.includes(kw);
}

function looksLikeMetadata(line: string): boolean {
  return SKIP_KEYWORDS.some((kw) => isKeywordMatch(line, kw));
}

function cleanName(raw: string): string {
  let name = raw.trim();
  name = name.replace(/\s*\d{1,2}\s*[xX×]\s*$/, '').trim();
  name = name.replace(/@\s*(Rp|IDR|\$)?\s*[\d.,]+\s*(Rp|IDR|\$)?\s*$/i, '').trim();
  name = name.replace(/\s+(Rp|IDR|\$)\s*$/i, '').trim();
  name = name.replace(/@+$/, '').trim();
  name = name.replace(/\s{2,}/g, ' ');
  name = name.replace(/[.,;:|\-_]+$/, '').trim();
  name = name.replace(/\(\s*\)/g, '').trim();
  return name;
}

function findAmount(lines: string[], keywords: string[]): number {
  for (const line of lines) {
    const isMatch = keywords.some((kw) => isKeywordMatch(line, kw));
    if (isMatch) {
      // 1. Bersihkan tulisan persen (seperti 10%) agar tidak ditangkap sebagai nominal
      let cleanedLine = line.replace(/\b\d+\s*%/g, '');
      
      // 2. Gabungkan angka yang terputus spasi gara-gar OCR (misal "17 700" jadi "17700")
      // FIX PENTING: Dulu \d{3} ditulis [0]{3} sehingga 700 tidak tergabung.
      cleanedLine = cleanedLine.replace(/(\d+)[.,\s]+(\d{3})(?!\d)/g, '$1$2');
      
      const matches = cleanedLine.match(/[\d.,]+/g);
      if (matches && matches.length > 0) {
        for (let i = matches.length - 1; i >= 0; i--) {
          const n = parseIDR(matches[i]);
          if (n !== null && n > 0) return n;
        }
      }
    }
  }
  return 0;
}

function tryParseItemLine(line: string): ParsedItem | null {
  // Gabungkan typo spasi OCR pada nominal harga
  const trimmed = line.trim().replace(/(\d+)[.,\s]+(\d{3})(?!\d)/g, '$1$2');
  
  if (trimmed.length < 3) return null;
  if (looksLikeMetadata(trimmed)) return null;

  if (/^\(.*\)$/.test(trimmed)) return null;

  // Skip baris tanggal / jam / nomor telepon — sering jadi "harga hantu" saat OCR.
  // Hanya di-skip kalau hurufnya sedikit (bukan nama menu yang kebetulan ada angka).
  const looksLikeDateTime =
    /\b\d{1,2}[\/.\-]\d{1,2}([\/.\-]\d{2,4})?\b/.test(trimmed) ||
    /\b\d{1,2}:\d{2}\b/.test(trimmed);
  const looksLikePhone = /(?:\+?62|0)\d[\d\s\-]{7,}/.test(trimmed);
  if (
    (looksLikeDateTime || looksLikePhone) &&
    (trimmed.match(/[a-zA-Z]/g) || []).length < 4
  ) {
    return null;
  }

  const numberMatches = [...trimmed.matchAll(/[\d][\d.,]*/g)];
  const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length;

  let lastNumValue = 0;
  let lastNumIndex = trimmed.length;

  if (numberMatches.length > 0) {
    const lastNum = numberMatches[numberMatches.length - 1];
    const parsed = parseIDR(lastNum[0]);
    if (parsed !== null) {
      lastNumValue = parsed;
      lastNumIndex = lastNum.index ?? trimmed.length;
    }
  }

  const hasValidPrice = lastNumValue >= 100 && lastNumValue <= 10_000_000;

  if (letterCount < 2 && hasValidPrice) {
    return { name: "ORPHAN_PRICE", qty: 1, price: lastNumValue, total: lastNumValue };
  }

  if (letterCount < 2) return null;

  let qty = 1;
  let nameStart = 0;
  let nameEnd = hasValidPrice ? lastNumIndex : trimmed.length;

  const qtyPrefix = trimmed.match(/^(?:[^a-zA-Z0-9]{1,3}\s*|[a-zA-Z]{1,3}\s+)?(\d{1,2})\s*[xX×@]?\s+/);
  if (qtyPrefix) {
    qty = parseInt(qtyPrefix[1]);
    nameStart = qtyPrefix[0].length; 
  } else if (hasValidPrice) {
    const beforeLast = trimmed.slice(0, lastNumIndex);
    const qtyMid = beforeLast.match(/(\d{1,2})\s*[xX×@]\s*([\d.,]+)\s*$/);
    if (qtyMid) {
      const q = parseInt(qtyMid[1]);
      const unitPrice = parseIDR(qtyMid[2]);
      if (q >= 1 && q <= 50 && unitPrice !== null && unitPrice > 0) {
        if (Math.abs(q * unitPrice - lastNumValue) / Math.max(lastNumValue, 1) < 0.1) {
          qty = q;
          nameEnd = qtyMid.index ?? 0;
        }
      }
    } else {
      const qtyEnd = beforeLast.match(/(\d{1,2})\s*[xX×]\s*$/);
      if (qtyEnd) {
        qty = parseInt(qtyEnd[1]);
        nameEnd = qtyEnd.index ?? lastNumIndex;
      }
    }
  }

  const name = cleanName(trimmed.slice(nameStart, nameEnd));
  if (name.length < 2 || (name.match(/[a-zA-Z]/g) || []).length < 2) return null;

  if (!hasValidPrice) {
    return { name, qty, price: 0, total: 0 };
  }

  const total = lastNumValue;
  const price = qty > 0 ? Math.round(total / qty) : total;

  return { name, qty, price, total };
}

export function parseReceipt(rawText: string): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const tax = findAmount(lines, ['pajak', 'tax', 'ppn', 'pb1', 'pb 1', 'vat', 'gst']);
  const service = findAmount(lines, ['service', 'svc', 'layanan', 'penanganan', 'ongkir', 'biaya lainnya', 'gratuity', 'tip', 'delivery']);
  const discount = findAmount(lines, ['diskon', 'discount', 'potongan', 'voucher', 'promo', 'coupon']);
  const subtotalFound = findAmount(lines, ['subtotal', 'sub total', 'sub-total', 'total harga', 'amount']);
  const totalFound = findAmount(lines, ['grand total', 'total bayar', 'total pembayaran', 'balance', 'amount due', 'total']);

  const items: ParsedItem[] = [];
  let pendingItem: ParsedItem | null = null;

  for (const line of lines) {
    const item = tryParseItemLine(line);
    if (!item) continue;

    if (item.total === 0 && item.name !== "ORPHAN_PRICE") {
      if (pendingItem) {
        pendingItem.name += ` ${item.name}`;
      } else {
        pendingItem = item;
      }
      continue;
    }

    if (item.name === "ORPHAN_PRICE" && pendingItem) {
      pendingItem.total = item.total;
      pendingItem.price = Math.round(item.total / pendingItem.qty);
      items.push(pendingItem);
      pendingItem = null;
      continue;
    }

    if (item.name !== "ORPHAN_PRICE" && item.total > 0) {
      items.push(item);
      pendingItem = null; 
    }
  }

  const calculatedSubtotal = items.reduce((s, i) => s + i.total, 0);
  const subtotal = subtotalFound > 0 ? subtotalFound : calculatedSubtotal;
  const total = totalFound > 0 ? totalFound : subtotal + tax + service - discount;

  return { items, subtotal, tax, service, discount, total };
}