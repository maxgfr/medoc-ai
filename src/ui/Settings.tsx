/** Language and country, the AI model (llm-connect's settings store), the medicine data, your data. */
import { ENDPOINT_PRESETS } from "llm-connect";
import { useLlmSettings } from "llm-connect/react";
import { useEffect, useState } from "react";
import type { CountryId, Manifest } from "../../shared/schema";
import { COUNTRIES } from "../../shared/schema";
import { llm } from "../ai/settings";
import { countryModule } from "../countries/registry";
import { importFiles, prefetchCountry } from "../data/localImport";
import { isOld, manifest, sourceOf } from "../data/repo";
import { exportBackup, importBackup, removeLocalDataset, wipeAll } from "../db/db";
import { formatDate, LOCALES } from "../i18n";
import { useLocale, useSetLocale, useT } from "../i18n/react";
import { useLoad } from "./hooks";
import { Button, downloadFile, ExternalLink, Field, Notice, PageTitle } from "./kit";
import { ScopeSelect } from "./ScopeSelect";
import { StatusCard } from "./Status";
import { useApp } from "./state";

const LOCALE_NAMES: Record<string, string> = { fr: "Français", en: "English" };

export function Settings() {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  return (
    <div className="grid gap-4">
      <PageTitle title={t("settings.title")} />
      <section className="card grid gap-4 sm:grid-cols-2">
        <Field label={t("settings.language")}>
          <select
            className="input"
            value={locale}
            onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number])}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("settings.country")} hint={t("settings.countryHint")}>
          <ScopeSelect />
        </Field>
      </section>
      <StatusCard />
      <AiSettings />
      <DataSettings />
      <Backup />
      <section className="card grid gap-2">
        <h2 className="font-semibold">{t("settings.aboutTitle")}</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">{t("settings.about")}</p>
        <ExternalLink href="https://github.com/maxgfr/medoc-ai" className="w-fit text-sm">
          {t("settings.code")}
        </ExternalLink>
      </section>
    </div>
  );
}

const TEST_REASONS = {
  auth: "settings.testAuth",
  cors: "settings.testCors",
  http: "settings.testHttp",
  timeout: "settings.testTimeout",
  config: "settings.testConfig",
  insecure: "settings.testInsecure",
} as const;

