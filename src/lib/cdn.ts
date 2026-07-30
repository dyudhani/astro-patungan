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

function loadScript({ src, integrity }: ScriptSpec): Promise<void> {
  const existing = loading.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.integrity = integrity;
    el.crossOrigin = "anonymous";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Gagal memuat ${src}`));
    document.head.appendChild(el);
  });
  loading.set(src, promise);
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
