/**
 * The scanner: the camera reads the box's DataMatrix or barcode; a code can be
 * typed; a photo is searched for a code, then read by the AI model when there
 * is none, and the person picks the medicine among the matches.
 */
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { type ParsedCode, parseCode } from "../../shared/codes/gs1";
import { gelbeListeUrl } from "../../shared/countries/de/parse";
import { preparePhoto } from "../ai/image";
import { type BoxReading, readBox } from "../ai/medical";
import { loadLlmSettings, savedSettings } from "../ai/settings";
import { germany } from "../countries/de";
import { countryModule, inScope } from "../countries/registry";
import { type Hit, searchCountries } from "../data/repo";
import { formatDate } from "../i18n";
import { useLocale, useT } from "../i18n/react";
import { detectIn, getDetector } from "../scan/detector";
import { resolveCode } from "../scan/resolve";
import { Button, ExternalLink, Field, Icon, Notice, PageTitle, Spinner } from "./kit";
import { go, href, type ScanInfo } from "./router";
import { useApp } from "./state";

type Camera = "starting" | "on" | "denied" | "none" | "off";

function infoOf(code: ParsedCode, key?: string): ScanInfo {
  const c = key || code.gtin || code.pzn;
  return {
    ...(c ? { code: c } : {}),
    ...(code.lot ? { lot: code.lot } : {}),
    ...(code.expiry ? { expiry: code.expiry } : {}),
    ...(code.serial ? { serial: code.serial } : {}),
  };
}

