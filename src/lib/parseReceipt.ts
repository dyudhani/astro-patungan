/**
 * Parser for Indonesian & English receipt text.
 * Heuristic-based — not AI, but effective for common receipt formats.
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
  /** Number-consistency warnings (e.g. item total vs. receipt total far apart) — a sign OCR may have misread something. */
  warnings: string[];
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
  'bayar', 'payment', 'visa', 'mastercard', 'debit', 'credit', 'kredit', 'amex', 'card', 'edc',
  'qris', 'gopay', 'ovo', 'dana', 'shopeepay',
  'pay by', 'mem id', 'login', 'user id', 'user pass', 'free login',
  'tanggal', 'date', 'jam', 'time',
  'kasir', 'cashier', 'meja', 'table', 'pax', 'guest', 'tamu',
  'struk', 'receipt', 'invoice', 'nota', 'bill',
  'terima kasih', 'thank you', 'thanks',
  'npwp', 'nomor', 'no.', 'no :', 'no:',
  'rounding', 'pembulatan',
  // Common noise on Indonesian POS receipts (Moka, Pawoon, Olsera, Majoo, Qasir, iSeller, ESB, GoBiz)
  'poin', 'point', 'member', 'membership', 'saldo',
  'powered', 'www', 'http', '.com', 'telp', 'telepon', 'hotline',
  'cabang', 'outlet', 'alamat', 'gerai',
  'approval', 'batch', 'trace', 'antrian', 'queue', 'operator', 'shift', 'reprint',
  'order id', 'order#', 'no urut', 'no. urut', 'order no', 'order :',
  'dine in', 'dine-in', 'take away', 'takeaway', 'pesanan diterima'
];

// Matches keywords with punctuation/spaces (e.g. "sub total", "no.") — those
// are safe to loose-match, since a menu name can't accidentally contain one.
const PHRASE_OR_PUNCT_KEYWORD = /[^a-z0-9]/i;

