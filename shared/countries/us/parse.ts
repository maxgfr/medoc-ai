/**
 * openFDA (public domain). The NDC directory (one zip, ~26 MB) is indexed: one
 * medicine per product NDC, its packages keyed by their dashless 10-digit NDC,
 * which is what a UPC-A on a US box carries ("3" + NDC + check digit). Labels
 * (1.8 GB in bulk) are fetched one at a time from the API by the app.
 */
import type { DocKind, DocSection, Medicine, Pack } from "../../schema";
import { isoDate } from "../../text";

export const OPENFDA = "https://api.fda.gov";
export const NDC_DOWNLOAD_INDEX = `${OPENFDA}/download.json`;

export interface NdcRecord {
  product_ndc?: string;
  product_type?: string;
  brand_name?: string;
  generic_name?: string;
  dosage_form?: string;
  route?: string[];
  labeler_name?: string;
  marketing_category?: string;
  marketing_start_date?: string;
  marketing_end_date?: string;
  listing_expiration_date?: string;
  active_ingredients?: { name?: string; strength?: string }[];
  packaging?: { package_ndc?: string; description?: string; marketing_end_date?: string }[];
  pharm_class?: string[];
  openfda?: { spl_set_id?: string[] };
}

/** Product types that are medicines people keep at home; bulk ingredients and the like are not. */
const KEPT = new Set([
  "HUMAN PRESCRIPTION DRUG",
  "HUMAN OTC DRUG",
  "VACCINE",
  "PLASMA DERIVATIVE",
  "CELLULAR THERAPY",
  "STANDARDIZED ALLERGENIC",
]);

const title = (s: string) =>
  s.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());

export const dailyMedUrl = (setId: string) =>
  `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setId)}`;

export function ndcMedicine(r: NdcRecord, today: string): Medicine | null {
  const id = r.product_ndc;
  if (!id || !KEPT.has(r.product_type ?? "")) return null;
  const brand = r.brand_name?.trim() || r.generic_name?.trim();
  if (!brand) return null;
  const end = isoDate(r.marketing_end_date);
  const expires = isoDate(r.listing_expiration_date);
  const marketed = (!end || end >= today) && (!expires || expires >= today);
  const packs: Pack[] = [];
  for (const p of r.packaging ?? []) {
    if (!p.package_ndc) continue;
    const pEnd = isoDate(p.marketing_end_date);
    packs.push({
      code: p.package_ndc.replace(/-/g, ""),
      altCodes: [p.package_ndc],
      label: p.description ?? p.package_ndc,
      marketed: marketed && (!pEnd || pEnd >= today),
    });
  }
  const setId = r.openfda?.spl_set_id?.[0];
  const generic = r.generic_name?.trim();
  const name =
    generic && generic.toLowerCase() !== brand.toLowerCase()
      ? `${title(brand)} (${generic.toLowerCase()})`
      : title(brand);
  const authorisedAt = isoDate(r.marketing_start_date);
  return {
    id,
    country: "us",
    name,
    ...(r.dosage_form ? { form: r.dosage_form.toLowerCase() } : {}),
    routes: (r.route ?? []).map((x) => x.toLowerCase()),
    ...(r.labeler_name ? { holder: r.labeler_name } : {}),
    ...(r.marketing_category ? { status: r.marketing_category } : {}),
    marketed,
    ...(authorisedAt ? { authorisedAt } : {}),
    substances: (r.active_ingredients ?? [])
      .filter((a) => a.name)
      .map((a) => ({ name: title(a.name ?? ""), ...(a.strength ? { strength: a.strength } : {}) })),
    packs,
    prescription: r.product_type === "HUMAN OTC DRUG" ? [] : ["Prescription only (Rx)"],
    otc: r.product_type === "HUMAN OTC DRUG",
    links: setId ? [{ kind: "dailymed", url: dailyMedUrl(setId) }] : [],
    docs: setId ? "live" : "none",
    ...(setId ? { ref: setId } : {}),
  };
}

export function parseNdc(
  json: { results?: NdcRecord[] },
  today = new Date().toISOString().slice(0, 10),
): { meds: Medicine[]; codes: Record<string, string> } {
  // A product NDC can be listed more than once (one record per SPL version): one medicine
  // each, the marketed and most recent record first, with the packs of all of them.
  const byId = new Map<string, { med: Medicine; start: string }>();
  for (const r of json.results ?? []) {
    const m = ndcMedicine(r, today);
    if (!m) continue;
    const start = r.marketing_start_date ?? "";
    const have = byId.get(m.id);
    if (!have) {
      byId.set(m.id, { med: m, start });
      continue;
    }
    const newer = Number(m.marketed) - Number(have.med.marketed) || start.localeCompare(have.start);
    const [keep, other] = newer > 0 ? [m, have.med] : [have.med, m];
    for (const p of other.packs) if (!keep.packs.some((q) => q.code === p.code)) keep.packs.push(p);
    keep.marketed ||= other.marketed;
    byId.set(m.id, { med: keep, start: newer > 0 ? start : have.start });
  }
  const meds = [...byId.values()].map((x) => x.med);
  const codes: Record<string, string> = {};
  for (const m of meds) for (const p of m.packs) codes[p.code] = m.id;
  return { meds, codes };
}

/**
 * The candidate dashless NDC-10s a 10- or 11-digit number may be. An 11-digit
 * billing NDC (5-4-2) pads one segment with a leading zero; which one is not
 * known from the digits, so all three are tried.
 */
