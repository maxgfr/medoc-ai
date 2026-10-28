/**
 * Notifications from the page itself: at each dose time while the app is open
 * (or recently in the background), and once for new alerts. Without a push
 * server nothing can ring while the app is closed; the calendar export does.
 */
import { useEffect } from "react";
import { getKv, intakesOn, setKv } from "../db/db";
import { useT } from "../i18n/react";
import { useApp } from "../ui/state";
import { localDay, nextDose } from "./schedule";

export const REMINDERS_KEY = "reminders";

export async function notify(title: string, body: string, tag: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker?.getRegistration();
  const options = { body, tag, icon: "./icon.svg", badge: "./icon.svg" };
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
}

export async function askPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission === "default"
    ? Notification.requestPermission()
    : Notification.permission;
}

/** Schedules the next dose's notification while the page lives; also tells about new alerts once. */
export function useInAppReminders(): void {
  const t = useT();
  const { treatments, profiles, concerns, ready } = useApp();

  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    void (async () => {
      if (!(await getKv<boolean>(REMINDERS_KEY)) || cancelled) return;
      const now = new Date();
      const today = localDay(now);
      const next = nextDose(treatments, await intakesOn(today), now);
      if (!next || cancelled) return;
      const delay = next.at.getTime() - now.getTime();
      if (delay > 2 ** 31 - 1) return;
      timer = setTimeout(() => {
        const who = profiles.find((p) => p.id === next.treatment.profileId)?.name;
        void notify(
          t("treat.reminderTitle", { name: next.treatment.name }),
          `${t("treat.reminderBody", { amount: next.amount, unit: next.unit, time: next.time })}${who && profiles.length > 1 ? ` · ${who}` : ""}`,
          `dose-${next.treatment.id}-${next.date}-${next.time}`,
        );
      }, delay);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ready, treatments, profiles, t]);

  useEffect(() => {
    if (!ready || !concerns.length) return;
    void (async () => {
      const seen = new Set((await getKv<string[]>("seenAlerts")) ?? []);
      const keys = concerns.map((c) => `${c.kind}:${c.alert?.id ?? c.itemId ?? c.medId}`);
      const fresh = keys.filter((k) => !seen.has(k));
      if (!fresh.length) return;
      await setKv("seenAlerts", keys);
      if (await getKv<boolean>(REMINDERS_KEY))
        await notify(t("alert.title"), t("alert.notifyText", { count: fresh.length }), "alerts");
    })();
  }, [ready, concerns, t]);
}
