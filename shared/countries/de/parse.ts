/**
 * Germany. The full register (BfArM's AMIce) may not be copied or
 * redistributed, and PZN data is sold by the IFA, so the index is built from
 * what is openly published:
 * - BfArM's supply shortage database (CSV meant for automated retrieval),
 * - the lists of § 35 Abs. 5a SGB V (children's medicines) and § 129 Abs. 2b
 *   SGB V (urgency list), official notices with the PZN of every product,
 * - EMA's centrally authorised medicines, valid in Germany.
 * Contact details in the shortage file (phone, e-mail) are left out.
 */
import { validPzn } from "../../codes/gs1";
import type { Alert, Medicine, Pack, Substance } from "../../schema";
import { csvRows, decodeEntities, isoDate } from "../../text";

export const SHORTAGES_CSV =
  "https://anwendungen.pharmnet-bund.de/lieferengpassmeldungen/public/csv";
export const SHORTAGES_PAGE =
  "https://anwendungen.pharmnet-bund.de/lieferengpassmeldungen/faces/public/meldungen.xhtml";
export const LISTS_PAGE =
  "https://www.bfarm.de/DE/Arzneimittel/Arzneimittelinformationen/Lieferengpaesse/ALBVVG/_node.html";

export const gelbeListeUrl = (pzn: string) =>
  `https://www.gelbe-liste.de/suche?term=${encodeURIComponent(pzn)}`;

/** The current CSV files of the BfArM lists, linked from the ALBVVG page (their names carry a date). */
export function listUrls(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(
    /href="([^"]*(?:Liste_kinderarzneimittel|Dringlichkeitsliste_arzneimittelliste)[^"]*\.csv[^"]*)"/g,
  )) {
    const href = (m[1] ?? "").replace(/&amp;/g, "&");
    if (/changelog/i.test(href)) continue;
    out.add(new URL(href, "https://www.bfarm.de/").href);
  }
  return [...out];
}

/** Rows as records keyed by the header row, for files whose column order may change. */
function records(text: string, delimiter: string): Record<string, string>[] {
  const rows = csvRows(text, delimiter);
  const header = rows[0]?.map((h) => h.toLowerCase());
  if (!header) return [];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const pick = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const v = r[k.toLowerCase()];
    if (v && v !== "N/A") return v;
  }
  return undefined;
};

interface Product {
  name: string;
  holder?: string;
  form?: string;
  atc?: string;
  substances: Set<string>;
  pzns: Set<string>;
}

const productKey = (name: string, holder?: string) =>
  `${name.toLowerCase()}|${(holder ?? "").toLowerCase()}`;

export interface EmaEntry {
  category?: string;
  name_of_medicine?: string;
  ema_product_number?: string;
  medicine_status?: string;
  active_substance?: string;
  international_non_proprietary_name_common_name?: string;
  atc_code_human?: string;
  marketing_authorisation_developer_applicant_holder?: string;
  marketing_authorisation_date?: string;
  therapeutic_indication?: string;
  medicine_url?: string;
}

/** EMA's German product information (SmPC and leaflet) of a centrally authorised medicine. */
export function germanProductInfoUrl(eparUrl: string): string | undefined {
  const slug = eparUrl.split("/").pop();
  return slug
    ? `https://www.ema.europa.eu/de/documents/product-information/${slug}-epar-product-information_de.pdf`
    : undefined;
}

export const emaId = (number: string) => `ema-${number.replace(/[^A-Za-z0-9]+/g, "-")}`;

export interface GermanyResult {
  meds: Medicine[];
  codes: Record<string, string>;
  alerts: Alert[];
  /** Therapeutic indication of EMA products, written as their docs. */
  indications: Record<string, string>;
}

