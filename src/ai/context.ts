/**
 * The documents a model reads, cut to fit: sections in priority order until
 * the character budget is spent. Each section carries an id the model cites.
 */
import type { DocSection } from "../../shared/schema";

export interface SourceDoc {
  /** Prefix that makes section ids unique across medicines ("m1"). */
  key: string;
  medName: string;
  sections: DocSection[];
}

export interface Context {
  text: string;
  /** Every id the model may cite → its medicine and section. */
  ids: Map<string, { medName: string; section: DocSection }>;
  truncated: boolean;
}

const escapeAttr = (s: string) => s.replace(/"/g, "'");

/**
 * Sections ranked by `priority` (lower first; Infinity drops one), shared
 * evenly between documents so one long RCP does not crowd the others out.
 */
export function buildContext(
  docs: SourceDoc[],
  budget: number,
  priority: (s: DocSection) => number = () => 0,
): Context {
  const ids = new Map<string, { medName: string; section: DocSection }>();
  const perDoc = Math.floor(budget / Math.max(1, docs.length));
  const blocks: string[] = [];
  let truncated = false;
  for (const d of docs) {
    let left = perDoc;
    const ranked = d.sections
      .map((s, i) => ({ s, i, p: priority(s) }))
      .filter((x) => Number.isFinite(x.p) && x.s.text.trim())
      .sort((a, b) => a.p - b.p || a.i - b.i);
    const kept: { s: DocSection; i: number; text: string }[] = [];
    for (const { s, i } of ranked) {
      if (left <= 200) {
        truncated = true;
        break;
      }
      const text = s.text.length > left ? `${s.text.slice(0, left)} […]` : s.text;
      if (text.length < s.text.length) truncated = true;
      left -= text.length + 120;
      kept.push({ s, i, text });
    }
    for (const { s, text } of kept.sort((a, b) => a.i - b.i)) {
      const id = docs.length > 1 ? `${d.key}:${s.id}` : s.id;
      ids.set(id, { medName: d.medName, section: s });
      blocks.push(
        `<section id="${id}" medicine="${escapeAttr(d.medName)}" document="${s.doc}" title="${escapeAttr(s.title)}">\n${text}\n</section>`,
      );
    }
  }
  return { text: blocks.join("\n\n"), ids, truncated };
}

/** Keeps the citations that name a section the model was given. */
export function validCitations(cited: string[], ctx: Context): string[] {
  return [...new Set(cited.map((c) => c.trim()))].filter((c) => ctx.ids.has(c));
}

/** RCP numbering: 4.3 (contra-indications) and 4.5 (interactions) matter most for interactions. */
export function interactionPriority(s: DocSection): number {
  const id = s.id;
  if (/^rcp-4\.5$|label-drug_interactions/.test(id)) return 0;
  if (/^rcp-4\.3$|label-contraindications|label-do_not_use|label-boxed_warning/.test(id)) return 1;
  if (/^rcp-4\.4$|label-warnings|label-ask_doctor|notice-2$/.test(id)) return 2;
  if (/^rcp-2$|label-active_ingredient/.test(id)) return 3;
  return Number.POSITIVE_INFINITY;
}

/** For a summary: the patient leaflet first, then the RCP's clinical part. */
export function summaryPriority(s: DocSection): number {
  if (s.doc === "notice") return 0;
  if (/^rcp-4(\.\d)?$/.test(s.id)) return 1;
  return 5;
}
