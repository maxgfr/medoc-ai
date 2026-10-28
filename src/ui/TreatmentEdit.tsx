import { type FormEvent, useState } from "react";
import type { CountryId } from "../../shared/schema";
import { deleteTreatment, putTreatment } from "../db/db";
import { type Dose, type Treatment, uid } from "../db/model";
import { useT } from "../i18n/react";
import { localDay } from "../reminders/schedule";
import { useMedicine } from "./hooks";
import { Button, Empty, Field, Icon, LinkButton, PageTitle, Spinner } from "./kit";
import { go, href } from "./router";
import { useApp } from "./state";

export function TreatmentEdit(
  props: { id: string } | { country: CountryId; med: string; item?: string },
) {
  const t = useT();
  const { treatments } = useApp();
  if ("id" in props) {
    const tr = treatments.find((x) => x.id === props.id);
    return tr ? <TreatmentForm initial={tr} /> : <Empty icon="pill" title={t("common.notFound")} />;
  }
  return (
    <NewTreatment
      country={props.country}
      med={props.med}
      {...(props.item ? { item: props.item } : {})}
    />
  );
}

/** A tablet-like default unit from the form ("comprimé pelliculé" → "comprimé"). */
function unitFor(form: string | undefined, fallback: string): string {
  if (!form) return fallback;
  const first = form.split(/[\s,]/)[0]?.toLowerCase();
  return first && first.length < 16 ? first : fallback;
}

function NewTreatment({ country, med, item }: { country: CountryId; med: string; item?: string }) {
  const t = useT();
  const { active } = useApp();
  const m = useMedicine(country, med);
  if (m.status === "loading") return <Spinner />;
  if (m.status === "error" || !m.value) return <Empty icon="pill" title={t("common.unknownMed")} />;
  const tr: Treatment = {
    id: uid(),
    profileId: active.id,
    country,
    medId: med,
    name: m.value.name,
    ...(item ? { itemId: item } : {}),
    doses: [{ time: "08:00", amount: "1", unit: unitFor(m.value.form, t("treat.unitDefault")) }],
    days: [],
    start: localDay(new Date()),
    createdAt: new Date().toISOString(),
  };
  return <TreatmentForm initial={tr} isNew />;
}

