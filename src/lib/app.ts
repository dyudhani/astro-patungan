import { parseReceipt } from "./parseReceipt";
import type { Bill, BillItem, Person, PersonResult } from "./types";
import { $, escapeHtml, triggerDownload, downloadBlob } from "./dom";
import { fmtIDR, roundCfg, type RoundMode } from "./format";
import {
  itemSharersCount,
  itemTotalShares,
  calculateSplit,
  applyReconcile as applyReconcileCalc,
} from "./calc";
import { recognizeReceipt } from "./ocr";
import { loadHtmlToImage } from "./cdn";
import { buildReceiptNode, type BankInfo } from "./receipt";
import {
  buildShareText,
  buildPersonShareText,
  buildCsv,
  buildShareLink as encodeShareLink,
  decodeShareState,
  extractShareHash,
} from "./share";
import { setupThemeToggle } from "./theme";
import { registerServiceWorker } from "./pwa";
import { setupInstallPrompt } from "./install-prompt";
import { showAlert, showConfirm } from "./modal";
import { showToast } from "./toast";
import { t, getLang, onLangChange, applyStaticTranslations } from "./i18n";
import { setupLangToggle } from "./lang-toggle";

// html-to-image via CDN (for PNG export).
declare const htmlToImage: {
  toPng: (node: HTMLElement, opts?: any) => Promise<string>;
};

// ============ STATE ============
let bill: Bill = { items: [], tax: 0, service: 0, discount: 0 };
let people: Person[] = [];
let nextItemId = 1;
let nextPersonId = 1;
let selectedFile: File | null = null;
let payerName = ""; // who fronted the money (settle-up)
let savedBank: { name: string; acc: string; holder: string } | null = null;
let rotation = 0; // receipt image rotation (0/90/180/270) for tilted photos
let paid: Record<string, boolean> = {}; // "paid" checklist per name
let payLink = ""; // payment link (QRIS/e-wallet)
let reconcile = false; // make the collected total match the bill (diff goes to 1 person)
let summaryPaidBound = false; // has the "paid" checkbox listener been attached?
let appendMode = false; // true after "+ Tambah dari struk lain" — merge instead of replace

// roundTotal & roundCfg → ./format ; calculations → ./calc ; OCR → ./ocr

// ============ STEP 1: UPLOAD ============
const dropzone = $<HTMLLabelElement>("dropzone");
const fileInput = $<HTMLInputElement>("file-input");
const preview = $("preview");
const previewImg = $<HTMLImageElement>("preview-img");
const previewRemove = $("preview-remove");
const btnScan = $<HTMLButtonElement>("btn-scan");
const btnSkip = $("btn-skip");
const scanLabel = $("scan-label");
const uploadError = $("upload-error");
const progressWrap = $("progress-wrap");
const progressBar = $("progress-bar");
const progressText = $("progress-text");

// Shows parseReceipt's number warnings. Renders into #scan-warning inside
// step-bill, not step-upload's uploadError, which scrolls out of view.
function renderScanWarnings(warnings: string[]) {
  const el = $("scan-warning");
  if (warnings.length === 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `<div class="info">⚠️ <b>${t("scanWarningHeading")}</b><br/>${warnings
    .map((w) => "• " + escapeHtml(w))
    .join("<br/>")}</div>`;
}

// Shows/hides the "adding to an existing bill" banner in step-upload, with a
// way to cancel back to normal (replace) mode.
function syncAppendModeBanner() {
  const el = $("append-mode-banner");
  if (!appendMode) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `<div class="info">${t("appendBannerText", { count: bill.items.length })} <button type="button" id="btn-cancel-append" style="margin-left:6px;text-decoration:underline;background:none;border:none;color:inherit;cursor:pointer;font-weight:600;">${t("btnCancel")}</button></div>`;
  $("btn-cancel-append").addEventListener("click", () => {
    appendMode = false;
    syncAppendModeBanner();
  });
}

// Merges freshly scanned/entered items into the existing bill (append mode)
// or replaces it entirely — the single point every entry path routes through.
// True if most of `newItems` already match an existing item by name+total —
// a strong hint the same struk got scanned/pasted twice by mistake.
function looksLikeDuplicateScan(
  newItems: { name: string; total: number }[],
  existing: BillItem[],
): boolean {
  if (newItems.length === 0 || existing.length === 0) return false;
  const existingKeys = new Set(
    existing.map((i) => `${i.name.trim().toLowerCase()}|${i.total}`),
  );
  const matches = newItems.filter((i) =>
    existingKeys.has(`${i.name.trim().toLowerCase()}|${i.total}`),
  ).length;
  return matches / newItems.length >= 0.6;
}

// Returns false (and leaves `bill` untouched) if the user cancels after
// being warned this looks like a duplicate scan — callers must check this
// before assuming their new items/ids exist.
async function mergeOrReplaceBill(
  newItems: { name: string; qty: number; price: number; total: number }[],
  tax: number,
  service: number,
  discount: number,
): Promise<boolean> {
  if (appendMode && looksLikeDuplicateScan(newItems, bill.items)) {
    const proceed = await showConfirm(t("duplicateScanConfirm"), {
      confirmLabel: t("duplicateScanConfirmYes"),
      cancelLabel: t("btnCancel"),
    });
    if (!proceed) {
      appendMode = false;
      syncAppendModeBanner();
      return false;
    }
  }

  const itemsWithIds = newItems.map((it) => ({ id: nextItemId++, ...it }));
  if (appendMode) {
    bill = {
      items: [...bill.items, ...itemsWithIds],
      tax: bill.tax + tax,
      service: bill.service + service,
      discount: bill.discount + discount,
    };
    appendMode = false;
  } else {
    bill = { items: itemsWithIds, tax, service, discount };
  }
  syncAppendModeBanner();
  return true;
}

// 90° rotate button for tilted/sideways receipt photos (injected into #preview).
const rotateBtn = document.createElement("button");
rotateBtn.type = "button";
rotateBtn.id = "preview-rotate";
rotateBtn.textContent = t("rotateBtnText");
rotateBtn.title = t("rotateBtnTitle");
rotateBtn.style.cssText =
  "position:absolute;bottom:8px;right:8px;background:rgba(15,23,42,0.85);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;z-index:2;";
preview.appendChild(rotateBtn);
rotateBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  rotation = (rotation + 90) % 360;
  previewImg.style.transform = `rotate(${rotation}deg)`;
  previewImg.style.transformOrigin = "center";
});

// ============ DIRECT CAMERA + PASTE TEXT (injected into #step-upload) ============
// Hidden input with capture=environment → opens the back camera directly on phones.
const camInput = document.createElement("input");
camInput.type = "file";
camInput.accept = "image/*";
camInput.setAttribute("capture", "environment");
camInput.style.display = "none";
document.body.appendChild(camInput);
camInput.addEventListener("change", () => {
  const f = camInput.files?.[0];
  if (f) setFile(f);
});

const extraRow = document.createElement("div");
extraRow.style.cssText =
  "display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;";
extraRow.innerHTML = `
  <button type="button" id="btn-camera" class="btn btn-secondary" style="flex:1; min-width:140px; font-size:13px;">${t("btnCamera")}</button>
  <button type="button" id="btn-paste" class="btn btn-secondary" style="flex:1; min-width:140px; font-size:13px;">${t("btnPaste")}</button>`;
btnSkip.parentElement?.appendChild(extraRow);

const pastePanel = document.createElement("div");
pastePanel.id = "paste-panel";
pastePanel.className = "hidden";
pastePanel.style.cssText = "margin-top:10px;";
pastePanel.innerHTML = `
  <textarea id="paste-text" class="input" rows="6" placeholder="${t("pasteTextPlaceholder")}" aria-label="${t("pasteTextAria")}" style="width:100%; font-family:var(--mono); font-size:13px; line-height:1.5;"></textarea>
  <button type="button" id="btn-parse-text" class="btn btn-primary btn-block" style="margin-top:8px;">${t("btnParseText")}</button>`;
btnSkip.parentElement?.appendChild(pastePanel);

