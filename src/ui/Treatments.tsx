import { useState } from "react";
import { db, getKv, setKv } from "../db/db";
import { formatDate } from "../i18n";
import { useLocale, useT } from "../i18n/react";
import { treatmentsToIcs } from "../reminders/ics";
import { askPermission, REMINDERS_KEY } from "../reminders/notify";
import { adherence, localDay } from "../reminders/schedule";
import { useLoad } from "./hooks";
import { Badge, Button, downloadFile, Empty, LinkButton, Notice, PageTitle } from "./kit";
import { href } from "./router";
import { useApp, useMine } from "./state";

export function Treatments() {
  const t = useT();
  const locale = useLocale();
  const { active } = useApp();
  const { treatments } = useMine();
  const today = localDay(new Date());
  const all = useLoad(async () => (await db()).getAll("intakes"), [treatments]);
  const reminders = useLoad(() => getKv<boolean>(REMINDERS_KEY), []);
  const [remindersOn, setRemindersOn] = useState<boolean | null>(null);
  const on = remindersOn ?? (reminders.status === "ready" ? Boolean(reminders.value) : false);

  const current = treatments.filter((x) => !x.end || x.end >= today);
  const past = treatments.filter((x) => x.end && x.end < today);

  function exportIcs() {
    const ics = treatmentsToIcs(current, {
      calendarName: t("treat.icsName", { name: active.name }),
      summary: (tr, amount, unit) => t("treat.icsSummary", { amount, unit, name: tr.name }),
      description: (tr) => [tr.notes, t("common.disclaimer")].filter(Boolean).join("\n\n"),
    });
    downloadFile(
      `medoc-${active.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "treatments"}.ics`,
      ics,
      "text/calendar",
    );
  }

  async function toggleReminders() {
    if (!on) {
      const p = await askPermission();
      if (p !== "granted") return;
    }
    await setKv(REMINDERS_KEY, !on);
    setRemindersOn(!on);
  }

  const weekdays = t("treat.weekdays").split(",");

  return (
    <div className="grid gap-4">
      <PageTitle title={t("treat.title")} subtitle={active.name}>
        <LinkButton href={href({ name: "today" })} variant="secondary" icon="today">
          {t("today.title")}
        </LinkButton>
      </PageTitle>
      {treatments.length ? (
        <>
          {[current, past].map((list, n) =>
            list.length ? (
              <ul
                key={n === 0 ? "current" : "past"}
                className="card divide-y divide-stone-100 p-0 dark:divide-stone-800"
              >
                {list.map((tr) => {
                  const a =
                    all.status === "ready"
                      ? adherence(
                          [tr],
                          all.value.filter((i) => i.treatmentId === tr.id),
                          today,
                        )
                      : null;
                  return (
                    <li key={tr.id}>
                      <a
                        href={href({ name: "treatment", id: tr.id })}
                        className="grid gap-1 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium">{tr.name}</span>
                          {tr.paused ? (
                            <Badge>{t("treat.paused")}</Badge>
                          ) : n === 1 ? (
                            <Badge>{t("treat.ended")}</Badge>
                          ) : (
                            <Badge tone="ok">{t("treat.active")}</Badge>
                          )}
                        </span>
                        <span className="text-xs text-stone-500 dark:text-stone-400">
                          {tr.doses
                            .map((d) =>
                              t("treat.schedule", { amount: d.amount, unit: d.unit, time: d.time }),
                            )
                            .join(" · ")}
                          {tr.days.length && tr.days.length < 7
                            ? ` · ${tr.days.map((d) => weekdays[d]).join(", ")}`
                            : ""}
                        </span>
                        <span className="text-xs text-stone-500 dark:text-stone-400">
                          {formatDate(locale, tr.start)}
                          {tr.end ? ` → ${formatDate(locale, tr.end)}` : ""}
                          {a?.due
                            ? ` · ${t("treat.adherence", { taken: a.taken, due: a.due })}`
                            : ""}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null,
          )}
          <section className="card grid gap-3">
            <h2 className="font-semibold">{t("treat.exportIcs")}</h2>
            <p className="text-sm text-stone-600 dark:text-stone-300">{t("treat.exportIcsHint")}</p>
            <Button
              variant="secondary"
              icon="download"
              onClick={exportIcs}
              disabled={!current.length}
              className="w-fit"
            >
              {t("treat.exportIcs")}
            </Button>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-brand-600"
                checked={on}
                onChange={() => void toggleReminders()}
              />
              <span>
                <span className="font-medium">{t("treat.remindersOn")}</span>
                <span className="block text-xs text-stone-500">{t("treat.remindersHint")}</span>
              </span>
            </label>
          </section>
        </>
      ) : (
        <Empty icon="pill" title={t("treat.empty")}>
          <LinkButton href={href({ name: "search" })} icon="search">
            {t("common.search")}
          </LinkButton>
        </Empty>
      )}
      <Notice>{t("common.disclaimer")}</Notice>
    </div>
  );
}
