/** The AI tabs of a medicine: a plain-language summary and questions, both citing the leaflet. */
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Docs, Medicine } from "../../shared/schema";
import type { CallContext } from "../ai/call";
import type { SourceDoc } from "../ai/context";
import { type AnswerEnd, askStream, type Summary, summarize, type Turn } from "../ai/medical";
import { loadLlmSettings, modelLabel, savedSettings } from "../ai/settings";
import { aiCached, setAiCache } from "../db/db";
import { formatDate, type TextKey } from "../i18n";
import { useLocale, useT } from "../i18n/react";
import { Badge, Button, LinkButton, Notice, Spinner } from "./kit";
import { Md } from "./Markdown";
import { href } from "./router";

/** The saved settings once loaded, or null when no model is set up. */
export function useAiContext(): { ready: boolean; ctx: Omit<CallContext, "t"> | null } {
  const [state, setState] = useState<{ ready: boolean; ctx: Omit<CallContext, "t"> | null }>({
    ready: false,
    ctx: null,
  });
  useEffect(() => {
    void loadLlmSettings().then(() => {
      const settings = savedSettings();
      setState({ ready: true, ctx: settings ? { settings } : null });
    });
  }, []);
  return state;
}

export function AiSetup() {
  const t = useT();
  return (
    <div className="card grid justify-items-start gap-3">
      <p className="text-sm text-stone-600 dark:text-stone-300">{t("ai.needSetup")}</p>
      <LinkButton href={href({ name: "settings" })} icon="spark">
        {t("ai.setup")}
      </LinkButton>
    </div>
  );
}

export function Citations({
  ids,
  titles,
  onCite,
}: {
  ids: string[];
  titles: Map<string, string>;
  onCite: (sectionId: string) => void;
}) {
  const t = useT();
  if (!ids.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-stone-500">{t("ai.sources")}</span>
      {ids.map((id) => {
        const sectionId = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onCite(sectionId)}
            className="rounded-full border border-stone-300 px-2 py-0.5 text-stone-600 hover:border-brand-500 hover:text-brand-700 dark:border-stone-700 dark:text-stone-300"
          >
            {(titles.get(id) ?? sectionId).slice(0, 60)}
          </button>
        );
      })}
    </div>
  );
}

const sourceOf = (med: Medicine, docs: Docs): SourceDoc => ({
  key: "m1",
  medName: med.name,
  sections: docs.sections,
});

const titlesOf = (docs: Docs) => new Map(docs.sections.map((s) => [s.id, s.title || s.id]));

type SavedSummary = Summary & { truncated: boolean; at: string };

