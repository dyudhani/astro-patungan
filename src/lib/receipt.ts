// Digital receipt HTML — shared by PDF (print) & PNG export. Pure: takes
// data as parameters instead of closing over app.ts's mutable state.

import type { PersonResult } from "./types";
import { escapeHtml } from "./dom";
import { fmtIDR } from "./format";
import { t, getLang } from "./i18n";

export interface BankInfo {
  name: string;
  acc: string;
  holder: string;
}

export function buildReceiptHTML(
  results: PersonResult[],
  paid: Record<string, boolean>,
  bank: BankInfo | null,
  payLink: string,
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString(getLang() === "en" ? "en-US" : "id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const bName = bank?.name?.trim();
  const bAcc = bank?.acc?.trim();
  const bHolder = bank?.holder?.trim();
  const link = payLink.trim();

  let bankHtml = "";
  if (bName || bAcc || bHolder || link) {
    bankHtml = `
      <div style="background-color: #0F172A; color: #F8FAFC; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center; page-break-inside: avoid; box-shadow: 0 4px 6px rgba(15,23,42,0.1);">
        <div style="font-size: 12px; color: #10B981; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">${t("receiptTransferTo")}</div>
        ${bName ? `<div style="font-size: 16px; font-weight: 600; color: #F8FAFC;">${t("shareBank", { name: escapeHtml(bName) })}</div>` : ""}
        ${bAcc ? `<div style="font-size: 28px; font-family: monospace; font-weight: 900; margin: 4px 0; color: #10B981; letter-spacing: 2px; user-select: all;">${escapeHtml(bAcc)}</div>` : ""}
        ${bHolder ? `<div style="font-size: 14px; color: #94A3B8; font-weight: 500;">${t("shareHolder", { holder: escapeHtml(bHolder) })}</div>` : ""}
        ${link ? `<div style="font-size: 13px; color: #10B981; font-weight: 600; margin-top: 8px; word-break: break-all;">🔗 ${escapeHtml(link)}</div>` : ""}
      </div>
    `;
  }

  const personHtml = results
    .map(
      (r) => `
    <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; border-bottom: 1px dashed #E2E8F0; padding-bottom: 12px;">
        <div style="background-color: #F1F5F9; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 16px;">👤</div>
        <span style="font-weight: 800; font-size: 18px; color: #0F172A;">${escapeHtml(r.name)}</span>
        ${paid[r.name] ? `<span style="margin-left:auto; font-size:11px; font-weight:700; background:#D1FAE5; color:#059669; padding:3px 10px; border-radius:6px;">${t("paidBadge")}</span>` : ""}
      </div>

      <div style="font-size: 14px; color: #334155;">
        ${r.items.map((i) => `
          <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
            <div style="flex:1; padding-right:12px; line-height: 1.4;">
              <span style="font-weight: 600; color: #0F172A;">${escapeHtml(i.name)}</span>
              ${i.qty < i.totalShares ? `<span style="color: #64748B; font-size: 12px; margin-left: 4px;">(${i.qty}/${i.totalShares})</span>` : ''}
            </div>
            <div style="font-family: monospace; font-weight: 500; color: #0F172A;">${fmtIDR(i.share)}</div>
          </div>
        `).join("")}

        <div style="height: 1px; background-color: #E2E8F0; margin: 12px 0;"></div>

        <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#475569; font-weight:600;">
          <div style="flex:1;">${t("subtotalLabel")}</div>
          <div style="font-family: monospace;">${fmtIDR(r.subtotal)}</div>
        </div>

        ${r.taxShare > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#475569;"><div style="flex:1;">${t("taxLabel")}</div><div style="font-family: monospace;">${fmtIDR(r.taxShare)}</div></div>` : ""}
        ${r.serviceShare > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#475569;"><div style="flex:1;">${t("serviceLabel")}</div><div style="font-family: monospace;">${fmtIDR(r.serviceShare)}</div></div>` : ""}
        ${r.discountShare > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#10B981; font-weight: 600;"><div style="flex:1;">${t("discountLabel")}</div><div style="font-family: monospace;">−${fmtIDR(r.discountShare)}</div></div>` : ""}
      </div>

      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 700; font-size: 14px; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">${t("receiptTotalDue")}</span>
        <span style="color: #FFFFFF; background-color: #10B981; padding: 6px 12px; border-radius: 8px; font-size: 18px; font-weight: 900; font-family: monospace; box-shadow: 0 2px 4px rgba(16,185,129,0.2);">${fmtIDR(r.totalRounded)}</span>
      </div>
    </div>
  `,
    )
    .join("");

  const grandRounded = results.reduce((s, r) => s + r.totalRounded, 0);

  return `
    <div style="border-bottom: 2px solid #10B981; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 32px; font-weight: 900; color: #0F172A; letter-spacing: -1px; line-height: 1;">patungan.</div>
        <span style="color: #10B981; font-size: 13px; font-weight: bold; margin-top: 6px; display: inline-block;">🔗 astro-patungan.vercel.app</span>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 1px;">${t("receiptDigital")}</div>
        <div style="font-size: 14px; color: #0F172A; font-weight: 600; margin-top: 2px;">${dateStr}</div>
      </div>
    </div>

    ${bankHtml}

    <div style="margin-bottom: 8px; font-weight: bold; font-size: 16px; color: #0F172A;">${t("receiptBreakdown")}</div>
    ${personHtml}

    <div style="margin-top: 24px; padding: 20px; background-color: #F8FAFC; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; border: 2px solid #10B981; page-break-inside: avoid;">
      <div>
        <div style="font-weight: 800; font-size: 18px; color: #0F172A;">${t("receiptTotalCollected")}</div>
        <div style="font-size: 13px; color: #64748B; margin-top: 4px;">${t("receiptPerReceipt")}</div>
      </div>
      <span style="font-weight: 900; font-size: 24px; color: #10B981; font-family: monospace;">${fmtIDR(grandRounded)}</span>
    </div>

    <div style="margin-top: 32px; text-align: center; color: #94A3B8; font-size: 12px;">
      <div style="font-weight: 600;">${t("receiptFooterFair")}</div>
      <div style="margin-top: 4px;">${t("receiptFooterCopyright")}</div>
    </div>
  `;
}

export function buildReceiptNode(
  results: PersonResult[],
  paid: Record<string, boolean>,
  bank: BankInfo | null,
  payLink: string,
): HTMLElement {
  const c = document.createElement("div");
  c.id = "print-container";
  c.style.cssText =
    "max-width:600px;margin:0 auto;padding:24px 20px;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#0F172A;";
  c.innerHTML = buildReceiptHTML(results, paid, bank, payLink);
  return c;
}
