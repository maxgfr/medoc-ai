import type { CountryModule } from "./types";

/** UK packs carry a GTIN-13 from the dm+d (UK GS1 prefixes 50…). */
export const unitedKingdom: CountryModule = {
  id: "uk",
  flag: "🇬🇧",
  currency: "GBP",
  keysFor: (code) => (code.gtin ? [code.gtin] : code.digits?.length === 13 ? [code.digits] : []),
  owns: (code) => Boolean(code.gtin?.startsWith("50")),
  docs: () => Promise.resolve(null),
};
