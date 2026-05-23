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
  itemIds: number[];
}

// ============ STATE ============
let bill: Bill = { items: [], tax: 0, service: 0, discount: 0 };
let people: Person[] = [];
let nextItemId = 1;
let nextPersonId = 1;
let selectedFile: File | null = null;

// ============ CONFIG ============
const ROUND_TO = 1000;

// ============ UTILS ============
const fmtIDR = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
const roundUp = (n: number) => Math.ceil(n / ROUND_TO) * ROUND_TO;
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
    row.innerHTML = `
      <input type="text" class="input" value="${escapeHtml(item.name)}" data-id="${item.id}" data-field="name" style="flex:1;" />
      <input type="number" class="input mono" value="${item.qty}" min="1" data-id="${item.id}" data-field="qty" style="width:55px; text-align:center; padding: 6px 4px;" />
      <span style="color:var(--ink-muted);">×</span>
      <input type="number" class="input mono" value="${item.price}" min="0" data-id="${item.id}" data-field="price" style="width:100px; text-align:right; padding: 6px 8px;" />
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
      { id: nextPersonId++, name: "Orang 1", itemIds: [] },
      { id: nextPersonId++, name: "Orang 2", itemIds: [] },
    ];
  }
  renderPeopleStep();
  $("step-people").classList.remove("hidden");
  $("step-people").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ============ STEP 3: PEOPLE ============
function getItemSharers(itemId: number): Person[] {
  return people.filter((p) => p.itemIds.includes(itemId));
}

function renderPeopleStep() {
  const list = $("people-list");
  list.innerHTML = "";

  people.forEach((person) => {
    const card = document.createElement("div");
    card.className = "person-card";
    const chips = bill.items
      .map((item) => {
        const active = person.itemIds.includes(item.id);
        const sharers = getItemSharers(item.id);
        const sharedNote =
          sharers.length > 1 && active
            ? `<span class="chip-shared">dibagi ${sharers.length}</span>`
            : "";
        const perHead =
          active && sharers.length > 0
            ? item.total / sharers.length
            : item.total;
        return `
          <div class="chip ${active ? "active" : ""}" data-person="${person.id}" data-item="${item.id}">
            <div class="chip-check">${active ? "✓" : ""}</div>
            <div class="chip-info">
              <div class="chip-name">${escapeHtml(item.name || "(tanpa nama)")} ${sharedNote}</div>
              <div class="chip-meta">${item.qty}× ${fmtIDR(item.price)} · ${active ? fmtIDR(perHead) + " / orang" : fmtIDR(item.total)}</div>
            </div>
          </div>
        `;
      })
      .join("");

    card.innerHTML = `
      <div class="person-head">
        <input type="text" class="input person-name" value="${escapeHtml(person.name)}" data-person-name="${person.id}" style="flex:1;" />
        <button class="person-remove" data-remove-person="${person.id}" type="button">Hapus</button>
      </div>
      <div class="chip-grid">${chips}</div>
    `;
    list.appendChild(card);
  });
}

$("people-list").addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const chip = t.closest(".chip") as HTMLElement | null;
  if (chip) {
    const pid = Number(chip.dataset.person);
    const iid = Number(chip.dataset.item);
    const p = people.find((x) => x.id === pid);
    if (!p) return;
    if (p.itemIds.includes(iid))
      p.itemIds = p.itemIds.filter((x) => x !== iid);
    else p.itemIds.push(iid);
    renderPeopleStep();
    return;
  }
  const removePerson = (t as HTMLElement).dataset.removePerson;
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
  people.push({ id: nextPersonId++, name, itemIds: [] });
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
  items: { name: string; share: number }[];
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
    const personItems: { name: string; share: number }[] = [];
    let subtotal = 0;
    p.itemIds.forEach((iid) => {
      const item = bill.items.find((i) => i.id === iid);
      if (!item) return;
      const sharers = getItemSharers(iid).length || 1;
      const share = (item.price * item.qty) / sharers;
      subtotal += share;
      personItems.push({ name: item.name || "(item)", share });
    });

    const ratio = billSubtotal > 0 ? subtotal / billSubtotal : 0;
    const taxShare = bill.tax * ratio;
    const serviceShare = bill.service * ratio;
    const discountShare = bill.discount * ratio;
    const totalRaw = subtotal + taxShare + serviceShare - discountShare;
    const totalRounded = roundUp(Math.max(0, totalRaw));

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

$("btn-calculate").addEventListener("click", () => {
  if (people.length === 0) {
    alert("Tambah minimal 1 orang dulu");
    return;
  }
  const { results, grandTotal } = calculate();
  lastResults = results;
  lastGrandTotal = grandTotal;

  const sumList = $("summary-list");
  sumList.innerHTML = results
    .map(
      (r) => `
    <div class="summary-row">
      <span class="summary-name">${escapeHtml(r.name)}</span>
      <span class="summary-amount">${fmtIDR(r.totalRounded)}</span>
    </div>
  `,
    )
    .join("");

  const totalRounded = results.reduce((s, r) => s + r.totalRounded, 0);
  const diff = totalRounded - grandTotal;
  $("summary-sub").textContent =
    `Total bill: ${fmtIDR(grandTotal)} · Setelah pembulatan: ${fmtIDR(totalRounded)} (selisih +${fmtIDR(diff)})`;

  $("step-result").classList.remove("hidden");
  $("step-result").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ============ DOWNLOAD ============
$("btn-download").addEventListener("click", async () => {
  const target = $("render-target");
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const personHtml = lastResults
    .map(
      (r) => `
    <div class="rt-person">
      <div class="rt-person-head">
        <span class="rt-person-name">${escapeHtml(r.name)}</span>
        <span class="rt-person-amount">${fmtIDR(r.totalRounded)}</span>
      </div>
      <div class="rt-items">
        ${r.items.map((i) => `<div class="rt-item"><span>• ${escapeHtml(i.name)}</span><span class="mono">${fmtIDR(i.share)}</span></div>`).join("")}
        ${r.taxShare > 0 ? `<div class="rt-item"><span>• Pajak (proporsional)</span><span class="mono">${fmtIDR(r.taxShare)}</span></div>` : ""}
        ${r.serviceShare > 0 ? `<div class="rt-item"><span>• Service charge</span><span class="mono">${fmtIDR(r.serviceShare)}</span></div>` : ""}
        ${r.discountShare > 0 ? `<div class="rt-item"><span>• Diskon</span><span class="mono">−${fmtIDR(r.discountShare)}</span></div>` : ""}
        ${r.totalRounded - r.totalRaw > 0.5 ? `<div class="rt-item" style="color: var(--ink-muted);"><span>• Pembulatan</span><span class="mono">+${fmtIDR(r.totalRounded - r.totalRaw)}</span></div>` : ""}
      </div>
    </div>
  `,
    )
    .join("");

  const grandRounded = lastResults.reduce((s, r) => s + r.totalRounded, 0);

  target.innerHTML = `
    <div class="rt-header">
      <div class="rt-title">patungan.</div>
      <div class="rt-date">${dateStr} · ${timeStr}</div>
    </div>
    ${personHtml}
    <div class="rt-total-box">
      <span class="rt-total-label">Total terkumpul</span>
      <span class="rt-total-amount">${fmtIDR(grandRounded)}</span>
    </div>
    <div class="rt-footer">— pembulatan ke atas Rp ${ROUND_TO.toLocaleString("id-ID")} —</div>
  `;
  target.classList.remove("hidden");

  try {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 150));
    const dataUrl = await htmlToImage.toPng(target, {
      quality: 1,
      pixelRatio: 2,
      backgroundColor: "#F8FAFC",
      cacheBust: true,
    });
    const link = document.createElement("a");
    link.download = `patungan-${now.toISOString().slice(0, 10)}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error(err);
    alert("Gagal generate gambar. Coba lagi.");
  } finally {
    target.classList.add("hidden");
    target.innerHTML = "";
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

// suppress unused variable warning
void lastGrandTotal;
