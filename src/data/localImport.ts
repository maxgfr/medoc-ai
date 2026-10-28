/** Runs the import worker and stores its index in IndexedDB, in place of the published one. */
import { type CountryId, searchEntry } from "../../shared/schema";
import { saveLocalDataset } from "../db/db";
import type { ImportRequest, ImportResponse } from "./import.worker";
import { forget } from "./repo";

export async function importFiles(country: CountryId, files: File[]): Promise<number> {
  const payload: ImportRequest = {
    country,
    files: await Promise.all(
      files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    ),
  };
  const worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
  try {
    const res = await new Promise<ImportResponse>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<ImportResponse>) => resolve(e.data);
      worker.onerror = (e) => reject(new Error(e.message));
      worker.postMessage(
        payload,
        payload.files.map((f) => f.bytes.buffer as ArrayBuffer),
      );
    });
    if (!res.ok) throw new Error(res.error);
    await saveLocalDataset(
      { country, manifest: res.manifest, search: res.meds.map(searchEntry), alerts: res.alerts },
      res.meds,
      res.codes,
    );
    forget(country);
    return res.meds.length;
  } finally {
    worker.terminate();
  }
}

/** Fetches a country's codes and search index once, so the service worker keeps them for offline scans. */
export async function prefetchCountry(
  country: CountryId,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const base = `${import.meta.env.BASE_URL}data/${country}`;
  const urls = [
    `${base}/search.json`,
    ...Array.from(
      { length: 256 },
      (_, i) => `${base}/codes/${i.toString(16).padStart(2, "0")}.json`,
    ),
  ];
  let done = 0;
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        await fetch(url).catch(() => null);
        onProgress?.(++done, urls.length);
      }
    }),
  );
}
