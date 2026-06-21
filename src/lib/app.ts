import { parseReceipt, type ParsedReceipt } from "./parseReceipt";

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
let payerName = ""; // siapa yang nalangin (settle-up)
let savedBank: { name: string; acc: string; holder: string } | null = null;
let rotation = 0; // rotasi gambar struk (0/90/180/270) untuk foto miring

// ============ CONFIG PEMBULATAN ============
// ROUND_TO = kelipatan pembulatan (1000 = ribuan terdekat ke atas).
//   Ganti ke 500 / 100 kalau mau lebih halus, atau 1 untuk tanpa pembulatan.
// ROUND_MODE: "up" = ke atas (selalu cukup nutup bill), "nearest" = ke terdekat
//   (paling adil), "down" = ke bawah (anti-overcharge, yang nalangin bisa nombok).
type RoundMode = "up" | "nearest" | "down";
const ROUND_TO = 1000;
const ROUND_MODE = "nearest" as RoundMode;

// ============ UTILS ============
const fmtIDR = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
const roundTotal = (n: number) => {
  if (ROUND_TO <= 1) return Math.round(n);
  if (ROUND_MODE === "nearest") return Math.round(n / ROUND_TO) * ROUND_TO;
  if (ROUND_MODE === "down") return Math.floor(n / ROUND_TO) * ROUND_TO;
  return Math.ceil(n / ROUND_TO) * ROUND_TO;
};
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

// Tombol putar 90° untuk foto struk yang miring/sideways (disuntik ke #preview).
const rotateBtn = document.createElement("button");
rotateBtn.type = "button";
rotateBtn.id = "preview-rotate";
rotateBtn.textContent = "↻ Putar";
rotateBtn.title = "Putar 90°";
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

