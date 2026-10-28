/**
 * EMA's list of centrally authorised medicines: the EPAR page of a French
 * specialty authorised by the European Commission. The BDPM gives the EU
 * number (EU/1/14/944) and EMA the procedure number (EMEA/H/C/004406), which
 * do not join, so the brand name is matched instead, and only when one EMA
 * entry has it.
 */
import { join } from "node:path";
import type { Medicine } from "../../shared/schema";
import { download, log } from "../io";

export const EMA_URL =
  "https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json";

type EmaEntry = import("../../shared/countries/de/parse").EmaEntry;

let loaded: Promise<EmaEntry[]> | null = null;

/** EMA's medicine list, downloaded once per run (France and Germany both read it). */
export function loadEma(cacheDir: string): Promise<EmaEntry[]> {
  loaded ??= download(EMA_URL, join(cacheDir, "ema", "medicines.json")).then((bytes) => {
    const data = (JSON.parse(new TextDecoder().decode(bytes)) as { data?: EmaEntry[] }).data ?? [];
    if (data.length < 1000) throw new Error(`EMA: only ${data.length} entries`);
    return data;
  });
  loaded.catch(() => {
    loaded = null;
  });
  return loaded;
}

/** "HEMLIBRA 30 mg/ml, solution injectable" → "hemlibra". */
export const brandKey = (name: string) =>
  (name.split(/[\s,]+\d|,/)[0] ?? name).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function eparLinks(entries: EmaEntry[]): Map<string, string> {
  const byName = new Map<string, string | null>();
  for (const e of entries) {
    if (e.category !== "Human" || !e.name_of_medicine || !e.medicine_url) continue;
    const key = brandKey(e.name_of_medicine);
    byName.set(key, byName.has(key) ? null : e.medicine_url);
  }
  const out = new Map<string, string>();
  for (const [k, v] of byName) if (v) out.set(k, v);
  return out;
}

/** Adds the EPAR link to every centrally authorised specialty (EU number in `ref`). */
export async function addEparLinks(meds: Medicine[], cacheDir: string): Promise<number> {
  let added = 0;
  try {
    const links = eparLinks(await loadEma(cacheDir));
    for (const m of meds) {
      if (!m.ref?.startsWith("EU/")) continue;
      const url = links.get(brandKey(m.name));
      if (url) {
        m.links.push({ kind: "epar", url });
        added++;
      }
    }
  } catch (err) {
    log("EMA: skipped,", err instanceof Error ? err.message : err);
  }
  return added;
}
