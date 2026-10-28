import { useState } from "react";
import { expiryState } from "../alerts/match";
import { countryModule } from "../countries/registry";
import { formatDate } from "../i18n";
import { useLocale, useT } from "../i18n/react";
import { localDay } from "../reminders/schedule";
import { Badge, Empty, LinkButton, PageTitle } from "./kit";
import { href } from "./router";
import { useApp, useMine } from "./state";

type Filter = "all" | "expired" | "soon" | "alerts" | "finished";

export function Cabinet() {
  const t = useT();
  const locale = useLocale();
  const { active } = useApp();
  const { items, concerns } = useMine();
  const [filter, setFilter] = useState<Filter>("all");
  const today = localDay(new Date());
  const alerted = new Set(concerns.filter((c) => c.alert).map((c) => c.itemId));

  const shown = items
    .filter((i) => {
      const state = expiryState(i.expiry, today);
      switch (filter) {
        case "finished":
          return Boolean(i.finishedAt);
        case "expired":
          return !i.finishedAt && state === "expired";
        case "soon":
          return !i.finishedAt && state === "soon";
        case "alerts":
          return !i.finishedAt && alerted.has(i.id);
        default:
          return !i.finishedAt;
      }
    })
    .sort(
      (a, b) =>
        (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999") || a.name.localeCompare(b.name),
    );

  const filters: [Filter, string][] = [
    ["all", t("cabinet.filterAll")],
    ["expired", t("cabinet.filterExpired")],
    ["soon", t("cabinet.filterSoon")],
    ["alerts", t("cabinet.filterAlerts")],
    ["finished", t("cabinet.filterFinished")],
  ];

  return (
    <div className="grid gap-4">
      <PageTitle title={t("cabinet.title")} subtitle={active.name}>
        <LinkButton href={href({ name: "scan" })} icon="scan">
          {t("common.navScan")}
        </LinkButton>
      </PageTitle>
      {items.length ? (
        <>
          <div className="flex flex-wrap gap-2">
            {filters.map(([f, label]) => (
              <button
                key={f}
                type="button"
                className="chip"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>
          <ul className="card divide-y divide-stone-100 p-0 dark:divide-stone-800">
            {shown.map((i) => {
              const state = expiryState(i.expiry, today);
              return (
                <li key={i.id}>
                  <a
                    href={href({ name: "item", id: i.id })}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  >
                    <span aria-hidden="true">{countryModule(i.country).flag}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.name}</span>
                      <span className="block text-xs text-stone-500 dark:text-stone-400">
                        {i.expiry
                          ? state === "expired"
                            ? t("alert.expiredOn", { date: formatDate(locale, i.expiry) })
                            : t("alert.expiresOn", { date: formatDate(locale, i.expiry) })
                          : t("cabinet.noExpiry")}
                        {i.quantity ? ` · ${i.quantity}` : ""}
                      </span>
                    </span>
                    {i.finishedAt ? (
                      <Badge>{t("cabinet.finished")}</Badge>
                    ) : state === "expired" ? (
                      <Badge tone="danger">{t("alert.expired")}</Badge>
                    ) : state === "soon" ? (
                      <Badge tone="warn">{t("alert.soon")}</Badge>
                    ) : alerted.has(i.id) ? (
                      <Badge tone="warn">{t("cabinet.filterAlerts")}</Badge>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <Empty icon="cabinet" title={t("cabinet.empty")}>
          <LinkButton href={href({ name: "scan" })} icon="scan">
            {t("home.scanCta")}
          </LinkButton>
        </Empty>
      )}
    </div>
  );
}
