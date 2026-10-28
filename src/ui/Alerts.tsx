import { useState } from "react";
import type { Manifest } from "../../shared/schema";
import type { Concern } from "../alerts/match";
import { countryModule } from "../countries/registry";
import { setKv } from "../db/db";
import { formatDate } from "../i18n";
import { useLocale, useT } from "../i18n/react";
import { askPermission, REMINDERS_KEY } from "../reminders/notify";
import { Avatar, Badge, Button, Empty, ExternalLink, Notice, PageTitle } from "./kit";
import { href } from "./router";
import { useApp } from "./state";

const TONE: Record<Concern["kind"], "danger" | "warn" | "info" | "ok"> = {
  shortage: "danger",
  stopped: "danger",
  expired: "danger",
  safety: "info",
  tension: "warn",
  soon: "warn",
  restored: "ok",
};

export function ConcernRow({
  concern: c,
  showProfile = false,
}: {
  concern: Concern;
  showProfile?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const { profiles } = useApp();
  const who = profiles.find((p) => p.id === c.profileId);
  const target =
    c.itemId && (c.kind === "expired" || c.kind === "soon")
      ? href({ name: "item", id: c.itemId })
      : href({ name: "med", country: c.country, id: c.medId });
  return (
    <div className="card grid gap-1.5 py-3">
      <div className="flex items-center gap-2">
        <Badge tone={TONE[c.kind]}>{t(`alert.${c.kind}`)}</Badge>
        {showProfile && who ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-stone-500">
            <Avatar name={who.name} color={who.color} size="size-5" /> {who.name}
          </span>
        ) : null}
      </div>
      <a href={target} className="font-medium hover:underline">
        {c.name}
      </a>
      {c.alert ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {c.alert.title}
          {c.alert.start
            ? ` · ${t("alert.since", { date: formatDate(locale, c.alert.start) })}`
            : ""}
          {c.alert.url ? (
            <>
              {" "}
              <ExternalLink href={c.alert.url}>{t("alert.more")}</ExternalLink>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

export function Alerts() {
  const t = useT();
  const locale = useLocale();
  const { concerns, profiles, manifests } = useApp();
  const [perm, setPerm] = useState(() =>
    typeof Notification === "undefined" ? "denied" : Notification.permission,
  );

  async function enable() {
    const p = await askPermission();
    setPerm(p);
    if (p === "granted") await setKv(REMINDERS_KEY, true);
  }

  return (
    <div className="grid gap-4">
      <PageTitle title={t("alert.title")} />
      {concerns.length ? (
        concerns.map((c) => (
          <ConcernRow
            key={`${c.profileId}-${c.kind}-${c.alert?.id ?? c.itemId}-${c.medId}`}
            concern={c}
            showProfile={profiles.length > 1}
          />
        ))
      ) : (
        <Empty icon="bell" title={t("alert.empty")} />
      )}
      {perm === "granted" ? (
        <Notice>{t("alert.notifyOn")}</Notice>
      ) : perm === "denied" ? (
        <Notice tone="warn">{t("alert.notifyDenied")}</Notice>
      ) : (
        <Button variant="secondary" icon="bell" onClick={() => void enable()} className="w-fit">
          {t("alert.notify")}
        </Button>
      )}
      <ul className="grid gap-0.5 text-xs text-stone-500">
        {(Object.values(manifests) as Manifest[]).map((m) => (
          <li key={m.country}>
            {countryModule(m.country).flag}{" "}
            {t("alert.checked", { date: formatDate(locale, m.generatedAt, "time") })}
          </li>
        ))}
      </ul>
    </div>
  );
}
