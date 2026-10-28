import { useState } from "react";
import { deleteIntake, intakesOn, putIntake } from "../db/db";
import { formatDate } from "../i18n";
import { useLocale, useT } from "../i18n/react";
import { addDays, type DueDose, dosesOn, intakeId, localDay } from "../reminders/schedule";
import { useLoad } from "./hooks";
import { Badge, Button, Empty, Icon, LinkButton, PageTitle, Spinner } from "./kit";
import { go, href } from "./router";
import { useApp, useMine } from "./state";

export function Today({ date }: { date?: string }) {
  const t = useT();
  const locale = useLocale();
  const { active } = useApp();
  const { treatments } = useMine();
  const today = localDay(new Date());
  const day = date ?? today;
  const [version, setVersion] = useState(0);
  const intakes = useLoad(() => intakesOn(day), [day, version]);
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  async function record(d: DueDose, status: "taken" | "skipped" | null) {
    const id = intakeId(d.treatment.id, d.date, d.time);
    if (status === null) await deleteIntake(id);
    else
      await putIntake({
        id,
        treatmentId: d.treatment.id,
        profileId: d.treatment.profileId,
        date: d.date,
        time: d.time,
        status,
        at: new Date().toISOString(),
      });
    setVersion((v) => v + 1);
  }

  const doses = intakes.status === "ready" ? dosesOn(treatments, intakes.value, day) : [];

  return (
    <div className="grid gap-4">
      <PageTitle
        title={day === today ? t("today.title") : formatDate(locale, day, "long")}
        subtitle={active.name}
      >
        <LinkButton href={href({ name: "treatments" })} variant="secondary" icon="pill">
          {t("treat.title")}
        </LinkButton>
      </PageTitle>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-lg p-2 hover:bg-stone-200 dark:hover:bg-stone-800"
          aria-label={t("today.prevDay")}
          onClick={() => go({ name: "today", date: addDays(day, -1) }, { replace: true })}
        >
          <Icon name="left" />
        </button>
        <span className="text-sm font-medium">{formatDate(locale, day, "long")}</span>
        <button
          type="button"
          className="rounded-lg p-2 hover:bg-stone-200 dark:hover:bg-stone-800"
          aria-label={t("today.nextDay")}
          onClick={() => go({ name: "today", date: addDays(day, 1) }, { replace: true })}
        >
          <Icon name="right" />
        </button>
      </div>
      {intakes.status === "loading" ? (
        <Spinner />
      ) : doses.length ? (
        <ul className="grid gap-2">
          {doses.map((d) => {
            const late = !d.intake && (day < today || (day === today && d.time < nowTime));
            return (
              <li
                key={`${d.treatment.id}-${d.time}`}
                className={`card flex flex-wrap items-center gap-3 py-3 ${d.intake?.status === "taken" ? "opacity-70" : ""}`}
              >
                <span className="num w-14 text-lg font-bold">{d.time}</span>
                <span className="min-w-0 flex-1">
                  <a
                    href={href({ name: "treatment", id: d.treatment.id })}
                    className="block truncate font-medium hover:underline"
                  >
                    {d.treatment.name}
                  </a>
                  <span className="text-xs text-stone-500">
                    {d.amount} {d.unit}
                    {d.treatment.notes ? ` · ${d.treatment.notes}` : ""}
                  </span>
                </span>
                {d.intake ? (
                  <span className="flex items-center gap-2">
                    <Badge tone={d.intake.status === "taken" ? "ok" : "neutral"}>
                      {d.intake.status === "taken" ? t("today.taken") : t("today.skipped")}
                    </Badge>
                    <Button variant="ghost" onClick={() => void record(d, null)}>
                      {t("today.undo")}
                    </Button>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    {late ? <Badge tone="warn">{t("today.late")}</Badge> : null}
                    <Button variant="ghost" onClick={() => void record(d, "skipped")}>
                      {t("today.skip")}
                    </Button>
                    <Button icon="check" onClick={() => void record(d, "taken")}>
                      {t("today.taken")}
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon="today" title={treatments.length ? t("today.nothing") : t("treat.empty")} />
      )}
    </div>
  );
}
