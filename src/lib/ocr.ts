// Receipt OCR — image preprocessing + Tesseract dual-pass, all in-browser.

import { parseReceipt, type ParsedReceipt } from "./parseReceipt";
import { loadTesseract } from "./cdn";

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

// ============ IMAGE PROCESSING PRIMITIVES (integral image based) ============
// Summed-area table: mean/std over any window in O(1), so contrast/skew
// detection stay fast even on a ~2600px upscaled image.

interface IntegralImages {
  sum: Float64Array;
  sumSq: Float64Array;
}

function buildIntegral(gray: Float32Array, w: number, h: number): IntegralImages {
  const stride = w + 1;
  const sum = new Float64Array(stride * (h + 1));
  const sumSq = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    const rowOff = y * w;
    const outRow = (y + 1) * stride;
    const prevRow = y * stride;
    for (let x = 0; x < w; x++) {
      const v = gray[rowOff + x];
      rowSum += v;
      rowSumSq += v * v;
      sum[outRow + x + 1] = sum[prevRow + x + 1] + rowSum;
      sumSq[outRow + x + 1] = sumSq[prevRow + x + 1] + rowSumSq;
    }
  }
  return { sum, sumSq };
}

function localMeanStd(
  ii: IntegralImages,
  w: number,
  h: number,
  x: number,
  y: number,
  r: number,
): { mean: number; std: number } {
  const stride = w + 1;
  const x0 = Math.max(0, x - r);
  const y0 = Math.max(0, y - r);
  const x1 = Math.min(w - 1, x + r);
  const y1 = Math.min(h - 1, y + r);
  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  const A = y0 * stride + x0;
  const B = y0 * stride + x1 + 1;
  const C = (y1 + 1) * stride + x0;
  const D = (y1 + 1) * stride + x1 + 1;
  const s = ii.sum[D] - ii.sum[B] - ii.sum[C] + ii.sum[A];
  const sq = ii.sumSq[D] - ii.sumSq[B] - ii.sumSq[C] + ii.sumSq[A];
  const mean = s / area;
  const variance = Math.max(0, sq / area - mean * mean);
  return { mean, std: Math.sqrt(variance) };
}

// LOCAL contrast normalization (CLAHE-like) via per-window z-score.
// More robust to uneven lighting/glare than a single global contrast stretch.
function adaptiveLocalContrast(
  gray: Float32Array,
  w: number,
  h: number,
  radius = 20,
  targetStd = 55,
  stdFloor = 12,
): Float32Array {
  const ii = buildIntegral(gray, w, h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const { mean, std } = localMeanStd(ii, w, h, x, y, radius);
      const z = (gray[y * w + x] - mean) / Math.max(std, stdFloor);
      const v = 128 + z * targetStd;
      out[y * w + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return out;
}

/** Grayscale image (Float32) → RGB canvas (so it can go through canvas rotate). */
function grayToCanvas(gray: Float32Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d")!;
  const id = cx.createImageData(w, h);
  for (let j = 0, i = 0; j < w * h; j++, i += 4) {
    const v = gray[j];
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  cx.putImageData(id, 0, 0);
  return c;
}

function canvasToGray(c: HTMLCanvasElement): { gray: Float32Array; w: number; h: number } {
  const cx = c.getContext("2d", { willReadFrequently: true })!;
  const id = cx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const gray = new Float32Array(c.width * c.height);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  return { gray, w: c.width, h: c.height };
}

/** Rotate a canvas by a small angle, growing the canvas a bit so corners don't get clipped. */
function rotateCanvasByAngle(src: HTMLCanvasElement, angleDeg: number): HTMLCanvasElement {
  const rad = (angleDeg * Math.PI) / 180;
  const w = src.width;
  const h = src.height;
  const absCos = Math.abs(Math.cos(rad));
  const absSin = Math.abs(Math.sin(rad));
  const nw = Math.round(w * absCos + h * absSin);
  const nh = Math.round(w * absSin + h * absCos);
  const c = document.createElement("canvas");
  c.width = nw;
  c.height = nh;
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#fff";
  cx.fillRect(0, 0, nw, nh);
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = "high";
  cx.translate(nw / 2, nh / 2);
  cx.rotate(rad);
  cx.drawImage(src, -w / 2, -h / 2);
  return c;
}

// Detects residual skew (±10°) left after the user's manual 90° rotation.
// Uses row projection: the correct angle maximizes dark-pixel variance per row.
function detectSkewAngle(gray: Float32Array, w: number, h: number): number {
  const maxW = 500;
  const scale = Math.min(1, maxW / w);
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));

  const small = new Float32Array(sw * sh);
  let sum = 0;
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(h - 1, Math.round(y / scale));
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(w - 1, Math.round(x / scale));
      const v = gray[sy * w + sx];
      small[y * sw + x] = v;
      sum += v;
    }
  }
  const mean = sum / (sw * sh);

  const darkX: number[] = [];
  const darkY: number[] = [];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (small[y * sw + x] < mean * 0.85) {
        darkX.push(x - sw / 2);
        darkY.push(y - sh / 2);
      }
    }
  }
  if (darkX.length < 20) return 0; // too little text detected, don't guess

  function varianceAtAngle(deg: number): number {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rowSums = new Float64Array(sh);
    for (let i = 0; i < darkX.length; i++) {
      const ry = -darkX[i] * sin + darkY[i] * cos;
      const bucket = Math.round(ry + sh / 2);
      if (bucket >= 0 && bucket < sh) rowSums[bucket]++;
    }
    let m = 0;
    for (let i = 0; i < sh; i++) m += rowSums[i];
    m /= sh;
    let variance = 0;
    for (let i = 0; i < sh; i++) {
      const diff = rowSums[i] - m;
      variance += diff * diff;
    }
    return variance / sh;
  }

  let best = 0;
  let bestScore = -1;
  for (let deg = -10; deg <= 10; deg += 1) {
    const s = varianceAtAngle(deg);
    if (s > bestScore) {
      bestScore = s;
      best = deg;
    }
  }
  for (let deg = best - 1; deg <= best + 1; deg += 0.2) {
    const s = varianceAtAngle(deg);
    if (s > bestScore) {
      bestScore = s;
      best = deg;
    }
  }
  return best;
}

