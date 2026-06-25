// Helper DOM ringan yang dipakai di banyak tempat.

/** Ambil elemen by id dengan tipe yang bisa ditentukan. */
export const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

/** Escape teks supaya aman dimasukkan ke innerHTML. */
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
