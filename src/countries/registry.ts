/**
 * Every country the app knows. Adding one: a parser in shared/countries/<cc>,
 * an indexer in indexer/countries/<cc>.ts, its id in COUNTRIES
 * (shared/schema.ts), a module here, and its name in the i18n catalogs.
 */
import type { CountryId } from "../../shared/schema";
import { france } from "./fr";
import type { CountryModule } from "./types";
import { unitedKingdom } from "./uk";
import { unitedStates } from "./us";

export const REGISTRY: Record<CountryId, CountryModule> = {
  fr: france,
  us: unitedStates,
  uk: unitedKingdom,
};

export const countryModule = (id: CountryId) => REGISTRY[id];

/** The country a device probably is in, from its languages. */
export function guessCountry(languages: readonly string[], available: CountryId[]): CountryId {
  for (const tag of languages) {
    const region = tag.split("-")[1]?.toLowerCase();
    const id = region === "gb" ? "uk" : region;
    if (id && available.includes(id as CountryId)) return id as CountryId;
    if (tag.toLowerCase().startsWith("fr") && available.includes("fr")) return "fr";
  }
  return available[0] ?? "fr";
}
