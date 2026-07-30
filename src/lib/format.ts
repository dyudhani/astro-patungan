// Number formatting & rounding.

export type RoundMode = "up" | "nearest" | "down";

// Rounding config (mutable object — changed from the result-step UI).
//   to: rounding step (1000/500/100, or 1 = no rounding).
//   mode: "up" round up, "nearest" round to nearest (fairest), "down" round down.
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

/** Wrap a CSV cell in quotes if it contains a comma/quote/newline. */
export const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
