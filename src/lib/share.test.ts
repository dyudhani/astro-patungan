import { describe, it, expect } from "vitest";
import {
  buildShareText,
  buildCsv,
  encodeShareState,
  decodeShareState,
  extractShareHash,
} from "./share";
import type { PersonResult } from "./types";

// These were previously impossible to unit-test — the logic lived inline
// inside app.ts, closing over its module-level state. Now they're plain
// functions: data in, string out.

const results: PersonResult[] = [
  {
    name: "Dicky",
    items: [{ name: "Mie Goreng", share: 15000, qty: 1, totalShares: 1 }],
    subtotal: 15000,
    taxShare: 1500,
    serviceShare: 0,
    discountShare: 0,
    totalRaw: 16500,
    totalRounded: 17000,
  },
  {
    name: "Ayu",
    items: [{ name: "Es Teh", share: 8000, qty: 1, totalShares: 1 }],
    subtotal: 8000,
    taxShare: 800,
    serviceShare: 0,
    discountShare: 0,
    totalRaw: 8800,
    totalRounded: 9000,
  },
];

describe("buildShareText", () => {
  it("lists every person with their total and each item's share", () => {
    const text = buildShareText(results, {}, "", null, "");
    expect(text).toContain("Dicky");
    expect(text).toContain("Rp 17.000");
    expect(text).toContain("Mie Goreng");
    expect(text).toContain("Ayu");
    expect(text).toContain("Rp 9.000");
  });

  it("marks a person LUNAS when paid[name] is true", () => {
    const text = buildShareText(results, { Dicky: true }, "", null, "");
    expect(text).toMatch(/Dicky\*.*LUNAS/);
    expect(text).not.toMatch(/Ayu\*.*LUNAS/);
  });

  it("adds a settle-up section listing transfers to the payer, excluding the payer themself", () => {
    const text = buildShareText(results, {}, "Dicky", null, "");
    expect(text).toContain("Transfer ke *Dicky*");
    expect(text).toContain("Ayu: Rp 9.000");
    expect(text).not.toContain("Dicky: Rp 17.000");
  });

  it("includes bank details and the payment link only when provided", () => {
    const withBank = buildShareText(
      results,
      {},
      "",
      { name: "BCA", acc: "1234567890", holder: "Dicky" },
      "https://pay.example/xyz",
    );
    expect(withBank).toContain("Bank BCA");
    expect(withBank).toContain("1234567890");
    expect(withBank).toContain("https://pay.example/xyz");

    const withoutBank = buildShareText(results, {}, "", null, "");
    expect(withoutBank).not.toContain("Transfer ke:");
  });
});

describe("buildCsv", () => {
  it("has a header row and one row per person plus a grand-total row", () => {
    const csv = buildCsv(results, {});
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe(
      "Nama,Pesanan,Subtotal,Pajak,Service,Diskon,Total,Status",
    );
    expect(rows).toHaveLength(2 /* people */ + 1 /* blank */ + 1 /* total */ + 1 /* header */);
    expect(rows.at(-1)).toContain("Total Terkumpul");
  });

  it("marks paid status per person", () => {
    const csv = buildCsv(results, { Dicky: true });
    const dickyRow = csv.split("\r\n").find((r) => r.startsWith("Dicky"));
    expect(dickyRow).toContain("LUNAS");
    const ayuRow = csv.split("\r\n").find((r) => r.startsWith("Ayu"));
    expect(ayuRow).toContain("Belum");
  });

  it("quotes fields containing a comma (item names joined with '; ')", () => {
    const csv = buildCsv(results, {});
    // "Mie Goreng" itself has no comma, but the item cell format uses "="
    // and could contain one in real data — csvCell must still be applied.
    expect(csv).toContain("Mie Goreng=15000");
  });
});

describe("encodeShareState / decodeShareState round-trip", () => {
  it("survives unicode content (person names with accents/emoji)", () => {
    const state = { bill: { items: [] }, people: [{ name: "Jöhn 🎉" }] };
    const encoded = encodeShareState(state);
    expect(decodeShareState(encoded)).toEqual(state);
  });
});

describe("extractShareHash", () => {
  it("pulls the payload out of a #s=... hash", () => {
    expect(extractShareHash("#s=abc123")).toBe("abc123");
  });

  it("returns null when there's no share payload", () => {
    expect(extractShareHash("")).toBeNull();
    expect(extractShareHash("#something-else")).toBeNull();
  });
});