// ============ KAMERA LANGSUNG + TEMPEL TEKS (disuntik ke #step-upload) ============
// Input tersembunyi dgn capture=environment → buka kamera belakang langsung di HP.
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
  <button type="button" id="btn-camera" class="btn btn-secondary" style="flex:1; min-width:140px; font-size:13px;">📷 Foto pakai kamera</button>
  <button type="button" id="btn-paste" class="btn btn-secondary" style="flex:1; min-width:140px; font-size:13px;">📋 Tempel teks struk</button>`;
btnSkip.parentElement?.appendChild(extraRow);

const pastePanel = document.createElement("div");
pastePanel.id = "paste-panel";
pastePanel.className = "hidden";
pastePanel.style.cssText = "margin-top:10px;";
pastePanel.innerHTML = `
  <textarea id="paste-text" class="input" rows="6" placeholder="Tempel teks struk di sini — tiap baris: nama + harga (mis. 'Es Teh 8.000')..." style="width:100%; font-family:var(--mono); font-size:13px; line-height:1.5;"></textarea>
  <button type="button" id="btn-parse-text" class="btn btn-primary btn-block" style="margin-top:8px;">Proses teks → daftar pesanan</button>`;
btnSkip.parentElement?.appendChild(pastePanel);

$("btn-camera").addEventListener("click", () => camInput.click());
$("btn-paste").addEventListener("click", () => {
  pastePanel.classList.toggle("hidden");
  if (!pastePanel.classList.contains("hidden"))
    $<HTMLTextAreaElement>("paste-text").focus();
});
$("btn-parse-text").addEventListener("click", () => {
  const txt = $<HTMLTextAreaElement>("paste-text").value.trim();
  if (!txt) {
    alert("Tempel teks struk dulu.");
    return;
  }
  const parsed = parseReceipt(txt);
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
  if (bill.items.length === 0)
    alert("Tidak ada item terbaca dari teks. Coba rapikan formatnya, atau tambah manual di langkah berikutnya.");
  pastePanel.classList.add("hidden");
  renderBillStep();
  $("step-bill").classList.remove("hidden");
  $("step-bill").scrollIntoView({ behavior: "smooth", block: "start" });
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

// ============ OCR IMAGE PREPROCESSING ============
// Struk Indonesia sering: kertas thermal pudar, foto miring, cahaya kurang,
// resolusi kecil. Preprocessing ini menaikkan akurasi Tesseract secara signifikan
// tanpa kirim data ke mana pun (semua di canvas browser).
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

async function preprocessImage(file: File): Promise<HTMLCanvasElement | File> {
  try {
    const img = await loadImage(file);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    // Upscale struk yang terlalu kecil (foto thermal sering < 1000px) supaya
    // huruf cukup besar untuk dikenali, lalu batasi maksimal agar tidak berat.
    const TARGET_MIN = 1600;
    const MAX_DIM = 2600;
    let scale = 1;
    if (Math.min(w, h) < TARGET_MIN) scale = TARGET_MIN / Math.min(w, h);
    if (Math.max(w * scale, h * scale) > MAX_DIM)
      scale = MAX_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    // Dukung rotasi (foto struk yang miring/sideways). Kalau 90/270, tukar dimensi.
    const swap = rotation === 90 || rotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;

    // 1) Grayscale (luminance) + hitung rata-rata untuk auto-contrast.
    let sum = 0;
    const gray = new Float32Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      gray[j] = g;
      sum += g;
    }
    const mean = sum / gray.length;

    // 2) Contrast stretch di sekitar mean — teks gelap makin tegas, latar makin
    //    bersih. Kontras sedang (1.35) supaya teks pudar tidak ikut hilang.
    const contrast = 1.35;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      let v = (gray[j] - mean) * contrast + mean;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  } catch {
    return file; // kalau gagal, biar Tesseract baca file aslinya
  }
}

// Skor hasil parse: makin banyak item bernama+berharga makin bagus, bonus kalau
// subtotal/pajak/total ikut kebaca. Dipakai untuk memilih hasil dual-pass terbaik.
function scoreParse(p: ParsedReceipt): number {
  const goodItems = p.items.filter(
    (i) => i.name && i.name !== "ORPHAN_PRICE" && i.total > 0,
  ).length;
  return (
    goodItems * 100 +
    (p.subtotal > 0 ? 15 : 0) +
    (p.tax > 0 ? 5 : 0) +
    (p.total > 0 ? 5 : 0)
  );
}

// Progress untuk tahap "recognizing text" (di-scale per pass pada dual-pass).
let ocrBase = 60;
let ocrSpan = 40;
let ocrPassText = "Membaca struk...";

btnScan.addEventListener("click", async () => {
  if (!selectedFile) return;
  btnScan.disabled = true;
  scanLabel.innerHTML = '<span class="spinner"></span> Memproses...';
  uploadError.innerHTML = "";
  progressWrap.classList.remove("hidden");
  setProgress(5, "Memuat Tesseract OCR...");

  try {
    const worker = await Tesseract.createWorker("ind+eng", 1, {
      logger: (m: any) => {
        if (m.status === "loading tesseract core")
          setProgress(10, "Memuat OCR engine...");
        else if (m.status === "initializing tesseract")
          setProgress(18, "Inisialisasi...");
        else if (m.status === "loading language traineddata") {
          const pct = 20 + (m.progress || 0) * 20;
          setProgress(pct, "Mengunduh model bahasa Indonesia...");
        } else if (m.status === "initializing api")
          setProgress(42, "Menyiapkan...");
        else if (m.status === "recognizing text") {
          const pct = ocrBase + (m.progress || 0) * ocrSpan;
          setProgress(
            pct,
            `${ocrPassText} ${Math.round((m.progress || 0) * 100)}%`,
          );
        }
      },
    });

    let parsed: ParsedReceipt;
    try {
      await worker.setParameters({ preserve_interword_spaces: "1" });
      setProgress(48, "Membersihkan gambar struk...");
      const processed = await preprocessImage(selectedFile!);

      // ===== DUAL-PASS =====
      // Pass 1 — PSM 6: anggap struk sebagai satu blok teks seragam.
      await worker.setParameters({ tessedit_pageseg_mode: "6" });
      ocrBase = 60;
      ocrSpan = 20;
      ocrPassText = "Membaca struk (1/2)...";
      setProgress(60, ocrPassText);
      const p1 = parseReceipt((await worker.recognize(processed)).data.text);

      // Pass 2 — PSM 4: anggap struk sebagai satu kolom teks (ukuran bervariasi).
      await worker.setParameters({ tessedit_pageseg_mode: "4" });
      ocrBase = 80;
      ocrSpan = 20;
      ocrPassText = "Membaca ulang (2/2)...";
      setProgress(80, ocrPassText);
      const p2 = parseReceipt((await worker.recognize(processed)).data.text);

      // Pilih hasil yang paling banyak menangkap item.
      parsed = scoreParse(p2) > scoreParse(p1) ? p2 : p1;
    } finally {
      await worker.terminate();
    }

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

  // Saat render, tampilkan nilai apa adanya dalam mode nominal (Rp).
  $<HTMLSelectElement>("t-tax-mode").value = "nominal";
  $<HTMLSelectElement>("t-service-mode").value = "nominal";
  $<HTMLSelectElement>("t-discount-mode").value = "nominal";
  $<HTMLInputElement>("t-tax").value = String(bill.tax);
  $<HTMLInputElement>("t-service").value = String(bill.service);
  $<HTMLInputElement>("t-discount").value = String(bill.discount);
  updateBillTotals();
}

// Hitung nominal dari sebuah baris (pajak/service/diskon) yang punya mode Rp/%.
// Kalau mode "%", nilainya dihitung dari subtotal dan nominalnya ditampilkan.
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

// Pajak / Service / Diskon — semua punya input nilai + selector mode (Rp/%).
["t-tax", "t-service", "t-discount"].forEach((id) =>
  $(id).addEventListener("input", updateBillTotals),
);
["t-tax-mode", "t-service-mode", "t-discount-mode"].forEach((id) =>
  $(id).addEventListener("change", updateBillTotals),
);

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

  // Tombol "bagi rata semua" + peringatan pesanan yang belum dibagi ke siapa pun.
  const controls = document.createElement("div");
  controls.style.cssText = "margin-bottom:16px;";
  const unassigned = bill.items.filter(
    (it) => getItemSharersCount(it.id) === 0,
  );
  controls.innerHTML = `
    <button type="button" id="btn-split-global" style="width:100%; font-size:13px; padding:10px; border-radius:8px; border:1px dashed #10B981; background:#ECFDF5; color:#059669; font-weight:600; cursor:pointer; margin-bottom:${unassigned.length ? "10px" : "0"};">⚖️ Bagikan SEMUA pesanan rata ke semua teman</button>
    ${
      unassigned.length
        ? `<div style="background:#FEF3C7; border:1px solid #FCD34D; color:#92400E; padding:10px 12px; border-radius:8px; font-size:13px;">⚠️ <b>${unassigned.length} pesanan belum dibagi</b>: ${unassigned.map((i) => escapeHtml(i.name || "(tanpa nama)")).join(", ")}</div>`
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
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <button type="button" class="btn-split-all" data-item="${item.id}" style="flex:1; font-size:12px; padding:7px; border-radius:6px; border:1px solid #10B981; background:#ECFDF5; color:#059669; font-weight:600; cursor:pointer;">⚖️ Bagi rata ke semua</button>
        ${sharersCount > 0 ? `<button type="button" class="btn-clear-item" data-item="${item.id}" style="font-size:12px; padding:7px 12px; border-radius:6px; border:1px solid #E2E8F0; background:#FFFFFF; color:#64748B; cursor:pointer;">Kosongkan</button>` : ""}
      </div>
      <div class="chip-grid" style="display:flex; flex-direction:column; gap:8px;">${chips}</div>
    `;
    list.appendChild(card);
  });

  scheduleSave();
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

  // Bagi rata SEMUA pesanan ke semua teman (qty 1 tiap orang tiap item).
  if (t.closest("#btn-split-global")) {
    bill.items.forEach((it) =>
      people.forEach((p) => {
        p.items[it.id] = 1;
      }),
    );
    renderPeopleStep();
    return;
  }

  // Bagi rata satu pesanan ke semua teman.
  const splitAll = t.closest(".btn-split-all") as HTMLElement | null;
  if (splitAll) {
    const iid = Number(splitAll.dataset.item);
    people.forEach((p) => {
      p.items[iid] = 1;
    });
    renderPeopleStep();
    return;
  }

  // Kosongkan satu pesanan dari semua teman.
  const clearItem = t.closest(".btn-clear-item") as HTMLElement | null;
  if (clearItem) {
    const iid = Number(clearItem.dataset.item);
    people.forEach((p) => {
      delete p.items[iid];
    });
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
    ["bank-name-input", "bank-acc-input", "bank-holder-input"].forEach((id) =>
      $(id).addEventListener("input", scheduleSave),
    );
  }
  // Pulihkan data rekening dari sesi tersimpan (kalau ada).
  if (savedBank) {
    $<HTMLInputElement>("bank-name-input").value = savedBank.name || "";
    $<HTMLInputElement>("bank-acc-input").value = savedBank.acc || "";
    $<HTMLInputElement>("bank-holder-input").value = savedBank.holder || "";
    savedBank = null;
  }
}

// ============ SETTLE-UP + SHARE (disuntik ke #step-result sekali) ============
function setupResultExtras() {
  if (!$("settle-container")) {
    const wrap = document.createElement("div");
    wrap.id = "settle-container";
    wrap.style.cssText =
      "background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-top:16px;";
    wrap.innerHTML = `
      <div style="font-size:14px;font-weight:600;color:#0F172A;margin-bottom:8px;">🤝 Siapa yang nalangin / bayar duluan?</div>
      <select id="settle-payer" class="input" style="color:#0F172A;cursor:pointer;"></select>
      <div id="settle-list" style="margin-top:12px;"></div>`;
    const firstRow = $("step-result").querySelector(".btn-row");
    if (firstRow) $("step-result").insertBefore(wrap, firstRow);
    else $("step-result").appendChild(wrap);
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
    row.innerHTML = `
      <button type="button" id="btn-share-wa" class="btn btn-block" style="background:#25D366;color:#fff;font-weight:bold;">📲 Bagikan ke WhatsApp</button>
      <button type="button" id="btn-copy" class="btn btn-block" style="background:#F1F5F9;color:#0F172A;border:1px solid #E2E8F0;">📋 Salin teks</button>`;
    const firstRow = $("step-result").querySelector(".btn-row");
    if (firstRow) $("step-result").insertBefore(row, firstRow);
    else $("step-result").appendChild(row);

    $("btn-share-wa").addEventListener("click", () => {
      window.open(
        "https://wa.me/?text=" + encodeURIComponent(buildShareText()),
        "_blank",
      );
    });
    $("btn-copy").addEventListener("click", async () => {
      const text = buildShareText();
      try {
        await navigator.clipboard.writeText(text);
        const b = $("btn-copy");
        const old = b.textContent;
        b.textContent = "✓ Tersalin!";
        setTimeout(() => {
          b.textContent = old;
        }, 1500);
      } catch {
        alert("Gagal menyalin otomatis. Salin manual:\n\n" + text);
      }
    });
  }
}

function renderSettle() {
  // Kalau orang yang dipilih sudah dihapus, reset.
  if (payerName && !lastResults.some((r) => r.name === payerName)) payerName = "";

  const sel = $<HTMLSelectElement>("settle-payer");
  if (sel) {
    sel.innerHTML = ['<option value="">— Pilih yang nalangin —</option>']
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
    list.innerHTML = `<div style="font-size:13px;color:#64748B;">Pilih satu orang yang nalangin — nanti muncul siapa transfer berapa ke dia.</div>`;
    return;
  }
  const others = lastResults.filter(
    (r) => r.name !== payerName && r.totalRounded > 0,
  );
  const totalIn = others.reduce((s, r) => s + r.totalRounded, 0);
  list.innerHTML = `
    <div style="font-size:13px;color:#0F172A;margin-bottom:8px;">${escapeHtml(payerName)} nalangin semua, akan terima total <b>${fmtIDR(totalIn)}</b>:</div>
    ${others
      .map(
        (r) => `
      <div style="display:flex;justify-content:space-between;padding:8px 10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:6px;font-size:14px;color:#0F172A;">
        <span>${escapeHtml(r.name)} → ${escapeHtml(payerName)}</span>
        <span class="mono" style="font-weight:700;color:#10B981;">${fmtIDR(r.totalRounded)}</span>
      </div>`,
      )
      .join("")}`;
}

function buildShareText(): string {
  const lines: string[] = ["*Patungan* 🧾"];
  const bank = captureBank();
  if (bank && (bank.name || bank.acc || bank.holder)) {
    lines.push("", "💳 Transfer ke:");
    if (bank.name) lines.push("Bank " + bank.name);
    if (bank.acc) lines.push(bank.acc);
    if (bank.holder) lines.push("a.n. " + bank.holder);
  }
  lines.push("");
  lastResults.forEach((r) => {
    lines.push(`👤 *${r.name}* — ${fmtIDR(r.totalRounded)}`);
    r.items.forEach((i) =>
      lines.push(
        `   • ${i.name}${i.qty < i.totalShares ? ` (${i.qty}/${i.totalShares})` : ""}: ${fmtIDR(i.share)}`,
      ),
    );
  });
  const grand = lastResults.reduce((s, r) => s + r.totalRounded, 0);
  lines.push("", `💰 Total: ${fmtIDR(grand)}`);
  if (payerName) {
    const others = lastResults.filter(
      (r) => r.name !== payerName && r.totalRounded > 0,
    );
    if (others.length) {
      lines.push("", `🤝 Transfer ke *${payerName}* (yang nalangin):`);
      others.forEach((r) => lines.push(`   ${r.name}: ${fmtIDR(r.totalRounded)}`));
    }
  }
  lines.push("", "via patungan. — https://astro-patungan.vercel.app/");
  return lines.join("\n");
}

// ============ AUTO-SAVE SESI (localStorage, tetap 100% offline) ============
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

function saveState() {
  try {
    const data = {
      v: 1,
      bill,
      people,
      nextItemId,
      nextPersonId,
      payerName,
      bank: captureBank(),
      ts: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
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

    renderBillStep();
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
    when = new Date(s.ts).toLocaleString("id-ID", {
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
    "background:#FFFFFF;border:1px solid #10B981;border-radius:10px;padding:14px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;";
  banner.innerHTML = `
    <div style="color:#0F172A;font-size:14px;">💾 Ada sesi tersimpan${when ? ` <span style="color:#64748B;">(${when})</span>` : ""}. Lanjutkan?</div>
    <div style="display:flex;gap:8px;">
      <button type="button" id="restore-yes" class="btn" style="background:#10B981;color:#fff;padding:8px 16px;font-size:14px;">Lanjutkan</button>
      <button type="button" id="restore-no" class="btn" style="background:#F1F5F9;color:#0F172A;padding:8px 16px;font-size:14px;">Hapus</button>
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

$("btn-calculate").addEventListener("click", () => {
  if (people.length === 0) {
    alert("Tambah minimal 1 orang dulu");
    return;
  }
  const unassigned = bill.items.filter(
    (it) => getItemSharersCount(it.id) === 0,
  );
  if (unassigned.length > 0) {
    const names = unassigned.map((i) => i.name || "(tanpa nama)").join(", ");
    if (
      !confirm(
        `${unassigned.length} pesanan belum dibagi ke siapa pun:\n${names}\n\nKalau dilanjut, pesanan itu tidak ditagih ke siapa pun (total terkumpul jadi kurang dari bill). Tetap lanjut?`,
      )
    )
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

  setupResultExtras();
  renderSettle();
  scheduleSave();

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

// ============ INIT ============
showRestoreBanner();

void lastGrandTotal;