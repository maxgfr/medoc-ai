/** Germany: BfArM's shortages and PZN lists, EMA's centrally authorised medicines. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  LISTS_PAGE,
  listUrls,
  parseGermany,
  SHORTAGES_CSV,
  SHORTAGES_PAGE,
} from "../../shared/countries/de/parse";
import { Docs } from "../../shared/schema";
import { decodeBytes, decodeEntities } from "../../shared/text";
import { download, emptyDir, get, log } from "../io";
import type { CountryIndex } from "../write";
import { EMA_URL, loadEma } from "./ema";
import type { IndexerContext } from "./types";

export async function indexGermany(ctx: IndexerContext): Promise<CountryIndex> {
  const shortages = decodeBytes(
    await download(SHORTAGES_CSV, join(ctx.cacheDir, "de", "shortages.csv")),
  );
  const page = await (await get(LISTS_PAGE)).text();
  const urls = listUrls(page);
  if (!urls.length) throw new Error("de: no PZN list linked from the BfArM page");
  const lists: string[] = [];
  for (const [i, url] of urls.entries()) {
    lists.push(decodeBytes(await download(url, join(ctx.cacheDir, "de", `list-${i}.csv`))));
  }
  const ema = await loadEma(ctx.cacheDir);
  const out = parseGermany({ shortages, lists, ema });
  const withPzn = Object.keys(out.codes).length;
  if (withPzn < 500) throw new Error(`de: only ${withPzn} PZNs, a BfArM file looks truncated`);

  // The therapeutic indication of EMA products is the one text they have in the app.
  const docsDir = join(ctx.outDir, "de", "docs");
  await emptyDir(docsDir);
  await mkdir(docsDir, { recursive: true });
  const at = new Date().toISOString();
  for (const [id, text] of Object.entries(out.indications)) {
    const docs = Docs.parse({
      id,
      fetchedAt: at,
      sections: [
        {
          id: "ema-indication",
          doc: "rcp",
          title: "Therapeutic indication (EMA, English)",
          level: 1,
          text: decodeEntities(text),
        },
      ],
    });
    await writeFile(join(docsDir, `${id}.json.gz`), Bun.gzipSync(JSON.stringify(docs)));
  }
  log(
    `de: ${out.meds.length} medicines, ${withPzn} PZNs, ${out.alerts.length} shortages, ${urls.length} BfArM lists`,
  );
  const today = at.slice(0, 10);
  return {
    meds: out.meds,
    codes: out.codes,
    alerts: out.alerts,
    sources: [
      { name: "BfArM — Lieferengpassmeldungen", url: SHORTAGES_PAGE, updatedAt: today },
      {
        name: "BfArM — Arzneimittellisten (§ 35 Abs. 5a, § 129 Abs. 2b SGB V)",
        url: LISTS_PAGE,
        updatedAt: today,
      },
      {
        name: "European Medicines Agency — centrally authorised medicines",
        url: EMA_URL,
        updatedAt: today,
      },
    ],
    attribution:
      "Quellen: BfArM (Lieferengpassmeldungen, Arzneimittellisten nach SGB V) und Europäische Arzneimittel-Agentur. Teilindex: das vollständige Arzneimittelregister (AMIce) darf nicht weiterverbreitet werden.",
    licence:
      "Amtliche Bekanntmachungen und offen veröffentlichte Daten; EMA-Daten mit Quellenangabe",
    search: "static",
    docs: Object.keys(out.indications).length,
  };
}
