/**
 * The leaflet (notice) and the summary of product characteristics (RCP) of a
 * specialty, from its BDPM page `/medicament/{cis}/extrait`. Both are tab
 * panels of that one page; their headings are paragraphs styled
 * AmmAnnexeTitre1/2 (RCP, numbered "4.5.") or AmmNoticeTitre1 (leaflet).
 */
import type { DocKind, DocSection } from "../../schema";
import { htmlToText } from "../../text";

const PANELS: Record<DocKind, string> = {
  notice: "tabpanel-notice-panel",
  rcp: "tabpanel-rcp-panel",
};

/** The HTML of one tab panel: from its opening tag to the next panel or the end of <main>. */
function panel(html: string, id: string): string | null {
  const start = html.indexOf(`id="${id}"`);
  if (start === -1) return null;
  const open = html.indexOf(">", start);
  const rest = html.slice(open + 1);
  const ends = [rest.indexOf('id="tabpanel-'), rest.indexOf("</main>"), rest.indexOf("<footer")]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  return ends.length ? rest.slice(0, ends[0]) : rest;
}

/** Navigation and "back to top" links inside a panel are not part of the text. */
function stripChrome(html: string): string {
  return html
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, "")
    .replace(/<a\b[^>]*lien-retour-hautdepage[^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<button\b[\s\S]*?<\/button>/gi, "")
    .replace(/Redirection vers le haut de page/g, "")
    .replace(/<[^>]*$/, "");
}

const HEADING =
  /<(p|h\d|div)\b[^>]*class=["']?Amm(?:Annexe|Notice)Titre(\d?)\b[^>]*>([\s\S]*?)<\/\1>/gi;

function sectionId(doc: DocKind, title: string, taken: Set<string>, index: number): string {
  const num = /^(\d+(?:\.\d+)*)\.?\s/.exec(title)?.[1];
  let id = num ? `${doc}-${num}` : `${doc}-s${index}`;
  while (taken.has(id)) id = `${id}b`;
  taken.add(id);
  return id;
}

/** One document's sections, in page order. Text before the first heading becomes an untitled intro. */
export function sectionsOf(html: string, doc: DocKind): DocSection[] {
  const body = panel(html, PANELS[doc]);
  if (!body) return [];
  const clean = stripChrome(body);
  const out: DocSection[] = [];
  const taken = new Set<string>();
  const heads = [...clean.matchAll(HEADING)];
  const push = (title: string, level: number, chunk: string) => {
    const text = htmlToText(chunk);
    if (!text && !title) return;
    out.push({
      id: sectionId(doc, title, taken, out.length),
      doc,
      title,
      level: Math.min(3, Math.max(1, level)),
      text,
    });
  };
  const first = heads[0]?.index ?? clean.length;
  const intro = htmlToText(clean.slice(0, first));
  if (intro.length > 40) push("", 1, clean.slice(0, first));
  heads.forEach((m, i) => {
    const title = htmlToText(m[3] ?? "").replace(/\s+/g, " ");
    const level = Number(m[2] || 1);
    const from = (m.index ?? 0) + m[0].length;
    const to = heads[i + 1]?.index ?? clean.length;
    const parent = out.at(-1);
    // A third-level heading ("Associations déconseillées") is part of its section's text.
    if (level >= 3 && parent) {
      const text = htmlToText(clean.slice(from, to));
      parent.text = [parent.text, title ? `${title} :` : "", text].filter(Boolean).join("\n");
      return;
    }
    push(title, level, clean.slice(from, to));
  });
  return out.filter((s) => s.title || s.text);
}

/** Both documents of a page. */
export function parseExtrait(html: string): DocSection[] {
  return [...sectionsOf(html, "notice"), ...sectionsOf(html, "rcp")];
}

/** The date ANSM last updated the leaflet ("ANSM - Mis à jour le : 25/08/2025"), as yyyy-mm-dd. */
export function textDate(html: string): string | undefined {
  const body = panel(html, PANELS.notice) ?? panel(html, PANELS.rcp) ?? "";
  const m = /Mis\s+à\s+jour\s+le\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(
    htmlToText(body.slice(0, 20_000)),
  );
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}