// Smart matching: avoid word collisions (e.g. "Tipat" vs "Tip")
function isKeywordMatch(text: string, kw: string): boolean {
  const lc = text.toLowerCase();

  // Prevent "total" from colliding with "subtotal"
  if (kw === 'total') {
    return new RegExp(`\\btotal\\b`, 'i').test(lc) && !lc.includes('subtotal') && !lc.includes('sub total');
  }

  // "jam" (hour) is metadata only in a TIME LABEL ("Jam : 22:12"), not inside
  // a menu name like "... 2 JAM" (a 2-hour package) — those must stay.
  if (kw === 'jam') {
    return /\bjam\b\s*:?\s*\d{1,2}:\d{2}/i.test(lc) || /^jam\b/i.test(lc.trim());
  }

  // Every other single-word keyword ALWAYS uses word boundaries (\b) — loose
  // substring matching silently deleted real items like "Nasi Goreng BILLzard".
  if (!PHRASE_OR_PUNCT_KEYWORD.test(kw)) {
    return new RegExp(`\\b${kw}\\b`, 'i').test(lc);
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

// Merge numbers OCR split with a stray space (e.g. "17 700" -> "17700").
// IMPORTANT FIX: this used to be written [0]{3}, so 700 never merged.
function mergeOcrSplitDigits(s: string): string {
  return s.replace(/(\d+)[.,\s]+(\d{3})(?!\d)/g, '$1$2');
}

function findAmount(lines: string[], keywords: string[]): number {
  for (const line of lines) {
    const isMatch = keywords.some((kw) => isKeywordMatch(line, kw));
    if (isMatch) {
      // Strip percentage text (e.g. 10%) so it isn't captured as an amount
      const cleanedLine = mergeOcrSplitDigits(line.replace(/\b\d+\s*%/g, ''));

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
  const trimmed = mergeOcrSplitDigits(line.trim());

  if (trimmed.length < 3) return null;
  if (looksLikeMetadata(trimmed)) return null;

  if (/^\(.*\)$/.test(trimmed)) return null;

  // Skip date/time/phone lines ("ghost prices" during OCR) — but only when
  // there are few letters, so a menu name with digits isn't dropped.
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

  // Convenience-store 4-column layout: "NAME QTY PRICE TOTAL" (Circle K, etc).
  // Name may contain digits, so take the last 3 numbers as qty/price/total.
  const trailing3 = trimmed.match(/(\d{1,3})\s+([\d.,]+)\s+([\d.,]+)\s*$/);
  if (trailing3) {
    const q = parseInt(trailing3[1], 10);
    const unit = parseIDR(trailing3[2]);
    const tot = parseIDR(trailing3[3]);
    if (
      q >= 1 &&
      q <= 99 &&
      unit !== null &&
      unit >= 100 &&
      unit <= 10_000_000 &&
      tot !== null &&
      tot >= 100 &&
      tot <= 10_000_000 &&
      Math.abs(q * unit - tot) / Math.max(tot, 1) < 0.15
    ) {
      const nm = cleanName(trimmed.slice(0, trailing3.index ?? 0));
      if (nm.length >= 2 && (nm.match(/[a-zA-Z]/g) || []).length >= 2) {
        return { name: nm, qty: q, price: unit, total: tot };
      }
    }
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
  let subtotal = subtotalFound > 0 ? subtotalFound : calculatedSubtotal;
  let finalTax = tax;
  let finalService = service;
  let total = totalFound > 0 ? totalFound : subtotal + tax + service - discount;

  // Detect tax-already-included prices (e.g. "BKP SUDAH TERMASUK PPN") — if
  // items ≈ grand total, tax/service must not be added again on top.
  const base = calculatedSubtotal > 0 ? calculatedSubtotal : subtotal;
  const taxIncludedKeyword = /termasuk\s+(ppn|pajak|tax)|sudah\s+termasuk|incl(usive)?/i.test(
    rawText,
  );
  if (
    totalFound > 0 &&
    base > 0 &&
    Math.abs(base - totalFound) / totalFound < 0.03
  ) {
    finalTax = 0;
    finalService = 0;
    subtotal = base;
    total = totalFound;
  } else if (taxIncludedKeyword && base > 0 && (finalTax > 0 || finalService > 0)) {
    // Found a "tax included" marker but the numbers aren't conclusive — play
    // it safe and zero out tax only if the items already come close to the found total.
    if (totalFound > 0 && Math.abs(base - totalFound) / totalFound < 0.06) {
      finalTax = 0;
      finalService = 0;
    }
  }

  // Sanity check: if the numbers don't add up, OCR likely misread something —
  // warn the user instead of silently splitting the bill with wrong numbers.
  const warnings: string[] = [];
  const fmtNum = (n: number) => Math.round(n).toLocaleString("id-ID");

  if (totalFound > 0 && calculatedSubtotal > 0) {
    const expectedTotal = calculatedSubtotal + finalTax + finalService - discount;
    if (Math.abs(expectedTotal - totalFound) / totalFound > 0.08) {
      warnings.push(
        `Total dari rincian item (Rp ${fmtNum(expectedTotal)}) beda jauh dari TOTAL di struk (Rp ${fmtNum(totalFound)}) — kemungkinan ada angka yang salah kebaca, cek manual.`,
      );
    }
  }
  if (subtotalFound > 0 && calculatedSubtotal > 0) {
    // The receipt's Subtotal is usually already net of discount, so compare
    // net (not the raw item sum) so a legitimate discount isn't mistaken for a misread.
    const netCalculated = calculatedSubtotal - discount;
    if (Math.abs(netCalculated - subtotalFound) / subtotalFound > 0.08) {
      warnings.push(
        `Jumlah semua item (Rp ${fmtNum(netCalculated)}) tidak cocok dengan Subtotal di struk (Rp ${fmtNum(subtotalFound)}) — kemungkinan ada item yang salah kebaca.`,
      );
    }
  }
  if (totalFound === 0 && subtotalFound === 0 && items.length > 0) {
    warnings.push(
      `Baris "Subtotal/Total" tidak terbaca dari struk — isi manual di langkah berikutnya.`,
    );
  }

  return {
    items,
    subtotal,
    tax: finalTax,
    service: finalService,
    discount,
    total,
    warnings,
  };
}