/** What in the cabinets and treatments needs attention: expiry, shortages, safety information. */
import type { Alert, AlertKind, CountryId } from "../../shared/schema";
import type { Item, Treatment } from "../db/model";
import { addDays } from "../reminders/schedule";

export type ExpiryState = "expired" | "soon" | "ok" | "unknown";

export const SOON_DAYS = 30;

export function expiryState(expiry: string | undefined, today: string): ExpiryState {
  if (!expiry) return "unknown";
  if (expiry < today) return "expired";
  if (expiry <= addDays(today, SOON_DAYS)) return "soon";
  return "ok";
}

export interface Concern {
  kind: AlertKind | "expired" | "soon";
  /** The alert, for the source's kinds. */
  alert?: Alert;
  profileId: string;
  country: CountryId;
  medId: string;
  name: string;
  itemId?: string;
}

/** Kinds that are over: a restored supply is good news, shown only on the medicine. */
const QUIET: AlertKind[] = ["restored"];

export function concerns(
  items: Item[],
  treatments: Treatment[],
  alertsBy: Partial<Record<CountryId, Alert[]>>,
  today: string,
): Concern[] {
  const out: Concern[] = [];
  const index = new Map<string, Alert[]>();
  for (const [country, list] of Object.entries(alertsBy)) {
    for (const a of list ?? []) {
      if (QUIET.includes(a.kind) || (a.end && a.end < today && a.kind === "safety")) continue;
      for (const id of a.medIds) {
        const key = `${country}:${id}`;
        index.set(key, [...(index.get(key) ?? []), a]);
      }
    }
  }
  const seen = new Set<string>();
  const add = (c: Concern) => {
    const key = `${c.profileId}|${c.country}|${c.medId}|${c.kind}|${c.alert?.id ?? c.itemId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  for (const it of items) {
    if (it.finishedAt) continue;
    const state = expiryState(it.expiry, today);
    const base = {
      profileId: it.profileId,
      country: it.country,
      medId: it.medId,
      name: it.name,
      itemId: it.id,
    };
    if (state === "expired" || state === "soon") add({ ...base, kind: state });
    for (const a of index.get(`${it.country}:${it.medId}`) ?? [])
      add({ ...base, kind: a.kind, alert: a });
  }
  for (const t of treatments) {
    if (t.paused || (t.end && t.end < today)) continue;
    for (const a of index.get(`${t.country}:${t.medId}`) ?? [])
      add({
        profileId: t.profileId,
        country: t.country,
        medId: t.medId,
        name: t.name,
        kind: a.kind,
        alert: a,
      });
  }
  const weight: Record<Concern["kind"], number> = {
    shortage: 0,
    stopped: 1,
    safety: 2,
    expired: 3,
    tension: 4,
    soon: 5,
    restored: 6,
  };
  return out.sort((a, b) => weight[a.kind] - weight[b.kind] || a.name.localeCompare(b.name));
}
