import type { ParsedCode } from "../../shared/codes/gs1";
import type { CountryId, Docs, Medicine } from "../../shared/schema";
import type { Hit } from "../data/repo";

/** What the app needs to know about a country to scan, search and show its medicines. */
export interface CountryModule {
  id: CountryId;
  flag: string;
  currency: string;
  /** The keys of its codes/ index a scanned code may be. */
  keysFor(code: ParsedCode): string[];
  /** The code certainly belongs to this country (a CIP13, a UPC-A of a US drug). */
  owns(code: ParsedCode): boolean;
  /** Leaflet text, when the country has it. */
  docs(med: Medicine): Promise<Docs | null>;
  /** Name search through the source's API, for a country that ships no search index. */
  liveSearch?(query: string, signal?: AbortSignal): Promise<Hit[]>;
  /** A pack the published index does not have yet (newer than the build). */
  liveLookup?(keys: string[]): Promise<Medicine | null>;
}
