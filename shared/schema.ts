/**
 * The normalized shape every country's index is written in. The indexer (Bun,
 * in the GitHub Action) checks its output against these schemas before
 * writing; the app reads the same types.
 */
import { z } from "zod";

export const COUNTRIES = ["fr", "de", "us", "uk"] as const;
export const CountryId = z.enum(COUNTRIES);
export type CountryId = z.infer<typeof CountryId>;

export const Substance = z.object({
  name: z.string(),
  strength: z.string().optional(),
  /** What the strength is expressed per ("un comprimé", "1 mL"). */
  per: z.string().optional(),
});
export type Substance = z.infer<typeof Substance>;

export const Pack = z.object({
  /** The key the pack's barcode resolves to: CIP13 (FR), PZN (DE), dashless NDC-10 (US), GTIN-13 (UK). */
  code: z.string(),
  /** Other codes printed on older boxes (CIP7). */
  altCodes: z.array(z.string()).optional(),
  label: z.string(),
  marketed: z.boolean(),
  /** Public price in the country's currency. */
  price: z.number().optional(),
  /** Reimbursement rate, as published ("65%"). */
  reimbursement: z.string().optional(),
});
export type Pack = z.infer<typeof Pack>;

export const LinkKind = z.enum([
  "notice",
  "rcp",
  "sheet",
  "has",
  "ansm",
  "epar",
  "dailymed",
  "mhra",
  "emc",
  /** A search by pack code on a reference site (Gelbe Liste for a PZN). */
  "lookup",
  /** The authority's shortage database (BfArM). */
  "shortages",
]);
export type LinkKind = z.infer<typeof LinkKind>;

export const Link = z.object({ kind: LinkKind, url: z.string(), label: z.string().optional() });
export type Link = z.infer<typeof Link>;

export const Assessment = z.object({
  level: z.string(),
  date: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
});

export const Medicine = z.object({
  id: z.string(),
  country: CountryId,
  name: z.string(),
  form: z.string().optional(),
  routes: z.array(z.string()),
  holder: z.string().optional(),
  /** Authorisation status, as published. */
  status: z.string().optional(),
  marketed: z.boolean(),
  /** false when the source does not say whether it is marketed (`marketed` is then a guess). */
  marketKnown: z.boolean().optional(),
  authorisedAt: z.string().optional(),
  substances: z.array(Substance),
  packs: z.array(Pack),
  atc: z.string().optional(),
  /** Generic group (FR): its label and whether this one is the princeps. */
  generic: z.object({ group: z.string(), role: z.string() }).optional(),
  prescription: z.array(z.string()),
  smr: Assessment.optional(),
  asmr: Assessment.optional(),
  enhancedMonitoring: z.boolean().optional(),
  /** Médicament d'intérêt thérapeutique majeur (FR). */
  major: z.boolean().optional(),
  /** Over the counter (US) or prescription only. */
  otc: z.boolean().optional(),
  links: z.array(Link),
  /** Where the leaflet text comes from: the published docs/ file, a live API, or nowhere. */
  docs: z.enum(["static", "live", "none"]),
  /** A source id the docs are fetched with (US: the SPL set id). */
  ref: z.string().optional(),
});
export type Medicine = z.infer<typeof Medicine>;

/** One row of the search index: short keys, as there are tens of thousands. */
export const SearchEntry = z.object({
  i: z.string(),
  n: z.string(),
  /** Active substances, joined. */
  s: z.string(),
  /** Holder or labeler. */
  h: z.string().optional(),
  f: z.string().optional(),
  /** 1 when marketed. */
  m: z.union([z.literal(0), z.literal(1)]),
});
export type SearchEntry = z.infer<typeof SearchEntry>;

export const DocKind = z.enum(["notice", "rcp"]);
export type DocKind = z.infer<typeof DocKind>;

export const DocSection = z.object({
  /** Stable within a document: "rcp-4.5", "notice-2". */
  id: z.string(),
  doc: DocKind,
  title: z.string(),
  level: z.number().int().min(1).max(3),
  text: z.string(),
});
export type DocSection = z.infer<typeof DocSection>;

export const Docs = z.object({
  id: z.string(),
  /** When the text was read from the source. */
  fetchedAt: z.string(),
  /** When the authority last updated the text, when it says so (yyyy-mm-dd). */
  updatedAt: z.string().optional(),
  sections: z.array(DocSection),
});
export type Docs = z.infer<typeof Docs>;

export const AlertKind = z.enum(["shortage", "tension", "stopped", "restored", "safety"]);
export type AlertKind = z.infer<typeof AlertKind>;

export const Alert = z.object({
  id: z.string(),
  /** Every medicine the alert is about: one ANSM notice often covers a whole substance. */
  medIds: z.array(z.string()),
  kind: AlertKind,
  title: z.string(),
  start: z.string().optional(),
  end: z.string().optional(),
  url: z.string().optional(),
});
export type Alert = z.infer<typeof Alert>;

export const Source = z.object({
  name: z.string(),
  url: z.string(),
  updatedAt: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

export const SHARDS = 256;

export const Manifest = z.object({
  country: CountryId,
  /** Changes whenever any file changes: the app appends it to every data URL. */
  version: z.string(),
  generatedAt: z.string(),
  sources: z.array(Source),
  counts: z.object({
    medicines: z.number(),
    packs: z.number(),
    alerts: z.number(),
    docs: z.number(),
  }),
  /** "live": names are searched through the source's API (too many to ship an index). */
  search: z.enum(["static", "live"]),
  attribution: z.string(),
  licence: z.string(),
  /** Set when this build kept a previous index because a source failed. */
  stale: z.string().optional(),
});
export type Manifest = z.infer<typeof Manifest>;

/** The shard a medicine's record is written to: FNV-1a of its id, two hex digits. */
export function shardOf(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % SHARDS).toString(16).padStart(2, "0");
}

/** What a medicine contributes to the search index. */
export function searchEntry(m: Medicine): SearchEntry {
  return {
    i: m.id,
    n: m.name,
    s: [...new Set(m.substances.map((s) => s.name))].join(", "),
    ...(m.holder ? { h: m.holder } : {}),
    ...(m.form ? { f: m.form } : {}),
    m: m.marketed ? 1 : 0,
  };
}
