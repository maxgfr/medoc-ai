/** Downloads and file writes shared by the country indexers. */
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const USER_AGENT = "medoc-ai-indexer/1.0 (+https://github.com/maxgfr/medoc-ai)";

export const log = (...args: unknown[]) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GetOptions {
  tries?: number;
  timeoutMs?: number;
  /** First wait between tries; it doubles each time, up to 3 minutes (or what Retry-After asks). */
  backoffMs?: number;
}

/** The wait a 429 or 503 asks for (Retry-After, in seconds or as a date), capped at 5 minutes. */
function retryAfter(res: Response): number | undefined {
  const v = res.headers.get("retry-after");
  if (!v) return undefined;
  const ms = /^\d+$/.test(v) ? Number(v) * 1000 : Date.parse(v) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 300_000) : undefined;
}

/**
 * GET with a timeout and retries spaced out, so a server that is busy or
 * briefly refusing a runner gets a few minutes to come back; throws after the
 * last try. 404 and auth errors are not retried.
 */
export async function get(
  url: string,
  { tries = 3, timeoutMs = 120_000, backoffMs = 5_000 }: GetOptions = {},
): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    let wait = Math.min(backoffMs * 2 ** i, 180_000);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      last = new Error(`${url}: HTTP ${res.status}`);
      if (res.status === 404 || res.status === 401 || res.status === 403) break;
      wait = retryAfter(res) ?? wait;
    } catch (err) {
      last = err;
    }
    if (i < tries - 1) {
      log(
        `${url}: try ${i + 1} failed (${last instanceof Error ? last.message : last}), next in ${Math.round(wait / 1000)} s`,
      );
      await sleep(wait);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/**
 * Downloads a source file to `path` (the raw cache) and returns the bytes. Six
 * tries over about ten minutes: a source down for a moment does not cost the
 * day's update.
 */
export async function download(
  url: string,
  path: string,
  options: GetOptions = {},
): Promise<Uint8Array> {
  const bytes = new Uint8Array(
    await (
      await get(url, { tries: 6, timeoutMs: 90_000, backoffMs: 15_000, ...options })
    ).arrayBuffer(),
  );
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
