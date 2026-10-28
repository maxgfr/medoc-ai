/**
 * AI answers rendered from Markdown (GitHub flavour): no raw HTML, no images
 * (the CSP blocks them anyway), links open in a new tab. Section citations
 * written as [rcp-4.5] become buttons that open that section of the leaflet;
 * citations of sections the model was not given are dropped.
 */
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CITATION } from "../ai/medical";

const CITE = "#cite:";

/** A short label for a cited section: "RCP 4.5", "Notice 2", else the start of its title. */
export function citationLabel(id: string, title: string): string {
  const section = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  const numbered = /^(rcp|notice)-(\d+(?:\.\d+)*)$/.exec(section);
  if (numbered) return `${numbered[1] === "rcp" ? "RCP" : "Notice"} ${numbered[2]}`;
  const clean = title.replace(/[[\]"]/g, "").trim();
  return clean.length > 28 ? `${clean.slice(0, 27)}…` : clean;
}

/** `[rcp-4.5]` → a Markdown link the renderer turns into a citation button; the title is its tooltip. */
export function linkCitations(text: string, titles: ReadonlyMap<string, string>): string {
  return text.replace(CITATION, (_m, id: string) => {
    const title = titles.get(id);
    if (!title) return "";
    const tooltip = title.replace(/[[\]"]/g, "");
    return ` [${citationLabel(id, title)}](${CITE}${encodeURIComponent(id)} "${tooltip}")`;
  });
}

export function Md({
  text,
  titles,
  onCite,
  inline = false,
}: {
  text: string;
  /** Section id → title, for the citations the text may hold. */
  titles?: ReadonlyMap<string, string>;
  onCite?: (sectionId: string) => void;
  /** One short piece of text (a list item): no paragraph margins. */
  inline?: boolean;
}) {
  const components: Components = {
    a: ({ node: _, href, children, title, ...props }) => {
      if (href?.startsWith(CITE)) {
        const id = decodeURIComponent(href.slice(CITE.length));
        const sectionId = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
        return (
          <button
            type="button"
            title={title}
            aria-label={title}
            onClick={() => onCite?.(sectionId)}
            className="mx-0.5 inline rounded-full border border-stone-300 px-1.5 py-px align-baseline text-[11px] text-stone-600 hover:border-brand-500 hover:text-brand-700 dark:border-stone-700 dark:text-stone-300"
          >
            {children}
          </button>
        );
      }
      return (
        <a {...props} href={href} title={title} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    table: ({ node: _, ...props }) => (
      <div className="overflow-x-auto">
        <table {...props} />
      </div>
    ),
    ...(inline ? { p: ({ node: _, ...props }) => <span {...props} /> } : {}),
  };
  return (
    <div className={inline ? "markdown inline" : "markdown"}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={components}
        disallowedElements={["img"]}
        skipHtml
      >
        {titles ? linkCitations(text, titles) : text}
      </Markdown>
    </div>
  );
}
