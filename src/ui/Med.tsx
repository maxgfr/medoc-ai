/** One medicine: what the index says, its leaflet, and the AI on top of it. */
import { useEffect, useMemo, useState } from "react";
import type { Alert, CountryId, Docs, LinkKind, Medicine } from "../../shared/schema";
import { countryModule } from "../countries/registry";
import { formatDate, formatPrice, type TextKey } from "../i18n";
import { useLocale, useT } from "../i18n/react";
import { useLoad, useMedicine } from "./hooks";
import { Badge, Empty, ExternalLink, Icon, LinkButton, Notice, Spinner } from "./kit";
import { MedAsk, MedSummary } from "./MedAi";
import { DocsView } from "./MedDocs";
import { href, type ScanInfo } from "./router";
import { useApp } from "./state";

type Tab = "info" | "leaflet" | "summary" | "ask";

const LINK_LABELS: Record<LinkKind, TextKey> = {
  notice: "med.linkNotice",
  rcp: "med.linkRcp",
  sheet: "med.linkSheet",
  has: "med.linkHas",
  ansm: "med.linkAnsm",
  epar: "med.linkEpar",
  dailymed: "med.linkDailymed",
  mhra: "med.linkMhra",
  emc: "med.linkEmc",
  lookup: "med.linkLookup",
  shortages: "med.linkShortages",
};

const ALERT_TONE: Record<Alert["kind"], "danger" | "warn" | "info" | "ok"> = {
  shortage: "danger",
  stopped: "danger",
  tension: "warn",
  safety: "info",
  restored: "ok",
};

export function Med({ country, id, scan }: { country: CountryId; id: string; scan?: ScanInfo }) {
  const t = useT();
  const state = useMedicine(country, id);
  if (state.status === "loading")
    return (
      <div className="flex justify-center py-16 text-stone-500">
        <Spinner className="size-6" />
      </div>
    );
  if (state.status === "error") return <Notice tone="error">{t("common.error")}</Notice>;
  if (!state.value) return <Empty icon="pill" title={t("common.unknownMed")} />;
  return <MedView med={state.value} {...(scan ? { scan } : {})} />;
}

