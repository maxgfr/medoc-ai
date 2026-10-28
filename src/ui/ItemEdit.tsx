/** A box in the cabinet: added from a medicine page (pre-filled by the scan) or edited. */
import { type FormEvent, useEffect, useState } from "react";
import type { CountryId } from "../../shared/schema";
import { deleteItem, putItem } from "../db/db";
import { type Item, uid } from "../db/model";
import { useT } from "../i18n/react";
import { localDay } from "../reminders/schedule";
import { useMedicine } from "./hooks";
import { Avatar, Button, Empty, Field, LinkButton, Notice, PageTitle, Spinner } from "./kit";
import { go, href, type ScanInfo } from "./router";
import { useApp } from "./state";

export function ItemEdit(
  props: { id: string } | { country: CountryId; med: string; scan?: ScanInfo },
) {
  const t = useT();
  const { items } = useApp();
  if ("id" in props) {
    const item = items.find((i) => i.id === props.id);
    return item ? (
      <ItemForm initial={item} />
    ) : (
      <Empty icon="cabinet" title={t("common.notFound")} />
    );
  }
  return (
    <NewItem
      country={props.country}
      med={props.med}
      {...(props.scan ? { scan: props.scan } : {})}
    />
  );
}

function NewItem({ country, med, scan }: { country: CountryId; med: string; scan?: ScanInfo }) {
  const t = useT();
  const { active } = useApp();
  const m = useMedicine(country, med);
  if (m.status === "loading") return <Spinner />;
  if (m.status === "error" || !m.value) return <Empty icon="pill" title={t("common.unknownMed")} />;
  const pack = scan?.code
    ? m.value.packs.find((p) => p.code === scan.code)
    : m.value.packs.length === 1
      ? m.value.packs[0]
      : undefined;
  const item: Item = {
    id: uid(),
    profileId: active.id,
    country,
    medId: med,
    name: m.value.name,
    ...(pack ? { code: pack.code } : scan?.code ? { code: scan.code } : {}),
    ...(scan?.lot ? { lot: scan.lot } : {}),
    ...(scan?.expiry ? { expiry: scan.expiry } : {}),
    ...(scan?.serial ? { serial: scan.serial } : {}),
    ...(pack ? { quantity: pack.label } : {}),
    addedAt: new Date().toISOString(),
  };
  return <ItemForm initial={item} isNew />;
}

function ItemForm({ initial, isNew = false }: { initial: Item; isNew?: boolean }) {
  const t = useT();
  const { profiles, items, reload } = useApp();
  const [item, setItem] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setItem(initial), [initial]);
  const duplicate =
    isNew && item.serial
      ? items.some(
          (i) => i.serial === item.serial && i.code === item.code && i.medId === item.medId,
        )
      : false;

  const set = <K extends keyof Item>(k: K, v: string) =>
    setItem((prev) => {
      const next = { ...prev };
      if (v) (next as Record<string, unknown>)[k] = v;
      else delete next[k];
      return next;
    });

  async function save(e: FormEvent) {
    e.preventDefault();
    await putItem(item);
    await reload();
    go({ name: "cabinet" }, { replace: true });
  }

  async function finish(done: boolean) {
    const next = { ...item };
    if (done) next.finishedAt = new Date().toISOString();
    else delete next.finishedAt;
    await putItem(next);
    await reload();
    go({ name: "cabinet" }, { replace: true });
  }

  async function remove() {
    await deleteItem(item.id);
    await reload();
    go({ name: "cabinet" }, { replace: true });
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <PageTitle title={item.name} subtitle={t("cabinet.itemTitle")} />
      {duplicate ? <Notice tone="warn">{t("cabinet.duplicate")}</Notice> : null}
      <div className="card grid gap-4 sm:grid-cols-2">
        <Field label={t("cabinet.expiry")}>
          <input
            className="input"
            type="date"
            value={item.expiry ?? ""}
            onChange={(e) => set("expiry", e.target.value)}
          />
        </Field>
        <Field label={t("cabinet.lot")}>
          <input
            className="input font-mono"
            value={item.lot ?? ""}
            onChange={(e) => set("lot", e.target.value)}
          />
        </Field>
        <Field label={t("cabinet.quantity")} hint={t("cabinet.quantityHint")}>
          <input
            className="input"
            value={item.quantity ?? ""}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </Field>
        <Field label={t("cabinet.opened")}>
          <input
            className="input"
            type="date"
            max={localDay(new Date())}
            value={item.openedAt ?? ""}
            onChange={(e) => set("openedAt", e.target.value)}
          />
        </Field>
        {item.serial ? (
          <Field label={t("cabinet.serial")}>
            <input className="input font-mono" value={item.serial} readOnly />
          </Field>
        ) : null}
        {profiles.length > 1 ? (
          <Field label={t("cabinet.profile")}>
            <select
              className="input"
              value={item.profileId}
              onChange={(e) => set("profileId", e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <div className="sm:col-span-2">
          <Field label={t("cabinet.notes")}>
            <textarea
              className="input min-h-20"
              value={item.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" icon="check">
          {isNew ? t("common.add") : t("common.save")}
        </Button>
        <LinkButton
          variant="secondary"
          href={href({ name: "med", country: item.country, id: item.medId })}
          icon="doc"
        >
          {t("med.tabLeaflet")}
        </LinkButton>
        {!isNew ? (
          <>
            <LinkButton
              variant="secondary"
              href={href({
                name: "newTreatment",
                country: item.country,
                med: item.medId,
                item: item.id,
              })}
              icon="calendar"
            >
              {t("med.addTreatment")}
            </LinkButton>
            <Button variant="ghost" onClick={() => void finish(!item.finishedAt)}>
              {item.finishedAt ? t("cabinet.restore") : t("cabinet.markFinished")}
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
      {profiles.length > 1 ? (
        <p className="flex items-center gap-2 text-xs text-stone-500">
          {(() => {
            const p = profiles.find((x) => x.id === item.profileId);
            return p ? (
              <>
                <Avatar name={p.name} color={p.color} size="size-5" /> {p.name}
              </>
            ) : null;
          })()}
        </p>
      ) : null}
    </form>
  );
}
