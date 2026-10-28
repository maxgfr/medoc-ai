import { type FormEvent, useEffect, useState } from "react";
import type { CountryId } from "../../shared/schema";
import { countryModule } from "../countries/registry";
import { type Hit, searchStatic } from "../data/repo";
import { useT } from "../i18n/react";
import { Badge, Empty, Icon, Notice, PageTitle, Spinner } from "./kit";
import { go, href } from "./router";
import { useApp } from "./state";

/** Static index: as you type. Live API (US): on submit, to spare openFDA's daily quota. */
export function Search({ q: initial = "" }: { q?: string }) {
  const t = useT();
  const { country, setCountry, available } = useApp();
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => setQ(initial), [initial]);

  async function run(query: string, c: CountryId, submitted: boolean) {
    if (query.trim().length < 2) {
      setHits(null);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const fromIndex = await searchStatic(c, query);
      if (fromIndex) {
        setLive(false);
        setHits(fromIndex);
      } else if (submitted) {
        const mod = countryModule(c);
        setLive(true);
        setHits(mod.liveSearch ? await mod.liveSearch(query) : []);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: searches again when the text or the country changes.
  useEffect(() => {
    const id = setTimeout(() => void run(q, country, q === initial), 180);
    return () => clearTimeout(id);
  }, [q, country]);

  function submit(e: FormEvent) {
    e.preventDefault();
    go({ name: "search", q: q.trim() }, { replace: true });
    void run(q, country, true);
  }

  return (
    <div className="grid gap-4">
      <PageTitle title={t("search.title")} />
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400"
          />
          <input
            className="input py-3 pl-10"
            type="search"
            // biome-ignore lint/a11y/noAutofocus: the search page exists to type in.
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("common.search")}
          />
        </div>
        {available.length > 1 ? (
          <select
            className="input w-auto"
            value={country}
            onChange={(e) => void setCountry(e.target.value as CountryId)}
            aria-label={t("country.label")}
          >
            {available.map((c) => (
              <option key={c} value={c}>
                {countryModule(c).flag} {t(`country.${c}`)}
              </option>
            ))}
          </select>
        ) : null}
      </form>

      {!available.length ? <Notice tone="warn">{t("search.noIndex")}</Notice> : null}
      {error ? <Notice tone="error">{t("common.error")}</Notice> : null}
      {loading ? (
        <div className="flex justify-center py-6 text-stone-500">
          <Spinner className="size-5" />
        </div>
      ) : hits === null ? (
        <p className="text-sm text-stone-500">{t("search.hint")}</p>
      ) : hits.length ? (
        <>
          {live ? <p className="text-xs text-stone-500">{t("search.live")}</p> : null}
          <ul className="card divide-y divide-stone-100 p-0 dark:divide-stone-800">
            {hits.map((h) => (
              <li key={h.id}>
                <a
                  href={href({ name: "med", country, id: h.id })}
                  className="block px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium">{h.name}</span>
                    {!h.marketed ? <Badge>{t("search.notMarketed")}</Badge> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">
                    {[h.substances, h.holder].filter(Boolean).join(" · ")}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty icon="search" title={t("search.empty")} />
      )}
    </div>
  );
}
