import { describe, it, expect } from "vitest";
import { parseReceipt } from "./parseReceipt";
import { billzardRoomReceipt } from "./__fixtures__/receipts/billzard-room";
import { billzardFoodReceipt } from "./__fixtures__/receipts/billzard-food";
import { billzardRoomBadOcr } from "./__fixtures__/receipts/billzard-room-badocr";

describe("struk asli (fixtures) — parser harus baca angka pas", () => {
  for (const fixture of [billzardRoomReceipt, billzardFoodReceipt]) {
    it(fixture.label, () => {
      const r = parseReceipt(fixture.rawText);
      expect(r.items).toHaveLength(fixture.expected.itemCount);
      expect(r.subtotal).toBe(fixture.expected.subtotal);
      expect(r.tax).toBe(fixture.expected.tax);
      expect(r.service).toBe(fixture.expected.service);
      expect(r.discount).toBe(fixture.expected.discount);
      expect(r.total).toBe(fixture.expected.total);
      expect(r.warnings).toEqual([]);
    });
  }

  it("safety net: OCR yang gagal total tetap memicu warning, bukan diam-diam salah", () => {
    const r = parseReceipt(billzardRoomBadOcr.rawText);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("regresi bug keyword-collision (jam & bill)", () => {
  it('"N JAM" di nama menu tidak boleh ke-skip sebagai label waktu', () => {
    const r = parseReceipt("1 NEW PACKAGE VIP 2 JAM 99.000");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].total).toBe(99000);
  });

  it('label waktu asli ("Jam : HH:MM") tetap harus di-skip', () => {
    const r = parseReceipt("Jam : 22:12:5\nMie Goreng 30.000");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Mie Goreng");
  });

  it('nama venue yang mengandung substring "bill" (mis. Billzard) tidak boleh ke-skip', () => {
    const r = parseReceipt("2 Nasi Goreng Billzard 70.000");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Nasi Goreng Billzard");
  });

  it('header nota asli ("Bill No: ...") tetap harus di-skip', () => {
    const r = parseReceipt("Bill No: 12345\nMie Goreng 20.000");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Mie Goreng");
  });
});

describe("regresi keyword-collision generik (word-boundary rule)", () => {
  it('"VegeTABLE" tidak boleh ke-skip gara-gara substring "table"', () => {
    const r = parseReceipt("1 Vegetable Fried Rice 35.000");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Vegetable Fried Rice");
  });

  it('"CASHew" tidak boleh ke-skip gara-gara substring "cash"', () => {
    const r = parseReceipt("1 Cashew Chicken 42.000");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Cashew Chicken");
  });

  it('"OverTIME" tidak boleh ke-skip gara-gara substring "time"', () => {
    const r = parseReceipt("1 Overtime Burger 25.000");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Overtime Burger");
  });

  it('label meja asli ("Nomor Meja : ...") tetap harus di-skip', () => {
    const r = parseReceipt("Nomor Meja : 5\nMie Goreng 20.000");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe("Mie Goreng");
  });
});
