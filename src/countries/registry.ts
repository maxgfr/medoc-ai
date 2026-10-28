/**
 * Every country the app knows. Adding one: a parser in shared/countries/<cc>,
 * an indexer in indexer/countries/<cc>.ts, its id in COUNTRIES
 * (shared/schema.ts), a module here, and its name in the i18n catalogs.
 */
import type { CountryId } from "../../shared/schema";
import { germany } from "./de";
import { france } from "./fr";
import type { CountryModule } from "./types";
import { unitedKingdom } from "./uk";
import { unitedStates } from "./us";

export const REGISTRY: Record<CountryId, CountryModule> = {
  fr: france,
  de: germany,
  us: unitedStates,
  uk: unitedKingdom,
};

export const countryModule = (id: CountryId) => REGISTRY[id];

/** Where searches look: one country, or every country with an index (the default). */
export type Scope = CountryId | "all";

/** The countries a scope covers, among those with an index. */
export const inScope = (scope: Scope, available: CountryId[]): CountryId[] =>
  scope === "all" ? available : available.filter((c) => c === scope);
