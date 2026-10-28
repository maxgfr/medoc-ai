/** United States: openFDA's NDC directory (public domain). */
import { join } from "node:path";
import { unzipSync } from "fflate";
import { NDC_DOWNLOAD_INDEX, OPENFDA, parseNdc } from "../../shared/countries/us/parse";
import { download, get, log } from "../io";
import type { CountryIndex } from "../write";
import type { IndexerContext } from "./types";

interface DownloadIndex {
  results: { drug: { ndc: { export_date: string; partitions: { file: string }[] } } };
}

export async function indexUnitedStates(ctx: IndexerContext): Promise<CountryIndex> {
  const index = (await (await get(NDC_DOWNLOAD_INDEX)).json()) as DownloadIndex;
  const { export_date, partitions } = index.results.drug.ndc;
  const results: unknown[] = [];
  for (const [i, p] of partitions.entries()) {
    const zip = await download(p.file, join(ctx.cacheDir, "us", `ndc-${i}.zip`));
    for (const [name, bytes] of Object.entries(unzipSync(zip))) {
      if (!name.endsWith(".json")) continue;
      const json = JSON.parse(new TextDecoder().decode(bytes)) as { results?: unknown[] };
      results.push(...(json.results ?? []));
    }
  }
  const { meds, codes } = parseNdc({ results: results as never });
  if (meds.length < 50_000)
    throw new Error(`us: only ${meds.length} products, the NDC export looks truncated`);
  log(
    `us: ${meds.length} products, ${Object.keys(codes).length} package NDCs (export ${export_date})`,
  );
  return {
    meds,
    codes,
    alerts: [],
    sources: [
      { name: "openFDA — NDC Directory", url: `${OPENFDA}/drug/ndc.json`, updatedAt: export_date },
      { name: "openFDA — Drug labels (live)", url: `${OPENFDA}/drug/label.json` },
      { name: "DailyMed (NLM)", url: "https://dailymed.nlm.nih.gov/" },
    ],
    attribution:
      "Source: openFDA (U.S. Food and Drug Administration). Not endorsed by the FDA. Do not rely on openFDA to make decisions regarding medical care.",
    licence: "Public domain (CC0)",
    search: "live",
    docs: 0,
  };
}
