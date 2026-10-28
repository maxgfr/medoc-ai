import { type FormEvent, useEffect, useState } from "react";
import type { CountryId } from "../../shared/schema";
import { countryModule, inScope, type Scope } from "../countries/registry";
import { type Hit, manifest, searchCountries } from "../data/repo";
import { useT } from "../i18n/react";
import { Badge, Empty, Icon, Notice, PageTitle, Spinner } from "./kit";
import { go, href } from "./router";
import { ScopeSelect } from "./ScopeSelect";
import { useApp } from "./state";

/**
 * Every country in scope at once. Static indexes are searched as you type;
 * a country searched through its live API (the US, openFDA) only when the
 * search is submitted, to spare the API's daily quota.
 */
export function Search({ q: initial = "" }: { q?: string }) {
  const t = useT();
  const { scope, available } = useApp();
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [liveCountries, setLiveCountries] = useState<CountryId[]>([]);
  const [waitingLive, setWaitingLive] = useState<CountryId[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => setQ(initial), [initial]);

  async function run(query: string, s: Scope, submitted: boolean) {
    if (query.trim().length < 2) {
      setHits(null);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const countries = inScope(s, available);
      const res = await searchCountries(countries, query, {
        live: submitted,
        liveSearch: (c, text) => countryModule(c).liveSearch?.(text),
      });
      setHits(res.hits);
      setLiveCountries(res.liveCountries);
      const live: CountryId[] = [];
      if (!submitted)
        for (const c of countries)
          if ((await manifest(c))?.search === "live" && countryModule(c).liveSearch) live.push(c);
      setWaitingLive(live);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: searches again when the text or the scope changes.
  useEffect(() => {
    const id = setTimeout(() => void run(q, scope, q === initial && Boolean(initial)), 180);
    return () => clearTimeout(id);
  }, [q, scope, available]);

  function submit(e: FormEvent) {
    e.preventDefault();
    go({ name: "search", q: q.trim() }, { replace: true });
    void run(q, scope, true);
  }

  const several = inScope(scope, available).length > 1;

  return (
    <div className="grid gap-4">
      <PageTitle title={t("search.title")} />
      <form onSubmit={submit} className="grid gap-2 sm:flex">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400"
          />
          <input
            className="input py-3 pl-10"
            type="search"
            enterKeyHint="search"
            // biome-ignore lint/a11y/noAutofocus: the search page exists to type in.
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("common.search")}
          />
        </div>
        <ScopeSelect className="input sm:w-auto" />
      </form>

      {!available.length ? <Notice tone="warn">{t("search.noIndex")}</Notice> : null}
      {error ? <Notice tone="error">{t("common.error")}</Notice> : null}
      {loading ? (
        <div className="flex justify-center py-6 text-stone-500">
          <Spinner className="size-5" />
        </div>
      ) : hits === null ? (
        <p className="text-sm text-stone-500">{t("search.hint")}</p>
      ) : (
        <>
          {waitingLive.length && q.trim().length >= 2 ? (
            <button
              type="button"
              onClick={() => void run(q, scope, true)}
              className="w-fit text-left text-sm text-brand-700 underline-offset-2 hover:underline dark:text-brand-400"
            >
              {t("search.liveHint", {
                countries: waitingLive
                  .map((c) => `${countryModule(c).flag} ${t(`country.${c}`)}`)
                  .join(", "),
              })}
            </button>
          ) : null}
          {liveCountries.length ? (
            <p className="text-xs text-stone-500">{t("search.live")}</p>
          ) : null}
          {hits.length ? (
            <ul className="card divide-y divide-stone-100 p-0 dark:divide-stone-800">
              {hits.map((h) => (
                <li key={`${h.country}:${h.id}`}>
                  <a
                    href={href({ name: "med", country: h.country, id: h.id })}
                    className="block px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-medium">
                        {several ? (
                          <span
                            className="mr-1.5"
                            role="img"
                            aria-label={t(`country.${h.country}`)}
                          >
                            {countryModule(h.country).flag}
                          </span>
                        ) : null}
                        {h.name}
                      </span>
                      {!h.marketed ? <Badge>{t("search.notMarketed")}</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">
                      {[h.substances, h.holder].filter(Boolean).join(" · ")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="search" title={t("search.empty")} />
          )}
        </>
      )}
    </div>
  );
}
