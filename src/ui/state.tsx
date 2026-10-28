/**
 * What every screen reads: the profiles and the active one, every box and
 * treatment on the device, the countries with an index and their alerts.
 * Small enough to load whole; screens call `reload` after a write.
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Alert, CountryId, Manifest } from "../../shared/schema";
import { type Concern, concerns } from "../alerts/match";
import type { Scope } from "../countries/registry";
import { forget, alerts as loadAlerts, manifest, publishedCountries } from "../data/repo";
import {
  allItems,
  allLocalDatasets,
  allProfiles,
  allTreatments,
  getKv,
  putProfile,
  setKv,
} from "../db/db";
import { type Item, PROFILE_COLORS, type Profile, type Treatment, uid } from "../db/model";
import { useT } from "../i18n/react";
import { localDay } from "../reminders/schedule";

interface AppState {
  ready: boolean;
  profiles: Profile[];
  active: Profile;
  setActive: (id: string) => Promise<void>;
  /** Where searches look: every country (the default) or one. */
  scope: Scope;
  setScope: (s: Scope) => Promise<void>;
  /** Countries with an index, published or imported on this device. */
  available: CountryId[];
  /** Each country's index manifest: its version and date. */
  manifests: Partial<Record<CountryId, Manifest>>;
  items: Item[];
  treatments: Treatment[];
  alertsBy: Partial<Record<CountryId, Alert[]>>;
  /** Asks the server for the latest index of every country (also done on its own). */
  refreshData: () => Promise<void>;
  /** Everything that needs attention, all profiles. */
  concerns: Concern[];
  online: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

const PLACEHOLDER: Profile = {
  id: "",
  name: "",
  color: PROFILE_COLORS[0] ?? "#047857",
  createdAt: "",
};

export function AppProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState("");
  const [scope, setScopeState] = useState<Scope>("all");
  const [available, setAvailable] = useState<CountryId[]>([]);
  const [manifests, setManifests] = useState<Partial<Record<CountryId, Manifest>>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [alertsBy, setAlertsBy] = useState<Partial<Record<CountryId, Alert[]>>>({});
  const [online, setOnline] = useState(() => navigator.onLine);

  const reload = useCallback(async () => {
    let ps = await allProfiles();
    if (!ps.length) {
      const me: Profile = {
        id: uid(),
        name: t("profile.me"),
        color: PROFILE_COLORS[0] ?? "#047857",
        createdAt: new Date().toISOString(),
      };
      await putProfile(me);
      ps = [me];
    }
    const stored = await getKv<string>("activeProfile");
    setProfiles(ps);
    setActiveId(ps.some((p) => p.id === stored) ? (stored as string) : (ps[0]?.id ?? ""));
    setItems(await allItems());
    setTreatments(await allTreatments());
  }, [t]);

  /**
   * The countries, their manifests and alerts. `fresh` forgets everything read
   * so far, so the next medicine opened comes from the latest index.
   */
  const loadIndexes = useCallback(async (fresh: boolean) => {
    if (fresh) forget();
    const published = await publishedCountries();
    const local = (await allLocalDatasets()).map((d) => d.country);
    const avail = [...new Set([...published, ...local])];
    const ms = await Promise.all(avail.map(async (c) => [c, await manifest(c)] as const));
    setAvailable(avail);
    setManifests(
      Object.fromEntries(ms.filter(([, m]) => m)) as Partial<Record<CountryId, Manifest>>,
    );
    const entries = await Promise.all(avail.map(async (c) => [c, await loadAlerts(c)] as const));
    setAlertsBy(Object.fromEntries(entries));
    return avail;
  }, []);

  useEffect(() => {
    void (async () => {
      await reload();
      const avail = await loadIndexes(false);
      const stored = await getKv<Scope>("scope");
      setScopeState(stored && (stored === "all" || avail.includes(stored)) ? stored : "all");
      setReady(true);
    })();
  }, [reload, loadIndexes]);

  // An installed app can stay open for days: check for a newer index when it comes back to the front,
  // at most every 30 minutes, and every 6 hours while it stays open.
  useEffect(() => {
    let last = Date.now();
    const check = () => {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        Date.now() - last < 30 * 60_000
      )
        return;
      last = Date.now();
      void loadIndexes(true);
    };
    const timer = setInterval(() => {
      last = 0;
      check();
    }, 6 * 3600_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, [loadIndexes]);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  const value = useMemo<AppState>(() => {
    const active = profiles.find((p) => p.id === activeId) ?? profiles[0] ?? PLACEHOLDER;
    return {
      ready,
      profiles,
      active,
      setActive: async (id) => {
        await setKv("activeProfile", id);
        setActiveId(id);
      },
      scope,
      setScope: async (s) => {
        await setKv("scope", s);
        setScopeState(s);
      },
      available,
      manifests,
      items,
      treatments,
      alertsBy,
      refreshData: async () => {
        await loadIndexes(true);
      },
      concerns: concerns(items, treatments, alertsBy, localDay(new Date())),
      online,
      reload,
    };
  }, [
    ready,
    profiles,
    activeId,
    scope,
    available,
    manifests,
    items,
    treatments,
    alertsBy,
    online,
    reload,
    loadIndexes,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

/** The active profile's boxes and treatments. */
export function useMine() {
  const { items, treatments, active, concerns: all } = useApp();
  return useMemo(
    () => ({
      items: items.filter((i) => i.profileId === active.id),
      treatments: treatments.filter((t) => t.profileId === active.id),
      concerns: all.filter((c) => c.profileId === active.id),
    }),
    [items, treatments, active.id, all],
  );
}
