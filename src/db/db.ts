/** IndexedDB, through idb. Everything personal stays here, on the device. */
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { Alert, CountryId, Manifest, Medicine, SearchEntry } from "../../shared/schema";
import { Backup, type Intake, type Item, type Profile, type Treatment } from "./model";

/** A country's index imported in the browser, used instead of the published one. */
export interface LocalDataset {
  country: CountryId;
  manifest: Manifest;
  search: SearchEntry[];
  alerts: Alert[];
}

interface MedocDB extends DBSchema {
  kv: { key: string; value: unknown };
  profiles: { key: string; value: Profile };
  items: { key: string; value: Item; indexes: { profileId: string } };
  treatments: { key: string; value: Treatment; indexes: { profileId: string } };
  intakes: { key: string; value: Intake; indexes: { treatmentId: string; date: string } };
  datasets: { key: string; value: LocalDataset };
  localMeds: { key: string; value: Medicine };
  localCodes: { key: string; value: string };
  aiCache: { key: string; value: { value: unknown; at: string } };
}

let dbp: Promise<IDBPDatabase<MedocDB>> | null = null;

export function db(): Promise<IDBPDatabase<MedocDB>> {
  dbp ??= openDB<MedocDB>("medoc-ai", 1, {
    upgrade(d) {
      d.createObjectStore("kv");
      d.createObjectStore("profiles", { keyPath: "id" });
      d.createObjectStore("items", { keyPath: "id" }).createIndex("profileId", "profileId");
      d.createObjectStore("treatments", { keyPath: "id" }).createIndex("profileId", "profileId");
      const intakes = d.createObjectStore("intakes", { keyPath: "id" });
      intakes.createIndex("treatmentId", "treatmentId");
      intakes.createIndex("date", "date");
      d.createObjectStore("datasets", { keyPath: "country" });
      d.createObjectStore("localMeds");
      d.createObjectStore("localCodes");
      d.createObjectStore("aiCache");
    },
  });
  return dbp;
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("kv", key)) as T | undefined;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await (await db()).put("kv", value, key);
}

export async function allProfiles(): Promise<Profile[]> {
  return (await (await db()).getAll("profiles")).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

export async function putProfile(p: Profile): Promise<void> {
  await (await db()).put("profiles", p);
}

/** Deletes a profile and everything that is theirs. */
export async function deleteProfile(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["profiles", "items", "treatments", "intakes"], "readwrite");
  await tx.objectStore("profiles").delete(id);
  for (const store of ["items", "treatments"] as const) {
    for (const key of await tx.objectStore(store).index("profileId").getAllKeys(id))
      await tx.objectStore(store).delete(key);
  }
  for (const i of await tx.objectStore("intakes").getAll()) {
    if (i.profileId === id) await tx.objectStore("intakes").delete(i.id);
  }
  await tx.done;
}

export async function itemsOf(profileId: string): Promise<Item[]> {
  return (await db()).getAllFromIndex("items", "profileId", profileId);
}

export async function allItems(): Promise<Item[]> {
  return (await db()).getAll("items");
}

export async function putItem(item: Item): Promise<void> {
  await (await db()).put("items", item);
}

export async function deleteItem(id: string): Promise<void> {
  await (await db()).delete("items", id);
}

export async function treatmentsOf(profileId: string): Promise<Treatment[]> {
  return (await db()).getAllFromIndex("treatments", "profileId", profileId);
}

export async function allTreatments(): Promise<Treatment[]> {
  return (await db()).getAll("treatments");
}

export async function putTreatment(t: Treatment): Promise<void> {
  await (await db()).put("treatments", t);
}

export async function deleteTreatment(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["treatments", "intakes"], "readwrite");
  await tx.objectStore("treatments").delete(id);
  for (const key of await tx.objectStore("intakes").index("treatmentId").getAllKeys(id))
    await tx.objectStore("intakes").delete(key);
  await tx.done;
}

export async function intakesOn(date: string): Promise<Intake[]> {
  return (await db()).getAllFromIndex("intakes", "date", date);
}

