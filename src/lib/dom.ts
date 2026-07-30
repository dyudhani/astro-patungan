// Lightweight DOM helpers used throughout the app.

/** Get an element by id with a castable type. */
export const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

/** Escape text so it's safe to insert into innerHTML. */
export const escapeHtml = (s: string) =>
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

/** Trigger a browser download for a given href (data: URL or blob: URL). */
export function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

/** Download a Blob as a file, revoking the temporary object URL afterward. */
export function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  triggerDownload(href, filename);
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
