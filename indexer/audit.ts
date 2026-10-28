/**
 * bun run audit [--out public/data]
 *
 * Checks every published file of every country before the site is deployed:
 * each record against its schema and in the shard it belongs to, ids unique,
 * every pack code pointing to an existing medicine and back, alerts about
 * known medicines, the search index matching the medicines, every leaflet file
 * readable and non-empty, counts matching the manifest, and a few codes that
 * must always resolve (canaries). Errors fail the run, so the previous site
 * stays online; warnings are reported.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  Alert,
  COUNTRIES,
  type CountryId,
  Docs,
  Manifest,
  Medicine,
  SearchEntry,
  SHARDS,
  shardOf,
} from "../shared/schema";

/** Codes that must resolve to these medicines in every build (long-marketed packs). */
export const CANARIES: Partial<Record<CountryId, [code: string, id: string, what: string][]>> = {
  fr: [
    ["3400935955838", "60234100", "DOLIPRANE 1000 mg, comprimé (8)"],
    ["3595583", "60234100", "DOLIPRANE 1000 mg, comprimé (CIP7)"],
  ],
};

/** Smallest index each country may have; a smaller one means a source went wrong. */
export const MINIMUM: Record<CountryId, number> = { fr: 10_000, de: 1_000, us: 50_000, uk: 1_000 };

export interface CountryReport {
  country: CountryId;
  errors: string[];
  warnings: string[];
  stats: Record<string, number | string>;
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

/** Keeps a list of problems short: the first few, then how many more. */
function collector() {
  const lines: string[] = [];
  const counts = new Map<string, number>();
  return {
    add(kind: string, detail: string) {
      const n = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, n);
      if (n <= 3) lines.push(`${kind}: ${detail}`);
    },
    lines: () => [
      ...lines,
      ...[...counts.entries()].filter(([, n]) => n > 3).map(([k, n]) => `${k}: ${n - 3} more`),
    ],
  };
}