$("btn-camera").addEventListener("click", () => camInput.click());
$("btn-paste").addEventListener("click", () => {
  pastePanel.classList.toggle("hidden");
  if (!pastePanel.classList.contains("hidden"))
    $<HTMLTextAreaElement>("paste-text").focus();
});
$("btn-parse-text").addEventListener("click", async () => {
  const txt = $<HTMLTextAreaElement>("paste-text").value.trim();
  if (!txt) {
    await showAlert(t("pasteEmptyAlert"));
    return;
  }
  const parsed = parseReceipt(txt);
  const merged = await mergeOrReplaceBill(parsed.items, parsed.tax, parsed.service, parsed.discount);
  if (!merged) return;
  if (parsed.items.length === 0) await showAlert(t("noItemsFromTextAlert"));
  renderScanWarnings(parsed.warnings);
  pastePanel.classList.add("hidden");
  renderBillStep();
  $("step-bill").classList.remove("hidden");
  $("step-bill").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ============ SPLIT TOTAL EVENLY ONLY (no item breakdown) ============
const totalOnlyRow = document.createElement("div");
totalOnlyRow.style.cssText = "margin-top:8px;";
totalOnlyRow.innerHTML = `<button type="button" id="btn-total-only" class="btn btn-secondary btn-block" style="font-size:13px;">${t("btnTotalOnly")}</button>`;
btnSkip.parentElement?.appendChild(totalOnlyRow);

const totalOnlyPanel = document.createElement("div");
totalOnlyPanel.id = "total-only-panel";
totalOnlyPanel.className = "hidden";
totalOnlyPanel.style.cssText =
  "margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;";
totalOnlyPanel.innerHTML = `
  <input type="number" id="to-total" class="input mono" placeholder="${t("toTotalPlaceholder")}" aria-label="${t("toTotalPlaceholder")}" style="width:100%;" />
  <textarea id="to-names" class="input" rows="2" placeholder="${t("toNamesPlaceholder")}" aria-label="${t("toNamesAria")}" style="width:100%; margin-top:8px; font-family:inherit;"></textarea>
  <button type="button" id="to-go" class="btn btn-primary btn-block" style="margin-top:8px;">${t("btnGo")}</button>`;
btnSkip.parentElement?.appendChild(totalOnlyPanel);

$("btn-total-only").addEventListener("click", () =>
  totalOnlyPanel.classList.toggle("hidden"),
);
$("to-go").addEventListener("click", async () => {
  const total = Math.max(0, Number($<HTMLInputElement>("to-total").value) || 0);
  const names = $<HTMLTextAreaElement>("to-names")
    .value.split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (total <= 0) {
    await showAlert(t("totalBillEmptyAlert"));
    return;
  }
  if (names.length === 0) {
    await showAlert(t("namesEmptyAlert"));
    return;
  }
  const wasAppend = appendMode;
  const merged = await mergeOrReplaceBill(
    [{ name: t("totalBillLabel"), qty: 1, price: total, total }],
    0,
    0,
    0,
  );
  if (!merged) return;
  const iid = bill.items[bill.items.length - 1].id;

  if (wasAppend) {
    // Add any new names, then charge everyone (old + new) for this item too.
    const existingNames = new Set(people.map((p) => p.name));
    names
      .filter((n) => !existingNames.has(n))
      .forEach((name) => people.push({ id: nextPersonId++, name, items: {} }));
    people.forEach((p) => {
      p.items[iid] = 1;
    });
  } else {
    people = names.map((name) => ({ id: nextPersonId++, name, items: { [iid]: 1 } }));
  }
  totalOnlyPanel.classList.add("hidden");
  renderBillStep();
  renderPeopleStep();
  $("step-bill").classList.remove("hidden");
  $("step-people").classList.remove("hidden");
  $("step-people").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ============ BILL-SPLIT HISTORY (UI) ============
const histRow = document.createElement("div");
histRow.style.cssText = "margin-top:8px;";
histRow.innerHTML = `<button type="button" id="btn-history" class="btn btn-secondary btn-block" style="font-size:13px;">${t("btnHistory")}</button>`;
btnSkip.parentElement?.appendChild(histRow);

const histPanel = document.createElement("div");
histPanel.id = "history-panel";
histPanel.className = "hidden";
histPanel.style.cssText = "margin-top:10px;";
btnSkip.parentElement?.appendChild(histPanel);

function renderHistory() {
  const list = loadHistory();
  if (list.length === 0) {
    histPanel.innerHTML = `<div style="font-size:13px;color:var(--ink-muted);padding:10px;">${t("historyEmpty")}</div>`;
    return;
  }
  histPanel.innerHTML = list
    .map((h, idx) => {
      let when = "";
      try {
        when = new Date(h.ts).toLocaleString(getLang() === "en" ? "en-US" : "id-ID", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        /* noop */
      }
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;">
        <div style="font-size:13px;color:var(--ink);"><b>${fmtIDR(h.grand || 0)}</b> · ${t("historyPeopleCount", { count: h.peopleCount || 0 })}<br/><span style="color:var(--ink-muted);font-size:12px;">${when}</span></div>
        <div style="display:flex;gap:6px;">
          <button type="button" data-hist-open="${idx}" class="btn" style="background:var(--accent);color:#fff;font-size:12px;padding:6px 12px;">${t("historyOpenBtn")}</button>
          <button type="button" data-hist-del="${idx}" class="btn" style="background:var(--danger-soft);color:var(--danger);font-size:12px;padding:6px 10px;">${t("historyDelBtn")}</button>
        </div>
      </div>`;
    })
    .join("");
}

$("btn-history").addEventListener("click", () => {
  histPanel.classList.toggle("hidden");
  if (!histPanel.classList.contains("hidden")) renderHistory();
});

histPanel.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const openBtn = t.closest("[data-hist-open]") as HTMLElement | null;
  if (openBtn) {
    const h = loadHistory()[Number(openBtn.dataset.histOpen)];
    if (h) {
      restoreSession(h);
      renderResult();
      $("step-result").classList.remove("hidden");
      $("step-result").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }
  const delBtn = t.closest("[data-hist-del]") as HTMLElement | null;
  if (delBtn) {
    const list = loadHistory();
    list.splice(Number(delBtn.dataset.histDel), 1);
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(list));
    } catch {
      /* noop */
    }
    renderHistory();
    return;
  }
});

function setFile(file: File | null) {
  selectedFile = file;
  uploadError.innerHTML = "";
  rotation = 0;
  previewImg.style.transform = "";
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target?.result as string;
      preview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
    btnScan.disabled = false;
    scanLabel.textContent = t("scanLabelRescan");
  } else {
    preview.classList.add("hidden");
    previewImg.src = "";
    btnScan.disabled = true;
    scanLabel.textContent = t("scanLabelChooseFirst");
  }
}

fileInput.addEventListener("change", (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) setFile(f);
});

previewRemove.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileInput.value = "";
  setFile(null);
});

["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  }),
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  }),
);
dropzone.addEventListener("drop", (e) => {
  const f = (e as DragEvent).dataTransfer?.files?.[0];
  if (f && f.type.startsWith("image/")) setFile(f);
});

function setProgress(pct: number, text: string) {
  progressBar.style.width = pct + "%";
  progressText.textContent = text;
}

// OCR (preprocessing + Tesseract dual-pass) moved to ./ocr.ts → recognizeReceipt

btnScan.addEventListener("click", async () => {
  if (!selectedFile) return;
  btnScan.disabled = true;
  scanLabel.innerHTML = `<span class="spinner"></span> ${t("scanLabelProcessing")}`;
  uploadError.innerHTML = "";
  progressWrap.classList.remove("hidden");
  setProgress(5, t("ocrLoadingTesseract"));

  try {
    const parsed = await recognizeReceipt(selectedFile, {
      rotation,
      onProgress: setProgress,
    });

    const merged = await mergeOrReplaceBill(
      parsed.items,
      parsed.tax,
      parsed.service,
      parsed.discount,
    );
    if (!merged) return;

    if (parsed.items.length === 0) {
      uploadError.innerHTML = `<div class="info">${t("ocrNoItemsWarning")}</div>`;
    }
    renderScanWarnings(parsed.warnings);

    renderBillStep();
    $("step-bill").classList.remove("hidden");
    $("step-bill").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err: any) {
    console.error(err);
    uploadError.innerHTML = `<div class="error">❌ ${err.message || t("ocrErrorGeneric")}${t("ocrErrorSuffix")}</div>`;
  } finally {
    progressWrap.classList.add("hidden");
    setProgress(0, "");
    btnScan.disabled = false;
    scanLabel.textContent = t("scanLabelScanAgain");
  }
});

btnSkip.addEventListener("click", async () => {
  await mergeOrReplaceBill([], 0, 0, 0);
  renderBillStep();
  $("step-bill").classList.remove("hidden");
  $("step-bill").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ============ STEP 2: BILL EDIT ============
function renderBillStep() {
  const list = $("items-list");
  list.innerHTML = "";
  bill.items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.style.display = "flex";
    row.style.flexDirection = "column";
    row.style.gap = "8px";
    row.style.padding = "14px 0";
    row.style.borderBottom = "1px solid var(--line)";

    row.innerHTML = `
      <div style="display:flex; gap:6px; width: 100%; align-items:center;">
        <input type="text" class="input" value="${escapeHtml(item.name)}" data-id="${item.id}" data-field="name" placeholder="${t("itemNamePlaceholder")}" aria-label="${t("itemNameAria")}" style="flex:1; color:var(--ink); font-weight:600;" />
        <button data-move="up" data-id="${item.id}" type="button" title="${t("moveUpTitle")}" aria-label="${t("moveUpAria")}" style="background:var(--line-soft); color:var(--ink); border:1px solid var(--line); border-radius:8px; width:34px; height:38px; cursor:pointer; font-weight:bold;">↑</button>
        <button data-move="down" data-id="${item.id}" type="button" title="${t("moveDownTitle")}" aria-label="${t("moveDownAria")}" style="background:var(--line-soft); color:var(--ink); border:1px solid var(--line); border-radius:8px; width:34px; height:38px; cursor:pointer; font-weight:bold;">↓</button>
        <button data-dup="${item.id}" type="button" title="${t("dupTitle")}" aria-label="${t("dupAria")}" style="background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent-soft); border-radius:8px; width:34px; height:38px; cursor:pointer; font-weight:bold;">⧉</button>
        <button class="person-remove" data-remove="${item.id}" type="button" aria-label="${t("removeItemAria")}" style="background:var(--danger-soft); color:var(--danger); border-radius:8px; width:40px; height:38px; display:flex; align-items:center; justify-content:center; font-weight:bold;">✕</button>
      </div>
      <div style="display:flex; align-items:center; gap:6px; width: 100%;">
        <input type="number" class="input mono" value="${item.qty}" min="1" data-id="${item.id}" data-field="qty" title="${t("qtyTitle")}" aria-label="${t("qtyTitle")}" style="width:60px; text-align:center; padding:8px 4px; color:var(--ink); border:1px solid var(--line);" />
        <span style="color:var(--ink-muted); font-size:14px; font-weight:bold;">×</span>
        <div style="position:relative; flex:1; max-width: 120px;">
          <span style="position:absolute; left:8px; top:10px; font-size:12px; color:var(--ink-muted);">@</span>
          <input type="number" class="input mono" value="${item.price}" min="0" data-id="${item.id}" data-field="price" title="${t("unitPriceTitle")}" placeholder="${t("unitPricePlaceholder")}" aria-label="${t("unitPriceAria")}" style="width:100%; padding:8px 8px 8px 24px; text-align:right; color:var(--ink); border:1px solid var(--line);" />
        </div>
        <span style="color:var(--ink-muted); font-size:14px; font-weight:bold;">=</span>
        <div style="position:relative; flex:1;">
          <span style="position:absolute; left:8px; top:10px; font-size:12px; color:var(--accent); font-weight:bold;">Rp</span>
          <input type="number" class="input mono" value="${item.total}" min="0" data-id="${item.id}" data-field="total" title="${t("totalPriceTitle")}" placeholder="${t("totalPricePlaceholder")}" aria-label="${t("totalPriceAria")}" style="width:100%; padding:8px 8px 8px 28px; text-align:right; color:var(--accent); font-weight:bold; background:var(--accent-soft); border:1px solid var(--accent-soft);" />
        </div>
      </div>
    `;
    list.appendChild(row);
  });

  // On render, show the raw values in nominal (Rp) mode.
  $<HTMLSelectElement>("t-tax-mode").value = "nominal";
  $<HTMLSelectElement>("t-service-mode").value = "nominal";
  $<HTMLSelectElement>("t-discount-mode").value = "nominal";
  $<HTMLInputElement>("t-tax").value = String(bill.tax);
  $<HTMLInputElement>("t-service").value = String(bill.service);
  $<HTMLInputElement>("t-discount").value = String(bill.discount);
  updateBillTotals();
}

// Compute the nominal value for a row (tax/service/discount) that has an Rp/% mode.
// If mode is "%", the value is computed from the subtotal and the nominal is displayed.
function resolveCharge(key: string, subtotal: number): number {
  const mode = $<HTMLSelectElement>(`t-${key}-mode`).value;
  const inputVal = Math.max(0, Number($<HTMLInputElement>(`t-${key}`).value) || 0);
  const nominalRow = $(`t-${key}-nominal-row`);
  let value = inputVal;
  if (mode === "percent") {
    value = Math.round(subtotal * (inputVal / 100));
    $(`t-${key}-nominal-display`).textContent = "= " + fmtIDR(value);
    nominalRow.classList.remove("hidden");
  } else {
    nominalRow.classList.add("hidden");
  }
  return value;
}

function updateBillTotals() {
  const subtotal = bill.items.reduce((s, i) => s + i.price * i.qty, 0);
  $("t-subtotal").textContent = fmtIDR(subtotal);

  bill.tax = resolveCharge("tax", subtotal);
  bill.service = resolveCharge("service", subtotal);
  bill.discount = resolveCharge("discount", subtotal);

  const total = subtotal + bill.tax + bill.service - bill.discount;
  $("t-total").textContent = fmtIDR(Math.max(0, total));
  scheduleSave();
}

$("items-list").addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  const id = Number(t.dataset.id);
  const field = t.dataset.field;
  if (!id || !field) return;
  
  const item = bill.items.find((i) => i.id === id);
  if (!item) return;

  const row = t.closest(".item-row");

  if (field === "name") {
    item.name = t.value;
  } else if (field === "qty") {
    item.qty = Math.max(1, Number(t.value) || 1);
    item.total = item.price * item.qty;
    if (row) {
      const totInput = row.querySelector(`[data-field="total"]`) as HTMLInputElement;
      if (totInput) totInput.value = String(item.total);
    }
  } else if (field === "price") { 
    item.price = Math.max(0, Number(t.value) || 0);
    item.total = item.price * item.qty;
    if (row) {
      const totInput = row.querySelector(`[data-field="total"]`) as HTMLInputElement;
      if (totInput) totInput.value = String(item.total);
    }
  } else if (field === "total") { 
    item.total = Math.max(0, Number(t.value) || 0);
    item.price = Math.round(item.total / item.qty);
    if (row) {
      const priceInput = row.querySelector(`[data-field="price"]`) as HTMLInputElement;
      if (priceInput) priceInput.value = String(item.price);
    }
  }
  
  updateBillTotals();
});

$("items-list").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  const removeBtn = target.closest("[data-remove]") as HTMLElement | null;
  if (removeBtn) {
    const id = Number(removeBtn.dataset.remove);
    const idx = bill.items.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const removedItem = bill.items[idx];
    const removedShares = people
      .filter((p) => p.items[id] !== undefined)
      .map((p) => ({ p, qty: p.items[id] }));

    bill.items.splice(idx, 1);
    people.forEach((p) => delete p.items[id]);
    renderBillStep();

    showToast(t("deletedToast", { name: removedItem.name || t("itemNoNameFallback") }), {
      actionLabel: t("undoLabel"),
      onAction: () => {
        bill.items.splice(idx, 0, removedItem);
        removedShares.forEach(({ p, qty }) => {
          p.items[id] = qty;
        });
        renderBillStep();
      },
    });
    return;
  }

  // Duplicate order (inserted right below it).
  const dupBtn = target.closest("[data-dup]") as HTMLElement | null;
  if (dupBtn) {
    const id = Number(dupBtn.dataset.dup);
    const idx = bill.items.findIndex((i) => i.id === id);
    if (idx >= 0) {
      bill.items.splice(idx + 1, 0, { ...bill.items[idx], id: nextItemId++ });
      renderBillStep();
    }
    return;
  }

  // Reorder up/down.
  const moveBtn = target.closest("[data-move]") as HTMLElement | null;
  if (moveBtn) {
    const id = Number(moveBtn.dataset.id);
    const idx = bill.items.findIndex((i) => i.id === id);
    const ni = moveBtn.dataset.move === "up" ? idx - 1 : idx + 1;
    if (idx >= 0 && ni >= 0 && ni < bill.items.length) {
      [bill.items[idx], bill.items[ni]] = [bill.items[ni], bill.items[idx]];
      renderBillStep();
    }
    return;
  }
});

$("btn-add-item").addEventListener("click", () => {
  bill.items.push({
    id: nextItemId++,
    name: "",
    qty: 1,
    price: 0,
    total: 0,
  });
  renderBillStep();
  const inputs = $("items-list").querySelectorAll('input[data-field="name"]');
  const last = inputs[inputs.length - 1] as HTMLInputElement | undefined;
  last?.focus();
});

// Sends the user back to step-upload to scan/paste a second receipt, whose
// items get merged into the current bill instead of replacing it.
$("btn-add-receipt").addEventListener("click", () => {
  appendMode = true;
  setFile(null);
  fileInput.value = "";
  uploadError.innerHTML = "";
  syncAppendModeBanner();
  $("step-upload").scrollIntoView({ behavior: "smooth", block: "start" });
});

// Tax / Service / Discount — each has a value input + mode selector (Rp/%).
["t-tax", "t-service", "t-discount"].forEach((id) =>
  $(id).addEventListener("input", updateBillTotals),
);
["t-tax-mode", "t-service-mode", "t-discount-mode"].forEach((id) =>
  $(id).addEventListener("change", updateBillTotals),
);

// Quick presets for Service Charge (10/15/20%) — sets percent mode + value.
document.querySelectorAll("[data-service-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $<HTMLSelectElement>("t-service-mode").value = "percent";
    $<HTMLInputElement>("t-service").value = (btn as HTMLElement).dataset.servicePreset!;
    updateBillTotals();
  });
});

$("btn-to-people").addEventListener("click", async () => {
  if (bill.items.length === 0) {
    await showAlert(t("addMinItemAlert"));
    return;
  }
  if (people.length === 0) {
    people = [
      { id: nextPersonId++, name: `${t("defaultPersonName")} 1`, items: {} },
      { id: nextPersonId++, name: `${t("defaultPersonName")} 2`, items: {} },
    ];
  }
  renderPeopleStep();
  $("step-people").classList.remove("hidden");
  $("step-people").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ============ STEP 3: PEOPLE ============
// Thin wrapper around the pure functions in ./calc (using the current `people` state).
const getItemSharersCount = (itemId: number) => itemSharersCount(people, itemId);
const getItemTotalShares = (itemId: number) => itemTotalShares(people, itemId);

function renderPeopleStep() {
  const list = $("people-list");
  list.innerHTML = "";

  const peopleManager = document.createElement("div");
  peopleManager.style.marginBottom = "20px";
  peopleManager.style.paddingBottom = "20px";
  peopleManager.style.borderBottom = "2px dashed var(--line)";

  const tagsHtml = people.map(p => `
    <div style="display:inline-flex; align-items:center; background:var(--line-soft); border:1px solid var(--line); color:var(--ink); padding:6px 12px; border-radius:20px; font-size:14px; font-weight:600; margin:4px 6px 4px 0;">
      👤 <input type="text" value="${escapeHtml(p.name)}" data-edit-person="${p.id}" title="${t("editNameTitle")}" aria-label="${t("friendNameAria")}" style="background:transparent; border:none; outline:none; color:var(--ink); font-weight:600; font-size:14px; padding:0 2px; width:${Math.max(4, p.name.length)}ch; min-width:36px;" />
      <button type="button" data-remove-person="${p.id}" aria-label="${t("removeFriendAria", { name: escapeHtml(p.name) })}" style="margin-left:6px; color:var(--danger); font-size:16px; font-weight:bold; cursor:pointer; background:none; border:none;">✕</button>
    </div>
  `).join("");

  peopleManager.innerHTML = `
    <div style="font-size:14px; font-weight:bold; color:var(--ink); margin-bottom:10px;">${t("peopleListLabel")}</div>
    <div style="display:flex; flex-wrap:wrap;">
       ${people.length > 0 ? tagsHtml : `<span style="color:var(--ink-muted); font-size:13px; font-style:italic;">${t("noOneJoinedYet")}</span>`}
    </div>
  `;
  list.appendChild(peopleManager);

  if (people.length === 0) return;

  // "split everything evenly" button + warning for orders not yet assigned to anyone.
  const controls = document.createElement("div");
  controls.style.cssText = "margin-bottom:16px;";
  const unassigned = bill.items.filter(
    (it) => getItemSharersCount(it.id) === 0,
  );
  controls.innerHTML = `
    <button type="button" id="btn-split-global" style="width:100%; font-size:13px; padding:10px; border-radius:8px; border:1px dashed var(--accent); background:var(--accent-soft); color:var(--accent); font-weight:600; cursor:pointer; margin-bottom:${unassigned.length ? "10px" : "0"};">${t("splitAllEvenlyBtn")}</button>
    ${
      unassigned.length
        ? `<div style="background:var(--warning-soft); border:1px solid var(--warning); color:var(--warning); padding:10px 12px; border-radius:8px; font-size:13px;">⚠️ ${t("unassignedWarning", { count: unassigned.length, names: unassigned.map((i) => escapeHtml(i.name || t("itemNoNameFallback"))).join(", ") })}</div>`
        : ""
    }`;
  list.appendChild(controls);

  bill.items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "person-card";

    const totalShares = getItemTotalShares(item.id);
    const sharersCount = getItemSharersCount(item.id);

    const chips = people
      .map((person) => {
        const qty = person.items[item.id] || 0;
        const active = qty > 0;
        const perHead = totalShares > 0 ? (item.total / totalShares) * qty : 0;

        return `
          <div class="chip ${active ? "active" : ""}" style="display:flex; justify-content:space-between; align-items:center; padding-right:10px; border:${active ? '2px solid var(--accent)' : '1px solid var(--line)'}; background:var(--bg-card);">
            <div style="flex:1; cursor:pointer;" class="chip-main" data-person="${person.id}" data-item="${item.id}">
              <div class="chip-info">
                <div class="chip-name" style="display:flex; align-items:center; color:var(--ink); font-weight:600;">
                  👤 ${escapeHtml(person.name)}
                </div>
                <div class="chip-meta" style="color:var(--ink); opacity:0.7;">
                  ${active ? `<span style="color:var(--accent); font-weight:bold; opacity:1;">${t("perHeadOwes", { amount: fmtIDR(perHead) })}</span>` : t("notChargedYet")}
                </div>
              </div>
            </div>
            <div class="chip-actions" style="display:flex; align-items:center; gap:8px;">
              <button type="button" class="btn-qty minus" data-action="minus" data-person="${person.id}" data-item="${item.id}" aria-label="${t("decreasePortionAria", { name: escapeHtml(person.name) })}" style="padding:2px 8px; border-radius:4px; border:1px solid var(--ink); background:var(--bg-card); color:var(--ink); font-weight:bold; cursor:pointer;">-</button>
              <span style="font-weight:bold; min-width:12px; text-align:center; color:var(--ink);">${qty}</span>
              <button type="button" class="btn-qty plus" data-action="plus" data-person="${person.id}" data-item="${item.id}" aria-label="${t("increasePortionAria", { name: escapeHtml(person.name) })}" style="padding:2px 8px; border-radius:4px; border:1px solid var(--accent); background:var(--accent); color:#FFFFFF; font-weight:bold; cursor:pointer;">+</button>
            </div>
          </div>
        `;
      })
      .join("");

    card.innerHTML = `
      <div class="item-head" style="margin-bottom:14px; padding-bottom:12px; border-bottom:1px dashed var(--line); display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-weight:bold; font-size:16px; color:var(--ink);">🍽️ ${escapeHtml(item.name || t("noNameItemFallback"))}</div>
          <div style="font-size:13px; color:var(--ink-muted); margin-top:4px;">${t("qtyTimesPrice", { qty: item.qty, price: fmtIDR(item.price) })}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:900; font-size:16px; color:var(--accent);">${fmtIDR(item.total)}</div>
          ${sharersCount > 0
            ? `<div style="font-size:10px; font-weight:600; background:var(--accent-soft); color:var(--accent); padding:3px 6px; border-radius:4px; margin-top:6px; display:inline-block;">${t("chargedToNFriends", { count: sharersCount })}</div>`
            : `<div style="font-size:10px; font-weight:600; background:var(--danger-soft); color:var(--danger); padding:3px 6px; border-radius:4px; margin-top:6px; display:inline-block;">${t("noOnePayingYet")}</div>`}
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <button type="button" class="btn-split-all" data-item="${item.id}" style="flex:1; font-size:12px; padding:7px; border-radius:6px; border:1px solid var(--accent); background:var(--accent-soft); color:var(--accent); font-weight:600; cursor:pointer;">${t("splitOneEvenlyBtn")}</button>
        ${sharersCount > 0 ? `<button type="button" class="btn-clear-item" data-item="${item.id}" style="font-size:12px; padding:7px 12px; border-radius:6px; border:1px solid var(--line); background:var(--bg-card); color:var(--ink-muted); cursor:pointer;">${t("clearItemBtn")}</button>` : ""}
      </div>
      <div class="chip-grid" style="display:flex; flex-direction:column; gap:8px;">${chips}</div>
    `;
    list.appendChild(card);
  });

  scheduleSave();
}

$("people-list").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  const removeBtn = target.closest("[data-remove-person]") as HTMLElement | null;
  if (removeBtn) {
    const pid = Number(removeBtn.dataset.removePerson);
    const idx = people.findIndex((p) => p.id === pid);
    if (idx === -1) return;
    const removedPerson = people[idx];

    people.splice(idx, 1);
    renderPeopleStep();

    showToast(t("deletedToast", { name: removedPerson.name || t("noNamePersonFallback") }), {
      actionLabel: t("undoLabel"),
      onAction: () => {
        people.splice(idx, 0, removedPerson);
        renderPeopleStep();
      },
    });
    return;
  }

  // Split ALL orders evenly among all friends (qty 1 per person per item).
  if (target.closest("#btn-split-global")) {
    bill.items.forEach((it) =>
      people.forEach((p) => {
        p.items[it.id] = 1;
      }),
    );
    renderPeopleStep();
    return;
  }

  // Split one order evenly among all friends.
  const splitAll = target.closest(".btn-split-all") as HTMLElement | null;
  if (splitAll) {
    const iid = Number(splitAll.dataset.item);
    people.forEach((p) => {
      p.items[iid] = 1;
    });
    renderPeopleStep();
    return;
  }

  // Clear one order from all friends.
  const clearItem = target.closest(".btn-clear-item") as HTMLElement | null;
  if (clearItem) {
    const iid = Number(clearItem.dataset.item);
    people.forEach((p) => {
      delete p.items[iid];
    });
    renderPeopleStep();
    return;
  }

  if (target.classList.contains("btn-qty")) {
    const pid = Number(target.dataset.person);
    const iid = Number(target.dataset.item);
    const p = people.find((x) => x.id === pid);
    if (!p) return;

    let currentQty = p.items[iid] || 0;
    if (target.dataset.action === "plus") {
      p.items[iid] = currentQty + 1;
    } else if (target.dataset.action === "minus") {
      if (currentQty > 1) {
        p.items[iid] = currentQty - 1;
      } else {
        delete p.items[iid];
      }
    }
    renderPeopleStep();
    return;
  }

  const chipMain = target.closest(".chip-main") as HTMLElement | null;
  if (chipMain) {
    const pid = Number(chipMain.dataset.person);
    const iid = Number(chipMain.dataset.item);
    const p = people.find((x) => x.id === pid);
    if (!p) return;

    if (p.items[iid]) {
      delete p.items[iid];
    } else {
      p.items[iid] = 1;
    }
    renderPeopleStep();
    return;
  }
});

// Rename a friend directly in the tag (without re-rendering, so focus isn't lost).
$("people-list").addEventListener("input", (e) => {
  const t = e.target as HTMLElement;
  const pid = t.dataset.editPerson;
  if (pid) {
    const p = people.find((x) => x.id === Number(pid));
    if (p) {
      p.name = (t as HTMLInputElement).value;
      scheduleSave();
    }
  }
});

$("btn-add-person").addEventListener("click", () => {
  const inp = $<HTMLInputElement>("new-person");
  const name = inp.value.trim() || `${t("defaultFriendName")} ${people.length + 1}`;
  people.push({ id: nextPersonId++, name, items: {} });
  inp.value = "";
  renderPeopleStep();
});

$<HTMLInputElement>("new-person").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("btn-add-person").click();
  }
});

// ============ SAVED FRIEND GROUPS (localStorage) ============
interface FriendGroup {
  id: number;
  name: string;
  members: string[];
}
const GROUPS_KEY = "patungan_groups_v1";

function loadGroups(): FriendGroup[] {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveGroups(groups: FriendGroup[]) {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch {
    /* noop */
  }
}

$("btn-save-group").addEventListener("click", () => {
  $("load-group-panel").classList.add("hidden");
  $("save-group-panel").classList.toggle("hidden");
  if (!$("save-group-panel").classList.contains("hidden"))
    $<HTMLInputElement>("group-name-input").focus();
});

$("btn-confirm-save-group").addEventListener("click", async () => {
  const nameInput = $<HTMLInputElement>("group-name-input");
  const groupName = nameInput.value.trim();
  if (!groupName) {
    await showAlert(t("groupNameEmptyAlert"));
    return;
  }
  if (people.length === 0) {
    await showAlert(t("groupNeedPersonAlert"));
    return;
  }
  const members = people.map((p) => p.name).filter(Boolean);
  const groups = loadGroups();
  const existingIdx = groups.findIndex((g) => g.name === groupName);
  if (existingIdx >= 0) {
    const overwrite = await showConfirm(t("groupOverwriteConfirm", { name: groupName }));
    if (!overwrite) return;
    groups[existingIdx] = { ...groups[existingIdx], members };
  } else {
    groups.push({ id: Date.now(), name: groupName, members });
  }
  saveGroups(groups);
  nameInput.value = "";
  $("save-group-panel").classList.add("hidden");
  showToast(t("groupSavedToast", { name: groupName }));
});

function renderGroupList() {
  const panel = $("load-group-panel");
  const groups = loadGroups();
  if (groups.length === 0) {
    panel.innerHTML = `<div style="font-size:13px;color:var(--ink-muted);padding:10px;">${t("groupEmptyList")}</div>`;
    return;
  }
  panel.innerHTML = groups
    .map(
      (g) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;">
        <div style="font-size:13px;color:var(--ink);"><b>${escapeHtml(g.name)}</b><br/><span style="color:var(--ink-muted);font-size:12px;">${t("groupMembersLabel", { count: g.members.length, names: g.members.map(escapeHtml).join(", ") })}</span></div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button type="button" data-group-use="${g.id}" class="btn" style="background:var(--accent);color:#fff;font-size:12px;padding:6px 12px;">${t("groupUseBtn")}</button>
          <button type="button" data-group-del="${g.id}" class="btn" style="background:var(--danger-soft);color:var(--danger);font-size:12px;padding:6px 10px;">${t("historyDelBtn")}</button>
        </div>
      </div>`,
    )
    .join("");
}

$("btn-load-group").addEventListener("click", () => {
  $("save-group-panel").classList.add("hidden");
  $("load-group-panel").classList.toggle("hidden");
  if (!$("load-group-panel").classList.contains("hidden")) renderGroupList();
});

$("load-group-panel").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  const useBtn = target.closest("[data-group-use]") as HTMLElement | null;
  if (useBtn) {
    const g = loadGroups().find((gr) => gr.id === Number(useBtn.dataset.groupUse));
    if (g) {
      const existingNames = new Set(people.map((p) => p.name));
      g.members
        .filter((name) => !existingNames.has(name))
        .forEach((name) => people.push({ id: nextPersonId++, name, items: {} }));
      renderPeopleStep();
      showToast(t("groupAddedToast", { name: g.name }));
    }
    return;
  }

  const delBtn = target.closest("[data-group-del]") as HTMLElement | null;
  if (delBtn) {
    const groups = loadGroups();
    const idx = groups.findIndex((gr) => gr.id === Number(delBtn.dataset.groupDel));
    if (idx >= 0) {
      groups.splice(idx, 1);
      saveGroups(groups);
      renderGroupList();
    }
    return;
  }
});

// ============ STEP 4: CALCULATE ============
// Calculation logic moved to ./calc (calculateSplit). This just stores the result here.
let lastResults: PersonResult[] = [];
let lastGrandTotal = 0;

function setupBankInputs() {
  if (!$("bank-details-container")) {
    const bankHtml = document.createElement("div");
    bankHtml.id = "bank-details-container";
    bankHtml.style.marginBottom = "20px";
    bankHtml.style.padding = "15px";
    bankHtml.style.background = "var(--bg-card)";
    bankHtml.style.borderRadius = "8px";
    bankHtml.style.border = "1px solid var(--line)";
    bankHtml.innerHTML = `
      <h4 style="margin-top:0; margin-bottom:12px; font-size:14px; color:var(--ink); font-weight:600;">${t("bankDetailsHeading")}</h4>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <input type="text" id="bank-name-input" class="input" placeholder="${t("bankNamePlaceholder")}" aria-label="${t("bankNameAria")}" style="flex:1; min-width:120px; color:var(--ink);" />
        <input type="text" id="bank-acc-input" class="input" placeholder="${t("bankAccPlaceholder")}" aria-label="${t("bankAccAria")}" style="flex:1; min-width:150px; color:var(--ink);" />
        <input type="text" id="bank-holder-input" class="input" placeholder="${t("bankHolderPlaceholder")}" aria-label="${t("bankHolderAria")}" style="flex:1; min-width:150px; color:var(--ink);" />
      </div>
      <input type="text" id="bank-link-input" class="input" placeholder="${t("bankLinkPlaceholder")}" aria-label="${t("bankLinkAria")}" style="width:100%; margin-top:10px; color:var(--ink);" />
    `;
    $("step-result").insertBefore(bankHtml, $("summary-list"));
    ["bank-name-input", "bank-acc-input", "bank-holder-input", "bank-link-input"].forEach(
      (id) => $(id).addEventListener("input", scheduleSave),
    );
  }
  // Restore bank account data from the saved session (if any).
  if (savedBank) {
    $<HTMLInputElement>("bank-name-input").value = savedBank.name || "";
    $<HTMLInputElement>("bank-acc-input").value = savedBank.acc || "";
    $<HTMLInputElement>("bank-holder-input").value = savedBank.holder || "";
    savedBank = null;
  }
  if (payLink) $<HTMLInputElement>("bank-link-input").value = payLink;
}

// Insert an element into #step-result, above the action buttons (.btn-row)
// if any already exist there, otherwise append it at the end.
function insertIntoResultStep(el: HTMLElement) {
  const step = $("step-result");
  const firstRow = step.querySelector(".btn-row");
  if (firstRow) step.insertBefore(el, firstRow);
  else step.appendChild(el);
}

// ============ SETTLE-UP + SETTINGS + SHARE (injected into #step-result once) ====
function setupResultExtras() {
  // Rounding settings + difference reconciliation.
  if (!$("result-settings")) {
    const s = document.createElement("div");
    s.id = "result-settings";
    s.style.cssText =
      "background:var(--bg-card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-top:16px;font-size:13px;color:var(--ink);";
    s.innerHTML = `
      <div style="font-weight:600;margin-bottom:10px;">${t("roundingSettingsHeading")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <select id="round-mode" class="input" aria-label="${t("roundModeAria")}" style="flex:1;min-width:130px;color:var(--ink);cursor:pointer;">
          <option value="nearest">${t("roundNearest")}</option>
          <option value="up">${t("roundUp")}</option>
          <option value="down">${t("roundDown")}</option>
        </select>
        <select id="round-to" class="input" aria-label="${t("roundToAria")}" style="flex:1;min-width:110px;color:var(--ink);cursor:pointer;">
          <option value="1000">${t("roundPer1000")}</option>
          <option value="500">${t("roundPer500")}</option>
          <option value="100">${t("roundPer100")}</option>
          <option value="1">${t("roundNone")}</option>
        </select>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;">
        <input type="checkbox" id="round-reconcile" style="width:16px;height:16px;cursor:pointer;" />
        ${t("reconcileLabel")}
      </label>`;
    insertIntoResultStep(s);
    $("round-mode").addEventListener("change", () => {
      roundCfg.mode = $<HTMLSelectElement>("round-mode").value as RoundMode;
      renderResult();
    });
    $("round-to").addEventListener("change", () => {
      roundCfg.to = Number($<HTMLSelectElement>("round-to").value) || 1;
      renderResult();
    });
    $("round-reconcile").addEventListener("change", () => {
      reconcile = $<HTMLInputElement>("round-reconcile").checked;
      renderResult();
    });
  }

  if (!$("settle-container")) {
    const wrap = document.createElement("div");
    wrap.id = "settle-container";
    wrap.style.cssText =
      "background:var(--bg-card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:16px;";
    wrap.innerHTML = `
      <div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:8px;">${t("settleHeading")}</div>
      <select id="settle-payer" class="input" aria-label="${t("settlePayerAria")}" style="color:var(--ink);cursor:pointer;"></select>
      <div id="settle-list" style="margin-top:12px;"></div>`;
    insertIntoResultStep(wrap);
    $("settle-payer").addEventListener("change", () => {
      payerName = $<HTMLSelectElement>("settle-payer").value;
      renderSettle();
      scheduleSave();
    });
  }

  if (!$("result-actions")) {
    const row = document.createElement("div");
    row.id = "result-actions";
    row.className = "btn-row";
    row.style.marginTop = "16px";
    const btn = (id: string, label: string, bg: string, fg: string, extra = "") =>
      `<button type="button" id="${id}" class="btn" style="flex:1;min-width:120px;background:${bg};color:${fg};font-weight:bold;${extra}">${label}</button>`;
    row.innerHTML =
      btn("btn-share-wa", t("btnWhatsApp"), "#25D366", "#fff") +
      btn("btn-copy", t("btnCopyText"), "var(--line-soft)", "var(--ink)", "border:1px solid var(--line);") +
      btn("btn-png", t("btnPng"), "#0F172A", "#fff") +
      btn("btn-csv", t("btnCsv"), "var(--line-soft)", "var(--ink)", "border:1px solid var(--line);") +
      btn("btn-link", t("btnCopyLink"), "var(--line-soft)", "var(--ink)", "border:1px solid var(--line);");
    insertIntoResultStep(row);

    $("btn-share-wa").addEventListener("click", () => {
      window.open(
        "https://wa.me/?text=" + encodeURIComponent(currentShareText()),
        "_blank",
      );
    });
    $("btn-copy").addEventListener("click", () => flashCopy("btn-copy", currentShareText()));
    $("btn-png").addEventListener("click", downloadPNG);
    $("btn-csv").addEventListener("click", downloadCSV);
    $("btn-link").addEventListener("click", () =>
      flashCopy("btn-link", encodeShareLink(buildState()), t("btnCopyLink"), t("btnLinkCopied")),
    );
  }

  // "paid" checklist + per-person WhatsApp send (delegated, attached once).
  if (!summaryPaidBound) {
    summaryPaidBound = true;
    $("summary-list").addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.paid !== undefined) {
        paid[t.dataset.paid] = t.checked;
        renderResult();
      }
    });
    $("summary-list").addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        "[data-send-wa]",
      ) as HTMLElement | null;
      if (!btn) return;
      const name = btn.dataset.sendWa!;
      const r = lastResults.find((res) => res.name === name);
      if (!r) return;
      const text = buildPersonShareText(r, payerName, currentBank(), capturePayLink());
      window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
    });
  }
}

