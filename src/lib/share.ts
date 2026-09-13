// Turns a calculated split into shareable text/CSV/link. Pure functions —
// no DOM, no app.ts state — testable on their own.

import type { PersonResult } from "./types";
import { fmtIDR, csvCell } from "./format";
import type { BankInfo } from "./receipt";
import { t } from "./i18n";

export function buildShareText(
  results: PersonResult[],
  paid: Record<string, boolean>,
  payerName: string,
  bank: BankInfo | null,
  payLink: string,
): string {
  const lines: string[] = [t("shareHeader")];
  if (bank && (bank.name || bank.acc || bank.holder)) {
    lines.push("", t("shareTransferTo"));
    if (bank.name) lines.push(t("shareBank", { name: bank.name }));
    if (bank.acc) lines.push(bank.acc);
    if (bank.holder) lines.push(t("shareHolder", { holder: bank.holder }));
  }
  if (payLink) lines.push("", t("sharePay", { link: payLink }));
  lines.push("");
  results.forEach((r) => {
    lines.push(
      `👤 *${r.name}* — ${fmtIDR(r.totalRounded)}${paid[r.name] ? ` ✅ ${t("paidBadge")}` : ""}`,
    );
    r.items.forEach((i) =>
      lines.push(
        `   • ${i.name}${i.qty < i.totalShares ? ` (${i.qty}/${i.totalShares})` : ""}: ${fmtIDR(i.share)}`,
      ),
    );
  });
  const grand = results.reduce((s, r) => s + r.totalRounded, 0);
  lines.push("", t("shareTotal", { amount: fmtIDR(grand) }));
  if (payerName) {
    const others = results.filter((r) => r.name !== payerName && r.totalRounded > 0);
    if (others.length) {
      lines.push("", t("shareTransferToPayer", { payer: payerName }));
      others.forEach((r) => lines.push(`   ${r.name}: ${fmtIDR(r.totalRounded)}`));
    }
  }
  lines.push("", t("shareFooter"));
  return lines.join("\n");
}

// A private message for just one person's own breakdown, so a shared group
// chat message doesn't expose what everyone else owes.
export function buildPersonShareText(
  result: PersonResult,
  payerName: string,
  bank: BankInfo | null,
  payLink: string,
): string {
  const lines: string[] = [t("personShareHeader", { name: result.name }), ""];
  result.items.forEach((i) =>
    lines.push(
      `• ${i.name}${i.qty < i.totalShares ? ` (${i.qty}/${i.totalShares})` : ""}: ${fmtIDR(i.share)}`,
    ),
  );
  lines.push("", t("personShareSubtotal", { amount: fmtIDR(result.subtotal) }));
  if (result.taxShare > 0) lines.push(t("personSharePajak", { amount: fmtIDR(result.taxShare) }));
  if (result.serviceShare > 0)
    lines.push(t("personShareService", { amount: fmtIDR(result.serviceShare) }));
  if (result.discountShare > 0)
    lines.push(t("personShareDiskon", { amount: fmtIDR(result.discountShare) }));
  lines.push("", t("personShareTotal", { amount: fmtIDR(result.totalRounded) }));

  if (bank && (bank.name || bank.acc || bank.holder)) {
    lines.push("", t("shareTransferTo"));
    if (bank.name) lines.push(t("shareBank", { name: bank.name }));
    if (bank.acc) lines.push(bank.acc);
    if (bank.holder) lines.push(t("shareHolder", { holder: bank.holder }));
  }
  if (payLink) lines.push("", t("sharePay", { link: payLink }));
  if (payerName && payerName !== result.name) {
    lines.push("", t("personShareTransferToPayer", { payer: payerName }));
  }
  lines.push("", t("shareFooter"));
  return lines.join("\n");
}

export function buildCsv(
  results: PersonResult[],
  paid: Record<string, boolean>,
): string {
  const rows: (string | number)[][] = [
    [
      t("csvName"),
      t("csvItems"),
      t("subtotalLabel"),
      t("taxLabel"),
      t("serviceLabel"),
      t("discountLabel"),
      t("totalBillLabel"),
      t("csvStatus"),
    ],
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
      paid[r.name] ? t("csvStatusPaid") : t("csvStatusUnpaid"),
    ]);
  });
  const grand = results.reduce((s, r) => s + r.totalRounded, 0);
  rows.push([]);
  rows.push([t("csvTotalCollected"), "", "", "", "", "", grand, ""]);

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