export function MedSummary({
  med,
  docs,
  onCite,
}: {
  med: Medicine;
  docs: Docs;
  onCite: (id: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const { ready, ctx } = useAiContext();
  const [summary, setSummary] = useState<SavedSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = ctx
    ? `summary:${med.country}:${med.id}:${docs.fetchedAt}:${ctx.settings.model}:${locale}`
    : "";

  useEffect(() => {
    if (key) void aiCached<SavedSummary>(key).then((s) => s && setSummary(s));
  }, [key]);

  async function run() {
    if (!ctx) return;
    setBusy(true);
    setError(null);
    try {
      const out = await summarize({ ...ctx, t }, locale, sourceOf(med, docs));
      const saved: SavedSummary = {
        purpose: out.purpose,
        howToTake: out.howToTake,
        doNotTake: out.doNotTake,
        sideEffects: out.sideEffects,
        warnings: out.warnings,
        citations: out.citations,
        truncated: out.truncated,
        at: new Date().toISOString(),
      };
      setSummary(saved);
      await setAiCache(key, saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ai.errUnknown"));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Spinner />;
  if (!ctx) return <AiSetup />;
  const headings = [
    ["purpose", t("ai.purpose")],
    ["howToTake", t("ai.howToTake")],
    ["doNotTake", t("ai.doNotTake")],
    ["sideEffects", t("ai.sideEffects")],
    ["warnings", t("ai.warnings")],
  ] as const;

  return (
    <div className="grid gap-3">
      <Notice tone="warn">{t("ai.disclaimer")}</Notice>
      {summary ? (
        <div className="card grid gap-4">
          {headings.map(([k, label]) =>
            summary[k].length ? (
              <section key={k}>
                <h3 className="font-semibold">{label}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {summary[k].map((line) => (
                    <li key={line}>
                      <Md text={line} inline />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          <Citations ids={summary.citations} titles={titlesOf(docs)} onCite={onCite} />
          {summary.truncated ? <p className="text-xs text-stone-500">{t("ai.truncated")}</p> : null}
          <p className="text-xs text-stone-500">
            {t("ai.cached", { date: formatDate(locale, summary.at) })}
          </p>
        </div>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex items-center gap-3">
        <Button icon="spark" busy={busy} onClick={() => void run()}>
          {summary ? t("ai.regenerate") : t("ai.summarize")}
        </Button>
        {busy ? (
          <span className="text-sm text-stone-500">
            {t("ai.generating", { model: modelLabel(ctx.settings) })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface AskTurn extends Turn {
  id: string;
  citations: string[];
  end?: AnswerEnd;
}

const END_MESSAGES: Record<Exclude<AnswerEnd, "stopped">, TextKey> = {
  length: "ai.endLength",
  truncated: "ai.endTruncated",
  refusal: "ai.endRefusal",
  "content-filter": "ai.endFilter",
};

/** Questions about the medicine: answers stream in Markdown, their citations open the leaflet. */
export function MedAsk({
  med,
  docs,
  onCite,
}: {
  med: Medicine;
  docs: Docs;
  onCite: (id: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const { ready, ctx } = useAiContext();
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [live, setLive] = useState<{ question: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const titles = titlesOf(docs);

  useEffect(() => () => abort.current?.abort(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!ctx || !q || live) return;
    setError(null);
    setQuestion("");
    setLive({ question: q, text: "" });
    abort.current = new AbortController();
    try {
      const out = await askStream(
        { ...ctx, t, signal: abort.current.signal },
        locale,
        sourceOf(med, docs),
        q,
        turns,
        (text) => setLive({ question: q, text }),
      );
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          question: q,
          answer: out.text,
          citations: out.citations,
          ...(out.end ? { end: out.end } : {}),
        },
      ]);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : t("ai.errUnknown"));
        setQuestion(q);
      }
    } finally {
      setLive(null);
      abort.current = null;
    }
  }

  if (!ready) return <Spinner />;
  if (!ctx) return <AiSetup />;
  const bubbles = [
    ...turns,
    ...(live ? [{ id: "live", question: live.question, answer: live.text, citations: [] }] : []),
  ];
  return (
    <div className="grid gap-3">
      <Notice tone="warn">{t("ai.disclaimer")}</Notice>
      {bubbles.map((turn) => (
        <div key={turn.id} className="grid gap-2">
          <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand-700 px-3 py-2 text-sm text-white dark:bg-brand-600">
            {turn.question}
          </p>
          <div
            className="card grid max-w-[95%] gap-2 text-sm"
            aria-live={turn.id === "live" ? "polite" : undefined}
          >
            {turn.answer ? (
              <Md text={turn.answer} titles={titles} onCite={onCite} />
            ) : (
              <span className="flex items-center gap-2 text-stone-500">
                <Spinner /> {t("ai.generating", { model: modelLabel(ctx.settings) })}
              </span>
            )}
            {"end" in turn && turn.end && turn.end !== "stopped" ? (
              <Badge tone="warn">{t(END_MESSAGES[turn.end])}</Badge>
            ) : null}
            <Citations ids={turn.citations} titles={titles} onCite={onCite} />
          </div>
        </div>
      ))}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <form onSubmit={submit} className="flex gap-2">
        <input
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("ai.askPlaceholder")}
          aria-label={t("ai.ask")}
        />
        {live ? (
          <Button variant="secondary" icon="close" onClick={() => abort.current?.abort()}>
            {t("ai.stop")}
          </Button>
        ) : (
          <Button type="submit" icon="send" disabled={!question.trim()}>
            {t("ai.ask")}
          </Button>
        )}
      </form>
    </div>
  );
}
