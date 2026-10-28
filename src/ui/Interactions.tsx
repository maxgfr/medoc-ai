/** The interactions between every medicine of a profile, read from their documents by the model. */
import { useMemo, useState } from "react";
import type { CountryId, Docs } from "../../shared/schema";
import type { SourceDoc } from "../ai/context";
import { interactions, type Severity } from "../ai/medical";
import { countryModule } from "../countries/registry";
import { medicine } from "../data/repo";
import { useLocale, useT } from "../i18n/react";
import { localDay } from "../reminders/schedule";
import { Badge, Button, Empty, Notice, PageTitle } from "./kit";
import { AiSetup, useAiContext } from "./MedAi";
import { href } from "./router";
import { useApp, useMine } from "./state";

const TONE: Record<Severity, "danger" | "warn" | "info" | "neutral"> = {
  contraindicated: "danger",
  avoid: "danger",
  caution: "warn",
  info: "info",
};

type Result = Awaited<ReturnType<typeof interactions>> & { missing: number };

export function Interactions() {
  const t = useT();
  const locale = useLocale();
  const { active } = useApp();
  const { items, treatments } = useMine();
  const { ready, ctx } = useAiContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const today = localDay(new Date());

  // One entry per medicine: open boxes and ongoing treatments.
  const meds = useMemo(() => {
    const out = new Map<string, { country: CountryId; id: string; name: string }>();
    for (const i of items)
      if (!i.finishedAt)
        out.set(`${i.country}:${i.medId}`, { country: i.country, id: i.medId, name: i.name });
    for (const tr of treatments)
      if (!tr.paused && (!tr.end || tr.end >= today))
        out.set(`${tr.country}:${tr.medId}`, { country: tr.country, id: tr.medId, name: tr.name });
    return [...out.values()];
  }, [items, treatments, today]);

  async function run() {
    if (!ctx) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const docs: SourceDoc[] = [];
      let missing = 0;
      for (const [n, m] of meds.entries()) {
        const med = await medicine(m.country, m.id).catch(() => undefined);
        const d: Docs | null = med
          ? await countryModule(m.country)
              .docs(med)
              .catch(() => null)
          : null;
        if (d?.sections.length)
          docs.push({ key: `m${n + 1}`, medName: m.name, sections: d.sections });
        else missing++;
      }
      if (docs.length < 2) {
        setResult({ pairs: [], notes: [], ids: new Map(), truncated: false, missing });
        return;
      }
      setResult({ ...(await interactions({ ...ctx, t }, locale, docs)), missing });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ai.errUnknown"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PageTitle title={t("inter.title")} subtitle={active.name} />
      {meds.length < 2 ? (
        <Empty icon="interact" title={t("inter.needTwo")} />
      ) : !ready ? null : !ctx ? (
        <AiSetup />
      ) : (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {t("inter.intro", { name: active.name })}
          </p>
          <section className="card">
            <h2 className="label">{t("inter.meds")}</h2>
            <ul className="grid gap-1 text-sm">
              {meds.map((m) => (
                <li key={`${m.country}:${m.id}`}>
                  <a
                    href={href({ name: "med", country: m.country, id: m.id })}
                    className="hover:underline"
                  >
                    {countryModule(m.country).flag} {m.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <Button icon="interact" busy={busy} onClick={() => void run()} className="w-fit">
            {busy ? t("inter.running", { count: meds.length }) : t("inter.run")}
          </Button>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {result ? (
            <div className="grid gap-3">
              <Notice tone="warn">{t("inter.indicative")}</Notice>
              {result.missing ? (
                <Notice>{t("inter.missing", { count: result.missing })}</Notice>
              ) : null}
              {result.pairs.length ? (
                result.pairs.map((p) => (
                  <div key={`${p.a}-${p.b}-${p.severity}`} className="card grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE[p.severity]}>{t(`inter.${p.severity}`)}</Badge>
                      <span className="font-medium">
                        {p.a} + {p.b}
                      </span>
                    </div>
                    <p className="text-sm">{p.explanation}</p>
                    {p.citations.length ? (
                      <p className="text-xs text-stone-500">
                        {t("ai.sources")}:{" "}
                        {p.citations
                          .map((c) => {
                            const s = result.ids.get(c);
                            return s ? `${s.medName} — ${s.section.title}` : c;
                          })
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <Notice>{t("inter.none")}</Notice>
              )}
              {result.notes.length ? (
                <section className="card">
                  <h3 className="font-semibold">{t("inter.notes")}</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {result.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {result.truncated ? (
                <p className="text-xs text-stone-500">{t("ai.truncated")}</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
