import { parseReceipt } from "./parseReceipt";

// Tesseract via CDN
declare const Tesseract: any;

// ============ TYPES ============
interface BillItem {
  id: number;
  name: string;
  qty: number;
  price: number;
  total: number;
}
interface Bill {
  items: BillItem[];
  tax: number;
  service: number;
  discount: number;
}
interface Person {
  id: number;
  name: string;
  items: Record<number, number>;
}

// ============ STATE ============
let bill: Bill = { items: [], tax: 0, service: 0, discount: 0 };
let people: Person[] = [];
let nextItemId = 1;
let nextPersonId = 1;
let selectedFile: File | null = null;

// ============ UTILS ============
const fmtIDR = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
const roundTotal = (n: number) => Math.round(n);
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

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

function setFile(file: File | null) {
  selectedFile = file;
  uploadError.innerHTML = "";
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target?.result as string;
      preview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
    btnScan.disabled = false;
    scanLabel.textContent = "🔍 Baca struk (offline)";
  } else {
    preview.classList.add("hidden");
    previewImg.src = "";
    btnScan.disabled = true;
    scanLabel.textContent = "Pilih foto dulu";
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

btnScan.addEventListener("click", async () => {
  if (!selectedFile) return;
  btnScan.disabled = true;
  scanLabel.innerHTML = '<span class="spinner"></span> Memproses...';
  uploadError.innerHTML = "";
  progressWrap.classList.remove("hidden");
  setProgress(5, "Memuat Tesseract OCR...");

  try {
    const result = await Tesseract.recognize(selectedFile, "ind+eng", {
      logger: (m: any) => {
        if (m.status === "loading tesseract core")
          setProgress(10, "Memuat OCR engine...");
        else if (m.status === "initializing tesseract")
          setProgress(20, "Inisialisasi...");
        else if (m.status === "loading language traineddata") {
          const pct = 25 + (m.progress || 0) * 25;
          setProgress(pct, "Mengunduh model bahasa Indonesia...");
        } else if (m.status === "initializing api")
          setProgress(55, "Menyiapkan...");
        else if (m.status === "recognizing text") {
          const pct = 60 + (m.progress || 0) * 40;
          setProgress(
            pct,
            `Membaca struk... ${Math.round((m.progress || 0) * 100)}%`,
          );
        }
      },
    });

    const rawText = result.data.text;
    const parsed = parseReceipt(rawText);

    bill = {
      items: parsed.items.map((it) => ({
        id: nextItemId++,
        name: it.name,
        qty: it.qty,
        price: it.price,
        total: it.total,
      })),
      tax: parsed.tax,
      service: parsed.service,
      discount: parsed.discount,
    };

    if (bill.items.length === 0) {
      uploadError.innerHTML = `<div class="info">⚠️ OCR tidak menemukan item yang jelas. Tambah item manual di langkah berikutnya, atau coba foto yang lebih terang & lurus.</div>`;
    }

    renderBillStep();
    $("step-bill").classList.remove("hidden");
    $("step-bill").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err: any) {
    console.error(err);
    uploadError.innerHTML = `<div class="error">❌ ${err.message || "Gagal memproses gambar"}. Coba foto lain atau input manual.</div>`;
  } finally {
    progressWrap.classList.add("hidden");
    setProgress(0, "");
    btnScan.disabled = false;
    scanLabel.textContent = "🔄 Scan ulang";
  }
});

btnSkip.addEventListener("click", () => {
  bill = { items: [], tax: 0, service: 0, discount: 0 };
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
    row.style.borderBottom = "1px solid #E2E8F0";

    row.innerHTML = `
      <div style="display:flex; gap:8px; width: 100%;">
        <input type="text" class="input" value="${escapeHtml(item.name)}" data-id="${item.id}" data-field="name" placeholder="Nama Pesanan" style="flex:1; color:#0F172A; font-weight:600;" />
        <button class="person-remove" data-remove="${item.id}" type="button" style="background:#FEE2E2; color:#EF4444; border-radius:8px; width:44px; display:flex; align-items:center; justify-content:center; font-weight:bold;">✕</button>
      </div>
      <div style="display:flex; align-items:center; gap:6px; width: 100%;">
        <input type="number" class="input mono" value="${item.qty}" min="1" data-id="${item.id}" data-field="qty" title="Jumlah (Qty)" style="width:60px; text-align:center; padding:8px 4px; color:#0F172A; border:1px solid #CBD5E1;" />
        <span style="color:#64748B; font-size:14px; font-weight:bold;">×</span>
        <div style="position:relative; flex:1; max-width: 120px;">
          <span style="position:absolute; left:8px; top:10px; font-size:12px; color:#64748B;">@</span>
          <input type="number" class="input mono" value="${item.price}" min="0" data-id="${item.id}" data-field="price" title="Harga Satuan" placeholder="Satuan" style="width:100%; padding:8px 8px 8px 24px; text-align:right; color:#0F172A; border:1px solid #CBD5E1;" />
        </div>
        <span style="color:#64748B; font-size:14px; font-weight:bold;">=</span>
        <div style="position:relative; flex:1;">
          <span style="position:absolute; left:8px; top:10px; font-size:12px; color:#10B981; font-weight:bold;">Rp</span>
          <input type="number" class="input mono" value="${item.total}" min="0" data-id="${item.id}" data-field="total" title="Harga Total" placeholder="Total" style="width:100%; padding:8px 8px 8px 28px; text-align:right; color:#10B981; font-weight:bold; background:#F0FDF4; border:1px solid #A7F3D0;" />
        </div>
      </div>
    `;
    list.appendChild(row);
  });

  $<HTMLSelectElement>("t-tax-mode").value = "nominal"; 
  $<HTMLInputElement>("t-tax").value = String(bill.tax);
  $<HTMLInputElement>("t-service").value = String(bill.service);
  $<HTMLInputElement>("t-discount").value = String(bill.discount);
  updateBillTotals();
}