function syncRoundingControls() {
  const m = $<HTMLSelectElement>("round-mode");
  if (m) m.value = roundCfg.mode;
  const to = $<HTMLSelectElement>("round-to");
  if (to) to.value = String(roundCfg.to);
  const rec = $<HTMLInputElement>("round-reconcile");
  if (rec) rec.checked = reconcile;
}

// Copy text to the clipboard + a brief confirmation animation on the button.
async function flashCopy(
  btnId: string,
  text: string,
  base = t("btnCopyText"),
  done = t("btnCopiedText"),
) {
  try {
    await navigator.clipboard.writeText(text);
    const b = $(btnId);
    b.textContent = done;
    setTimeout(() => {
      b.textContent = base;
    }, 1500);
  } catch {
    await showAlert(t("clipboardErrorAlert", { text }));
  }
}

function renderSettle() {
  // If the selected person was removed, reset.
  if (payerName && !lastResults.some((r) => r.name === payerName)) payerName = "";

  const sel = $<HTMLSelectElement>("settle-payer");
  if (sel) {
    sel.innerHTML = [`<option value="">${t("settlePlaceholderOption")}</option>`]
      .concat(
        lastResults.map(
          (r) => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`,
        ),
      )
      .join("");
    sel.value = payerName;
  }

  const list = $("settle-list");
  if (!list) return;
  if (!payerName) {
    list.innerHTML = `<div style="font-size:13px;color:var(--ink-muted);">${t("settleChoosePrompt")}</div>`;
    return;
  }
  const others = lastResults.filter(
    (r) => r.name !== payerName && r.totalRounded > 0,
  );
  const totalIn = others.reduce((s, r) => s + r.totalRounded, 0);
  list.innerHTML = `
    <div style="font-size:13px;color:var(--ink);margin-bottom:8px;">${t("settleSummary", { payer: escapeHtml(payerName), amount: `<b>${fmtIDR(totalIn)}</b>` })}</div>
    ${others
      .map(
        (r) => `
      <div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--bg);border:1px solid var(--line);border-radius:8px;margin-bottom:6px;font-size:14px;color:var(--ink);">
        <span>${escapeHtml(r.name)} → ${escapeHtml(payerName)}</span>
        <span class="mono" style="font-weight:700;color:var(--accent);">${fmtIDR(r.totalRounded)}</span>
      </div>`,
      )
      .join("")}`;
}

function capturePayLink(): string {
  const el = $<HTMLInputElement>("bank-link-input");
  return el ? el.value.trim() : payLink;
}

// Thin wrappers: gather the current DOM/app state and hand it to the pure
// builders in ./receipt and ./share, which don't know about app.ts at all.
function currentBank(): BankInfo | null {
  return captureBank();
}
function currentShareText(): string {
  return buildShareText(lastResults, paid, payerName, currentBank(), capturePayLink());
}
function currentReceiptNode(): HTMLElement {
  return buildReceiptNode(lastResults, paid, currentBank(), capturePayLink());
}

// ============ AUTO-SAVE SESSION (localStorage, still 100% offline) ============
const SAVE_KEY = "patungan_session_v1";
let saveTimer: number | undefined;

function captureBank(): { name: string; acc: string; holder: string } | null {
  const n = $<HTMLInputElement>("bank-name-input");
  if (!n) return savedBank;
  return {
    name: n.value || "",
    acc: $<HTMLInputElement>("bank-acc-input")?.value || "",
    holder: $<HTMLInputElement>("bank-holder-input")?.value || "",
  };
}

// Capture mode (Rp/%) + raw tax/service/discount values from the DOM, so
// "%" mode isn't lost when the session is restored.
function captureCharges(): Record<string, { mode: string; val: number }> {
  const out: Record<string, { mode: string; val: number }> = {};
  ["tax", "service", "discount"].forEach((k) => {
    const mode = $<HTMLSelectElement>(`t-${k}-mode`);
    const val = $<HTMLInputElement>(`t-${k}`);
    if (mode && val) out[k] = { mode: mode.value, val: Number(val.value) || 0 };
  });
  return out;
}

function applyCharges(charges?: Record<string, { mode: string; val: number }>) {
  if (!charges) return;
  ["tax", "service", "discount"].forEach((k) => {
    const c = charges[k];
    if (!c) return;
    const mode = $<HTMLSelectElement>(`t-${k}-mode`);
    const val = $<HTMLInputElement>(`t-${k}`);
    if (mode) mode.value = c.mode;
    if (val) val.value = String(c.val);
  });
  updateBillTotals();
}

function buildState() {
  return {
    v: 2,
    bill,
    people,
    nextItemId,
    nextPersonId,
    payerName,
    bank: captureBank(),
    payLink: capturePayLink(),
    paid,
    round: roundCfg,
    reconcile,
    charges: captureCharges(),
    ts: Date.now(),
  };
}

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildState()));
  } catch {
    /* localStorage bisa tidak tersedia (mode privat) — abaikan */
  }
}

function scheduleSave() {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveState, 400);
}

function clearState() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* noop */
  }
}

function restoreSession(s: any) {
  try {
    bill = s.bill;
    people = s.people || [];
    const maxItemId = bill.items.reduce(
      (m: number, i: BillItem) => Math.max(m, i.id),
      0,
    );
    const maxPersonId = people.reduce(
      (m: number, p: Person) => Math.max(m, p.id),
      0,
    );
    nextItemId = s.nextItemId || maxItemId + 1;
    nextPersonId = s.nextPersonId || maxPersonId + 1;
    payerName = s.payerName || "";
    savedBank = s.bank || null;
    payLink = s.payLink || "";
    paid = s.paid || {};
    reconcile = !!s.reconcile;
    if (s.round && typeof s.round.to === "number") {
      roundCfg.to = s.round.to;
      roundCfg.mode = s.round.mode || "nearest";
    }

    renderBillStep();
    applyCharges(s.charges);
    $("step-bill").classList.remove("hidden");
    if (people.length > 0) {
      renderPeopleStep();
      $("step-people").classList.remove("hidden");
    }
    $("step-bill").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    console.error(e);
  }
}

function showRestoreBanner() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let s: any;
  try {
    s = JSON.parse(raw);
  } catch {
    return;
  }
  if (!s || !s.bill) return;
  const hasData =
    (s.bill.items && s.bill.items.length > 0) ||
    (s.people && s.people.length > 0);
  if (!hasData) return;

  let when = "";
  try {
    when = new Date(s.ts).toLocaleString(getLang() === "en" ? "en-US" : "id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    /* noop */
  }

  const banner = document.createElement("div");
  banner.id = "restore-banner";
  banner.style.cssText =
    "background:var(--bg-card);border:1px solid var(--accent);border-radius:10px;padding:14px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;";
  banner.innerHTML = `
    <div style="color:var(--ink);font-size:14px;">${t("restoreBannerText", { when: when ? ` <span style="color:var(--ink-muted);">(${when})</span>` : "" })}</div>
    <div style="display:flex;gap:8px;">
      <button type="button" id="restore-yes" class="btn" style="background:var(--accent);color:#fff;padding:8px 16px;font-size:14px;">${t("restoreBannerContinue")}</button>
      <button type="button" id="restore-no" class="btn" style="background:var(--line-soft);color:var(--ink);padding:8px 16px;font-size:14px;">${t("historyDelBtn")}</button>
    </div>`;
  const up = $("step-upload");
  up.parentElement?.insertBefore(banner, up);
  $("restore-yes").addEventListener("click", () => {
    restoreSession(s);
    banner.remove();
  });
  $("restore-no").addEventListener("click", () => {
    clearState();
    banner.remove();
  });
}

// Render the whole result step. Safe to call again (when rounding changes, etc).
function renderResult() {
  const { results, grandTotal } = calculateSplit(bill, people);
  applyReconcileCalc(results, grandTotal, reconcile, payerName);
  lastResults = results;
  lastGrandTotal = grandTotal;

  setupBankInputs();
  setupResultExtras();
  syncRoundingControls();

  const sumList = $("summary-list");
  sumList.style.display = "flex";
  sumList.style.flexDirection = "column";
  sumList.style.gap = "15px";

  sumList.innerHTML = results
    .map(
      (r) => `
    <div class="summary-row" style="display:flex; flex-direction:column; padding:16px; border:1px solid var(--line); border-radius:12px; background:var(--bg-card); box-shadow:0 1px 3px rgba(0,0,0,0.05); ${paid[r.name] ? "opacity:0.6;" : ""}">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px dashed var(--line); padding-bottom:8px;">
        <div style="font-size:16px; font-weight:bold; color:var(--ink);">
          👤 ${escapeHtml(r.name)} ${paid[r.name] ? `<span style="font-size:11px;font-weight:700;background:var(--accent-soft);color:var(--accent);padding:2px 8px;border-radius:6px;margin-left:6px;">${t("paidBadge")}</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <button type="button" data-send-wa="${escapeHtml(r.name)}" title="${t("sendPersonAria", { name: escapeHtml(r.name) })}" aria-label="${t("sendPersonAria", { name: escapeHtml(r.name) })}" style="background:none;border:none;cursor:pointer;font-size:16px;padding:2px;line-height:1;">📲</button>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-muted);cursor:pointer;">
            <input type="checkbox" data-paid="${escapeHtml(r.name)}" ${paid[r.name] ? "checked" : ""} style="width:16px;height:16px;cursor:pointer;" /> ${t("paidLabel")}
          </label>
        </div>
      </div>

      <div style="font-size:13px; color:var(--ink); display:flex; flex-direction:column; gap:6px;">
        ${r.items.map((i) => `
          <div style="display:flex; justify-content:space-between; color:var(--ink);">
            <span>• ${escapeHtml(i.name)} ${i.qty < i.totalShares ? `<span style="color:var(--ink); opacity:0.6; font-weight:500;">(${i.qty}/${i.totalShares})</span>` : ''}</span>
            <span class="mono" style="font-weight:500;">${fmtIDR(i.share)}</span>
          </div>
        `).join("")}

        <div style="height:1px; background:var(--line); margin:6px 0;"></div>

        <div style="display:flex; justify-content:space-between; color:var(--ink); opacity:0.8; font-weight:600;"><span>${t("subtotalLabel")}</span><span class="mono">${fmtIDR(r.subtotal)}</span></div>
        ${r.taxShare > 0 ? `<div style="display:flex; justify-content:space-between; color:var(--ink); opacity:0.8;"><span>${t("taxLabel")}</span><span class="mono">${fmtIDR(r.taxShare)}</span></div>` : ""}
        ${r.serviceShare > 0 ? `<div style="display:flex; justify-content:space-between; color:var(--ink); opacity:0.8;"><span>${t("serviceLabel")}</span><span class="mono">${fmtIDR(r.serviceShare)}</span></div>` : ""}
        ${r.discountShare > 0 ? `<div style="display:flex; justify-content:space-between; color:var(--accent); font-weight:600;"><span>${t("discountLabel")}</span><span class="mono">-${fmtIDR(r.discountShare)}</span></div>` : ""}
        ${Math.abs(r.totalRounded - r.totalRaw) > 0.5 ? `<div style="display:flex; justify-content:space-between; color:var(--ink); opacity:0.6;"><span>${t("roundingAdjustLabel")}</span><span class="mono">${r.totalRounded > r.totalRaw ? '+' : ''}${fmtIDR(r.totalRounded - r.totalRaw)}</span></div>` : ""}
      </div>

      <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--line); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:bold; font-size:14px; color:var(--ink);">${t("totalBayarLabel")}</span>
        <span class="mono" style="font-weight:800; font-size:18px; color:#FFFFFF; background:var(--accent); padding:6px 14px; border-radius:8px;">${fmtIDR(r.totalRounded)}</span>
      </div>
    </div>
  `,
    )
    .join("");

  const totalRounded = results.reduce((s, r) => s + r.totalRounded, 0);
  const diff = totalRounded - grandTotal;
  const diffSign = diff > 0 ? "+" : "";

  $("summary-sub").innerHTML = `
    <div style="background:var(--bg-card); border:1px solid var(--line); padding:12px; border-radius:8px; text-align:center; margin-top:10px; color:var(--ink);">
      ${t("grandTotalOriginal", { amount: `<b>${fmtIDR(grandTotal)}</b>` })}<br/>
      ${t("grandTotalCollected", { amount: `<b>${fmtIDR(totalRounded)}</b>` })}
      <span style="opacity:0.7; font-size:12px;">${t("grandTotalDiff", { diff: diffSign + fmtIDR(diff) })}</span>
    </div>
  `;

  renderSettle();
  scheduleSave();
}

$("btn-calculate").addEventListener("click", async () => {
  if (people.length === 0) {
    await showAlert(t("addMinPersonAlert"));
    return;
  }
  const unassigned = bill.items.filter(
    (it) => getItemSharersCount(it.id) === 0,
  );
  if (unassigned.length > 0) {
    const names = unassigned.map((i) => i.name || t("itemNoNameFallback")).join(", ");
    const proceed = await showConfirm(
      t("unassignedConfirm", { count: unassigned.length, names }),
      { confirmLabel: t("proceedAnyway"), cancelLabel: t("btnCancel") },
    );
    if (!proceed) return;
  }
  renderResult();
  pushHistory();

  $("step-result").classList.remove("hidden");
  $("step-result").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ===== PDF via print =====
$("btn-download").addEventListener("click", () => {
  const printContainer = currentReceiptNode();
  const printStyle = document.createElement("style");
  printStyle.id = "print-style";
  printStyle.innerHTML = `
    @media print {
      body > *:not(#print-container) { display: none !important; }
      #print-container { display: block !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      @page { margin: 15mm; }
    }`;
  document.head.appendChild(printStyle);
  document.body.appendChild(printContainer);
  window.print();
  document.body.removeChild(printContainer);
  document.head.removeChild(printStyle);
});

// ===== PNG (html-to-image) =====
async function downloadPNG() {
  if (typeof htmlToImage === "undefined") {
    const btn = $<HTMLButtonElement>("btn-png");
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = t("pngLoadingBtn");
    try {
      await loadHtmlToImage();
    } catch (e) {
      console.error(e);
      await showAlert(t("pngModuleErrorAlert"));
      return;
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }
  const node = currentReceiptNode();
  node.style.position = "fixed";
  node.style.left = "-99999px";
  node.style.top = "0";
  document.body.appendChild(node);
  try {
    await (document as any).fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const dataUrl = await htmlToImage.toPng(node, {
      pixelRatio: 2,
      backgroundColor: "#F8FAFC",
      cacheBust: true,
    });
    triggerDownload(dataUrl, `patungan-${new Date().toISOString().slice(0, 10)}.png`);
  } catch (e) {
    console.error(e);
    await showAlert(t("pngErrorAlert"));
  } finally {
    document.body.removeChild(node);
  }
}

// ===== CSV =====
function downloadCSV() {
  const csv = buildCsv(lastResults, paid);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `patungan-${new Date().toISOString().slice(0, 10)}.csv`);
}

async function tryLoadFromHash(): Promise<boolean> {
  const encoded = extractShareHash(location.hash);
  if (!encoded) return false;
  try {
    const s: any = decodeShareState(encoded);
    history.replaceState(null, "", location.pathname); // clean up the hash
    if (!s || !s.bill) return false;
    if (await showConfirm(t("restoreFromLinkConfirm"))) {
      restoreSession(s);
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

// ===== BILL-SPLIT HISTORY (past sessions) =====
const HIST_KEY = "patungan_history_v1";
function loadHistory(): any[] {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
  } catch {
    return [];
  }
}
function pushHistory() {
  try {
    const grand = lastResults.reduce((s, r) => s + r.totalRounded, 0);
    if (grand <= 0) return;
    const list = loadHistory();
    list.unshift({ ...buildState(), grand, peopleCount: people.length });
    localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* noop */
  }
}

// ============ RESET ============
$("btn-reset").addEventListener("click", async () => {
  if (!(await showConfirm(t("resetConfirm")))) return;
  bill = { items: [], tax: 0, service: 0, discount: 0 };
  people = [];
  selectedFile = null;
  payerName = "";
  savedBank = null;
  clearState();
  fileInput.value = "";
  setFile(null);
  ["step-bill", "step-people", "step-result"].forEach((id) =>
    $(id).classList.add("hidden"),
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ============ DARK MODE TOGGLE (#12) ============
setupThemeToggle();

// ============ LANGUAGE TOGGLE (ID/EN) ============
applyStaticTranslations();
setupLangToggle();
// Re-render whatever's currently visible so dynamic content picks up the
// new language too — static text is handled by applyStaticTranslations().
onLangChange(() => {
  renderBillStep();
  if (!$("step-people").classList.contains("hidden")) renderPeopleStep();
  if (!$("step-result").classList.contains("hidden")) renderResult();
});

// ============ PWA: register service worker (#11) ============
registerServiceWorker();
setupInstallPrompt();

// ============ INIT ============
// Priority: share link → if none, offer to restore the saved session.
if (!(await tryLoadFromHash())) showRestoreBanner();

void lastGrandTotal;