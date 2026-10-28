/**
 * From a scanned code to a medicine: the countries that own the code first
 * (a CIP13 is French), then the one picked in the app, then the others with an
 * index; within each, every key the code may be.
 */
import type { ParsedCode } from "../../shared/codes/gs1";
import type { CountryId, Medicine } from "../../shared/schema";
import { REGISTRY } from "../countries/registry";
import { codeToId, medicine } from "../data/repo";

export interface Resolved {
  country: CountryId;
  med: Medicine;
  /** The pack key the code matched. */
  key: string;
}

export function countryOrder(
  code: ParsedCode,
  current: CountryId,
  available: CountryId[],
): CountryId[] {
  const owners = available.filter((c) => REGISTRY[c].owns(code));
  const rest = [current, ...available].filter((c) => available.includes(c) && !owners.includes(c));
  return [...new Set([...owners, ...rest])];
}

export async function resolveCode(
  code: ParsedCode,
  current: CountryId,
  available: CountryId[],
): Promise<Resolved | null> {
  const order = countryOrder(code, current, available);
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