export function parseGermany(
  input: { shortages?: string; lists?: string[]; ema?: EmaEntry[] },
  today = new Date().toISOString().slice(0, 10),
): GermanyResult {
  const products = new Map<string, Product>();
  // A PZN is one pack: when two files name it differently, it stays with the first product.
  const ownerOf = new Map<string, string>();
  const add = (
    name: string | undefined,
    holder: string | undefined,
    pzn: string | undefined,
    extra: Partial<Product>,
    substances: string[],
  ) => {
    if (!name || !pzn || !validPzn(pzn) || /^0+$/.test(pzn)) return undefined;
    const key = ownerOf.get(pzn) ?? productKey(name, holder);
    ownerOf.set(pzn, key);
    const p = products.get(key) ?? {
      name,
      ...(holder ? { holder } : {}),
      substances: new Set<string>(),
      pzns: new Set<string>(),
    };
    if (!p.form && extra.form) p.form = extra.form;
    if (!p.atc && extra.atc) p.atc = extra.atc;
    for (const s of substances) if (s) p.substances.add(s);
    p.pzns.add(pzn);
    products.set(key, p);
    return key;
  };

  for (const list of input.lists ?? []) {
    for (const r of records(list, ",")) {
      const form = pick(r, "Darreichungsform");
      const atc = pick(r, "ATC-Code");
      add(
        pick(r, "Arzneimittelname"),
        pick(r, "Zulassungsinhaber"),
        pick(r, "PZN"),
        { ...(form ? { form } : {}), ...(atc ? { atc } : {}) },
        [pick(r, "Wirkstoff") ?? ""],
      );
    }
  }

  const shortageRows: { key: string; r: Record<string, string> }[] = [];
  for (const r of records(input.shortages ?? "", ";")) {
    const name = pick(r, "Arzneimittlbezeichnung", "Arzneimittelbezeichnung");
    const holder = pick(r, "Zulassungsinhaber");
    const form = pick(r, "Darreichungsform")?.split(",")[0];
    const atc = pick(r, "Atc Code", "ATC-Code");
    const substances = (pick(r, "Wirkstoffe") ?? "").split(";").map((s) => s.trim());
    let key: string | undefined;
    for (const pzn of (pick(r, "PZN") ?? "").split(/[,\s]+/)) {
      key =
        add(
          name,
          holder,
          pzn,
          { ...(form ? { form } : {}), ...(atc ? { atc } : {}) },
          substances,
        ) ?? key;
    }
    if (key) shortageRows.push({ key, r });
  }

  const meds: Medicine[] = [];
  const codes: Record<string, string> = {};
  const idOf = new Map<string, string>();
  for (const [key, p] of products) {
    const pzns = [...p.pzns].sort();
    const id = `pzn-${pzns[0]}`;
    idOf.set(key, id);
    // The lists give no pack size: the product name carries it when there is one ("- OP240ml").
    const label = / - (.+)$/.exec(p.name)?.[1] ?? p.form ?? p.name;
    const packs: Pack[] = pzns.map((pzn) => ({ code: pzn, label, marketed: true }));
    for (const pzn of pzns) codes[pzn] = id;
    meds.push({
      id,
      country: "de",
      name: p.name,
      ...(p.form ? { form: p.form } : {}),
      routes: [],
      ...(p.holder ? { holder: p.holder } : {}),
      // The BfArM lists include products whatever their marketing status.
      marketed: true,
      marketKnown: false,
      substances: [...p.substances].map((name): Substance => ({ name })),
      packs,
      ...(p.atc ? { atc: p.atc } : {}),
      prescription: [],
      links: [{ kind: "lookup", url: gelbeListeUrl(pzns[0] ?? "") }],
      docs: "none",
    });
  }

  const alerts: Alert[] = [];
  const seen = new Set<string>();
  for (const { key, r } of shortageRows) {
    const id = idOf.get(key);
    const end = isoDate(pick(r, "Ende"));
    if (!id || (end && end < today)) continue;
    const ref = pick(r, "Bearbeitungsnummer") ?? `${id}-${pick(r, "Beginn") ?? ""}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    const start = isoDate(pick(r, "Beginn"));
    const reason = pick(r, "Grund", "Art des Grundes");
    alerts.push({
      id: `de-${ref}`,
      medIds: [id],
      kind: "shortage",
      title: [pick(r, "Arzneimittlbezeichnung", "Arzneimittelbezeichnung"), reason]
        .filter(Boolean)
        .join(" — "),
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      url: SHORTAGES_PAGE,
    });
    const med = meds.find((m) => m.id === id);
    if (med && !med.links.some((l) => l.kind === "shortages"))
      med.links.push({ kind: "shortages", url: SHORTAGES_PAGE });
  }

  const indications: Record<string, string> = {};
  for (const e of input.ema ?? []) {
    if (
      e.category !== "Human" ||
      e.medicine_status !== "Authorised" ||
      !e.name_of_medicine ||
      !e.ema_product_number
    )
      continue;
    const id = emaId(e.ema_product_number);
    const substances = (
      e.active_substance ||
      e.international_non_proprietary_name_common_name ||
      ""
    )
      .split(/\s*(?:,|\/)\s*/)
      .filter(Boolean);
    const authorisedAt = isoDate(e.marketing_authorisation_date);
    const pi = e.medicine_url ? germanProductInfoUrl(e.medicine_url) : undefined;
    // Some entries have a placeholder for an indication: only real text becomes a document.
    const indication = decodeEntities(e.therapeutic_indication ?? "").trim();
    const hasText = indication.length > 40;
    meds.push({
      id,
      country: "de",
      name: e.name_of_medicine,
      routes: [],
      ...(e.marketing_authorisation_developer_applicant_holder
        ? { holder: e.marketing_authorisation_developer_applicant_holder }
        : {}),
      status: "EU (EMA)",
      marketed: true,
      ...(authorisedAt ? { authorisedAt } : {}),
      substances: substances.map((name) => ({ name })),
      packs: [],
      ...(e.atc_code_human ? { atc: e.atc_code_human } : {}),
      prescription: [],
      links: [
        ...(pi ? [{ kind: "notice" as const, url: pi }] : []),
        ...(e.medicine_url ? [{ kind: "epar" as const, url: e.medicine_url }] : []),
      ],
      docs: hasText ? "static" : "none",
      ref: e.ema_product_number,
    });
    if (hasText) indications[id] = indication;
  }

  return { meds, codes, alerts, indications };
}
