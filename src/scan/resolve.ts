/**
 * From a scanned code to a medicine. A box is looked up in every country with
 * an index, whatever the search scope: the countries that own the code first
 * (a CIP13 is French, a PZN German), then the one picked for searches, then
 * the others; within each, every key the code may be.
 */
import type { ParsedCode } from "../../shared/codes/gs1";
import type { CountryId, Medicine } from "../../shared/schema";
import { REGISTRY, type Scope } from "../countries/registry";
import { codeToId, medicine } from "../data/repo";

export interface Resolved {
  country: CountryId;
  med: Medicine;
  /** The pack key the code matched. */
  key: string;
}

export function countryOrder(code: ParsedCode, scope: Scope, available: CountryId[]): CountryId[] {
  const owners = available.filter((c) => REGISTRY[c].owns(code));
  const preferred = scope === "all" ? [] : [scope];
  const rest = [...preferred, ...available].filter(
    (c) => available.includes(c) && !owners.includes(c),
  );
  return [...new Set([...owners, ...rest])];
}

/** The countries that certainly issued this code, whether or not they have an index. */
export function owners(code: ParsedCode): CountryId[] {
  return (Object.keys(REGISTRY) as CountryId[]).filter((c) => REGISTRY[c].owns(code));
}

export async function resolveCode(
  code: ParsedCode,
  scope: Scope,
  available: CountryId[],
): Promise<Resolved | null> {
  const order = countryOrder(code, scope, available);
  for (const country of order) {
    for (const key of REGISTRY[country].keysFor(code)) {
      const id = await codeToId(country, key);
      if (!id) continue;
      const med = await medicine(country, id);
      if (med) return { country, med, key };
    }
  }
  // A pack newer than the published index: ask the live API of the country that owns the code.
  for (const country of order) {
    const m = REGISTRY[country];
    if (!m.liveLookup || !m.owns(code)) continue;
    const keys = m.keysFor(code);
    const med = await m.liveLookup(keys).catch(() => null);
    if (med) return { country, med, key: keys[0] ?? "" };
  }
  return null;
}
