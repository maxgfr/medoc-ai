/**
 * The Base de données publique des médicaments (BDPM): tab-separated files
 * without a header, joined on the CIS (one per specialty). Pure functions:
 * the indexer runs them in the GitHub Action, the app in a worker when someone
 * imports the files themselves. Columns follow ANSM's "Contenu et format des
 * fichiers téléchargeables dans la BDM" (v5).
 */
import type { Alert, AlertKind, Link, Medicine, Pack, Substance } from "../../schema";
import { decimal, decodeEntities, isoDate, tsvRows } from "../../text";

export const BDPM_SITE = "https://base-donnees-publique.medicaments.gouv.fr";

export const BDPM_FILES = [
  "CIS_bdpm",
  "CIS_CIP_bdpm",
  "CIS_COMPO_bdpm",
  "CIS_HAS_SMR_bdpm",
  "CIS_HAS_ASMR_bdpm",
  "HAS_LiensPageCT_bdpm",
  "CIS_GENER_bdpm",
  "CIS_CPD_bdpm",
  "CIS_CIP_Dispo_Spec",
  "CIS_MITM",
  "CIS_InfoImportantes",
] as const;
export type BdpmFile = (typeof BDPM_FILES)[number];

/** Where each file is downloaded from; InfoImportantes is generated on request. */
export function bdpmUrl(file: BdpmFile): string {
  return file === "CIS_InfoImportantes"
    ? `${BDPM_SITE}/download/CIS_InfoImportantes.txt`
    : `${BDPM_SITE}/download/file/${file}.txt`;
}

/** Which file a name someone drops into the app is (the InfoImportantes one carries a timestamp). */
export function bdpmFileOf(name: string): BdpmFile | undefined {
  const base = name.replace(/\.txt$/i, "");
  if (/^CIS_InfoImportantes/i.test(base)) return "CIS_InfoImportantes";
  return BDPM_FILES.find((f) => f.toLowerCase() === base.toLowerCase());
}

export const extraitUrl = (cis: string) => `${BDPM_SITE}/medicament/${cis}/extrait`;

export interface BdpmResult {
  meds: Medicine[];
  /** CIP13 and CIP7 → CIS. */
  codes: Record<string, string>;
  alerts: Alert[];
}

const GENERIC_ROLES: Record<string, string> = {
  "0": "princeps",
  "1": "generic",
  "2": "complementary",
  "4": "substitutable",
};

const DISPO_KINDS: Record<string, AlertKind> = {
  "1": "shortage",
  "2": "tension",
  "3": "stopped",
  "4": "restored",
};

/** Keeps the latest assessment per CIS (dates are yyyymmdd, so they sort as text). */
function latest<T extends { date?: string | undefined }>(map: Map<string, T>, cis: string, v: T) {
  const have = map.get(cis);
  if (!have || (v.date ?? "") > (have.date ?? "")) map.set(cis, v);
}

/** A short stable id for a text (FNV-1a, base 36). */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** `<a … href='…'>Title</a>` → its URL and text. */
function anchor(html: string): { url?: string; title: string } {
  const href = /href=['"]([^'"]+)['"]/i.exec(html)?.[1];
  const title = decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  return href ? { url: href, title } : { title };
}

