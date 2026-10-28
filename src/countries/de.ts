import { validPzn } from "../../shared/codes/gs1";
import { staticDocs } from "../data/repo";
import type { CountryModule } from "./types";

/**
 * German packs carry a PZN: in the IFA DataMatrix (PPN), as a Code 39 barcode,
 * or inside a GTIN of the IFA's NTIN range (4150 + PZN + check digit).
 */
export const germany: CountryModule = {
  id: "de",
  flag: "🇩🇪",
  currency: "EUR",
  keysFor(code) {
    if (code.pzn) return [code.pzn];
    if (code.gtin?.startsWith("4150")) return [code.gtin.slice(4, 12)];
    const d = code.digits?.length === 7 ? `0${code.digits}` : code.digits;
    return d && validPzn(d) ? [d] : [];
  },
  owns: (code) => Boolean(code.pzn || code.gtin?.startsWith("4150")),
  docs: (med) => (med.docs === "static" ? staticDocs("de", med.id) : Promise.resolve(null)),
};
