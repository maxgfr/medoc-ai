/**
 * NHS Dictionary of Medicines and Devices (dm+d), from NHSBSA through TRUD
 * (Open Government Licence; a free TRUD account and API key are needed to
 * download it). One medicine per actual medicinal product (AMP); its packs
 * (AMPP) carry the GTINs printed on UK boxes. Records are flat XML elements,
 * read with a small tolerant reader rather than a full XML parser so the
 * same code runs in Bun and in the browser.
 */
import type { Medicine, Pack, Substance } from "../../schema";
import { decodeEntities } from "../../text";

export const TRUD_ITEM_DMD = 24;
export const TRUD_ITEM_GTIN = 25;
export const trudReleasesUrl = (key: string, item: number) =>
  `https://isd.digital.nhs.uk/trud/api/v1/keys/${encodeURIComponent(key)}/items/${item}/releases?latest`;

export type DmdFile = "vmp" | "amp" | "ampp" | "ingredient" | "lookup" | "gtin";

/** Which dm+d file a zip entry is: f_vmp2_3101024.xml → vmp. */
export function dmdFileOf(name: string): DmdFile | undefined {
  const base = name.split("/").pop()?.toLowerCase() ?? "";
  const m = /^f_(vmp|amp|ampp|ingredient|lookup|gtin)\d?_/.exec(base);
  return m?.[1] as DmdFile | undefined;
}

type Rec = Record<string, string>;

/** The XML between <tag> and </tag>, for every occurrence. */
function blocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`, "g");
  const close = `</${tag}>`;
  for (let m = open.exec(xml); m; m = open.exec(xml)) {
    const start = m.index + m[0].length;
    const end = xml.indexOf(close, start);
    if (end === -1) break;
    out.push(xml.slice(start, end));
    open.lastIndex = end + close.length;
  }
  return out;
}

/** A flat record's leaf children: <NM>…</NM><APID>…</APID> → { NM, APID }. */
function leaves(xml: string): Rec {
  const out: Rec = {};
  for (const m of xml.matchAll(/<([A-Z_0-9]+)>([^<]*)<\/\1>/g))
    if (m[1]) out[m[1]] = decodeEntities((m[2] ?? "").trim());
  return out;
}

const records = (xml: string, tag: string) => blocks(xml, tag).map(leaves);

/** A lookup table of f_lookup: <SUPPLIER><INFO><CD/><DESC/></INFO>…</SUPPLIER>. */
function lookup(xml: string, table: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of blocks(xml, table)) {
    for (const r of records(b, "INFO")) if (r.CD && r.DESC) out.set(r.CD, r.DESC);
  }
  return out;
}

export const mhraSearchUrl = (name: string) =>
  `https://products.mhra.gov.uk/search/?search=${encodeURIComponent(name)}&page=1`;
export const emcSearchUrl = (name: string) =>
  `https://www.medicines.org.uk/emc/search?q=${encodeURIComponent(name)}`;

/** Keeps the first words that name the product ("Calpol 120mg/5ml oral suspension" → "Calpol"). */
function brandOf(name: string): string {
  return name.split(/\s+\d/)[0]?.trim() || name;
}

