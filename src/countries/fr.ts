import { staticDocs } from "../data/repo";
import type { CountryModule } from "./types";

/** French packs carry a CIP13 (GTIN 34009…); older boxes a CIP7. */
export const france: CountryModule = {
  id: "fr",
  flag: "🇫🇷",
  currency: "EUR",
  keysFor(code) {
    if (code.gtin?.startsWith("3400")) return [code.gtin];
    if (code.digits && /^\d{7}$|^\d{13}$/.test(code.digits)) return [code.digits];
    return [];
  },
  owns: (code) => Boolean(code.gtin?.startsWith("3400")),
  docs: (med) => (med.docs === "static" ? staticDocs("fr", med.id) : Promise.resolve(null)),
};