function MedView({ med, scan }: { med: Medicine; scan?: ScanInfo }) {
  const t = useT();
  const locale = useLocale();
  const { alertsBy, items, active, manifests } = useApp();
  const source = manifests[med.country];
  const [tab, setTab] = useState<Tab>("info");
  const [focus, setFocus] = useState<string | null>(null);
  const mod = countryModule(med.country);
  const alerts = useMemo(
    () => (alertsBy[med.country] ?? []).filter((a) => a.medIds.includes(med.id)),
    [alertsBy, med],
  );
  const mine = items.filter(
    (i) =>
      i.profileId === active.id && i.country === med.country && i.medId === med.id && !i.finishedAt,
  );
  const hasDocs = med.docs !== "none";
  // The leaflet loads the first time a tab needs it, and stays.
  const [wantDocs, setWantDocs] = useState(false);
  useEffect(() => {
    if (tab !== "info") setWantDocs(true);
  }, [tab]);
  const docs = useLoad<Docs | null>(
    () => (hasDocs && wantDocs ? mod.docs(med) : Promise.resolve(null)),
    [med.country, med.id, hasDocs && wantDocs],
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "info", label: t("med.tabInfo") },
    ...(hasDocs
      ? [
          { id: "leaflet" as const, label: t("med.tabLeaflet") },
          { id: "summary" as const, label: t("med.tabSummary") },
          { id: "ask" as const, label: t("med.tabAsk") },
        ]
      : []),
  ];

  const openSection = (sectionId: string) => {
    setFocus(sectionId);
    setTab("leaflet");
    setTimeout(
      () =>
        document
          .getElementById(`sec-${sectionId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  };

  return (
    <article className="grid gap-4">
      <header className="grid gap-2">
        <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
          {mod.flag} {t(`country.${med.country}`)}
          {med.atc ? ` · ${t("med.atc", { code: med.atc })}` : ""}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{med.name}</h1>
        <div className="flex flex-wrap gap-1.5">
          {med.marketKnown === false ? null : (
            <Badge tone={med.marketed ? "ok" : "neutral"}>
              {med.marketed ? t("med.marketed") : t("med.notMarketed")}
            </Badge>
          )}
          {med.otc === true ? (
            <Badge tone="info">{t("med.otc")}</Badge>
          ) : med.otc === false ? (
            <Badge>{t("med.rx")}</Badge>
          ) : null}
          {med.enhancedMonitoring ? <Badge tone="warn">▼ {t("med.monitoring")}</Badge> : null}
          {med.major ? <Badge tone="info">{t("med.major")}</Badge> : null}
          {[...new Set(alerts.map((a) => a.kind))].map((kind) => (
            <Badge key={kind} tone={ALERT_TONE[kind]}>
              {t(`alert.${kind}`)}
            </Badge>
          ))}
        </div>
      </header>

      {scan && (scan.lot || scan.expiry || scan.serial) ? (
        <div className="card grid gap-1 text-sm">
          <span className="label">{t("cabinet.scanned")}</span>
          <span>
            {[
              scan.lot ? t("scan.lot", { lot: scan.lot }) : "",
              scan.expiry ? t("scan.expires", { date: formatDate(locale, scan.expiry) }) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <LinkButton
          icon="plus"
          href={href({
            name: "newItem",
            country: med.country,
            med: med.id,
            ...(scan ? { scan } : {}),
          })}
        >
          {t("med.addCabinet")}
        </LinkButton>
        <LinkButton
          variant="secondary"
          icon="calendar"
          href={href({ name: "newTreatment", country: med.country, med: med.id })}
        >
          {t("med.addTreatment")}
        </LinkButton>
      </div>
      {mine.length ? (
        <a
          href={href({ name: "cabinet" })}
          className="text-sm text-brand-700 hover:underline dark:text-brand-400"
        >
          {t("med.inCabinet", { count: mine.length })}
        </a>
      ) : null}

      {tabs.length > 1 ? (
        <div
          role="tablist"
          className="flex gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1 text-sm dark:bg-stone-800"
        >
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => setTab(x.id)}
              className={`flex-1 rounded-lg px-3 py-1.5 font-medium whitespace-nowrap ${tab === x.id ? "bg-white shadow-sm dark:bg-stone-950" : "text-stone-500"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "info" ? <Info med={med} alerts={alerts} /> : null}
      {tab === "info" || !wantDocs ? null : docs.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-stone-500">
          <Spinner /> {t("med.docsLoading")}
        </p>
      ) : docs.status === "error" ? (
        <Notice tone="error">{t("med.docsError")}</Notice>
      ) : !docs.value?.sections.length ? (
        <Notice>{t("med.noDocs")}</Notice>
      ) : null}
      {docs.status === "ready" && docs.value?.sections.length ? (
        // All three stay mounted, only hidden: a conversation or an answer being written survives a tab change.
        <>
          <div hidden={tab !== "leaflet"}>
            <DocsView docs={docs.value} focus={focus} />
          </div>
          <div hidden={tab !== "summary"}>
            <MedSummary med={med} docs={docs.value} onCite={openSection} />
          </div>
          <div hidden={tab !== "ask"}>
            <MedAsk med={med} docs={docs.value} onCite={openSection} />
          </div>
        </>
      ) : null}

      {source ? (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {t("med.dataAsOf", { date: formatDate(locale, source.generatedAt, "time") })} ·{" "}
          {source.attribution}
        </p>
      ) : null}
      <p className="text-xs text-stone-500 dark:text-stone-400">{t("common.disclaimer")}</p>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-3 sm:gap-3">
      <dt className="text-xs font-medium text-stone-500 sm:text-sm dark:text-stone-400">{label}</dt>
      <dd className="text-sm sm:col-span-2">{children}</dd>
    </div>
  );
}

