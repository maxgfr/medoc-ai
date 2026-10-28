import {
  labelQuery,
  labelSections,
  type NdcRecord,
  ndcCandidates,
  ndcFromGtin,
  ndcMedicine,
  ndcQuery,
  OPENFDA,
} from "../../shared/countries/us/parse";
import type { Docs } from "../../shared/schema";
import type { Hit } from "../data/repo";
import type { CountryModule } from "./types";

async function openFda<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(url, signal ? { signal } : {});
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`openFDA: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const today = () => new Date().toISOString().slice(0, 10);

/** US packs carry a UPC-A: "3" + the 10-digit NDC + a check digit. */
export const unitedStates: CountryModule = {
  id: "us",
  flag: "🇺🇸",
  currency: "USD",
  keysFor(code) {
    const fromGtin = code.gtin ? ndcFromGtin(code.gtin) : undefined;
    if (fromGtin) return [fromGtin];
    return code.digits ? ndcCandidates(code.digits) : [];
  },
  owns: (code) => Boolean(code.gtin && ndcFromGtin(code.gtin)),
  async docs(med) {
    if (med.docs !== "live" || !med.ref) return null;
    const json = await openFda<{ results?: Record<string, unknown>[] }>(labelQuery(med.ref));
    const label = json?.results?.[0];
    if (!label) return null;
    const effective = typeof label.effective_time === "string" ? label.effective_time : "";
    return {
      id: med.id,
      fetchedAt: effective
        ? `${effective.slice(0, 4)}-${effective.slice(4, 6)}-${effective.slice(6, 8)}`
        : today(),
      sections: labelSections(label),
    } satisfies Docs;
  },
  async liveSearch(query, signal) {
    const q = query.trim().replace(/["\\]/g, "");
    if (!q) return [];
    const words = q.split(/\s+/).map((w) => encodeURIComponent(w.toLowerCase()));
    const all = (field: string) => words.map((w) => `${field}:${w}*`).join("+AND+");
    const search = `(${all("brand_name")})+OR+(${all("generic_name")})`;
    const json = await openFda<{ results?: NdcRecord[] }>(
      `${OPENFDA}/drug/ndc.json?search=${search}&limit=30`,
      signal,
    );
    const hits: Hit[] = [];
    for (const r of json?.results ?? []) {
      const m = ndcMedicine(r, today());
      if (!m) continue;
      hits.push({
        country: "us",
        id: m.id,
        name: m.name,
        substances: m.substances.map((s) => s.name).join(", "),
        ...(m.holder ? { holder: m.holder } : {}),
        ...(m.form ? { form: m.form } : {}),
        marketed: m.marketed,
      });
    }
    return hits;
  },
  async liveLookup(keys) {
    if (!keys.length) return null;
    const json = await openFda<{ results?: NdcRecord[] }>(ndcQuery(keys));
    const r = json?.results?.[0];
    return r ? ndcMedicine(r, today()) : null;
  },
};