export async function intakesOf(treatmentId: string): Promise<Intake[]> {
  return (await db()).getAllFromIndex("intakes", "treatmentId", treatmentId);
}

export async function putIntake(i: Intake): Promise<void> {
  await (await db()).put("intakes", i);
}

export async function deleteIntake(id: string): Promise<void> {
  await (await db()).delete("intakes", id);
}

export async function aiCached<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("aiCache", key))?.value as T | undefined;
}

/** Resolves once the write is committed, so a reload right after finds it. */
export async function setAiCache(key: string, value: unknown): Promise<void> {
  const tx = (await db()).transaction("aiCache", "readwrite");
  await tx.store.put({ value, at: new Date().toISOString() }, key);
  await tx.done;
}

export async function exportBackup(): Promise<Backup> {
  const d = await db();
  return {
    app: "medoc-ai",
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles: await d.getAll("profiles"),
    items: await d.getAll("items"),
    treatments: await d.getAll("treatments"),
    intakes: await d.getAll("intakes"),
  };
}

/** Replaces every profile, box, treatment and intake with the backup's. */
export async function importBackup(raw: unknown): Promise<Backup> {
  const backup = Backup.parse(raw);
  const d = await db();
  const tx = d.transaction(["profiles", "items", "treatments", "intakes"], "readwrite");
  for (const s of ["profiles", "items", "treatments", "intakes"] as const)
    await tx.objectStore(s).clear();
  for (const p of backup.profiles) await tx.objectStore("profiles").put(p);
  for (const i of backup.items) await tx.objectStore("items").put(i);
  for (const t of backup.treatments) await tx.objectStore("treatments").put(t);
  for (const i of backup.intakes) await tx.objectStore("intakes").put(i);
  await tx.done;
  return backup;
}

/** Deletes everything stored on this device by the app, the AI key aside (llm-connect owns it). */
export async function wipeAll(): Promise<void> {
  const d = await db();
  const stores = [
    "kv",
    "profiles",
    "items",
    "treatments",
    "intakes",
    "datasets",
    "localMeds",
    "localCodes",
    "aiCache",
  ] as const;
  const tx = d.transaction(stores, "readwrite");
  for (const s of stores) await tx.objectStore(s).clear();
  await tx.done;
}

export async function localDataset(country: CountryId): Promise<LocalDataset | undefined> {
  return (await db()).get("datasets", country);
}

export async function allLocalDatasets(): Promise<LocalDataset[]> {
  return (await db()).getAll("datasets");
}

export async function localMedicine(country: CountryId, id: string): Promise<Medicine | undefined> {
  return (await db()).get("localMeds", `${country}:${id}`);
}

export async function localCode(country: CountryId, code: string): Promise<string | undefined> {
  return (await db()).get("localCodes", `${country}:${code}`);
}

/** Stores a dataset imported in the browser, replacing that country's previous one. */
export async function saveLocalDataset(
  dataset: LocalDataset,
  meds: Medicine[],
  codes: Record<string, string>,
): Promise<void> {
  await removeLocalDataset(dataset.country);
  const d = await db();
  const tx = d.transaction(["datasets", "localMeds", "localCodes"], "readwrite");
  await tx.objectStore("datasets").put(dataset);
  for (const m of meds) await tx.objectStore("localMeds").put(m, `${dataset.country}:${m.id}`);
  for (const [code, id] of Object.entries(codes))
    await tx.objectStore("localCodes").put(id, `${dataset.country}:${code}`);
  await tx.done;
}

export async function removeLocalDataset(country: CountryId): Promise<void> {
  const d = await db();
  const tx = d.transaction(["datasets", "localMeds", "localCodes"], "readwrite");
  await tx.objectStore("datasets").delete(country);
  const range = IDBKeyRange.bound(`${country}:`, `${country}:\uffff`);
  await tx.objectStore("localMeds").delete(range);
  await tx.objectStore("localCodes").delete(range);
  await tx.done;
}
