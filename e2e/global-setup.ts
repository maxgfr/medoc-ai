/**
 * A tiny index built from the parsers' fixtures (real BDPM rows, a real BDPM
 * page, real openFDA records), served to the app in place of public/data so the
 * tests need neither the network nor a full index.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { writeIndex } from "../indexer/write";
import { parseGermany } from "../shared/countries/de/parse";
import { parseExtrait } from "../shared/countries/fr/notice";
import { BDPM_FILES, type BdpmFile, parseBdpm } from "../shared/countries/fr/parse";
import { parseNdc } from "../shared/countries/us/parse";
import { decodeBytes } from "../shared/text";

export const DATA = join(import.meta.dirname, ".data");

export default async function setup() {
  rmSync(DATA, { recursive: true, force: true });
  const fr = join(import.meta.dirname, "../shared/countries/fr/fixtures");
  const files: Partial<Record<BdpmFile, string>> = {};
  for (const f of BDPM_FILES) {
    try {
      files[f] = decodeBytes(readFileSync(join(fr, `${f}.txt`)));
    } catch {}
  }
  const bdpm = parseBdpm(files, "2026-10-28");
  const doli = bdpm.meds.find((m) => m.id === "60234100");
  if (doli) doli.docs = "static";
  // Brevibloc borrows Doliprane's leaflet: two medicines with documents, for the interactions check.
  const brevibloc = bdpm.meds.find((m) => m.id === "63922956");
  if (brevibloc) brevibloc.docs = "static";
  const sections = parseExtrait(readFileSync(join(fr, "extrait-60234100.html"), "utf8"));
  mkdirSync(join(DATA, "fr", "docs"), { recursive: true });
  writeFileSync(
    join(DATA, "fr", "docs", "60234100.json.gz"),
    gzipSync(JSON.stringify({ id: "60234100", fetchedAt: "2025-08-25", sections })),
  );
  writeFileSync(
    join(DATA, "fr", "docs", "63922956.json.gz"),
    gzipSync(JSON.stringify({ id: "63922956", fetchedAt: "2025-08-25", sections })),
  );
  await writeIndex(DATA, "fr", {
    ...bdpm,
    sources: [],
    attribution: "Test BDPM",
    licence: "test",
    search: "static",
    docs: 2,
  });
  const ndc = JSON.parse(
    readFileSync(join(import.meta.dirname, "../shared/countries/us/fixtures/ndc.json"), "utf8"),
  );
  await writeIndex(DATA, "us", {
    ...parseNdc(ndc, "2026-10-28"),
    alerts: [],
    sources: [],
    attribution: "Test openFDA",
    licence: "test",
    search: "live",
    docs: 0,
  });
  const de = join(import.meta.dirname, "../shared/countries/de/fixtures");
  const germany = parseGermany(
    {
      shortages: decodeBytes(readFileSync(join(de, "shortages.csv"))),
      lists: [decodeBytes(readFileSync(join(de, "kinder.csv")))],
      ema: JSON.parse(readFileSync(join(de, "ema.json"), "utf8")),
    },
    "2026-10-28",
  );
  await writeIndex(DATA, "de", {
    meds: germany.meds,
    codes: germany.codes,
    alerts: germany.alerts,
    sources: [],
    attribution: "Test BfArM",
    licence: "test",
    search: "static",
    docs: 0,
  });
  writeFileSync(join(DATA, "countries.json"), JSON.stringify(["fr", "de", "us"]));
}