export function parseDmd(files: Partial<Record<DmdFile, string>>): {
  meds: Medicine[];
  codes: Record<string, string>;
} {
  const amp = files.amp;
  if (!amp) throw new Error("The dm+d AMP file (f_amp2_*.xml) is required");
  const lk = files.lookup ?? "";
  const suppliers = lookup(lk, "SUPPLIER");
  const forms = lookup(lk, "FORM");
  const routes = lookup(lk, "ROUTE");
  const units = lookup(lk, "UNIT_OF_MEASURE");
  const legal = lookup(lk, "LEGAL_CATEGORY");

  const ingredients = new Map<string, string>();
  for (const r of records(files.ingredient ?? "", "ING"))
    if (r.ISID && r.NM) ingredients.set(r.ISID, r.NM);

  const vmp = files.vmp ?? "";
  const vmpForm = new Map<string, string>();
  for (const r of records(vmp, "DFORM"))
    if (r.VPID && r.FORMCD) vmpForm.set(r.VPID, forms.get(r.FORMCD) ?? "");
  const vmpRoutes = new Map<string, string[]>();
  for (const r of records(vmp, "DROUTE")) {
    if (!r.VPID || !r.ROUTECD) continue;
    const list = vmpRoutes.get(r.VPID) ?? [];
    list.push((routes.get(r.ROUTECD) ?? r.ROUTECD).toLowerCase());
    vmpRoutes.set(r.VPID, list);
  }
  const vmpSubstances = new Map<string, Substance[]>();
  for (const r of records(vmp, "VPI")) {
    const name = r.ISID ? ingredients.get(r.ISID) : undefined;
    if (!r.VPID || !name) continue;
    const unit = r.STRNT_NMRTR_UOMCD ? units.get(r.STRNT_NMRTR_UOMCD) : undefined;
    const per =
      r.STRNT_DNMTR_VAL && r.STRNT_DNMTR_UOMCD
        ? `${r.STRNT_DNMTR_VAL} ${units.get(r.STRNT_DNMTR_UOMCD) ?? ""}`.trim()
        : undefined;
    const list = vmpSubstances.get(r.VPID) ?? [];
    list.push({
      name,
      ...(r.STRNT_NMRTR_VAL ? { strength: `${r.STRNT_NMRTR_VAL} ${unit ?? ""}`.trim() } : {}),
      ...(per ? { per } : {}),
    });
    vmpSubstances.set(r.VPID, list);
  }

  const gtins = new Map<string, string[]>();
  for (const b of blocks(files.gtin ?? "", "AMPP")) {
    const id = /<AMPPID>(\d+)<\/AMPPID>/.exec(b)?.[1];
    if (!id) continue;
    for (const g of records(b, "GTINDATA")) {
      if (!g.GTIN || g.ENDDT) continue;
      const list = gtins.get(id) ?? [];
      list.push(g.GTIN.padStart(14, "0").slice(1));
      gtins.set(id, list);
    }
  }

  const packsOf = new Map<string, { packs: Pack[]; legal?: string }>();
  for (const r of records(files.ampp ?? "", "AMPP")) {
    if (!r.APPID || !r.APID) continue;
    const entry = packsOf.get(r.APID) ?? { packs: [] };
    const codes = gtins.get(r.APPID) ?? [];
    const marketed = !r.DISCCD;
    for (const code of codes.length ? codes : [`ampp-${r.APPID}`]) {
      entry.packs.push({ code, label: r.NM ?? "", marketed });
    }
    const cat = r.LEGAL_CATCD ? legal.get(r.LEGAL_CATCD) : undefined;
    if (cat) entry.legal = cat;
    packsOf.set(r.APID, entry);
  }

  const meds: Medicine[] = [];
  const codes: Record<string, string> = {};
  for (const r of records(amp, "AMP")) {
    if (!r.APID || !r.NM || r.INVALID === "1") continue;
    const vpid = r.VPID ?? "";
    const packInfo = packsOf.get(r.APID);
    const packs = packInfo?.packs ?? [];
    const holder = r.SUPPCD ? suppliers.get(r.SUPPCD) : undefined;
    const form = vmpForm.get(vpid);
    const otc = packInfo?.legal
      ? /^(GSL|P)$|general sales|pharmacy/i.test(packInfo.legal.trim())
      : undefined;
    const brand = brandOf(r.NM);
    meds.push({
      id: r.APID,
      country: "uk",
      name: r.NM,
      ...(form ? { form: form.toLowerCase() } : {}),
      routes: vmpRoutes.get(vpid) ?? [],
      ...(holder ? { holder } : {}),
      ...(packInfo?.legal ? { status: packInfo.legal } : {}),
      marketed: packs.some((p) => p.marketed),
      substances: vmpSubstances.get(vpid) ?? [],
      packs: packs.filter((p) => !p.code.startsWith("ampp-")),
      prescription: packInfo?.legal && !otc ? [packInfo.legal] : [],
      ...(otc !== undefined ? { otc } : {}),
      links: [
        { kind: "mhra", url: mhraSearchUrl(brand) },
        { kind: "emc", url: emcSearchUrl(brand) },
      ],
      docs: "none",
    });
    for (const p of packs) if (!p.code.startsWith("ampp-")) codes[p.code] = r.APID;
  }
  return { meds, codes };
}
