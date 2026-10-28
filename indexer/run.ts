/**
 * bun run index [--country fr|us|uk|all] [--out public/data] [--cache .cache]
 *               [--docs-limit 3000] [--docs-minutes 40] [--no-docs]
 *
 * Builds each country's index. A country whose source fails keeps the index
 * already in --out (restored from the Action's cache), marked stale in its
 * manifest; with no previous index, the run fails, unless the country was
 * skipped on purpose (UK without a TRUD key).
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import { COUNTRIES, type CountryId, Manifest } from "../shared/schema";
import { indexFrance } from "./countries/fr";
import type { IndexerContext } from "./countries/types";
import { indexUnitedKingdom, Skipped } from "./countries/uk";
import { indexUnitedStates } from "./countries/us";
import { log, readJson, writeJson } from "./io";
import { type CountryIndex, writeIndex } from "./write";

const INDEXERS: Record<CountryId, (ctx: IndexerContext) => Promise<CountryIndex>> = {
  fr: indexFrance,
  us: indexUnitedStates,
  uk: indexUnitedKingdom,
};

const { values } = parseArgs({
  options: {
    country: { type: "string", default: "all" },
    out: { type: "string", default: "public/data" },
    cache: { type: "string", default: ".cache" },
    "docs-limit": { type: "string", default: "3000" },
    "docs-minutes": { type: "string", default: "40" },
    "no-docs": { type: "boolean", default: false },
  },
});

const wanted = values.country === "all" ? [...COUNTRIES] : (values.country ?? "").split(",");
const countries = wanted.filter((c): c is CountryId =>
  (COUNTRIES as readonly string[]).includes(c),
);
if (!countries.length) {
  console.error(`Unknown country: ${values.country}. Use ${COUNTRIES.join(", ")} or all.`);
  process.exit(2);
}

const ctx: IndexerContext = {
  outDir: values.out ?? "public/data",
  cacheDir: values.cache ?? ".cache",
  env: process.env,
  ...(values["no-docs"]
    ? {}
    : { docs: { limit: Number(values["docs-limit"]), minutes: Number(values["docs-minutes"]) } }),
};

let failed = false;
for (const country of countries) {
  const started = Date.now();
  try {
    const index = await INDEXERS[country](ctx);
    const m = await writeIndex(ctx.outDir, country, index);
    log(
      `${country}: written, version ${m.version}, ${((Date.now() - started) / 1000).toFixed(0)} s`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Skipped) {
      log(message);
      continue;
    }
    const path = join(ctx.outDir, country, "manifest.json");
    const previous = await readJson<unknown>(path);
    const parsed = Manifest.safeParse(previous);
    if (parsed.success) {
      log(`${country}: FAILED (${message}); keeping the index of ${parsed.data.generatedAt}`);
      await writeJson(path, { ...parsed.data, stale: message.slice(0, 300) });
    } else {
      log(`${country}: FAILED (${message}) and there is no previous index`);
      failed = true;
    }
  }
}

// The list of countries the app can offer, with or without an index.
const available: CountryId[] = [];
for (const c of COUNTRIES)
  if (await readJson(join(ctx.outDir, c, "manifest.json"))) available.push(c);
await writeJson(join(ctx.outDir, "countries.json"), available);
log(`countries with an index: ${available.join(", ") || "none"}`);
process.exit(failed ? 1 : 0);
