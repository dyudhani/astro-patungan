// Turns a calculated split into shareable text/CSV/link. Pure functions —
// no DOM, no app.ts state — testable on their own.

import type { PersonResult } from "./types";
import { fmtIDR, csvCell } from "./format";
import type { BankInfo } from "./receipt";

export function buildShareText(
  results: PersonResult[],
  paid: Record<string, boolean>,
  payerName: string,
  bank: BankInfo | null,
  payLink: string,
): string {
  const lines: string[] = ["*Patungan* 🧾"];
  if (bank && (bank.name || bank.acc || bank.holder)) {
    lines.push("", "💳 Transfer ke:");
    if (bank.name) lines.push("Bank " + bank.name);
    if (bank.acc) lines.push(bank.acc);
    if (bank.holder) lines.push("a.n. " + bank.holder);
  }
  if (payLink) lines.push("", "🔗 Bayar: " + payLink);
  lines.push("");
  results.forEach((r) => {
    lines.push(
      `👤 *${r.name}* — ${fmtIDR(r.totalRounded)}${paid[r.name] ? " ✅ LUNAS" : ""}`,
    );
    r.items.forEach((i) =>
      lines.push(
        `   • ${i.name}${i.qty < i.totalShares ? ` (${i.qty}/${i.totalShares})` : ""}: ${fmtIDR(i.share)}`,
      ),
    );
  });
  const grand = results.reduce((s, r) => s + r.totalRounded, 0);
  lines.push("", `💰 Total: ${fmtIDR(grand)}`);
  if (payerName) {
    const others = results.filter((r) => r.name !== payerName && r.totalRounded > 0);
    if (others.length) {
      lines.push("", `🤝 Transfer ke *${payerName}* (yang nalangin):`);
      others.forEach((r) => lines.push(`   ${r.name}: ${fmtIDR(r.totalRounded)}`));
    }
  }
  lines.push("", "via patungan. — https://astro-patungan.vercel.app/");
  return lines.join("\n");
}

export function buildCsv(
  results: PersonResult[],
  paid: Record<string, boolean>,
): string {
  const rows: (string | number)[][] = [
    ["Nama", "Pesanan", "Subtotal", "Pajak", "Service", "Diskon", "Total", "Status"],
  ];
  results.forEach((r) => {
    const items = r.items
      .map(
        (i) =>
          `${i.name}${i.qty < i.totalShares ? ` (${i.qty}/${i.totalShares})` : ""}=${Math.round(i.share)}`,
      )
      .join("; ");
    rows.push([
      r.name,
      items,
      Math.round(r.subtotal),
      Math.round(r.taxShare),
      Math.round(r.serviceShare),
      Math.round(r.discountShare),
      r.totalRounded,
      paid[r.name] ? "LUNAS" : "Belum",
    ]);
  });
  const grand = results.reduce((s, r) => s + r.totalRounded, 0);
  rows.push([]);
  rows.push(["Total Terkumpul", "", "", "", "", "", grand, ""]);

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

// ===== Share link (encode state into the URL hash, still offline) =====

export function encodeShareState(state: unknown): string {
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeShareState(encoded: string): unknown {
  const json = decodeURIComponent(escape(atob(encoded)));
  return JSON.parse(json);
}

export function buildShareLink(state: unknown): string {
  return location.origin + location.pathname + "#s=" + encodeShareState(state);
}

/** Pull the "s=..." payload out of a URL hash like "#s=xyz", if present. */
export function extractShareHash(hash: string): string | null {
  const m = hash.match(/[#&]s=([^&]+)/);
  return m ? m[1] : null;
}
