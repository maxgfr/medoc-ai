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

interface EmaEntry {
  category?: string;
  name_of_medicine?: string;
  medicine_status?: string;
  medicine_url?: string;
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
    const bytes = await download(EMA_URL, join(cacheDir, "ema", "medicines.json"));
    const links = eparLinks(
      (JSON.parse(new TextDecoder().decode(bytes)) as { data?: EmaEntry[] }).data ?? [],
    );
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