export async function auditCountry(
  outDir: string,
  country: CountryId,
  { now = Date.now(), minimum = MINIMUM[country] }: { now?: number; minimum?: number } = {},
): Promise<CountryReport> {
  const dir = join(outDir, country);
  const errors = collector();
  const warnings = collector();
  const stats: Record<string, number | string> = {};

  const parsed = Manifest.safeParse(await json(join(dir, "manifest.json")).catch(() => null));
  if (!parsed.success) {
    return { country, errors: ["manifest.json is missing or invalid"], warnings: [], stats };
  }
  const manifest = parsed.data;
  if (manifest.country !== country) errors.add("manifest", `says ${manifest.country}`);
  const ageHours = (now - Date.parse(manifest.generatedAt)) / 3_600_000;
  stats.builtHoursAgo = Math.round(ageHours * 10) / 10;
  if (manifest.stale) warnings.add("stale", manifest.stale);
  else if (ageHours > 48) warnings.add("age", `built ${Math.round(ageHours)} hours ago`);

  // Medicines: valid, in their shard, unique.
  const meds = new Map<string, Medicine>();
  for (let i = 0; i < SHARDS; i++) {
    const key = i.toString(16).padStart(2, "0");
    const shard = (await json(join(dir, "meds", `${key}.json`)).catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!shard) {
      errors.add("meds shard", `${key}.json missing or unreadable`);
      continue;
    }
    for (const [id, raw] of Object.entries(shard)) {
      const m = Medicine.safeParse(raw);
      if (!m.success) {
        errors.add("medicine", `${id}: ${m.error.issues[0]?.message ?? "invalid"}`);
        continue;
      }
      if (m.data.id !== id) errors.add("medicine", `${id} keyed under another id`);
      if (shardOf(id) !== key) errors.add("medicine", `${id} in shard ${key}`);
      if (m.data.country !== country) errors.add("medicine", `${id} is from ${m.data.country}`);
      if (meds.has(id)) errors.add("duplicate", id);
      meds.set(id, m.data);
    }
  }
  stats.medicines = meds.size;
  if (meds.size !== manifest.counts.medicines)
    errors.add("count", `${meds.size} medicines, manifest says ${manifest.counts.medicines}`);
  if (meds.size < minimum) errors.add("count", `only ${meds.size} medicines (minimum ${minimum})`);

  // Pack codes: in their shard, pointing to a medicine that has that pack, and every pack listed.
  const codes = new Map<string, string>();
  for (let i = 0; i < SHARDS; i++) {
    const key = i.toString(16).padStart(2, "0");
    const shard = (await json(join(dir, "codes", `${key}.json`)).catch(() => null)) as Record<
      string,
      string
    > | null;
    if (!shard) {
      errors.add("codes shard", `${key}.json missing or unreadable`);
      continue;
    }
    for (const [code, id] of Object.entries(shard)) {
      if (shardOf(code) !== key) errors.add("code", `${code} in shard ${key}`);
      const med = meds.get(id);
      if (!med) errors.add("code", `${code} → ${id}, which is not in the index`);
      else if (!med.packs.some((p) => p.code === code || p.altCodes?.includes(code)))
        errors.add("code", `${code} → ${id}, which has no such pack`);
      codes.set(code, id);
    }
  }
  stats.codes = codes.size;
  if (codes.size !== manifest.counts.packs)
    errors.add("count", `${codes.size} codes, manifest says ${manifest.counts.packs}`);
  for (const m of meds.values())
    for (const p of m.packs)
      if (codes.get(p.code) !== m.id)
        errors.add("pack", `${m.id}'s pack ${p.code} does not resolve to it`);

  for (const [code, id, what] of CANARIES[country] ?? []) {
    if (codes.get(code) !== id)
      errors.add("canary", `${code} (${what}) resolves to ${codes.get(code) ?? "nothing"}`);
  }

  // Alerts about medicines of the index.
  const alerts = (await json(join(dir, "alerts.json")).catch(() => null)) as unknown[] | null;
  if (!alerts) errors.add("alerts", "alerts.json missing or unreadable");
  let unknownTargets = 0;
  for (const raw of alerts ?? []) {
    const a = Alert.safeParse(raw);
    if (!a.success) {
      errors.add("alert", a.error.issues[0]?.message ?? "invalid");
      continue;
    }
    if (!a.data.medIds.length) errors.add("alert", `${a.data.id} is about no medicine`);
    for (const id of a.data.medIds) if (!meds.has(id)) unknownTargets++;
  }
  stats.alerts = alerts?.length ?? 0;
  // A shortage notice can outlive a withdrawn specialty, but not by much.
  if (unknownTargets)
    warnings.add("alerts", `${unknownTargets} alert targets are not in the index`);

  // The search index lists every medicine once.
  if (manifest.search === "static") {
    const entries = (await json(join(dir, "search.json")).catch(() => null)) as unknown[] | null;
    if (!entries) errors.add("search", "search.json missing or unreadable");
    else {
      const seen = new Set<string>();
      for (const raw of entries) {
        const e = SearchEntry.safeParse(raw);
        if (!e.success) {
          errors.add("search", e.error.issues[0]?.message ?? "invalid entry");
          continue;
        }
        if (seen.has(e.data.i)) errors.add("search", `${e.data.i} listed twice`);
        if (!meds.has(e.data.i)) errors.add("search", `${e.data.i} is not in the index`);
        seen.add(e.data.i);
      }
      if (seen.size !== meds.size)
        errors.add("search", `${seen.size} entries for ${meds.size} medicines`);
    }
  }

  // Leaflets: every medicine that says it has one, readable, about it, with text.
  const files = new Set(
    (await readdir(join(dir, "docs")).catch(() => [] as string[])).map((f) =>
      f.replace(/\.json\.gz$/, ""),
    ),
  );
  let docs = 0;
  let withLeaflet = 0;
  for (const m of meds.values()) {
    if (m.docs !== "static") continue;
    docs++;
    if (!files.has(m.id)) {
      errors.add("docs", `${m.id} has no docs file`);
      continue;
    }
    try {
      const d = Docs.parse(
        JSON.parse(
          gunzipSync(await readFile(join(dir, "docs", `${m.id}.json.gz`))).toString("utf8"),
        ),
      );
      if (d.id !== m.id) errors.add("docs", `${m.id}'s file is about ${d.id}`);
      if (!d.sections.some((s) => s.text.trim().length > 20))
        errors.add("docs", `${m.id}'s leaflet has no text`);
      if (d.sections.some((s) => s.doc === "notice" && s.text.length > 200)) withLeaflet++;
    } catch (err) {
      errors.add("docs", `${m.id}: ${err instanceof Error ? err.message : "unreadable"}`);
    }
  }
  for (const f of files)
    if (!meds.has(f)) warnings.add("docs", `${f} has a file but is not in the index`);
  stats.docs = docs;
  if (docs !== manifest.counts.docs)
    errors.add("count", `${docs} leaflets, manifest says ${manifest.counts.docs}`);
  if (country === "fr" && docs) {
    stats.withLeaflet = withLeaflet;
    // The page layout changing would leave RCPs without their patient leaflet: catch it.
    if (withLeaflet / docs < 0.8)
      errors.add("docs", `only ${withLeaflet} of ${docs} have a patient leaflet text`);
    stats.leafletCoverage = `${Math.round((docs / meds.size) * 100)}%`;
  }

  return { country, errors: errors.lines(), warnings: warnings.lines(), stats };
}

export function reportMarkdown(reports: CountryReport[]): string {
  const lines = ["## Data audit", ""];
  for (const r of reports) {
    const verdict = r.errors.length ? "❌" : r.warnings.length ? "⚠️" : "✅";
    lines.push(`### ${verdict} ${r.country}`, "");
    lines.push(
      Object.entries(r.stats)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · "),
      "",
    );
    for (const e of r.errors) lines.push(`- ❌ ${e}`);
    for (const w of r.warnings) lines.push(`- ⚠️ ${w}`);
    lines.push("");
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const { parseArgs } = await import("node:util");
  const { appendFile } = await import("node:fs/promises");
  const { values } = parseArgs({ options: { out: { type: "string", default: "public/data" } } });
  const out = values.out ?? "public/data";
  const listed = ((await json(join(out, "countries.json")).catch(() => [])) as string[]).filter(
    (c): c is CountryId => (COUNTRIES as readonly string[]).includes(c),
  );
  const reports = await Promise.all(listed.map((c) => auditCountry(out, c)));
  const md = reportMarkdown(reports);
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  for (const r of reports)
    for (const e of r.errors) console.log(`::error title=${r.country} data audit::${e}`);
  if (!listed.length) {
    console.log("::error::No country has an index.");
    process.exit(1);
  }
  process.exit(reports.some((r) => r.errors.length) ? 1 : 0);
}
