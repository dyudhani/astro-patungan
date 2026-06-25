// Format angka & pembulatan.

export type RoundMode = "up" | "nearest" | "down";

// Konfigurasi pembulatan (objek mutable — diubah dari UI langkah hasil).
//   to: kelipatan (1000/500/100, atau 1 = tanpa pembulatan).
//   mode: "up" ke atas, "nearest" ke terdekat (paling adil), "down" ke bawah.
export const roundCfg: { to: number; mode: RoundMode } = {
  to: 1000,
  mode: "nearest",
};

export const fmtIDR = (n: number) =>
  "Rp " + Math.round(n).toLocaleString("id-ID");

export const roundTotal = (n: number) => {
  const to = roundCfg.to;
  if (to <= 1) return Math.round(n);
  if (roundCfg.mode === "nearest") return Math.round(n / to) * to;
  if (roundCfg.mode === "down") return Math.floor(n / to) * to;
  return Math.ceil(n / to) * to;
};

/** Bungkus sel CSV kalau mengandung koma/kutip/baris baru. */
export const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
