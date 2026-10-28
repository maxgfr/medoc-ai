/**
 * Writes one country's index to public/data/<cc>/, every record checked
 * against the shared schemas first. Medicines and codes are split into 256
 * shards by `shardOf`, so the app fetches one small file per lookup.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  Alert,
  type CountryId,
  Manifest,
  Medicine,
  SHARDS,
  type Source,
  searchEntry,
  shardOf,
} from "../shared/schema";
import { emptyDir, writeJson } from "./io";

export interface CountryIndex {
  meds: Medicine[];
  codes: Record<string, string>;
  alerts: Alert[];
  sources: Source[];
  attribution: string;
  licence: string;
  search: "static" | "live";
  docs: number;
}

export async function writeIndex(
  outDir: string,
  country: CountryId,
  index: CountryIndex,
): Promise<Manifest> {
  const dir = join(outDir, country);
  const medShards = new Map<string, Record<string, Medicine>>();
  for (const m of index.meds) {
    const med = Medicine.parse(m);
    const key = shardOf(med.id);
    const shard = medShards.get(key) ?? {};
    // One id, one medicine: a duplicate would hide a record and break the app's search index.
    if (shard[med.id]) throw new Error(`${country}: two medicines with the id ${med.id}`);
    shard[med.id] = med;
    medShards.set(key, shard);
  }
  const codeShards = new Map<string, Record<string, string>>();
  for (const [code, id] of Object.entries(index.codes)) {
    const key = shardOf(code);
    const shard = codeShards.get(key) ?? {};
    shard[code] = id;
    codeShards.set(key, shard);
  }
  const alerts = index.alerts.map((a) => Alert.parse(a));

  await emptyDir(join(dir, "meds"));
  await emptyDir(join(dir, "codes"));
  const hash = createHash("sha256");
  for (let i = 0; i < SHARDS; i++) {
    const key = i.toString(16).padStart(2, "0");
    const meds = medShards.get(key) ?? {};
    const codes = codeShards.get(key) ?? {};
    hash.update(JSON.stringify(meds)).update(JSON.stringify(codes));
    await writeJson(join(dir, "meds", `${key}.json`), meds);
    await writeJson(join(dir, "codes", `${key}.json`), codes);
  }
  hash.update(JSON.stringify(alerts));
  await writeJson(join(dir, "alerts.json"), alerts);
  if (index.search === "static") {
    const entries = index.meds.map(searchEntry);
    hash.update(JSON.stringify(entries));
    await writeJson(join(dir, "search.json"), entries);
  }

  const manifest = Manifest.parse({
    country,
    version: hash.digest("hex").slice(0, 12),
    generatedAt: new Date().toISOString(),
    sources: index.sources,
    counts: {
      medicines: index.meds.length,
      packs: Object.keys(index.codes).length,
      alerts: alerts.length,
      docs: index.docs,
    },
    search: index.search,
    attribution: index.attribution,
    licence: index.licence,
  });
  await writeJson(join(dir, "manifest.json"), manifest);
  return manifest;
}
