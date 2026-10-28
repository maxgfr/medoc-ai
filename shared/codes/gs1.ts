/**
 * What a medicine box's barcode says. A GS1 DataMatrix carries application
 * identifiers (AI) in any order: (01) the GTIN-14, (17) the expiry YYMMDD, (10)
 * the lot, (21) the serial number. Variable-length fields end with a GS
 * character (ASCII 29), or FNC1 as scanners report it. Linear codes carry only
 * the GTIN (EAN-13, UPC-A). German packs carry an IFA DataMatrix instead
 * (ISO/IEC 15434 format 06: "[)>␞06␝9N11…␝1T lot␝D expiry␝S serial"), whose PPN
 * holds the PZN, and a Code 39 PZN barcode ("-12345678"). People type codes
 * too: "(01)034…(17)…", a CIP13, a US NDC with dashes, a PZN.
 */

export interface ParsedCode {
  /** The raw text, as scanned or typed. */
  raw: string;
  /** GTIN-13 when the code has a GTIN (GTIN-14 with its leading 0 dropped, UPC-A padded). */
  gtin?: string;
  /** Digits that are not a GTIN but may still identify a pack: a CIP7, a typed NDC, a PZN. */
  digits?: string;
  /** German Pharmazentralnummer, from an IFA DataMatrix (PPN) or a PZN barcode. */
  pzn?: string;
  /** ISO date (YYYY-MM-DD). */
  expiry?: string;
  lot?: string;
  serial?: string;
}

const GS = "\u001d";

/** Fixed-length AIs (length of the data, without the AI) we may meet before (10) or (21). */
const FIXED: Record<string, number> = {
  "00": 18,
  "01": 14,
  "02": 14,
  "11": 6,
  "12": 6,
  "13": 6,
  "15": 6,
  "16": 6,
  "17": 6,
  "20": 2,
};

/** Variable-length AIs by prefix length; anything else is read up to the next GS. */
const VARIABLE_2 = new Set(["10", "21", "22", "30", "37", "90", "91", "92", "93", "94", "95"]);
const VARIABLE_3 = new Set(["240", "241", "250", "251", "710", "711", "712", "713", "714", "715"]);

