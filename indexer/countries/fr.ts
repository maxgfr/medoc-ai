/** France: the BDPM files, EMA's EPAR links, the scraped leaflets. */
import { join } from "node:path";
import {
  BDPM_FILES,
  BDPM_SITE,
  type BdpmFile,
  bdpmUrl,
  parseBdpm,
} from "../../shared/countries/fr/parse";
import { decodeBytes } from "../../shared/text";
import { download, log } from "../io";
import { scrapeNotices } from "../notices";
import type { CountryIndex } from "../write";
import { addEparLinks, EMA_URL } from "./ema";
import type { IndexerContext } from "./types";

export async function indexFrance(ctx: IndexerContext): Promise<CountryIndex> {
  const files: Partial<Record<BdpmFile, string>> = {};
  for (const f of BDPM_FILES) {
    const bytes = await download(bdpmUrl(f), join(ctx.cacheDir, "fr", `${f}.txt`));
    files[f] = decodeBytes(bytes);
    log(`fr: ${f} ${(bytes.length / 1024).toFixed(0)} KB`);
  }
  const { meds, codes, alerts } = parseBdpm(files);
  if (meds.length < 10_000)
    throw new Error(`fr: only ${meds.length} specialties, the BDPM looks truncated`);
  const epar = await addEparLinks(meds, ctx.cacheDir);
  log(
    `fr: ${meds.length} specialties, ${Object.keys(codes).length} codes, ${alerts.length} alerts, ${epar} EPAR links`,
  );
  const docs = ctx.docs
    ? await scrapeNotices(meds, { outDir: ctx.outDir, cacheDir: ctx.cacheDir, ...ctx.docs })
    : 0;
  const today = new Date().toISOString().slice(0, 10);
  return {
    meds,
    codes,
    alerts,
    sources: [
      {
        name: "Base de données publique des médicaments (ANSM, HAS, UNCAM)",
        url: `${BDPM_SITE}/telechargement`,
        updatedAt: today,
      },
      { name: "European Medicines Agency — EPAR", url: EMA_URL },
    ],
    attribution:
      "Source : Base de données publique des médicaments (base-donnees-publique.medicaments.gouv.fr). Données non modifiées sur le fond ; aucune caution de l'ANSM, de la HAS ou de l'UNCAM.",
    licence: "Réutilisation libre — conditions de la BDPM",
    search: "static",
    docs,
  };
}