export function ndcCandidates(digits: string): string[] {
  if (/^\d{10}$/.test(digits)) return [digits];
  if (!/^\d{11}$/.test(digits)) return [];
  const out: string[] = [];
  if (digits[0] === "0") out.push(digits.slice(1)); // 4-4-2
  if (digits[5] === "0") out.push(digits.slice(0, 5) + digits.slice(6)); // 5-3-2
  if (digits[9] === "0") out.push(digits.slice(0, 9) + digits.slice(10)); // 5-4-1
  return out;
}

/** A UPC-A in GTIN-13 form ("0" + "3" + NDC-10 + check digit) → the NDC-10. */
export function ndcFromGtin(gtin13: string): string | undefined {
  return /^03\d{11}$/.test(gtin13) ? gtin13.slice(2, 12) : undefined;
}

/** Label fields in reading order, with the document they belong to (patient leaflet or prescribing information). */
const LABEL_FIELDS: [field: string, doc: DocKind, en: string][] = [
  ["purpose", "notice", "Purpose"],
  ["indications_and_usage", "rcp", "Indications and usage"],
  ["active_ingredient", "notice", "Active ingredient"],
  ["do_not_use", "notice", "Do not use"],
  ["ask_doctor", "notice", "Ask a doctor before use"],
  ["ask_doctor_or_pharmacist", "notice", "Ask a doctor or pharmacist"],
  ["stop_use", "notice", "Stop use and ask a doctor"],
  ["pregnancy_or_breast_feeding", "notice", "Pregnancy or breast-feeding"],
  ["keep_out_of_reach_of_children", "notice", "Keep out of reach of children"],
  ["directions", "notice", "Directions"],
  ["other_safety_information", "notice", "Other information"],
  ["when_using", "notice", "When using this product"],
  ["inactive_ingredient", "notice", "Inactive ingredients"],
  ["inactive_ingredients", "notice", "Inactive ingredients"],
  ["questions", "notice", "Questions?"],
  ["boxed_warning", "rcp", "Boxed warning"],
  ["dosage_and_administration", "rcp", "Dosage and administration"],
  ["dosage_forms_and_strengths", "rcp", "Dosage forms and strengths"],
  ["contraindications", "rcp", "Contraindications"],
  ["warnings_and_cautions", "rcp", "Warnings and precautions"],
  ["warnings", "rcp", "Warnings"],
  ["precautions", "rcp", "Precautions"],
  ["adverse_reactions", "rcp", "Adverse reactions"],
  ["drug_interactions", "rcp", "Drug interactions"],
  ["use_in_specific_populations", "rcp", "Use in specific populations"],
  ["pregnancy", "rcp", "Pregnancy"],
  ["pediatric_use", "rcp", "Pediatric use"],
  ["geriatric_use", "rcp", "Geriatric use"],
  ["overdosage", "rcp", "Overdosage"],
  ["description", "rcp", "Description"],
  ["clinical_pharmacology", "rcp", "Clinical pharmacology"],
  ["how_supplied", "rcp", "How supplied / storage and handling"],
  ["storage_and_handling", "rcp", "Storage and handling"],
  ["information_for_patients", "notice", "Information for patients"],
  ["patient_counseling_information", "notice", "Patient counseling information"],
  ["spl_patient_package_insert", "notice", "Patient package insert"],
  ["spl_medguide", "notice", "Medication guide"],
];

/**
 * An openFDA drug/label result → sections; the field names are the section
 * ids. An OTC "Drug Facts" label is all patient leaflet.
 */
export function labelSections(label: Record<string, unknown>): DocSection[] {
  const out: DocSection[] = [];
  const types = (label.openfda as { product_type?: string[] } | undefined)?.product_type ?? [];
  const otc = types.some((t) => t.includes("OTC")) || Array.isArray(label.purpose);
  for (const [field, kind, heading] of LABEL_FIELDS) {
    const doc: DocKind = otc ? "notice" : kind;
    const value = label[field];
    if (!Array.isArray(value)) continue;
    const text = value
      .filter((v): v is string => typeof v === "string")
      .join("\n\n")
      .replace(/\s+\n/g, "\n")
      .trim();
    if (!text) continue;
    out.push({
      id: `label-${field}`,
      doc,
      title: heading,
      level: 1,
      text: withoutHeading(text, heading),
    });
  }
  return out;
}

/** Label texts often start with their own heading ("Purpose Pain reliever", "5 WARNINGS AND PRECAUTIONS 5.1 …"). */
function withoutHeading(text: string, heading: string): string {
  const words = heading
    .split(/[\s/?]+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`^\\d*(\\.\\d+)?\\s*${words.join("[\\s/]+")}\\s*\\??:?\\s*`, "i");
  const stripped = text.replace(re, "");
  return stripped || text;
}

/** The openFDA query for one product's current label. */
export function labelQuery(setId: string): string {
  return `${OPENFDA}/drug/label.json?search=${encodeURIComponent(`openfda.spl_set_id:"${setId}"`)}&limit=1`;
}

/** The openFDA query for a package NDC that is not in the published index (newer than the build). */
export function ndcQuery(ndc10s: string[]): string {
  const terms = ndc10s.flatMap((d) => dashed(d).map((n) => `packaging.package_ndc:"${n}"`));
  return `${OPENFDA}/drug/ndc.json?search=${encodeURIComponent(terms.join(" OR "))}&limit=1`;
}

/** The three dash layouts a dashless NDC-10 may have. */
export function dashed(ndc10: string): string[] {
  if (!/^\d{10}$/.test(ndc10)) return [];
  return [
    `${ndc10.slice(0, 4)}-${ndc10.slice(4, 8)}-${ndc10.slice(8)}`,
    `${ndc10.slice(0, 5)}-${ndc10.slice(5, 8)}-${ndc10.slice(8)}`,
    `${ndc10.slice(0, 5)}-${ndc10.slice(5, 9)}-${ndc10.slice(9)}`,
  ];
}