function TreatmentForm({ initial, isNew = false }: { initial: Treatment; isNew?: boolean }) {
  const t = useT();
  const { reload, items, profiles } = useApp();
  const [tr, setTr] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const boxes = items.filter(
    (i) => i.profileId === tr.profileId && i.medId === tr.medId && i.country === tr.country,
  );
  const weekdays = t("treat.weekdays").split(",");
  // Monday first in the picker.
  const order = [1, 2, 3, 4, 5, 6, 0];

  const setDose = (i: number, patch: Partial<Dose>) =>
    setTr((p) => ({ ...p, doses: p.doses.map((d, n) => (n === i ? { ...d, ...patch } : d)) }));
  const setOpt = (k: "end" | "notes" | "itemId", v: string) =>
    setTr((p) => {
      const next = { ...p };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });

  async function save(e: FormEvent) {
    e.preventDefault();
    const doses = [...tr.doses].sort((a, b) => a.time.localeCompare(b.time));
    await putTreatment({ ...tr, doses });
    await reload();
    go({ name: "treatments" }, { replace: true });
  }

  async function remove() {
    await deleteTreatment(tr.id);
    await reload();
    go({ name: "treatments" }, { replace: true });
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <PageTitle title={tr.name} subtitle={isNew ? t("treat.new") : t("treat.edit")} />
      <section className="card grid gap-3">
        <h2 className="font-semibold">{t("treat.doses")}</h2>
        {tr.doses.map((d, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positions in a controlled list; a key on the time would remount the row while it is typed in.
            key={i}
            className="grid grid-cols-[auto_5rem_1fr_auto] items-end gap-2"
          >
            <Field label={t("treat.time")}>
              <input
                className="input"
                type="time"
                required
                value={d.time}
                onChange={(e) => setDose(i, { time: e.target.value })}
              />
            </Field>
            <Field label={t("treat.amount")}>
              <input
                className="input"
                inputMode="decimal"
                required
                value={d.amount}
                onChange={(e) => setDose(i, { amount: e.target.value })}
              />
            </Field>
            <Field label={t("treat.unit")}>
              <input
                className="input"
                required
                value={d.unit}
                onChange={(e) => setDose(i, { unit: e.target.value })}
              />
            </Field>
            <button
              type="button"
              className="mb-1 rounded-lg p-2 text-stone-500 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800"
              aria-label={t("common.delete")}
              disabled={tr.doses.length === 1}
              onClick={() => setTr((p) => ({ ...p, doses: p.doses.filter((_, n) => n !== i) }))}
            >
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          icon="plus"
          className="w-fit"
          onClick={() =>
            setTr((p) => ({
              ...p,
              doses: [
                ...p.doses,
                {
                  ...(p.doses.at(-1) ?? { amount: "1", unit: t("treat.unitDefault") }),
                  time: "20:00",
                },
              ],
            }))
          }
        >
          {t("treat.addDose")}
        </Button>
      </section>

      <section className="card grid gap-3">
        <h2 className="font-semibold">{t("treat.days")}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="chip"
            aria-pressed={!tr.days.length}
            onClick={() => setTr((p) => ({ ...p, days: [] }))}
          >
            {t("treat.everyDay")}
          </button>
          {order.map((d) => (
            <button
              key={d}
              type="button"
              className="chip"
              aria-pressed={tr.days.includes(d)}
              onClick={() =>
                setTr((p) => {
                  const days = p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d];
                  return { ...p, days: days.length === 7 ? [] : days.sort() };
                })
              }
            >
              {weekdays[d]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("treat.start")}>
            <input
              className="input"
              type="date"
              required
              value={tr.start}
              onChange={(e) => setTr((p) => ({ ...p, start: e.target.value }))}
            />
          </Field>
          <Field label={t("treat.end")} hint={t("treat.endHint")}>
            <input
              className="input"
              type="date"
              min={tr.start}
              value={tr.end ?? ""}
              onChange={(e) => setOpt("end", e.target.value)}
            />
          </Field>
        </div>
        {boxes.length ? (
          <Field label={t("treat.box")}>
            <select
              className="input"
              value={tr.itemId ?? ""}
              onChange={(e) => setOpt("itemId", e.target.value)}
            >
              <option value="">{t("treat.noBox")}</option>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {[b.lot, b.expiry, b.quantity].filter(Boolean).join(" · ") || b.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={t("treat.notes")}>
          <input
            className="input"
            placeholder={t("treat.notesHint")}
            value={tr.notes ?? ""}
            onChange={(e) => setOpt("notes", e.target.value)}
          />
        </Field>
        {profiles.length > 1 ? (
          <Field label={t("cabinet.profile")}>
            <select
              className="input"
              value={tr.profileId}
              onChange={(e) => setTr((p) => ({ ...p, profileId: e.target.value }))}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" icon="check">
          {t("common.save")}
        </Button>
        <LinkButton
          variant="secondary"
          href={href({ name: "med", country: tr.country, id: tr.medId })}
          icon="doc"
        >
          {t("med.tabLeaflet")}
        </LinkButton>
        {!isNew ? (
          <>
            <Button variant="ghost" onClick={() => setTr((p) => ({ ...p, paused: !p.paused }))}>
              {tr.paused ? t("treat.resume") : t("treat.pause")}
            </Button>
            {confirm ? (
              <span className="flex items-center gap-2 text-sm">
                {t("common.confirmDelete")}
                <Button variant="danger" onClick={() => void remove()}>
                  {t("common.yes")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(false)}>
                  {t("common.no")}
                </Button>
              </span>
            ) : (
              <Button variant="danger" icon="trash" onClick={() => setConfirm(true)}>
                {t("common.delete")}
              </Button>
            )}
          </>
        ) : null}
      </div>
    </form>
  );
}
