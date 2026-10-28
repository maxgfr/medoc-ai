import { type FormEvent, useState } from "react";
import { expiryState } from "../alerts/match";
import { intakesOn } from "../db/db";
import { formatDate } from "../i18n";
import { useLocale, useT } from "../i18n/react";
import { dosesOn, localDay } from "../reminders/schedule";
import { ConcernRow } from "./Alerts";
import { useLoad } from "./hooks";
import { Badge, Icon } from "./kit";
import { go, href } from "./router";
import { StatusLine } from "./Status";
import { useApp, useMine } from "./state";

export function Home() {
  const t = useT();
  const locale = useLocale();
  const { active, profiles } = useApp();
  const { items, treatments, concerns } = useMine();
  const [q, setQ] = useState("");
  const today = localDay(new Date());
  const intakes = useLoad(() => intakesOn(today), [today, treatments]);
  const doses = intakes.status === "ready" ? dosesOn(treatments, intakes.value, today) : [];
  const soon = items
    .filter((i) => !i.finishedAt && ["expired", "soon"].includes(expiryState(i.expiry, today)))
    .sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? ""));
  const fresh = !items.length && !treatments.length;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (q.trim()) go({ name: "search", q: q.trim() });
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {profiles.length > 1 ? t("home.greeting", { name: active.name }) : t("common.tagline")}
        </h1>
      </div>

      <a
        href={href({ name: "scan" })}
        className="flex items-center gap-4 rounded-2xl bg-brand-700 p-5 text-white shadow-sm transition hover:bg-brand-800 dark:bg-brand-600"
      >
        <span className="grid size-14 place-items-center rounded-xl bg-white/15">
          <Icon name="scan" className="size-8" />
        </span>
        <span>
          <span className="block text-lg font-bold">{t("home.scanCta")}</span>
          <span className="text-sm text-white/80">{t("home.scanHint")}</span>
        </span>
      </a>

      <form onSubmit={submit} className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400"
        />
        <input
          className="input py-3 pl-10"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("home.searchPlaceholder")}
          aria-label={t("common.search")}
        />
      </form>

      {fresh ? (
        <section className="card">
          <h2 className="font-semibold">{t("home.firstTitle")}</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{t("home.firstBody")}</p>
        </section>
      ) : null}

      {concerns.length ? (
        <section className="grid gap-2">
          <h2 className="flex items-center justify-between font-semibold">
            {t("home.alerts", { count: concerns.length })}
            <a
              href={href({ name: "alerts" })}
              className="text-sm font-medium text-brand-700 dark:text-brand-400"
            >
              {t("alert.title")}
            </a>
          </h2>
          {concerns.slice(0, 3).map((c) => (
            <ConcernRow key={`${c.kind}-${c.alert?.id ?? c.itemId}-${c.medId}`} concern={c} />
          ))}
        </section>
      ) : null}

      {treatments.length ? (
        <section className="card grid gap-2">
          <h2 className="flex items-center justify-between font-semibold">
            {t("home.today")}
            <a
              href={href({ name: "today" })}
              className="text-sm font-medium text-brand-700 dark:text-brand-400"
            >
              {t("today.title")}
            </a>
          </h2>
          {doses.length ? (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {doses.map((d) => (
                <li
                  key={`${d.treatment.id}-${d.time}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="num w-12 font-semibold">{d.time}</span>
                  <span className="flex-1 truncate">{d.treatment.name}</span>
                  {d.intake ? (
                    <Badge tone={d.intake.status === "taken" ? "ok" : "neutral"}>
                      {d.intake.status === "taken" ? t("today.taken") : t("today.skipped")}
                    </Badge>
                  ) : (
                    <span className="text-xs text-stone-500">
                      {d.amount} {d.unit}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">{t("home.noDoses")}</p>
          )}
        </section>
      ) : null}

      {soon.length ? (
        <section className="card grid gap-2">
          <h2 className="font-semibold">{t("home.expiring")}</h2>
          <ul className="grid gap-1 text-sm">
            {soon.slice(0, 5).map((i) => (
              <li key={i.id}>
                <a
                  href={href({ name: "item", id: i.id })}
                  className="flex justify-between gap-3 hover:underline"
                >
                  <span className="truncate">{i.name}</span>
                  <span
                    className={
                      expiryState(i.expiry, today) === "expired"
                        ? "text-rose-600"
                        : "text-amber-700 dark:text-amber-400"
                    }
                  >
                    {i.expiry ? formatDate(locale, i.expiry) : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <StatusLine />
      <p className="text-xs text-stone-500 dark:text-stone-400">{t("common.disclaimer")}</p>
    </div>
  );
}
