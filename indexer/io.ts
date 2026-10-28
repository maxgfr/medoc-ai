/** Downloads and file writes shared by the country indexers. */
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const USER_AGENT = "medoc-ai-indexer/1.0 (+https://github.com/maxgfr/medoc-ai)";

export const log = (...args: unknown[]) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET with retries and a timeout; throws on a non-2xx answer after the last try. */
export async function get(url: string, { tries = 3, timeoutMs = 120_000 } = {}): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      last = new Error(`${url}: HTTP ${res.status}`);
      if (res.status === 404 || res.status === 401 || res.status === 403) break;
    } catch (err) {
      last = err;
    }
    await sleep(2000 * (i + 1));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** Downloads `url` to `path` (the raw cache) and returns the bytes. */
export async function download(url: string, path: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return bytes;
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function emptyDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}
