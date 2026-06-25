// OCR struk — preprocessing gambar + Tesseract dual-pass. Semua jalan di browser
// (tanpa kirim data). Dipisah dari UI supaya gampang dirawat & dipakai ulang.

import { parseReceipt, type ParsedReceipt } from "./parseReceipt";

declare const Tesseract: any;

export type ProgressFn = (pct: number, text: string) => void;

export function loadImage(file: File): Promise<HTMLImageElement> {
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

/**
 * Bersihkan gambar struk: upscale yang kekecilan, rotasi (foto miring),
 * grayscale, lalu auto-contrast. Mengembalikan canvas siap-OCR; kalau gagal
 * kembalikan file asli supaya Tesseract tetap bisa coba.
 */
export async function preprocessImage(
  file: File,
  rotation = 0,
): Promise<HTMLCanvasElement | File> {
  try {
    const img = await loadImage(file);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    const TARGET_MIN = 1600;
    const MAX_DIM = 2600;
    let scale = 1;
    if (Math.min(w, h) < TARGET_MIN) scale = TARGET_MIN / Math.min(w, h);
    if (Math.max(w * scale, h * scale) > MAX_DIM)
      scale = MAX_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);

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

    // Grayscale (luminance) + rata-rata untuk auto-contrast.
    let sum = 0;
    const gray = new Float32Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      gray[j] = g;
      sum += g;
    }
    const mean = sum / gray.length;

    // Contrast stretch sedang (1.35) — teks pudar tetap kebaca.
    const contrast = 1.35;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      let v = (gray[j] - mean) * contrast + mean;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  } catch {
    return file;
  }
}

/** Skor hasil parse: makin banyak item bernama+berharga makin bagus. */
export function scoreParse(p: ParsedReceipt): number {
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

export interface RecognizeOpts {
  rotation?: number;
  onProgress?: ProgressFn;
}

/**
 * Baca struk: preprocessing → Tesseract DUAL-PASS (PSM 6 blok & PSM 4 kolom),
 * lalu pilih hasil parse terbaik. Mengembalikan ParsedReceipt.
 */
export async function recognizeReceipt(
  file: File,
  opts: RecognizeOpts = {},
): Promise<ParsedReceipt> {
  const { rotation = 0, onProgress } = opts;
  const report: ProgressFn = onProgress || (() => {});

  // Progress tahap "recognizing text" di-scale per pass.
  let ocrBase = 60;
  let ocrSpan = 40;
  let ocrPassText = "Membaca struk...";

  report(5, "Memuat Tesseract OCR...");
  const worker = await Tesseract.createWorker("ind+eng", 1, {
    logger: (m: any) => {
      if (m.status === "loading tesseract core")
        report(10, "Memuat OCR engine...");
      else if (m.status === "initializing tesseract")
        report(18, "Inisialisasi...");
      else if (m.status === "loading language traineddata")
        report(20 + (m.progress || 0) * 20, "Mengunduh model bahasa Indonesia...");
      else if (m.status === "initializing api") report(42, "Menyiapkan...");
      else if (m.status === "recognizing text")
        report(
          ocrBase + (m.progress || 0) * ocrSpan,
          `${ocrPassText} ${Math.round((m.progress || 0) * 100)}%`,
        );
    },
  });

  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    report(48, "Membersihkan gambar struk...");
    const processed = await preprocessImage(file, rotation);

    // Pass 1 — PSM 6: satu blok teks seragam.
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    ocrBase = 60;
    ocrSpan = 20;
    ocrPassText = "Membaca struk (1/2)...";
    report(60, ocrPassText);
    const p1 = parseReceipt((await worker.recognize(processed)).data.text);

    // Pass 2 — PSM 4: satu kolom teks (ukuran bervariasi).
    await worker.setParameters({ tessedit_pageseg_mode: "4" });
    ocrBase = 80;
    ocrSpan = 20;
    ocrPassText = "Membaca ulang (2/2)...";
    report(80, ocrPassText);
    const p2 = parseReceipt((await worker.recognize(processed)).data.text);

    return scoreParse(p2) > scoreParse(p1) ? p2 : p1;
  } finally {
    await worker.terminate();
  }
}
