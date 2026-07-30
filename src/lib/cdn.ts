// Lazy-load third-party CDN scripts only when actually needed, instead of
// blocking every page load with a multi-MB download (Tesseract.js alone is
// ~2-5MB) that visitors who never touch OCR — e.g. "bagi rata total saja" —
// pay for regardless. SRI hashes are kept on the dynamically created tags
// too, matching what used to be on the static <script> tags in Layout.astro.

interface ScriptSpec {
  src: string;
  integrity: string;
}

const loading = new Map<string, Promise<void>>();

function loadScriptOnce(src: string, integrity: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.integrity = integrity;
    el.crossOrigin = "anonymous";
    el.onload = () => resolve();
    el.onerror = () => {
      el.remove();
      reject(new Error(`Gagal memuat ${src}`));
    };
    document.head.appendChild(el);
  });
}

const RETRY_DELAYS_MS = [500, 1500];

// Retries a couple of times before giving up — the load only happens the
// moment a user taps scan/export, often on flaky venue wifi, so a single
// transient blip shouldn't need a full page reload to recover from.
async function loadScriptWithRetry(spec: ScriptSpec): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await loadScriptOnce(spec.src, spec.integrity);
      return;
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

function loadScript(spec: ScriptSpec): Promise<void> {
  const existing = loading.get(spec.src);
  if (existing) return existing;

  const promise = loadScriptWithRetry(spec);
  loading.set(spec.src, promise);
  // A failed load (even after retries) must NOT stay cached — otherwise
  // every future attempt (e.g. clicking "Scan ulang" again) instantly
  // replays the same stale rejection forever, without ever touching the
  // network again, instead of actually retrying.
  promise.catch(() => loading.delete(spec.src));
  return promise;
}

export function loadTesseract(): Promise<void> {
  return loadScript({
    src: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
    integrity:
      "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F",
  });
}

export function loadHtmlToImage(): Promise<void> {
  return loadScript({
    src: "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js",
    integrity:
      "sha384-UbfRVKN3/elS1r7JcK2FhmPP+KlJ4CvYwbyYD7tH+uTkbT9bNJr9eJeQ0FoFbAgz",
  });
}