function AiSettings() {
  const t = useT();
  const state = useLlmSettings(llm);
  const [saved, setSaved] = useState<string | null>(null);
  const d = state.draft;

  useEffect(() => {
    void llm.load().then(() => llm.open());
  }, []);

  async function save() {
    const r = await llm.save();
    setSaved(
      r.ok
        ? t("settings.saved")
        : r.reason === "incomplete"
          ? t("settings.incomplete")
          : r.reason === "insecure-endpoint"
            ? t("settings.insecure")
            : t("settings.invalidEndpoint"),
    );
  }

  const models = state.models.slice(0, 200);
  const vision = (input?: string[]) => (input ? input.includes("image") : undefined);

  return (
    <section className="card grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("settings.aiTitle")}</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">{t("settings.aiIntro")}</p>
        </div>
      </div>
      <div
        className="grid w-fit grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 text-sm whitespace-nowrap dark:bg-stone-800"
        role="tablist"
      >
        {[false, true].map((custom) => (
          <button
            key={String(custom)}
            type="button"
            role="tab"
            aria-selected={d.custom === custom}
            onClick={() => llm.toggleCustom(custom)}
            className={`rounded-lg px-3 py-1 font-medium ${d.custom === custom ? "bg-white shadow-sm dark:bg-stone-950" : "text-stone-500"}`}
          >
            {custom ? t("settings.customTab") : t("settings.providerTab")}
          </button>
        ))}
      </div>

      {d.custom ? (
        <>
          <div className="flex flex-wrap gap-2">
            {Object.values(ENDPOINT_PRESETS).map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                aria-pressed={d.customEndpoint === p.endpoint}
                onClick={() => llm.applyPreset(p)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <Field label={t("settings.endpoint")}>
            <input
              className="input"
              placeholder="http://localhost:11434/v1"
              value={d.customEndpoint}
              onChange={(e) => llm.setEndpoint(e.target.value)}
            />
          </Field>
          <Field label={t("settings.model")}>
            <input
              className="input"
              placeholder="qwen3-vl"
              value={d.customModel}
              onChange={(e) => llm.setCustomModel(e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label={t("settings.provider")}>
            <select
              className="input"
              value={d.providerId}
              onChange={(e) => llm.selectProvider(e.target.value)}
              disabled={state.catalogStatus === "loading"}
            >
              {state.catalogStatus === "loading" ? (
                <option>{t("settings.catalogLoading")}</option>
              ) : null}
              <optgroup label={t("settings.recommendedGroup")}>
                {state.providers.recommended.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("settings.others")}>
                {state.providers.others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
          {state.catalogStatus === "error" ? (
            <Notice tone="error">
              {t("settings.catalogError")}{" "}
              <button type="button" className="underline" onClick={() => llm.retryCatalog()}>
                {t("common.retry")}
              </button>
            </Notice>
          ) : null}
          <div>
            <Field label={t("settings.model")}>
              <input
                className="input mb-2"
                placeholder={t("settings.searchModels")}
                value={state.search}
                onChange={(e) => llm.setSearch(e.target.value)}
              />
            </Field>
            <div
              className="max-h-56 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800"
              role="listbox"
              aria-label={t("settings.model")}
            >
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={d.model === m.id}
                  onClick={() => llm.selectModel(m.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                    d.model === m.id
                      ? "bg-brand-50 font-semibold text-brand-900 dark:bg-brand-900/40 dark:text-brand-100"
                      : "hover:bg-stone-50 dark:hover:bg-stone-800"
                  }`}
                >
                  <span className="truncate">
                    {m.name}
                    {state.recommendedModel?.id === m.id ? (
                      <span className="ml-2 text-xs text-brand-700 dark:text-brand-400">
                        {t("settings.recommended")}
                      </span>
                    ) : null}
                  </span>
                  {vision(m.input) ? (
                    <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      {t("settings.vision")}
                    </span>
                  ) : null}
                </button>
              ))}
              {models.length === 0 ? (
                <p className="px-3 py-2 text-sm text-stone-500">{t("settings.noModel")}</p>
              ) : null}
            </div>
          </div>
        </>
      )}

      <Field label={d.custom ? t("settings.apiKeyOptional") : t("settings.apiKey")}>
        <input
          className="input font-mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={state.apiKey}
          onChange={(e) => llm.setApiKey(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-brand-600"
          checked={d.rememberKey}
          onChange={(e) => llm.setRememberKey(e.target.checked)}
        />
        {t("settings.remember")}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void save()} disabled={!state.canSave}>
          {t("common.save")}
        </Button>
        <Button
          variant="secondary"
          busy={state.testing}
          disabled={!state.canTest}
          onClick={() => void llm.test()}
        >
          {t("settings.test")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => void llm.clear().then(() => setSaved(t("settings.cleared")))}
        >
          {t("settings.forget")}
        </Button>
        {saved ? <span className="text-sm text-stone-600 dark:text-stone-300">{saved}</span> : null}
      </div>
      {state.testResult ? (
        state.testResult.ok ? (
          <Notice>
            {state.testResult.modelCount
              ? t("settings.connectedModels", { count: state.testResult.modelCount })
              : t("settings.connected")}
          </Notice>
        ) : (
          <Notice tone="error">
            {t(
              TEST_REASONS[state.testResult.reason as keyof typeof TEST_REASONS] ??
                "settings.testFailed",
            )}
            {state.testResult.message ? ` ${state.testResult.message}` : ""}
          </Notice>
        )
      ) : null}
    </section>
  );
}

function DataSettings() {
  const t = useT();
  return (
    <section className="card grid gap-4">
      <div>
        <h2 className="font-semibold">{t("settings.dataTitle")}</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">{t("settings.dataIntro")}</p>
      </div>
      {COUNTRIES.map((c) => (
        <CountryData key={c} country={c} />
      ))}
    </section>
  );
}

const IMPORT: Partial<
  Record<
    CountryId,
    {
      label: "settings.importBdpm" | "settings.importDmd";
      hint: "settings.importBdpmHint" | "settings.importDmdHint";
      accept: string;
    }
  >
> = {
  fr: { label: "settings.importBdpm", hint: "settings.importBdpmHint", accept: ".txt,.zip" },
  uk: { label: "settings.importDmd", hint: "settings.importDmdHint", accept: ".zip,.xml" },
};

function CountryData({ country }: { country: CountryId }) {
  const t = useT();
  const locale = useLocale();
  const { refreshData } = useApp();
  const [version, setVersion] = useState(0);
  const info = useLoad(
    async () => ({ source: await sourceOf(country), manifest: await manifest(country) }),
    [country, version],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const imp = IMPORT[country];
  const m: Manifest | null = info.status === "ready" ? info.value.manifest : null;
  const source = info.status === "ready" ? info.value.source : "none";

  async function run(label: string, job: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    try {
      setMessage({ tone: "info", text: await job() });
      setVersion((v) => v + 1);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : t("common.error") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">
          {countryModule(country).flag} {t(`country.${country}`)}
        </h3>
        <span className="text-xs text-stone-500">
          {source === "local"
            ? t("settings.local")
            : source === "published"
              ? t("settings.published")
              : t("country.unavailable")}
        </span>
      </div>
      {m ? (
        <>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {t("settings.builtOn", { date: formatDate(locale, m.generatedAt) })} ·{" "}
            {t("settings.counts", {
              meds: m.counts.medicines,
              packs: m.counts.packs,
              alerts: m.counts.alerts,
              docs: m.counts.docs,
            })}
          </p>
          {source === "local" ? (
            <Notice tone="warn">{t("settings.localNotUpdated")}</Notice>
          ) : m.stale || isOld(m) ? (
            <Notice tone="warn">{t("settings.stale")}</Notice>
          ) : null}
          <p className="text-xs text-stone-500">{m.attribution}</p>
          {m.sources.length ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {m.sources.map((s) => (
                <li key={s.url}>
                  <ExternalLink href={s.url}>{s.name}</ExternalLink>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {source === "published" ? (
          <>
            <Button
              variant="secondary"
              icon="retry"
              busy={busy === "refresh"}
              onClick={() =>
                void run("refresh", async () => {
                  await refreshData();
                  return t("settings.upToDate");
                })
              }
            >
              {t("settings.refresh")}
            </Button>
            <Button
              variant="secondary"
              icon="download"
              busy={busy === "offline"}
              onClick={() =>
                void run("offline", async () => {
                  await prefetchCountry(country);
                  return t("settings.offlineDone");
                })
              }
            >
              {t("settings.offline")}
            </Button>
          </>
        ) : null}
        {source === "local" ? (
          <Button
            variant="secondary"
            onClick={() =>
              void run("remove", async () => {
                await removeLocalDataset(country);
                await refreshData();
                return t("settings.upToDate");
              })
            }
          >
            {t("settings.removeLocal")}
          </Button>
        ) : null}
        {imp ? (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800">
            {busy === "import" ? t("settings.importing") : t(imp.label)}
            <input
              type="file"
              multiple
              accept={imp.accept}
              className="sr-only"
              disabled={Boolean(busy)}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (files.length)
                  void run("import", async () => {
                    const count = await importFiles(country, files);
                    await refreshData();
                    return t("settings.imported", { count });
                  });
              }}
            />
          </label>
        ) : null}
      </div>
      {imp ? <p className="text-xs text-stone-500">{t(imp.hint)}</p> : null}
      {country === "us" && source === "published" ? (
        <p className="text-xs text-stone-500">{t("search.live")}</p>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </div>
  );
}

function Backup() {
  const t = useT();
  const { reload } = useApp();
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function exportIt() {
    const b = await exportBackup();
    downloadFile(
      `medoc-backup-${b.exportedAt.slice(0, 10)}.json`,
      JSON.stringify(b, null, 2),
      "application/json",
    );
  }

  return (
    <section className="card grid gap-3">
      <h2 className="font-semibold">{t("settings.backupTitle")}</h2>
      <p className="text-sm text-stone-600 dark:text-stone-300">{t("settings.backupIntro")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="download" onClick={() => void exportIt()}>
          {t("settings.exportBackup")}
        </Button>
        <label
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
          title={t("settings.restoreWarn")}
        >
          {t("settings.importBackup")}
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              void (async () => {
                try {
                  await importBackup(JSON.parse(await f.text()));
                  await reload();
                  setMessage({ tone: "info", text: t("settings.restored") });
                } catch (err) {
                  setMessage({
                    tone: "error",
                    text: err instanceof Error ? err.message.slice(0, 300) : t("common.error"),
                  });
                }
              })();
            }}
          />
        </label>
        {confirm ? (
          <>
            <Button
              variant="danger"
              onClick={() =>
                void (async () => {
                  await wipeAll();
                  await llm.clear();
                  await reload();
                  setConfirm(false);
                  setMessage({ tone: "info", text: t("settings.wiped") });
                })()
              }
            >
              {t("settings.wipeConfirm")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t("common.cancel")}
            </Button>
          </>
        ) : (
          <Button variant="danger" icon="trash" onClick={() => setConfirm(true)}>
            {t("settings.wipe")}
          </Button>
        )}
      </div>
      <p className="text-xs text-stone-500">{t("settings.restoreWarn")}</p>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </section>
  );
}
