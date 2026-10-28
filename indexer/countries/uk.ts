/**
 * United Kingdom: NHSBSA's dm+d through TRUD. Needs a TRUD API key
 * (TRUD_API_KEY, a free account subscribed to the dm+d items); without one the
 * country is skipped and the app shows it as unavailable.
 */
import { join } from "node:path";
import { unzipSync } from "fflate";
import {
  type DmdFile,
  dmdFileOf,
  parseDmd,
  TRUD_ITEM_DMD,
  TRUD_ITEM_GTIN,
  trudReleasesUrl,
} from "../../shared/countries/uk/parse";
import { decodeBytes } from "../../shared/text";
import { download, get, log } from "../io";
import type { CountryIndex } from "../write";
import type { IndexerContext } from "./types";

export class Skipped extends Error {}

interface Releases {
  releases?: {
    id: string;
    releaseDate?: string;
    archiveFileUrl?: string;
    archiveFileName?: string;
  }[];
}

/** Every XML file in a zip, nested zips included (the GTIN file ships as a zip inside the release). */
function collect(zip: Uint8Array, into: Partial<Record<DmdFile, string>>): void {
  for (const [name, bytes] of Object.entries(unzipSync(zip))) {
    if (name.toLowerCase().endsWith(".zip")) collect(bytes, into);
    const kind = dmdFileOf(name);
    if (kind && name.toLowerCase().endsWith(".xml")) into[kind] = decodeBytes(bytes);
  }
}

export async function indexUnitedKingdom(ctx: IndexerContext): Promise<CountryIndex> {
  const key = ctx.env.TRUD_API_KEY;
  if (!key) throw new Skipped("uk: no TRUD_API_KEY, skipped");
  const files: Partial<Record<DmdFile, string>> = {};
  let releaseDate: string | undefined;
  for (const item of [TRUD_ITEM_DMD, TRUD_ITEM_GTIN]) {
    const res = (await (await get(trudReleasesUrl(key, item))).json()) as Releases;
    const latest = res.releases?.[0];
    if (!latest?.archiveFileUrl) {
      if (item === TRUD_ITEM_DMD) throw new Error("uk: TRUD returned no dm+d release");
      continue;
    }
    if (item === TRUD_ITEM_DMD) releaseDate = latest.releaseDate;
    const zip = await download(
      latest.archiveFileUrl,
      join(ctx.cacheDir, "uk", latest.archiveFileName ?? `item-${item}.zip`),
    );
    collect(zip, files);
  }
  log(`uk: files ${Object.keys(files).join(", ")}`);
  const { meds, codes } = parseDmd(files);
  if (meds.length < 1000)
    throw new Error(`uk: only ${meds.length} products, the dm+d release looks incomplete`);
  log(`uk: ${meds.length} products, ${Object.keys(codes).length} GTINs`);
  return {
    meds,
    codes,
    alerts: [],
    sources: [
      {
        name: "NHS Dictionary of Medicines and Devices (NHSBSA, via TRUD)",
        url: "https://isd.digital.nhs.uk/trud/users/guest/filters/0/categories/6",
        ...(releaseDate ? { updatedAt: releaseDate } : {}),
      },
    ],
    attribution:
      "Contains public sector information from the NHSBSA dm+d, licensed under the Open Government Licence v3.0.",
    licence: "Open Government Licence v3.0",
    search: "static",
    docs: 0,
  };
}
