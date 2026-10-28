import { describe, expect, test } from "bun:test";
import { expiryDate, parseCode, validCheckDigit, validPzn } from "./gs1";

const GS = "\u001d";
const NOW = new Date("2026-10-28T00:00:00Z");

describe("check digit", () => {
  test("real CIP13 and UPC-A codes pass, a changed digit fails", () => {
    expect(validCheckDigit("3400949497294")).toBe(true);
    expect(validCheckDigit("03400949497294")).toBe(true);
    expect(validCheckDigit("371309001051")).toBe(true);
    expect(validCheckDigit("3400949497295")).toBe(false);
  });
});

describe("expiry", () => {
  test("day 00 is the last day of the month", () => {
    expect(expiryDate("280200", NOW)).toBe("2028-02-29");
    expect(expiryDate("270400", NOW)).toBe("2027-04-30");
  });
  test("century within -49…+50 years of today", () => {
    expect(expiryDate("990101", NOW)).toBe("1999-01-01");
    expect(expiryDate("300615", NOW)).toBe("2030-06-15");
  });
  test("an impossible date is dropped", () => {
    expect(expiryDate("271332", NOW)).toBeUndefined();
    expect(expiryDate("270231", NOW)).toBeUndefined();
  });
});

describe("parseCode", () => {
  test("a French DataMatrix with GS separators, AIs in any order", () => {
    const code = parseCode(`]d201034009494972941727043010LOT-42${GS}21ABC123`, NOW);
    expect(code).toEqual({
      raw: `]d201034009494972941727043010LOT-42${GS}21ABC123`,
      gtin: "3400949497294",
      expiry: "2027-04-30",
      lot: "LOT-42",
      serial: "ABC123",
    });
    const reordered = parseCode(`21SN9${GS}10L1${GS}172704300103400949497294`, NOW);
    expect(reordered).toMatchObject({ gtin: "3400949497294", expiry: "2027-04-30", lot: "L1" });
    const ordered = parseCode(`010340094949729417270430${GS}21SN9${GS}10L1`, NOW);
    expect(ordered).toMatchObject({ gtin: "3400949497294", serial: "SN9", lot: "L1" });
  });

  test("the human-readable form people type", () => {
    expect(parseCode("(01)03400949497294(17)270400(10)JX001", NOW)).toMatchObject({
      gtin: "3400949497294",
      expiry: "2027-04-30",
      lot: "JX001",
    });
  });

  test("linear codes: EAN-13 CIP13, UPC-A, GTIN-14", () => {
    expect(parseCode("3400949497294")?.gtin).toBe("3400949497294");
    expect(parseCode("371309001051")?.gtin).toBe("0371309001051");
    expect(parseCode("03400949497294")?.gtin).toBe("3400949497294");
  });

  test("digits that are not a GTIN are kept for the country to read", () => {
    expect(parseCode("4949729")).toEqual({ raw: "4949729", digits: "4949729" });
    expect(parseCode("71309-001-05")).toEqual({ raw: "71309-001-05", digits: "7130900105" });
  });

  test("text that is no code", () => {
    expect(parseCode("")).toBeNull();
    expect(parseCode("hello")).toBeNull();
  });
});

describe("German codes", () => {
  test("PZN check digit (real PZNs from the BfArM lists)", () => {
    expect(validPzn("00240365")).toBe(true);
    expect(validPzn("00658834")).toBe(true);
    expect(validPzn("00240366")).toBe(false);
  });

  test("an IFA DataMatrix: the PZN from its PPN, lot, expiry and serial", () => {
    const raw = `[)>\u001e06${GS}9N110024036552${GS}1TCH4711${GS}D270400${GS}S12345ABC\u001e\u0004`;
    expect(parseCode(raw, NOW)).toEqual({
      raw,
      pzn: "00240365",
      lot: "CH4711",
      expiry: "2027-04-30",
      serial: "12345ABC",
    });
  });

  test("a Code 39 PZN barcode and a typed PZN", () => {
    expect(parseCode("-00240365")).toEqual({ raw: "-00240365", pzn: "00240365" });
    expect(parseCode("PZN 00240365")?.pzn).toBe("00240365");
    expect(parseCode("00240365")).toEqual({ raw: "00240365", digits: "00240365" });
  });
});