function updateBillTotals() {
  const subtotal = bill.items.reduce((s, i) => s + i.price * i.qty, 0);
  $("t-subtotal").textContent = fmtIDR(subtotal);

  const taxMode = $<HTMLSelectElement>("t-tax-mode").value;
  const taxInputVal = Math.max(0, Number($<HTMLInputElement>("t-tax").value) || 0);

  if (taxMode === "percent") {
    bill.tax = Math.round(subtotal * (taxInputVal / 100));
    $("t-tax-nominal-display").textContent = "= " + fmtIDR(bill.tax);
    $("t-tax-nominal-row").classList.remove("hidden");
  } else {
    bill.tax = taxInputVal;
    $("t-tax-nominal-row").classList.add("hidden");
  }

  const total = subtotal + bill.tax + bill.service - bill.discount;
  $("t-total").textContent = fmtIDR(Math.max(0, total));
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
  const t = e.target as HTMLElement;
  const removeId = t.dataset.remove;
  if (removeId) {
    bill.items = bill.items.filter((i) => i.id !== Number(removeId));
    people.forEach(p => delete p.items[Number(removeId)]);
    renderBillStep();
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

$("t-tax").addEventListener("input", updateBillTotals);
$("t-tax-mode").addEventListener("change", updateBillTotals);

["t-service", "t-discount"].forEach((id) => {
  $(id).addEventListener("input", (e) => {
    const v = Math.max(
      0,
      Number((e.target as HTMLInputElement).value) || 0,
    );
    if (id === "t-service") bill.service = v;
    else bill.discount = v;
    updateBillTotals();
  });
});

$("btn-to-people").addEventListener("click", () => {
  if (bill.items.length === 0) {
    alert("Tambah minimal 1 item dulu");
    return;
  }
  if (people.length === 0) {
    people = [
      { id: nextPersonId++, name: "Orang 1", items: {} },
      { id: nextPersonId++, name: "Orang 2", items: {} },
    ];
  }
  renderPeopleStep();
  $("step-people").classList.remove("hidden");
  $("step-people").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ============ STEP 3: PEOPLE ============
function getItemSharersCount(itemId: number): number {
  return people.filter((p) => (p.items[itemId] || 0) > 0).length;
}

function getItemTotalShares(itemId: number): number {
  return people.reduce((sum, p) => sum + (p.items[itemId] || 0), 0);
}

function renderPeopleStep() {
  const list = $("people-list");
  list.innerHTML = "";

  const peopleManager = document.createElement("div");
  peopleManager.style.marginBottom = "20px";
  peopleManager.style.paddingBottom = "20px";
  peopleManager.style.borderBottom = "2px dashed #E2E8F0";

  const tagsHtml = people.map(p => `
    <div style="display:inline-flex; align-items:center; background:#F1F5F9; border:1px solid #CBD5E1; color:#0F172A; padding:6px 12px; border-radius:20px; font-size:14px; font-weight:600; margin:4px 6px 4px 0;">
      👤 ${escapeHtml(p.name)}
      <button type="button" data-remove-person="${p.id}" style="margin-left:8px; color:#EF4444; font-size:16px; font-weight:bold; cursor:pointer; background:none; border:none;">✕</button>
    </div>
  `).join("");

  peopleManager.innerHTML = `
    <div style="font-size:14px; font-weight:bold; color:#0F172A; margin-bottom:10px;">Daftar Teman Patungan:</div>
    <div style="display:flex; flex-wrap:wrap;">
       ${people.length > 0 ? tagsHtml : '<span style="color:#64748B; font-size:13px; font-style:italic;">Belum ada yang gabung. Tambah di atas 👆</span>'}
    </div>
  `;
  list.appendChild(peopleManager);

  if (people.length === 0) return;

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
          <div class="chip ${active ? "active" : ""}" style="display:flex; justify-content:space-between; align-items:center; padding-right:10px; border:${active ? '2px solid #10B981' : '1px solid #E2E8F0'}; background:#FFFFFF;">
            <div style="flex:1; cursor:pointer;" class="chip-main" data-person="${person.id}" data-item="${item.id}">
              <div class="chip-info">
                <div class="chip-name" style="display:flex; align-items:center; color:#0F172A; font-weight:600;">
                  👤 ${escapeHtml(person.name)}
                </div>
                <div class="chip-meta" style="color:#0F172A; opacity:0.7;">
                  ${active ? `<span style="color:#10B981; font-weight:bold; opacity:1;">Tanggungan: ${fmtIDR(perHead)}</span>` : "Belum ditagih"}
                </div>
              </div>
            </div>
            <div class="chip-actions" style="display:flex; align-items:center; gap:8px;">
              <button type="button" class="btn-qty minus" data-action="minus" data-person="${person.id}" data-item="${item.id}" style="padding:2px 8px; border-radius:4px; border:1px solid #0F172A; background:#FFFFFF; color:#0F172A; font-weight:bold; cursor:pointer;">-</button>
              <span style="font-weight:bold; min-width:12px; text-align:center; color:#0F172A;">${qty}</span>
              <button type="button" class="btn-qty plus" data-action="plus" data-person="${person.id}" data-item="${item.id}" style="padding:2px 8px; border-radius:4px; border:1px solid #10B981; background:#10B981; color:#FFFFFF; font-weight:bold; cursor:pointer;">+</button>
            </div>
          </div>
        `;
      })
      .join("");

    card.innerHTML = `
      <div class="item-head" style="margin-bottom:14px; padding-bottom:12px; border-bottom:1px dashed #CBD5E1; display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-weight:bold; font-size:16px; color:#0F172A;">🍽️ ${escapeHtml(item.name || "(Tanpa Nama)")}</div>
          <div style="font-size:13px; color:#64748B; margin-top:4px;">${item.qty} Qty × ${fmtIDR(item.price)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:900; font-size:16px; color:#10B981;">${fmtIDR(item.total)}</div>
          ${sharersCount > 0 
            ? `<div style="font-size:10px; font-weight:600; background:#D1FAE5; color:#059669; padding:3px 6px; border-radius:4px; margin-top:6px; display:inline-block;">Ditagih ke ${sharersCount} teman</div>` 
            : `<div style="font-size:10px; font-weight:600; background:#FEE2E2; color:#DC2626; padding:3px 6px; border-radius:4px; margin-top:6px; display:inline-block;">Belum ada yang bayar</div>`}
        </div>
      </div>
      <div class="chip-grid" style="display:flex; flex-direction:column; gap:8px;">${chips}</div>
    `;
    list.appendChild(card);
  });
}

$("people-list").addEventListener("click", (e) => {
  const t = e.target as HTMLElement;

  const removeBtn = t.closest("[data-remove-person]") as HTMLElement | null;
  if (removeBtn) {
    const pid = Number(removeBtn.dataset.removePerson);
    people = people.filter((p) => p.id !== pid);
    renderPeopleStep();
    return;
  }

  if (t.classList.contains("btn-qty")) {
    const pid = Number(t.dataset.person);
    const iid = Number(t.dataset.item);
    const p = people.find((x) => x.id === pid);
    if (!p) return;
    
    let currentQty = p.items[iid] || 0;
    if (t.dataset.action === "plus") {
      p.items[iid] = currentQty + 1;
    } else if (t.dataset.action === "minus") {
      if (currentQty > 1) {
        p.items[iid] = currentQty - 1;
      } else {
        delete p.items[iid];
      }
    }
    renderPeopleStep();
    return;
  }

  const chipMain = t.closest(".chip-main") as HTMLElement | null;
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

$("btn-add-person").addEventListener("click", () => {
  const inp = $<HTMLInputElement>("new-person");
  const name = inp.value.trim() || `Teman ${people.length + 1}`;
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

// ============ STEP 4: CALCULATE ============
interface PersonResult {
  name: string;
  items: { name: string; share: number; qty: number; totalShares: number }[];
  subtotal: number;
  taxShare: number;
  serviceShare: number;
  discountShare: number;
  totalRaw: number;
  totalRounded: number;
}

function calculate(): {
  results: PersonResult[];
  billSubtotal: number;
  grandTotal: number;
} {
  const billSubtotal = bill.items.reduce((s, i) => s + i.price * i.qty, 0);
  const grandTotal = Math.max(
    0,
    billSubtotal + bill.tax + bill.service - bill.discount,
  );

  const results: PersonResult[] = people.map((p) => {
    const personItems: { name: string; share: number; qty: number; totalShares: number }[] = [];
    let subtotal = 0;
    
    Object.entries(p.items).forEach(([idStr, qty]) => {
      const iid = Number(idStr);
      if (qty <= 0) return;
      const item = bill.items.find((i) => i.id === iid);
      if (!item) return;

      const totalShares = getItemTotalShares(iid) || 1;
      const share = (item.price * item.qty) * (qty / totalShares);
      subtotal += share;
      personItems.push({ name: item.name || "(item)", share, qty, totalShares });
    });

    const ratio = billSubtotal > 0 ? subtotal / billSubtotal : 0;
    const taxShare = bill.tax * ratio;
    const serviceShare = bill.service * ratio;
    const discountShare = bill.discount * ratio;
    const totalRaw = subtotal + taxShare + serviceShare - discountShare;
    
    const totalRounded = roundTotal(Math.max(0, totalRaw));

    return {
      name: p.name || "Tanpa nama",
      items: personItems,
      subtotal,
      taxShare,
      serviceShare,
      discountShare,
      totalRaw,
      totalRounded,
    };
  });

  return { results, billSubtotal, grandTotal };
}

let lastResults: PersonResult[] = [];
let lastGrandTotal = 0;

function setupBankInputs() {
  if (!$("bank-details-container")) {
    const bankHtml = document.createElement("div");
    bankHtml.id = "bank-details-container";
    bankHtml.style.marginBottom = "20px";
    bankHtml.style.padding = "15px";
    bankHtml.style.background = "#FFFFFF"; 
    bankHtml.style.borderRadius = "8px";
    bankHtml.style.border = "1px solid #E2E8F0";
    bankHtml.innerHTML = `
      <h4 style="margin-top:0; margin-bottom:12px; font-size:14px; color:#0F172A; font-weight:600;">💳 Detail Rekening Bank (Muncul Paling Atas PDF)</h4>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <input type="text" id="bank-name-input" class="input" placeholder="Nama Bank (BCA, Mandiri...)" style="flex:1; min-width:120px; color:#0F172A;" />
        <input type="text" id="bank-acc-input" class="input" placeholder="No Rekening" style="flex:1; min-width:150px; color:#0F172A;" />
        <input type="text" id="bank-holder-input" class="input" placeholder="Atas Nama" style="flex:1; min-width:150px; color:#0F172A;" />
      </div>
    `;
    $("step-result").insertBefore(bankHtml, $("summary-list"));
  }
}

$("btn-calculate").addEventListener("click", () => {
  if (people.length === 0) {
    alert("Tambah minimal 1 orang dulu");
    return;
  }
  const { results, grandTotal } = calculate();
  lastResults = results;
  lastGrandTotal = grandTotal;

  setupBankInputs();

  const sumList = $("summary-list");
  sumList.style.display = "flex";
  sumList.style.flexDirection = "column";
  sumList.style.gap = "15px";
  
  sumList.innerHTML = results
    .map(
      (r) => `
    <div class="summary-row" style="display:flex; flex-direction:column; padding:16px; border:1px solid #E2E8F0; border-radius:12px; background:#FFFFFF; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:16px; font-weight:bold; color:#0F172A; margin-bottom:10px; border-bottom:2px dashed #E2E8F0; padding-bottom:8px;">
        👤 ${escapeHtml(r.name)}
      </div>
      
      <div style="font-size:13px; color:#0F172A; display:flex; flex-direction:column; gap:6px;">
        ${r.items.map((i) => `
          <div style="display:flex; justify-content:space-between; color:#0F172A;">
            <span>• ${escapeHtml(i.name)} ${i.qty < i.totalShares ? `<span style="color:#0F172A; opacity:0.6; font-weight:500;">(${i.qty}/${i.totalShares})</span>` : ''}</span>
            <span class="mono" style="font-weight:500;">${fmtIDR(i.share)}</span>
          </div>
        `).join("")}
        
        <div style="height:1px; background:#E2E8F0; margin:6px 0;"></div>
        
        <div style="display:flex; justify-content:space-between; color:#0F172A; opacity:0.8; font-weight:600;"><span>Subtotal</span><span class="mono">${fmtIDR(r.subtotal)}</span></div>
        ${r.taxShare > 0 ? `<div style="display:flex; justify-content:space-between; color:#0F172A; opacity:0.8;"><span>Pajak (Tax)</span><span class="mono">${fmtIDR(r.taxShare)}</span></div>` : ""}
        ${r.serviceShare > 0 ? `<div style="display:flex; justify-content:space-between; color:#0F172A; opacity:0.8;"><span>Service Charge</span><span class="mono">${fmtIDR(r.serviceShare)}</span></div>` : ""}
        ${r.discountShare > 0 ? `<div style="display:flex; justify-content:space-between; color:#10B981; font-weight:600;"><span>Diskon</span><span class="mono">-${fmtIDR(r.discountShare)}</span></div>` : ""}
        ${Math.abs(r.totalRounded - r.totalRaw) > 0.5 ? `<div style="display:flex; justify-content:space-between; color:#0F172A; opacity:0.6;"><span>Pembulatan</span><span class="mono">${r.totalRounded > r.totalRaw ? '+' : ''}${fmtIDR(r.totalRounded - r.totalRaw)}</span></div>` : ""}
      </div>
      
      <div style="margin-top:12px; padding-top:12px; border-top:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:bold; font-size:14px; color:#0F172A;">TOTAL BAYAR:</span>
        <span class="mono" style="font-weight:800; font-size:18px; color:#FFFFFF; background:#10B981; padding:6px 14px; border-radius:8px;">${fmtIDR(r.totalRounded)}</span>
      </div>
    </div>
  `
    )
    .join("");

  const totalRounded = results.reduce((s, r) => s + r.totalRounded, 0);
  const diff = totalRounded - grandTotal;
  const diffSign = diff > 0 ? "+" : "";
  
  const summarySub = $("summary-sub");
  summarySub.innerHTML = `
    <div style="background:#FFFFFF; border:1px solid #E2E8F0; padding:12px; border-radius:8px; text-align:center; margin-top:10px; color:#0F172A;">
      Total tagihan asli: <b>${fmtIDR(grandTotal)}</b><br/>
      Total terkumpul setelah pembulatan: <b>${fmtIDR(totalRounded)}</b> 
      <span style="opacity:0.7; font-size:12px;">(Selisih: ${diffSign}${fmtIDR(diff)})</span>
    </div>
  `;

  $("step-result").classList.remove("hidden");
  $("step-result").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ============ NATIVE BROWSER PRINT TO PDF ============
$("btn-download").addEventListener("click", () => {
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  
  const bName = $<HTMLInputElement>("bank-name-input")?.value.trim();
  const bAcc = $<HTMLInputElement>("bank-acc-input")?.value.trim();
  const bHolder = $<HTMLInputElement>("bank-holder-input")?.value.trim();

  let bankHtml = "";
  if (bName || bAcc || bHolder) {
    bankHtml = `
      <div style="background-color: #0F172A; color: #F8FAFC; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center; page-break-inside: avoid; box-shadow: 0 4px 6px rgba(15,23,42,0.1);">
        <div style="font-size: 12px; color: #10B981; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Transfer Pembayaran Ke</div>
        ${bName ? `<div style="font-size: 16px; font-weight: 600; color: #F8FAFC;">Bank ${escapeHtml(bName)}</div>` : ""}
        ${bAcc ? `<div style="font-size: 28px; font-family: monospace; font-weight: 900; margin: 4px 0; color: #10B981; letter-spacing: 2px; user-select: all;">${escapeHtml(bAcc)}</div>` : ""}
        ${bHolder ? `<div style="font-size: 14px; color: #94A3B8; font-weight: 500;">a.n. ${escapeHtml(bHolder)}</div>` : ""}
      </div>
    `;
  }

  const personHtml = lastResults
    .map(
      (r) => `
    <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; border-bottom: 1px dashed #E2E8F0; padding-bottom: 12px;">
        <div style="background-color: #F1F5F9; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 16px;">👤</div>
        <span style="font-weight: 800; font-size: 18px; color: #0F172A;">${escapeHtml(r.name)}</span>
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
          <div style="flex:1;">Subtotal</div>
          <div style="font-family: monospace;">${fmtIDR(r.subtotal)}</div>
        </div>

        ${r.taxShare > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#475569;"><div style="flex:1;">Pajak (Tax)</div><div style="font-family: monospace;">${fmtIDR(r.taxShare)}</div></div>` : ""}
        ${r.serviceShare > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#475569;"><div style="flex:1;">Service Charge</div><div style="font-family: monospace;">${fmtIDR(r.serviceShare)}</div></div>` : ""}
        ${r.discountShare > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#10B981; font-weight: 600;"><div style="flex:1;">Diskon</div><div style="font-family: monospace;">−${fmtIDR(r.discountShare)}</div></div>` : ""}
      </div>
      
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 700; font-size: 14px; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Total Bayar</span>
        <span style="color: #FFFFFF; background-color: #10B981; padding: 6px 12px; border-radius: 8px; font-size: 18px; font-weight: 900; font-family: monospace; box-shadow: 0 2px 4px rgba(16,185,129,0.2);">${fmtIDR(r.totalRounded)}</span>
      </div>
    </div>
  `
    )
    .join("");

  const grandRounded = lastResults.reduce((s, r) => s + r.totalRounded, 0);

  const printContainer = document.createElement("div");
  printContainer.id = "print-container";
  printContainer.style.maxWidth = "600px";
  printContainer.style.margin = "0 auto";
  printContainer.style.padding = "24px 20px";
  printContainer.style.backgroundColor = "#F8FAFC"; 
  printContainer.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  printContainer.style.lineHeight = "1.5";
  printContainer.style.color = "#0F172A";

  printContainer.innerHTML = `
    <div style="border-bottom: 2px solid #10B981; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 32px; font-weight: 900; color: #0F172A; letter-spacing: -1px; line-height: 1;">patungan.</div>
        <a href="https://astro-patungan.vercel.app/" target="_blank" style="color: #10B981; text-decoration: none; font-size: 13px; font-weight: bold; margin-top: 6px; display: inline-block;">
          🔗 astro-patungan.vercel.app
        </a>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 1px;">Struk Digital</div>
        <div style="font-size: 14px; color: #0F172A; font-weight: 600; margin-top: 2px;">${dateStr}</div>
      </div>
    </div>
    
    ${bankHtml}
    
    <div style="margin-bottom: 8px; font-weight: bold; font-size: 16px; color: #0F172A;">Rincian Patungan:</div>
    ${personHtml}
    
    <div style="margin-top: 24px; padding: 20px; background-color: #F8FAFC; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; border: 2px solid #10B981; page-break-inside: avoid;">
      <div>
        <div style="font-weight: 800; font-size: 18px; color: #0F172A;">Total Terkumpul</div>
        <div style="font-size: 13px; color: #64748B; margin-top: 4px;">Sesuai struk + pembulatan</div>
      </div>
      <span style="font-weight: 900; font-size: 24px; color: #10B981; font-family: monospace;">${fmtIDR(grandRounded)}</span>
    </div>

    <div style="margin-top: 32px; text-align: center; color: #94A3B8; font-size: 12px;">
      <div style="font-weight: 600;">Dihitung secara adil & transparan.</div>
      <div style="margin-top: 4px;">&copy; dyudhani 2026 | No server, 100% aman.</div>
    </div>
  `;

  const printStyle = document.createElement("style");
  printStyle.id = "print-style";
  printStyle.innerHTML = `
    @media print {
      body > *:not(#print-container) {
        display: none !important;
      }
      #print-container {
        display: block !important;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page {
        margin: 15mm;
      }
    }
  `;

  document.head.appendChild(printStyle);
  document.body.appendChild(printContainer);

  window.print();

  document.body.removeChild(printContainer);
  document.head.removeChild(printStyle);
});

// ============ RESET ============
$("btn-reset").addEventListener("click", () => {
  if (!confirm("Mulai ulang dari awal?")) return;
  bill = { items: [], tax: 0, service: 0, discount: 0 };
  people = [];
  selectedFile = null;
  fileInput.value = "";
  setFile(null);
  ["step-bill", "step-people", "step-result"].forEach((id) =>
    $(id).classList.add("hidden"),
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
});

void lastGrandTotal;