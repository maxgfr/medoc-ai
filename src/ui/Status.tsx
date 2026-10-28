/**
 * Whether the app and the medicine data are current, in three places: a banner
 * when a new version is out, one line on the home screen, the detail in
 * Settings and More.
 */
import { useState } from "react";
import type { Manifest } from "../../shared/schema";
import { applyUpdate, CURRENT, checkForUpdate, useAppStatus } from "../app/update";
import { countryModule } from "../countries/registry";
import { isOld } from "../data/repo";
import { formatDate } from "../i18n";
import { useLocale, useT } from "../i18n/react";
import { Badge, Button, Icon } from "./kit";
import { href } from "./router";
import { useApp } from "./state";

const outdated = (m: Manifest) => Boolean(m.stale) || isOld(m);

export function UpdateBanner() {
  const t = useT();
  const { latest, published } = useAppStatus();
  if (latest !== false) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-700 px-4 py-2 text-center text-sm text-white dark:bg-brand-600"
    >
      <span>{t("status.newVersion", { version: published?.version ?? "" })}</span>
      <button
        type="button"
        onClick={() => void applyUpdate()}
        className="rounded-lg bg-white/15 px-3 py-1 font-semibold hover:bg-white/25"
      >
        {t("status.update")}
      </button>
    </div>
  );
}

/** One line: all current, or what is not. */
export function StatusLine() {
  const t = useT();
  const { manifests, online } = useApp();
  const { latest } = useAppStatus();
  const old = (Object.values(manifests) as Manifest[]).filter(outdated);
  const ok = latest === true && !old.length;
  return (
    <a
      href={`${href({ name: "settings" })}`}
      className={`flex items-center gap-2 text-xs ${ok ? "text-brand-700 dark:text-brand-400" : "text-amber-700 dark:text-amber-400"}`}
    >
      <Icon name={ok ? "check" : "alert"} className="size-4 shrink-0" />
      {ok
        ? t("status.allCurrent")
        : latest === false
          ? t("status.appBehind")
          : old.length
            ? t("status.dataBehind", {
                countries: old.map((m) => t(`country.${m.country}`)).join(", "),
              })
            : online
              ? t("status.checking")
              : t("status.offline")}
    </a>
  );
}

export function StatusCard() {
  const t = useT();
  const locale = useLocale();
  const { manifests, refreshData, available } = useApp();
  const { latest, published, checkedAt } = useAppStatus();
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      await Promise.all([checkForUpdate(), refreshData()]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card grid gap-3" id="status">
      <h2 className="font-semibold">{t("status.title")}</h2>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {t("status.appVersion", { version: CURRENT.version, commit: CURRENT.commit })}
          <span className="block text-xs text-stone-500">
            {t("status.builtOn", { date: formatDate(locale, CURRENT.builtAt, "time") })}
          </span>
        </span>
        {latest === true ? (
          <Badge tone="ok">✓ {t("status.latest")}</Badge>
        ) : latest === false ? (
          <Button onClick={() => void applyUpdate()} icon="download">
            {t("status.updateTo", {
              version: published?.version ?? "",
              commit: published?.commit ?? "",
            })}
          </Button>
        ) : (
          <Badge>{t("status.unknown")}</Badge>
        )}
      </div>
      <ul className="grid gap-2 border-t border-stone-100 pt-3 text-sm dark:border-stone-800">
        {available.map((c) => {
          const m = manifests[c];
          return (
            <li key={c} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {countryModule(c).flag} {t(`country.${c}`)}
                {m ? (
                  <span className="block text-xs text-stone-500">
                    {t("status.indexOf", { date: formatDate(locale, m.generatedAt, "time") })}
                  </span>
                ) : null}
              </span>
              {!m ? (
                <Badge>{t("status.unknown")}</Badge>
              ) : outdated(m) ? (
                <Badge tone="warn">{t("status.notCurrent")}</Badge>
              ) : (
                <Badge tone="ok">✓ {t("status.current")}</Badge>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon="retry" busy={busy} onClick={() => void check()}>
          {t("status.checkNow")}
        </Button>
        {checkedAt ? (
          <span className="text-xs text-stone-500">
            {t("status.checkedAt", { date: formatDate(locale, checkedAt, "time") })}
          </span>
        ) : null}
      </div>
    </section>
  );
}