export function parseBdpm(
  files: Partial<Record<BdpmFile, string>>,
  today = new Date().toISOString().slice(0, 10),
): BdpmResult {
  const main = files.CIS_bdpm;
  if (!main) throw new Error("CIS_bdpm.txt is required");

  const packs = new Map<string, Pack[]>();
  const codes: Record<string, string> = {};
  for (const r of tsvRows(files.CIS_CIP_bdpm ?? "")) {
    const [cis, cip7, label, , state, , cip13, , rate, , price] = r;
    if (!cis || !cip13) continue;
    const pack: Pack = {
      code: cip13,
      ...(cip7 ? { altCodes: [cip7] } : {}),
      label: label ?? "",
      marketed: (state ?? "").startsWith("Déclaration de commercialisation"),
    };
    const p = decimal(price);
    if (p !== undefined) pack.price = p;
    if (rate) pack.reimbursement = rate.replace(/\s/g, "");
    const list = packs.get(cis) ?? [];
    list.push(pack);
    packs.set(cis, list);
    codes[cip13] = cis;
    if (cip7) codes[cip7] = cis;
  }

  const substances = new Map<string, Substance[]>();
  for (const r of tsvRows(files.CIS_COMPO_bdpm ?? "")) {
    const [cis, , , name, strength, per, nature] = r;
    if (!cis || !name || nature !== "SA") continue;
    const list = substances.get(cis) ?? [];
    if (list.some((s) => s.name === name && s.strength === strength)) continue;
    list.push({
      name,
      ...(strength ? { strength } : {}),
      ...(per ? { per } : {}),
    });
    substances.set(cis, list);
  }

  const ctLinks = new Map<string, string>();
  for (const [ct, url] of tsvRows(files.HAS_LiensPageCT_bdpm ?? "")) {
    if (ct && url) ctLinks.set(ct, url);
  }

  type Assessed = { level: string; date?: string; text?: string; url?: string };
  const assess = (text: string | undefined) => {
    const out = new Map<string, Assessed>();
    for (const [cis, ct, , date, level, body] of tsvRows(text ?? "")) {
      if (!cis || !level) continue;
      const url = ct ? ctLinks.get(ct) : undefined;
      latest(out, cis, {
        level,
        ...(date ? { date } : {}),
        ...(body ? { text: body } : {}),
        ...(url ? { url } : {}),
      });
    }
    for (const v of out.values()) if (v.date) v.date = isoDate(v.date) ?? v.date;
    return out;
  };
  const smr = assess(files.CIS_HAS_SMR_bdpm);
  const asmr = assess(files.CIS_HAS_ASMR_bdpm);

  const generics = new Map<string, { group: string; role: string }>();
  for (const [, group, cis, type] of tsvRows(files.CIS_GENER_bdpm ?? "")) {
    if (!cis || !group) continue;
    generics.set(cis, { group, role: GENERIC_ROLES[type ?? ""] ?? "generic" });
  }

  const conditions = new Map<string, string[]>();
  for (const [cis, condition] of tsvRows(files.CIS_CPD_bdpm ?? "")) {
    if (!cis || !condition) continue;
    const list = conditions.get(cis) ?? [];
    if (!list.includes(condition)) list.push(condition);
    conditions.set(cis, list);
  }

  const major = new Map<string, string>();
  for (const [cis, atc] of tsvRows(files.CIS_MITM ?? "")) {
    if (cis) major.set(cis, atc ?? "");
  }

  const grouped = new Map<string, Alert>();
  const addAlert = (cis: string, alert: Omit<Alert, "medIds">) => {
    const have = grouped.get(alert.id);
    if (have) {
      if (!have.medIds.includes(cis)) have.medIds.push(cis);
    } else grouped.set(alert.id, { ...alert, medIds: [cis] });
  };
  for (const [cis, , code, label, start, , restored, url] of tsvRows(
    files.CIS_CIP_Dispo_Spec ?? "",
  )) {
    const kind = DISPO_KINDS[code ?? ""];
    if (!cis || !kind) continue;
    const s = isoDate(start);
    const e = isoDate(restored);
    addAlert(cis, {
      id: `${kind}-${cis}-${s ?? ""}`,
      kind,
      title: label ?? kind,
      ...(s ? { start: s } : {}),
      ...(e ? { end: e } : {}),
      ...(url ? { url } : {}),
    });
  }
  for (const [cis, start, end, html] of tsvRows(files.CIS_InfoImportantes ?? "")) {
    if (!cis || !html) continue;
    const e = isoDate(end);
    if (e && e < today) continue;
    const s = isoDate(start);
    const { url, title } = anchor(html);
    addAlert(cis, {
      id: `safety-${hash(`${url ?? ""}|${title}|${s ?? ""}`)}`,
      kind: "safety",
      title,
      ...(s ? { start: s } : {}),
      ...(e ? { end: e } : {}),
      ...(url ? { url } : {}),
    });
  }
  const alerts = [...grouped.values()];

  const ansmLinks = new Map<string, string[]>();
  for (const al of alerts) {
    if (!al.url || al.kind === "safety") continue;
    for (const cis of al.medIds) {
      const list = ansmLinks.get(cis) ?? [];
      if (!list.includes(al.url)) list.push(al.url);
      ansmLinks.set(cis, list);
    }
  }

  const meds: Medicine[] = [];
  for (const r of tsvRows(main)) {
    const [cis, name, form, routes, status, , state, date, , euNumber, holders, monitoring] = r;
    if (!cis || !name) continue;
    const links: Link[] = [
      { kind: "notice", url: `${extraitUrl(cis)}#tab-notice` },
      { kind: "rcp", url: `${extraitUrl(cis)}#tab-rcp` },
      { kind: "sheet", url: `${extraitUrl(cis)}#tab-fiche-info` },
    ];
    const s = smr.get(cis);
    const a = asmr.get(cis);
    const hasUrl = s?.url ?? a?.url;
    if (hasUrl) links.push({ kind: "has", url: hasUrl });
    for (const url of ansmLinks.get(cis) ?? []) links.push({ kind: "ansm", url });
    const authorisedAt = isoDate(date);
    const atc = major.get(cis);
    const generic = generics.get(cis);
    const holder = holders?.replace(/\s*;\s*/g, ", ").trim();
    meds.push({
      id: cis,
      country: "fr",
      name,
      ...(form ? { form } : {}),
      routes: (routes ?? "")
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean),
      ...(holder ? { holder } : {}),
      ...(status ? { status } : {}),
      marketed: state === "Commercialisée",
      ...(authorisedAt ? { authorisedAt } : {}),
      substances: substances.get(cis) ?? [],
      packs: packs.get(cis) ?? [],
      ...(atc ? { atc } : {}),
      ...(generic ? { generic } : {}),
      prescription: conditions.get(cis) ?? [],
      ...(s ? { smr: s } : {}),
      ...(a ? { asmr: a } : {}),
      enhancedMonitoring: monitoring === "Oui",
      ...(major.has(cis) ? { major: true } : {}),
      links,
      docs: "none",
      ...(euNumber ? { ref: euNumber } : {}),
    });
  }

  return { meds, codes, alerts };
}