function Info({ med, alerts }: { med: Medicine; alerts: Alert[] }) {
  const t = useT();
  const locale = useLocale();
  const mod = countryModule(med.country);
  const role = med.generic?.role;
  return (
    <div className="grid gap-4">
      {alerts.length ? (
        <section className="grid gap-2">
          <h2 className="font-semibold">{t("med.alertsTitle")}</h2>
          {alerts.map((a) => (
            <Notice
              key={a.id}
              tone={
                ALERT_TONE[a.kind] === "danger"
                  ? "error"
                  : ALERT_TONE[a.kind] === "warn"
                    ? "warn"
                    : "info"
              }
            >
              <span className="font-semibold">{t(`alert.${a.kind}`)}</span> — {a.title}
              {a.start ? ` (${t("alert.since", { date: formatDate(locale, a.start) })})` : ""}
              {a.url ? (
                <>
                  {" "}
                  <ExternalLink href={a.url}>{t("alert.more")}</ExternalLink>
                </>
              ) : null}
            </Notice>
          ))}
        </section>
      ) : null}

      <dl className="card divide-y divide-stone-100 py-1 dark:divide-stone-800">
        {med.substances.length ? (
          <Row label={t("med.substances")}>
            <ul>
              {med.substances.map((s) => (
                <li key={`${s.name}-${s.strength}`}>
                  <span className="font-medium">{s.name}</span>
                  {s.strength ? ` ${s.strength}` : ""}
                  {s.per ? <span className="text-stone-500"> / {s.per}</span> : null}
                </li>
              ))}
            </ul>
          </Row>
        ) : null}
        {med.form ? <Row label={t("med.form")}>{med.form}</Row> : null}
        {med.routes.length ? <Row label={t("med.routes")}>{med.routes.join(", ")}</Row> : null}
        {med.holder ? <Row label={t("med.holder")}>{med.holder}</Row> : null}
        {med.status ? (
          <Row label={t("med.status")}>
            {med.status}
            {med.authorisedAt ? (
              <span className="block text-xs text-stone-500">
                {t("med.authorised", { date: formatDate(locale, med.authorisedAt) })}
              </span>
            ) : null}
          </Row>
        ) : null}
        {med.prescription.length ? (
          <Row label={t("med.prescription")}>
            <ul className="list-disc pl-4">
              {med.prescription.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Row>
        ) : null}
        {med.generic ? (
          <Row label={t("med.generic")}>
            {med.generic.group}
            {role ? (
              <span className="block text-xs text-stone-500">
                {t(
                  role === "princeps"
                    ? "med.rolePrinceps"
                    : role === "complementary"
                      ? "med.roleComplementary"
                      : role === "substitutable"
                        ? "med.roleSubstitutable"
                        : "med.roleGeneric",
                )}
              </span>
            ) : null}
          </Row>
        ) : null}
        {med.smr ? (
          <Row label={t("med.smr")}>
            <span className="font-medium">{med.smr.level}</span>
            {med.smr.date ? (
              <span className="text-stone-500"> · {formatDate(locale, med.smr.date)}</span>
            ) : null}
            {med.smr.text ? (
              <span className="mt-1 block text-xs text-stone-600 dark:text-stone-300">
                {med.smr.text.replace(/\s*;\s*$/, "")}
              </span>
            ) : null}
          </Row>
        ) : null}
        {med.asmr ? (
          <Row label={t("med.asmr")}>
            <span className="font-medium">{med.asmr.level}</span>
            {med.asmr.text ? (
              <span className="mt-1 block text-xs text-stone-600 dark:text-stone-300">
                {med.asmr.text}
              </span>
            ) : null}
          </Row>
        ) : null}
      </dl>

      {med.packs.length ? (
        <section className="grid gap-2">
          <h2 className="font-semibold">{t("med.packs")}</h2>
          <ul className="card divide-y divide-stone-100 p-0 text-sm dark:divide-stone-800">
            {med.packs.map((p) => (
              <li key={p.code} className="grid gap-1 px-4 py-3">
                <span>{p.label}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                  <span className="num font-mono">
                    {med.country === "de"
                      ? `PZN ${p.code}`
                      : p.altCodes?.[0] && med.country === "us"
                        ? p.altCodes[0]
                        : p.code}
                  </span>
                  {p.price !== undefined ? (
                    <span>{formatPrice(locale, p.price, mod.currency)}</span>
                  ) : null}
                  {p.reimbursement ? (
                    <Badge tone="ok">{t("med.reimbursed", { rate: p.reimbursement })}</Badge>
                  ) : null}
                  {!p.marketed ? <Badge>{t("med.notMarketed")}</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {med.links.length ? (
        <section className="grid gap-2">
          <h2 className="font-semibold">{t("med.links")}</h2>
          <ul className="card grid gap-2 text-sm">
            {med.links.map((l) => (
              <li key={l.url} className="flex items-center gap-2">
                <Icon name="doc" className="size-4 text-stone-400" />
                <ExternalLink href={l.url}>{t(LINK_LABELS[l.kind])}</ExternalLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
