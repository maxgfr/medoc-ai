/**
 * Is this the latest version of the app? The server publishes version.json
 * with each deployment; the app compares it with the build it runs, when it
 * starts, when it comes back to the foreground (at most every 10 minutes) and
 * every 30 minutes. The service worker downloads a new version in the
 * background and waits: the app says one is there, and `applyUpdate` switches.
 */

import { registerSW } from "virtual:pwa-register";
import { useSyncExternalStore } from "react";

export interface Build {
  version: string;
  commit: string;
  builtAt: string;
}

export const CURRENT: Build = __BUILD__;

export interface AppStatus {
  /** The version the server publishes, once read. */
  published: Build | null;
  /** true: the app runs the published version; false: a newer one is out; null: not known yet (offline). */
  latest: boolean | null;
  /** The new version is downloaded and ready to switch to. */
  ready: boolean;
  checkedAt: string | null;
}

let status: AppStatus = { published: null, latest: null, ready: false, checkedAt: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<AppStatus>) => {
  status = { ...status, ...patch };
  for (const l of listeners) l();
};

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;

/** Two builds are the same version when they come from the same commit (a rebuild of it changes nothing). */
export const sameBuild = (a: Build, b: Build) => a.commit === b.commit && a.version === b.version;

export async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: "no-store" });
    if (!res.ok) return;
    const published = (await res.json()) as Build;
    const latest = sameBuild(published, CURRENT);
    set({ published, latest, checkedAt: new Date().toISOString() });
    // Ask the service worker to fetch the new version now rather than at its next check.
    if (!latest) await registration?.update().catch(() => {});
  } catch {
    // Offline: the status stays as it was.
  }
}

export async function applyUpdate(): Promise<void> {
  if (status.ready && updateSW) await updateSW(true);
  else location.reload();
}

let started = false;

export function startUpdateChecks(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  if (import.meta.env.PROD) {
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => set({ ready: true, latest: false }),
      onRegisteredSW: (_url, reg) => {
        registration = reg;
      },
    });
  }
  void checkForUpdate();
  let last = Date.now();
  const again = () => {
    if (document.visibilityState !== "visible" || Date.now() - last < 10 * 60_000) return;
    last = Date.now();
    void checkForUpdate();
  };
  document.addEventListener("visibilitychange", again);
  window.addEventListener("online", () => void checkForUpdate());
  setInterval(() => {
    last = Date.now();
    void checkForUpdate();
  }, 30 * 60_000);
}

export function useAppStatus(): AppStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}
