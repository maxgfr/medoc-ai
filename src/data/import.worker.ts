/**
 * Builds a country's index in the browser from files the person downloaded
 * from the source: the same parsers the GitHub Action runs, off the main thread.
 */
import { unzipSync } from "fflate";
import { type BdpmFile, bdpmFileOf, parseBdpm } from "../../shared/countries/fr/parse";
import { type DmdFile, dmdFileOf, parseDmd } from "../../shared/countries/uk/parse";
import { parseNdc } from "../../shared/countries/us/parse";
import type { Alert, CountryId, Manifest, Medicine } from "../../shared/schema";
import { decodeBytes } from "../../shared/text";

export interface ImportRequest {
  country: CountryId;
  files: { name: string; bytes: Uint8Array }[];
}

export type ImportResponse =
  | {
      ok: true;
      manifest: Manifest;
      meds: Medicine[];
      codes: Record<string, string>;
      alerts: Alert[];
    }
  | { ok: false; error: string };

/** Every file, with zips opened (nested ones too). */
function expand(files: ImportRequest["files"]): ImportRequest["files"] {
  const out: ImportRequest["files"] = [];
  for (const f of files) {
    if (f.name.toLowerCase().endsWith(".zip")) {
      out.push(
        ...expand(Object.entries(unzipSync(f.bytes)).map(([name, bytes]) => ({ name, bytes }))),
      );
    } else out.push(f);
  }
  return out;
}

function build(req: ImportRequest): ImportResponse {
  const files = expand(req.files);
  const now = new Date().toISOString();
  let result: { meds: Medicine[]; codes: Record<string, string>; alerts: Alert[] };
  let attribution: string;
  let licence: string;
  switch (req.country) {
    case "fr": {
      const texts: Partial<Record<BdpmFile, string>> = {};
      for (const f of files) {
        const kind = bdpmFileOf(f.name.split("/").pop() ?? f.name);
        if (kind) texts[kind] = decodeBytes(f.bytes);
      }
      if (!texts.CIS_bdpm) return { ok: false, error: "CIS_bdpm.txt" };
      result = parseBdpm(texts);
      attribution = "Source : Base de données publique des médicaments (import local).";
      licence = "Réutilisation libre — conditions de la BDPM";
      break;
    }
    case "de":
      // Germany's index is built from several authorities' files; only the Action assembles it.
      return { ok: false, error: "Germany is indexed by the GitHub Action only." };
    case "us": {
      const json = files.find((f) => f.name.endsWith(".json"));
      if (!json) return { ok: false, error: "drug-ndc-*.json" };
      result = { ...parseNdc(JSON.parse(new TextDecoder().decode(json.bytes))), alerts: [] };
      attribution = "Source: openFDA NDC Directory (local import).";
      licence = "Public domain (CC0)";
      break;
    }
    case "uk": {
      const texts: Partial<Record<DmdFile, string>> = {};
      for (const f of files) {
        const kind = dmdFileOf(f.name);
        if (kind && f.name.toLowerCase().endsWith(".xml")) texts[kind] = decodeBytes(f.bytes);
      }
      if (!texts.amp) return { ok: false, error: "f_amp2_*.xml" };
      result = { ...parseDmd(texts), alerts: [] };
      attribution =
        "Contains public sector information from the NHSBSA dm+d (local import), OGL v3.0.";
      licence = "Open Government Licence v3.0";
      break;
    }
  }
  const manifest: Manifest = {
    country: req.country,
    version: `local-${Date.now().toString(36)}`,
    generatedAt: now,
    sources: [],
    counts: {
      medicines: result.meds.length,
      packs: Object.keys(result.codes).length,
      alerts: result.alerts.length,
      docs: 0,
    },
    search: "static",
    attribution,
    licence,
  };
  return { ok: true, manifest, ...result };
}

self.onmessage = (e: MessageEvent<ImportRequest>) => {
  try {
    self.postMessage(build(e.data));
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies ImportResponse);
  }
};