export function Scan() {
  const t = useT();
  const locale = useLocale();
  const { scope, available } = useApp();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<Camera>("starting");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: "error" | "warn";
    text: string;
    /** For a German PZN the open data does not cover: where to look it up. */
    lookup?: string;
  } | null>(null);
  const [manual, setManual] = useState("");
  const [reading, setReading] = useState<BoxReading | null>(null);
  const [candidates, setCandidates] = useState<Hit[] | null>(null);
  const handled = useRef(false);

  const stop = useCallback(() => {
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
  }, []);

  const lookup = useCallback(
    async (raw: string) => {
      const code = parseCode(raw);
      if (!code || (!code.gtin && !code.digits && !code.pzn)) {
        setMessage({ tone: "warn", text: t("scan.notMedicine") });
        handled.current = false;
        return;
      }
      setBusy(
        t("scan.looking", {
          code: code.pzn ? `PZN ${code.pzn}` : (code.gtin ?? code.digits ?? raw),
        }),
      );
      setMessage(null);
      try {
        const found = await resolveCode(code, scope, available);
        if (found) {
          stop();
          go({
            name: "med",
            country: found.country,
            id: found.med.id,
            scan: infoOf(code, found.key),
          });
          return;
        }
        const pzn = germany.keysFor(code)[0];
        setMessage(
          pzn
            ? { tone: "warn", text: t("scan.pznNotFound", { pzn }), lookup: gelbeListeUrl(pzn) }
            : {
                tone: "warn",
                text: t("scan.notFound", {
                  countries: available.map((c) => t(`country.${c}`)).join(", "),
                }),
              },
        );
      } catch {
        setMessage({ tone: "error", text: t("common.error") });
      } finally {
        setBusy(null);
        handled.current = false;
      }
    },
    [scope, available, stop, t],
  );

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("none");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (!live) {
          for (const tr of s.getTracks()) tr.stop();
          return;
        }
        stream.current = s;
        const v = video.current;
        if (!v) return;
        v.srcObject = s;
        await v.play().catch(() => {});
        setCamera("on");
        const track = s.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        if (caps?.torch) setTorch(false);
        const detector = getDetector();
        const tick = async () => {
          if (!live) return;
          if (!handled.current && v.readyState >= 2) {
            try {
              const codes = await detector.detect(v);
              const raw = codes[0]?.rawValue;
              if (raw && !handled.current) {
                handled.current = true;
                navigator.vibrate?.(60);
                await lookup(raw);
              }
            } catch {}
          }
          timer = setTimeout(tick, 220);
        };
        void tick();
      } catch (err) {
        if (!live) return;
        setCamera(
          err instanceof DOMException && err.name === "NotAllowedError" ? "denied" : "none",
        );
      }
    })();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [lookup, stop]);

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    await track
      .applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      .catch(() => {});
    setTorch(!torch);
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    if (manual.trim()) void lookup(manual.trim());
  }

  async function photo(file: File) {
    setMessage(null);
    setCandidates(null);
    setReading(null);
    setBusy(t("scan.reading"));
    try {
      // A code in the photo first: no model needed.
      const bitmap = await createImageBitmap(file);
      const raw = await detectIn(bitmap).catch(() => null);
      bitmap.close();
      if (raw) {
        setBusy(null);
        await lookup(raw);
        return;
      }
      await loadLlmSettings();
      const settings = savedSettings();
      if (!settings) {
        setMessage({ tone: "warn", text: t("scan.photoNeedsAi") });
        return;
      }
      const prepared = await preparePhoto(file);
      const read = await readBox({ settings, t }, prepared.model);
      setReading(read);
      for (const c of read.codes) {
        const code = parseCode(c);
        if (!code) continue;
        const found = await resolveCode(code, scope, available);
        if (found) {
          go({
            name: "med",
            country: found.country,
            id: found.med.id,
            scan: {
              code: found.key,
              ...(read.lot ? { lot: read.lot } : {}),
              ...(/^\d{4}-\d{2}(-\d{2})?$/.test(read.expiry)
                ? { expiry: read.expiry.length === 7 ? `${read.expiry}-28` : read.expiry }
                : {}),
            },
          });
          return;
        }
      }
      const countries = inScope(scope, available);
      const search = (q: string) =>
        searchCountries(countries, q, {
          live: true,
          limit: 8,
          liveSearch: (c, text) => countryModule(c).liveSearch?.(text),
        }).then((r) => r.hits);
      const query = [read.name, read.strength].filter(Boolean).join(" ");
      const hits = await search(query);
      setCandidates(hits.length || !read.name ? hits : await search(read.name));
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : t("common.error") });
    } finally {
      setBusy(null);
    }
  }

  const scanInfoFromReading = (r: BoxReading | null): ScanInfo | undefined => {
    if (!r) return undefined;
    const exp = /^\d{4}-\d{2}(-\d{2})?$/.test(r.expiry)
      ? r.expiry.length === 7
        ? `${r.expiry}-28`
        : r.expiry
      : undefined;
    const s: ScanInfo = { ...(r.lot ? { lot: r.lot } : {}), ...(exp ? { expiry: exp } : {}) };
    return Object.keys(s).length ? s : undefined;
  };

  return (
    <div className="grid gap-4">
      <PageTitle title={t("scan.title")} />
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-stone-900 sm:aspect-video">
        <video
          ref={video}
          className="size-full object-cover"
          playsInline
          muted
          aria-label={t("scan.point")}
        />
        {camera === "on" ? (
          <>
            <div className="scan-frame pointer-events-none absolute top-1/2 left-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/90" />
            <p className="absolute inset-x-0 bottom-3 px-4 text-center text-sm text-white drop-shadow">
              {t("scan.point")}
            </p>
            {torch !== null ? (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                aria-pressed={torch}
                className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Icon name="torch" className="size-4" />
                {t("scan.torch")}
              </button>
            ) : null}
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-stone-200">
            {camera === "starting" ? (
              <span className="flex items-center gap-2">
                <Spinner /> {t("scan.starting")}
              </span>
            ) : camera === "denied" ? (
              t("scan.denied")
            ) : (
              t("scan.noCamera")
            )}
          </div>
        )}
        {busy ? (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-white">
            <span className="flex items-center gap-2">
              <Spinner /> {busy}
            </span>
          </div>
        ) : null}
      </div>

      {message ? (
        <Notice tone={message.tone}>
          {message.text}
          {message.lookup ? (
            <>
              {" "}
              <ExternalLink href={message.lookup}>{t("med.linkLookup")}</ExternalLink>
            </>
          ) : null}
        </Notice>
      ) : null}

      <form onSubmit={submitManual} className="card grid gap-3">
        <Field label={t("scan.manual")} hint={t("scan.manualHint")}>
          <div className="flex gap-2">
            <input
              className="input font-mono"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="3400935955838"
            />
            <Button type="submit" disabled={!manual.trim() || Boolean(busy)}>
              {t("scan.find")}
            </Button>
          </div>
        </Field>
      </form>

      <section className="card grid gap-3">
        <div>
          <h2 className="font-semibold">{t("scan.photo")}</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{t("scan.photoHint")}</p>
        </div>
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800">
          <Icon name="camera" className="size-4" />
          {t("scan.photo")}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void photo(f);
            }}
          />
        </label>
        {reading?.name ? (
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {t("scan.readName", {
              name: [reading.name, reading.strength, reading.form].filter(Boolean).join(" · "),
            })}
            {reading.lot ? ` · ${t("scan.lot", { lot: reading.lot })}` : ""}
            {/^\d{4}-\d{2}-\d{2}$/.test(reading.expiry)
              ? ` · ${t("scan.expires", { date: formatDate(locale, reading.expiry) })}`
              : ""}
          </p>
        ) : null}
        {candidates ? (
          candidates.length ? (
            <div className="grid gap-1">
              <h3 className="label">{t("scan.candidates")}</h3>
              {candidates.map((h) => {
                const scan = scanInfoFromReading(reading);
                return (
                  <a
                    key={`${h.country}:${h.id}`}
                    href={href({
                      name: "med",
                      country: h.country,
                      id: h.id,
                      ...(scan ? { scan } : {}),
                    })}
                    className="rounded-xl border border-stone-200 px-3 py-2 text-sm hover:border-brand-500 dark:border-stone-700"
                  >
                    <span className="font-medium">
                      {countryModule(h.country).flag} {h.name}
                    </span>
                    {h.holder ? (
                      <span className="block text-xs text-stone-500">{h.holder}</span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          ) : (
            <Notice tone="warn">{t("scan.noCandidate")}</Notice>
          )
        ) : null}
      </section>
    </div>
  );
}
