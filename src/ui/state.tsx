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
import type { Alert, CountryId } from "../../shared/schema";
import { type Concern, concerns } from "../alerts/match";
import { guessCountry } from "../countries/registry";
import { alerts as loadAlerts, publishedCountries } from "../data/repo";
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
  country: CountryId;
  setCountry: (c: CountryId) => Promise<void>;
  /** Countries with an index, published or imported on this device. */
  available: CountryId[];
  items: Item[];
  treatments: Treatment[];
  alertsBy: Partial<Record<CountryId, Alert[]>>;
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
  const [country, setCountryState] = useState<CountryId>("fr");
  const [available, setAvailable] = useState<CountryId[]>([]);
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

  useEffect(() => {
    void (async () => {
      await reload();
      const published = await publishedCountries();
      const local = (await allLocalDatasets()).map((d) => d.country);
      const avail = [...new Set([...published, ...local])];
      setAvailable(avail);
      const stored = await getKv<CountryId>("country");
      setCountryState(
        stored && avail.includes(stored) ? stored : guessCountry(navigator.languages ?? [], avail),
      );
      setReady(true);
      const entries = await Promise.all(avail.map(async (c) => [c, await loadAlerts(c)] as const));
      setAlertsBy(Object.fromEntries(entries));
    })();
  }, [reload]);

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
      country,
      setCountry: async (c) => {
        await setKv("country", c);
        setCountryState(c);
      },
      available,
      items,
      treatments,
      alertsBy,
      concerns: concerns(items, treatments, alertsBy, localDay(new Date())),
      online,
      reload,
    };
  }, [ready, profiles, activeId, country, available, items, treatments, alertsBy, online, reload]);

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
