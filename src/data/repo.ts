/**
 * Reads a country's index: the one published with the site (public/data, built
 * by the GitHub Action) or, when someone imported the source files in the
 * browser, the local one in IndexedDB. Every fetch goes through the service
 * worker, which keeps what was read for offline use.
 */
import MiniSearch from "minisearch";
import {
  type Alert,
  type CountryId,
  Docs,
  type Manifest,
  type Medicine,
  type SearchEntry,
  shardOf,
} from "../../shared/schema";
import { localCode, localDataset, localMedicine } from "../db/db";

const BASE = `${import.meta.env.BASE_URL}data`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const memo = new Map<string, Promise<unknown>>();
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    memo.set(key, p);
    p.catch(() => memo.delete(key));
  }
  return p;
}

/** Forgets what was read, so the next read asks again (after an import or a refresh). */
export function forget(country?: CountryId): void {
  for (const k of [...memo.keys()]) if (!country || k.includes(`:${country}`)) memo.delete(k);
}

/** The countries the published site has an index for. */
export function publishedCountries(): Promise<CountryId[]> {
  return once("countries:all", () => getJson<CountryId[]>("countries.json").catch(() => []));
}

export async function manifest(country: CountryId): Promise<Manifest | null> {
  const local = await localDataset(country);
  if (local) return local.manifest;
  return once(`manifest:${country}`, () =>
    getJson<Manifest>(`${country}/manifest.json`).catch(() => null),
  );
}

/** Where a country's index comes from. */
export async function sourceOf(country: CountryId): Promise<"local" | "published" | "none"> {
  if (await localDataset(country)) return "local";
  return (await manifest(country)) ? "published" : "none";
}

/** The medicine id a pack code is, if the index has it. */
export async function codeToId(country: CountryId, code: string): Promise<string | undefined> {
  if (await localDataset(country)) return localCode(country, code);
  const shard = await once(`codes:${country}:${shardOf(code)}`, () =>
    getJson<Record<string, string>>(`${country}/codes/${shardOf(code)}.json`),
  ).catch(() => ({}) as Record<string, string>);
  return shard[code];
}

export async function medicine(country: CountryId, id: string): Promise<Medicine | undefined> {
  if (await localDataset(country)) return localMedicine(country, id);
  const shard = await once(`meds:${country}:${shardOf(id)}`, () =>
    getJson<Record<string, Medicine>>(`${country}/meds/${shardOf(id)}.json`),
  );
  return shard[id];
}

export async function alerts(country: CountryId): Promise<Alert[]> {
  const local = await localDataset(country);
  if (local) return local.alerts;
  return once(`alerts:${country}`, () =>
    getJson<Alert[]>(`${country}/alerts.json`).catch(() => []),
  );
}

export interface Hit {
  id: string;
  name: string;
  substances: string;
  holder?: string;
  form?: string;
  marketed: boolean;
}

const toHit = (e: SearchEntry): Hit => ({
  id: e.i,
  name: e.n,
  substances: e.s,
  ...(e.h ? { holder: e.h } : {}),
  ...(e.f ? { form: e.f } : {}),
  marketed: e.m === 1,
});

/** Accents and case do not matter: "paracetamol" finds "PARACÉTAMOL". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function buildIndex(entries: SearchEntry[]): MiniSearch<SearchEntry> {
  const index = new MiniSearch<SearchEntry>({
    idField: "i",
    fields: ["n", "s", "h"],
    storeFields: ["i", "n", "s", "h", "f", "m"],
    processTerm: (t) => fold(t),
    searchOptions: { boost: { n: 3, s: 2 }, prefix: true, fuzzy: 0.2, combineWith: "AND" },
  });
  index.addAll(entries);
  return index;
}

async function searchIndex(country: CountryId): Promise<MiniSearch<SearchEntry> | null> {
  return once(`search:${country}`, async () => {
    const local = await localDataset(country);
    if (local) return buildIndex(local.search);
    const m = await manifest(country);
    if (m?.search !== "static") return null;
    return buildIndex(await getJson<SearchEntry[]>(`${country}/search.json`));
  });
}

/** Searches the static index; null when the country searches through a live API instead. */
export async function searchStatic(
  country: CountryId,
  query: string,
  limit = 30,
): Promise<Hit[] | null> {
  const index = await searchIndex(country);
  if (!index) return null;
  const results = index.search(query) as unknown as (SearchEntry & { score: number })[];
  // Marketed medicines first at equal relevance.
  return results
    .sort((a, b) => b.m - a.m || b.score - a.score)
    .slice(0, limit)
    .map(toHit);
}

/** Gzip bytes or, if a server already decoded them, the JSON itself. */
async function gunzipJson(res: Response): Promise<unknown> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** A medicine's leaflet and RCP from the published docs/ folder. */
export async function staticDocs(country: CountryId, id: string): Promise<Docs | null> {
  return once(`docs:${country}:${id}`, async () => {
    const res = await fetch(`${BASE}/${country}/docs/${id}.json.gz`);
    if (!res.ok) return null;
    return Docs.parse(await gunzipJson(res));
  });
}
