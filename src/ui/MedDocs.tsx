import { useMemo } from "react";
import type { DocKind, Docs } from "../../shared/schema";
import { formatDate } from "../i18n";
import { useLocale, useT } from "../i18n/react";

/** The leaflet and RCP as collapsible sections; `focus` opens one (from an AI citation). */
export function DocsView({ docs, focus }: { docs: Docs; focus: string | null }) {
  const t = useT();
  const locale = useLocale();
  const groups = useMemo(() => {
    const out: { doc: DocKind; sections: Docs["sections"] }[] = [];
    for (const s of docs.sections) {
      const last = out.at(-1);
      if (last?.doc === s.doc) last.sections.push(s);
      else out.push({ doc: s.doc, sections: [s] });
    }
    return out;
  }, [docs]);
  return (
    <div className="grid gap-5">
      <p className="text-xs text-stone-500">
        {t("med.docUpdated", { date: formatDate(locale, docs.fetchedAt) })}
      </p>
      {groups.map((g) => (
        <section key={g.doc} className="grid gap-2">
          <h2 className="font-semibold">
            {g.doc === "notice" ? t("med.docNotice") : t("med.docRcp")}
          </h2>
          <div className="card divide-y divide-stone-100 p-0 dark:divide-stone-800">
            {g.sections.map((s) => (
              <details
                key={s.id}
                id={`sec-${s.id}`}
                open={focus === s.id || undefined}
                className="group scroll-mt-20"
              >
                <summary
                  className={`cursor-pointer list-none px-4 py-3 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-800/50 ${s.level > 1 ? "pl-8" : ""} ${focus === s.id ? "bg-brand-50 dark:bg-brand-900/30" : ""}`}
                >
                  {s.title || "—"}
                </summary>
                <div className="doc-text px-4 pb-4 text-sm leading-relaxed text-stone-700 dark:text-stone-200">
                  {s.text}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
