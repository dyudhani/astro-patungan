// Lazy-loads third-party CDN scripts only when actually needed (Tesseract.js
// alone is ~2-5MB), keeping the same SRI hashes as the old static tags.

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

// Retries a couple of times before giving up — this runs on flaky venue
// wifi, so a single transient blip shouldn't force a full page reload.
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
  // A failed load must NOT stay cached, or every future call replays the
  // same stale rejection forever instead of actually retrying the network.
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