// Upscales, rotates, auto-deskews, and contrast-normalizes a receipt photo.
// Returns the original file on failure so Tesseract can still try.
export async function preprocessImage(
  file: File,
  rotation = 0,
): Promise<HTMLCanvasElement | File> {
  try {
    const img = await loadImage(file);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    const TARGET_MIN = 1800;
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

    let { gray, w: gw, h: gh } = canvasToGray(canvas);

    // Fine deskew: a hand-held photo is rarely exactly 0/90/180/270.
    const skew = detectSkewAngle(gray, gw, gh);
    if (Math.abs(skew) > 0.15) {
      const rotated = rotateCanvasByAngle(grayToCanvas(gray, gw, gh), skew);
      const re = canvasToGray(rotated);
      gray = re.gray;
      gw = re.w;
      gh = re.h;
    }

    const normalized = adaptiveLocalContrast(gray, gw, gh);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = gw;
    outCanvas.height = gh;
    const outCtx = outCanvas.getContext("2d")!;
    const outData = outCtx.createImageData(gw, gh);
    for (let j = 0, i = 0; j < gw * gh; j++, i += 4) {
      const v = normalized[j];
      outData.data[i] = outData.data[i + 1] = outData.data[i + 2] = v;
      outData.data[i + 3] = 255;
    }
    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  } catch {
    return file;
  }
}

// Scores a parse: more named+priced items is better, minus a penalty per
// ./parseReceipt consistency warning — picks the pass whose numbers add up.
export function scoreParse(p: ParsedReceipt): number {
  const goodItems = p.items.filter(
    (i) => i.name && i.name !== "ORPHAN_PRICE" && i.total > 0,
  ).length;
  return (
    goodItems * 100 +
    (p.subtotal > 0 ? 15 : 0) +
    (p.tax > 0 ? 5 : 0) +
    (p.total > 0 ? 5 : 0) -
    p.warnings.length * 20
  );
}

export interface RecognizeOpts {
  rotation?: number;
  onProgress?: ProgressFn;
}

// Reads a receipt: preprocess → Tesseract dual-pass (PSM 6 block, PSM 4
// column) → keep whichever parse scores best. Returns a ParsedReceipt.
export async function recognizeReceipt(
  file: File,
  opts: RecognizeOpts = {},
): Promise<ParsedReceipt> {
  const { rotation = 0, onProgress } = opts;
  const report: ProgressFn = onProgress || (() => {});

  // "recognizing text" progress is scaled per pass.
  let ocrBase = 60;
  let ocrSpan = 40;
  let ocrPassText = "Membaca struk...";

  report(2, "Mengunduh OCR engine...");
  await loadTesseract();

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
    await worker.setParameters({
      preserve_interword_spaces: "1",
      // Our upscale is already high (~1800-2600px) — tell Tesseract so its
      // LSTM font-size heuristics don't wrongly assume this is a real 300dpi scan.
      user_defined_dpi: "300",
    });
    report(48, "Meluruskan & menajamkan kontras struk...");
    const processed = await preprocessImage(file, rotation);

    // Pass 1 — PSM 6: a single uniform text block.
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    ocrBase = 60;
    ocrSpan = 20;
    ocrPassText = "Membaca struk (1/2)...";
    report(60, ocrPassText);
    const p1 = parseReceipt((await worker.recognize(processed)).data.text);

    // Pass 2 — PSM 4: a single column of text (variable-size).
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