/** The GS1 check digit of the digits before it is right. */
export function validCheckDigit(code: string): boolean {
  if (!/^\d{8,18}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3)
    sum += (digits[i] ?? 0) * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** YYMMDD → YYYY-MM-DD; day 00 means the last day of the month. */
export function expiryDate(yymmdd: string, now = new Date()): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  let dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return undefined;
  // GS1 general specifications, 7.12: the century that puts the year within -49…+50 of today.
  const current = now.getUTCFullYear();
  let year = Math.floor(current / 100) * 100 + yy;
  if (year - current >= 51) year -= 100;
  else if (year - current <= -50) year += 100;
  const last = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  if (dd === 0) dd = last;
  if (dd > last) return undefined;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function gtin13(gtin14: string): string | undefined {
  if (!validCheckDigit(gtin14)) return undefined;
  return gtin14.startsWith("0") ? gtin14.slice(1) : gtin14;
}

/** Reads GS1 element strings, with GS separators or in "(AI)value" form. */
function elements(data: string): Map<string, string> | null {
  const out = new Map<string, string>();
  if (/^\(\d{2,4}\)/.test(data)) {
    for (const m of data.matchAll(/\((\d{2,4})\)([^(]*)/g))
      out.set(m[1] ?? "", (m[2] ?? "").trim());
    return out.size ? out : null;
  }
  let i = 0;
  while (i < data.length) {
    if (data[i] === GS) {
      i++;
      continue;
    }
    const ai2 = data.slice(i, i + 2);
    const ai3 = data.slice(i, i + 3);
    const fixed = FIXED[ai2];
    if (fixed !== undefined) {
      const value = data.slice(i + 2, i + 2 + fixed);
      if (value.length !== fixed) return null;
      out.set(ai2, value);
      i += 2 + fixed;
      continue;
    }
    const ai = VARIABLE_2.has(ai2) ? ai2 : VARIABLE_3.has(ai3) ? ai3 : null;
    if (!ai) return out.size ? out : null;
    const end = data.indexOf(GS, i + ai.length);
    const value = data.slice(i + ai.length, end === -1 ? undefined : end);
    out.set(ai, value);
    i = end === -1 ? data.length : end + 1;
  }
  return out.size ? out : null;
}

/** The PZN check digit: modulo 11 of the first seven digits weighted 1 to 7. */
export function validPzn(pzn: string): boolean {
  if (!/^\d{8}$/.test(pzn)) return false;
  const d = [...pzn].map(Number);
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += (d[i] ?? 0) * (i + 1);
  return sum % 11 === d[7];
}

const RS = "\u001e";

/** ISO/IEC 15434 format 06 with ASC MH10.8.2 data identifiers, as on German packs (IFA). */
function fromIfa(raw: string, now: Date): ParsedCode | null {
  const EOT = "\u0004";
  const data = raw.replace(/<RS>/gi, RS).replace(/<GS>/gi, GS).replace(/<EOT>/gi, EOT);
  const body =
    data
      .replace(/^\[\)>/, "")
      .split(RS)
      .find((x) => x.startsWith("06")) ?? "";
  const out: ParsedCode = { raw };
  for (const part of body.slice(2).split(GS)) {
    const m = /^(9N|8P|1T|D|S)(.*)$/.exec(part.endsWith(EOT) ? part.slice(0, -1) : part);
    if (!m) continue;
    const id = m[1];
    const value = m[2] ?? "";
    if (id === "9N" && /^11\d{10}$/.test(value)) out.pzn = value.slice(2, 10);
    else if (id === "8P" && /^\d{14}$/.test(value)) {
      const g = gtin13(value);
      if (g) out.gtin = g;
    } else if (id === "1T" && value) out.lot = value;
    else if (id === "D") {
      const e = expiryDate(value, now);
      if (e) out.expiry = e;
    } else if (id === "S" && value) out.serial = value;
  }
  return out.pzn || out.gtin ? out : null;
}

/** Everything a scanned or typed code says, or null when it is not a medicine code. */
export function parseCode(input: string, now = new Date()): ParsedCode | null {
  const raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith("[)>")) return fromIfa(raw, now);
  // A PZN barcode (Code 39 "-12345678") or a typed "PZN 1234567".
  const pzn = /^(?:PZN[\s:-]*|-)(\d{7,8})$/i.exec(raw)?.[1]?.padStart(8, "0");
  if (pzn && validPzn(pzn)) return { raw, pzn };
  // Symbology identifiers some scanners put first: ]d2 (GS1 DataMatrix), ]C1 (GS1-128), ]Q3, ]e0.
  let data = raw.replace(/^\][A-Za-z]\d/, "").replace(/<GS>|\\x1d/gi, GS);
  if (data.startsWith(GS)) data = data.slice(1);

  const compact = data.replace(/[\s-]/g, "");
  if (/^\d+$/.test(compact) && !data.includes(GS)) {
    // A linear code or typed digits. A 16+ digit string starting with 01 is a DataMatrix without FNC1s.
    if (compact.length >= 16 && compact.startsWith("01")) return fromElements(raw, data, now);
    if (compact.length === 14 || compact.length === 13 || compact.length === 12) {
      const padded = compact.padStart(14, "0");
      const g = gtin13(padded);
      if (g) return { raw, gtin: g };
    }
    return { raw, digits: compact };
  }
  return fromElements(raw, data, now);
}

function fromElements(raw: string, data: string, now: Date): ParsedCode | null {
  const els = elements(data);
  if (!els) return null;
  const out: ParsedCode = { raw };
  const g = els.get("01");
  if (g) {
    const v = gtin13(g);
    if (v) out.gtin = v;
  }
  const exp = els.get("17");
  if (exp) {
    const d = expiryDate(exp, now);
    if (d) out.expiry = d;
  }
  const lot = els.get("10");
  if (lot) out.lot = lot;
  const serial = els.get("21");
  if (serial) out.serial = serial;
  return out.gtin || out.lot || out.expiry ? out : null;
}
