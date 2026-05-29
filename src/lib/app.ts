import { parseReceipt } from "./parseReceipt";

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
    const result = await (window as any).Tesseract.recognize(selectedFile, "ind+eng", {
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
    row.innerHTML = `
      <input type="text" class="input" value="${escapeHtml(item.name)}" data-id="${item.id}" data-field="name" style="flex:1; color:#0F172A;" />
      <input type="number" class="input mono" value="${item.qty}" min="1" data-id="${item.id}" data-field="qty" style="width:55px; text-align:center; padding: 6px 4px; color:#0F172A;" />
      <span style="color:#64748B;">×</span>
      <input type="number" class="input mono" value="${item.price}" min="0" data-id="${item.id}" data-field="price" style="width:100px; text-align:right; padding: 6px 8px; color:#0F172A;" />
      <button class="person-remove" data-remove="${item.id}" type="button">✕</button>
    `;
    list.appendChild(row);
  });

  $<HTMLInputElement>("t-tax").value = String(bill.tax);
  $<HTMLInputElement>("t-service").value = String(bill.service);
  $<HTMLInputElement>("t-discount").value = String(bill.discount);
  updateBillTotals();
}

function updateBillTotals() {
  const subtotal = bill.items.reduce((s, i) => s + i.price * i.qty, 0);
  $("t-subtotal").textContent = fmtIDR(subtotal);
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
  if (field === "name") item.name = t.value;
  else if (field === "qty") item.qty = Math.max(1, Number(t.value) || 1);
  else if (field === "price") item.price = Math.max(0, Number(t.value) || 0);
  item.total = item.price * item.qty;
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

["t-tax", "t-service", "t-discount"].forEach((id) => {
  $(id).addEventListener("input", (e) => {
    const v = Math.max(
      0,
      Number((e.target as HTMLInputElement).value) || 0,
    );
    if (id === "t-tax") bill.tax = v;
    else if (id === "t-service") bill.service = v;
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

  people.forEach((person) => {
    const card = document.createElement("div");
    card.className = "person-card";
    const chips = bill.items
      .map((item) => {
        const qty = person.items[item.id] || 0;
        const active = qty > 0;
        const totalShares = getItemTotalShares(item.id);
        const sharersCount = getItemSharersCount(item.id);
        
        const perHead = totalShares > 0 ? (item.total / totalShares) * qty : item.total;
        const shareNote = active && sharersCount > 1 
          ? `<span style="color:#4F46E5; font-size:10px; font-weight:600; padding:2px 6px; background:#EEF2FF; border-radius:4px; margin-left:6px;">Dibagi ${sharersCount}</span>` 
          : "";

        return `
          <div class="chip ${active ? "active" : ""}" style="display:flex; justify-content:space-between; align-items:center; padding-right:10px; border:1px solid #E2E8F0; background:#FFF;">
            <div style="flex:1; cursor:pointer;" class="chip-main" data-person="${person.id}" data-item="${item.id}">
              <div class="chip-info">
                <div class="chip-name" style="display:flex; align-items:center; color:#0F172A; font-weight:500;">
                  ${escapeHtml(item.name || "(tanpa nama)")} ${shareNote}
                </div>
                <div class="chip-meta" style="color:#64748B;">Bill Item: ${item.qty}× ${fmtIDR(item.price)} ${active ? `| <span style="color:#0F172A; font-weight:600;">Bayar: ${fmtIDR(perHead)}</span>` : ""}</div>
              </div>
            </div>
            <div class="chip-actions" style="display:flex; align-items:center; gap:8px;">
              <button type="button" class="btn-qty minus" data-action="minus" data-person="${person.id}" data-item="${item.id}" style="padding:2px 8px; border-radius:4px; border:1px solid #CBD5E1; background:#fff; color:#0F172A; font-weight:bold; cursor:pointer;">-</button>
              <span style="font-weight:bold; min-width:12px; text-align:center; color:#0F172A;">${qty}</span>
              <button type="button" class="btn-qty plus" data-action="plus" data-person="${person.id}" data-item="${item.id}" style="padding:2px 8px; border-radius:4px; border:1px solid #CBD5E1; background:#fff; color:#0F172A; font-weight:bold; cursor:pointer;">+</button>
            </div>
          </div>
        `;
      })
      .join("");

    card.innerHTML = `
      <div class="person-head">
        <input type="text" class="input person-name" value="${escapeHtml(person.name)}" data-person-name="${person.id}" style="flex:1; color:#0F172A; font-weight:bold;" />
        <button class="person-remove" data-remove-person="${person.id}" type="button">Hapus</button>
      </div>
      <div class="chip-grid" style="display:flex; flex-direction:column; gap:8px;">${chips}</div>
    `;
    list.appendChild(card);
  });
}

$("people-list").addEventListener("click", (e) => {
  const t = e.target as HTMLElement;

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

  const removePerson = t.dataset.removePerson;
  if (removePerson) {
    people = people.filter((p) => p.id !== Number(removePerson));
    renderPeopleStep();
  }
});

$("people-list").addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  const pid = t.dataset.personName;
  if (pid) {
    const p = people.find((x) => x.id === Number(pid));
    if (p) p.name = t.value;
  }
});

$("btn-add-person").addEventListener("click", () => {
  const inp = $<HTMLInputElement>("new-person");
  const name = inp.value.trim() || `Orang ${people.length + 1}`;
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
    bankHtml.style.background = "#F1F5F9";
    bankHtml.style.borderRadius = "8px";
    bankHtml.style.border = "1px solid #E2E8F0";
    bankHtml.innerHTML = `
      <h4 style="margin-top:0; margin-bottom:12px; font-size:14px; color:#334155; font-weight:600;">💳 Detail Rekening Bank (Muncul di Hasil)</h4>
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
    <div class="summary-row" style="display:flex; flex-direction:column; padding:16px; border:1px solid #CBD5E1; border-radius:12px; background:#FFFFFF; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:16px; font-weight:bold; color:#0F172A; margin-bottom:10px; border-bottom:2px dashed #E2E8F0; padding-bottom:8px;">
        👤 ${escapeHtml(r.name)}
      </div>
      
      <div style="font-size:13px; color:#334155; display:flex; flex-direction:column; gap:6px;">
        ${r.items.map((i) => `
          <div style="display:flex; justify-content:space-between; color:#0F172A;">
            <span>• ${escapeHtml(i.name)} ${i.qty < i.totalShares ? `<span style="color:#64748B; font-weight:500;">(${i.qty}/${i.totalShares})</span>` : ''}</span>
            <span class="mono" style="font-weight:500;">${fmtIDR(i.share)}</span>
          </div>
        `).join("")}
        
        <div style="height:1px; background:#E2E8F0; margin:6px 0;"></div>
        
        <div style="display:flex; justify-content:space-between; color:#475569;"><span>Subtotal</span><span class="mono">${fmtIDR(r.subtotal)}</span></div>
        ${r.taxShare > 0 ? `<div style="display:flex; justify-content:space-between; color:#475569;"><span>Pajak (Tax)</span><span class="mono">${fmtIDR(r.taxShare)}</span></div>` : ""}
        ${r.serviceShare > 0 ? `<div style="display:flex; justify-content:space-between; color:#475569;"><span>Service Charge</span><span class="mono">${fmtIDR(r.serviceShare)}</span></div>` : ""}
        ${r.discountShare > 0 ? `<div style="display:flex; justify-content:space-between; color:#16A34A; font-weight:500;"><span>Diskon</span><span class="mono">-${fmtIDR(r.discountShare)}</span></div>` : ""}
        ${Math.abs(r.totalRounded - r.totalRaw) > 0.5 ? `<div style="display:flex; justify-content:space-between; color:#64748B;"><span>Pembulatan</span><span class="mono">${r.totalRounded > r.totalRaw ? '+' : ''}${fmtIDR(r.totalRounded - r.totalRaw)}</span></div>` : ""}
      </div>
      
      <div style="margin-top:12px; padding-top:12px; border-top:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:bold; font-size:14px; color:#0F172A;">TOTAL BAYAR:</span>
        <span class="mono" style="font-weight:800; font-size:18px; color:#1E40AF; background:#DBEAFE; padding:6px 14px; border-radius:8px; border:1px solid #BFDBFE;">${fmtIDR(r.totalRounded)}</span>
      </div>
    </div>
  `
    )
    .join("");

  const totalRounded = results.reduce((s, r) => s + r.totalRounded, 0);
  const diff = totalRounded - grandTotal;
  const diffSign = diff > 0 ? "+" : "";
  
  const summarySub = $("summary-sub");
  summarySub.style.color = "#0F172A";
  summarySub.innerHTML = `
    <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px; border-radius:8px; text-align:center; margin-top:10px; color:#334155;">
      Total tagihan asli: <b style="color:#0F172A;">${fmtIDR(grandTotal)}</b><br/>
      Total terkumpul setelah pembulatan: <b style="color:#0F172A;">${fmtIDR(totalRounded)}</b> 
      <span style="color:#64748B; font-size:12px;">(Selisih: ${diffSign}${fmtIDR(diff)})</span>
    </div>
  `;

  $("step-result").classList.remove("hidden");
  $("step-result").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ============ DOWNLOAD ============
$("btn-download").addEventListener("click", async () => {
  const btn = $("btn-download") as HTMLButtonElement;
  const originalText = btn.textContent || "Download Struk";
  btn.textContent = "⏳ Memproses...";
  btn.disabled = true;

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
      <div class="rt-bank-box" style="margin-top:20px; padding:16px; background:#EFF6FF; border-radius:12px; border: 1.5px dashed #3B82F6; text-align:center;">
        <div style="font-size:12px; color:#1D4ED8; font-weight:bold; text-transform:uppercase; margin-bottom:8px; letter-spacing:0.5px;">Transfer Pembayaran Ke:</div>
        ${bName ? `<div style="font-size:16px; font-weight:bold; color:#1E3A8A;">Bank ${escapeHtml(bName)}</div>` : ""}
        ${bAcc ? `<div style="font-size:24px; font-family:monospace; font-weight:900; margin:6px 0; color:#0F172A; letter-spacing:1px;">${escapeHtml(bAcc)}</div>` : ""}
        ${bHolder ? `<div style="font-size:14px; color:#1E40AF; font-weight:600;">a.n. ${escapeHtml(bHolder)}</div>` : ""}
      </div>
    `;
  }

  // KUNCI PERBAIKAN: Pisahkan kiri (nama) dan kanan (harga) pakai flex:1 & blok tegas
  const personHtml = lastResults
    .map(
      (r) => `
    <div class="rt-person" style="margin-bottom:20px; padding-bottom:16px; border-bottom:2px dashed #CBD5E1;">
      <div class="rt-person-head" style="margin-bottom:12px;">
        <span class="rt-person-name" style="font-weight:bold; font-size:18px; color:#0F172A; display:block;">👤 ${escapeHtml(r.name)}</span>
      </div>
      <div class="rt-items" style="font-size:14px; color:#334155;">
        ${r.items.map((i) => `
          <div class="rt-item" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; color:#0F172A;">
            <div style="flex:1; padding-right:12px; word-break:break-word; line-height:1.4;">
              • ${escapeHtml(i.name)} ${i.qty < i.totalShares ? `<span style="color:#64748B;">(${i.qty}/${i.totalShares})</span>` : ''}
            </div>
            <div class="mono" style="white-space:nowrap; text-align:right;">${fmtIDR(i.share)}</div>
          </div>`).join("")}
          
        <div style="height:1px; background:#E2E8F0; margin:10px 0;"></div>
        
        ${r.taxShare > 0 ? `<div class="rt-item" style="display:flex; justify-content:space-between; margin-bottom:6px; color:#475569;"><div style="flex:1;">• Pajak (Tax)</div><div class="mono" style="white-space:nowrap;">${fmtIDR(r.taxShare)}</div></div>` : ""}
        ${r.serviceShare > 0 ? `<div class="rt-item" style="display:flex; justify-content:space-between; margin-bottom:6px; color:#475569;"><div style="flex:1;">• Service Charge</div><div class="mono" style="white-space:nowrap;">${fmtIDR(r.serviceShare)}</div></div>` : ""}
        ${r.discountShare > 0 ? `<div class="rt-item" style="display:flex; justify-content:space-between; margin-bottom:6px; color:#16A34A;"><div style="flex:1;">• Diskon</div><div class="mono" style="white-space:nowrap;">−${fmtIDR(r.discountShare)}</div></div>` : ""}
      </div>
      
      <div style="margin-top:16px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:bold; font-size:16px; color:#0F172A;">Total Bayar:</span>
        <span class="mono" style="color:#1E40AF; background:#DBEAFE; padding:6px 12px; border-radius:8px; font-size:18px; font-weight:bold; border:1px solid #BFDBFE;">${fmtIDR(r.totalRounded)}</span>
      </div>
    </div>
  `
    )
    .join("");

  const grandRounded = lastResults.reduce((s, r) => s + r.totalRounded, 0);

  // KUNCI PERBAIKAN WADAH UTAMA: Paksa font-family dan line-height: 1.5
  const target = document.createElement("div");
  target.style.width = "480px";
  target.style.padding = "32px 24px";
  target.style.backgroundColor = "#F8FAFC";
  target.style.position = "fixed"; 
  target.style.top = "0";
  target.style.left = "0";
  target.style.zIndex = "-1000"; 
  target.style.boxSizing = "border-box";
  
  // Wajib definisikan system font dan line-height agar tidak mepet
  target.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  target.style.lineHeight = "1.5"; 

  target.innerHTML = `
    <div class="rt-header" style="text-align:center; margin-bottom:24px;">
      <div class="rt-title" style="font-size:32px; font-weight:900; color:#0F172A; letter-spacing:-1px;">patungan.</div>
      <div class="rt-date" style="color:#64748B; font-size:14px; margin-top:4px;">${dateStr}</div>
    </div>
    
    ${personHtml}
    
    <div class="rt-total-box" style="margin-top:24px; padding:16px; background:#FFFFFF; border-radius:10px; display:flex; justify-content:space-between; align-items:center; border:2px solid #E2E8F0;">
      <span class="rt-total-label" style="font-weight:bold; font-size:18px; color:#0F172A;">Total Terkumpul</span>
      <span class="rt-total-amount" style="font-weight:900; font-size:20px; color:#0F172A; white-space:nowrap;">${fmtIDR(grandRounded)}</span>
    </div>
    
    ${bankHtml}
    
    <div class="rt-footer" style="margin-top:30px; font-size:12px; color:#94A3B8; text-align:center; font-weight:500;">— Struk digital dihitung dengan adil & transparan —</div>
  `;

  document.body.appendChild(target);

  try {
    target.getBoundingClientRect();
    await new Promise((r) => setTimeout(r, 600)); // Loading tunggu font selesai render

    const dataUrl = await (window as any).htmlToImage.toPng(target, {
      quality: 1,
      pixelRatio: 2, 
      backgroundColor: "#F8FAFC",
      cacheBust: true,
      skipFonts: false
    });
    
    const link = document.createElement("a");
    link.download = `patungan-${now.toISOString().slice(0, 10)}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error(err);
    alert("Gagal mengunduh gambar. Pastikan library html-to-image termuat dengan benar.");
  } finally {
    document.body.removeChild(target);
    btn.textContent = originalText;
    btn.disabled = false;
  }
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