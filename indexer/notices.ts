/**
 * The leaflet and RCP text of French specialties, scraped from their BDPM page
 * (no bulk file has it) for the AI features. Incremental: each run fetches the
 * pages never fetched, then the oldest, within a page and time budget, at a
 * polite rate. The state lives in the Action's cache between runs.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseExtrait } from "../shared/countries/fr/notice";
import { extraitUrl } from "../shared/countries/fr/parse";
import { Docs, type Medicine } from "../shared/schema";
import { exists, get, log, readJson, sleep, writeJson } from "./io";

interface DocState {
  /** ISO time of the last fetch. */
  at: string;
  /** Number of sections found; 0 when the page has no leaflet. */
  n: number;
}

export interface NoticeOptions {
  outDir: string;
  cacheDir: string;
  limit: number;
  minutes: number;
  /** Pages fetched at once; each worker waits `delayMs` between pages. */
  concurrency?: number;
  delayMs?: number;
  /** Pages older than this are fetched again. */
  maxAgeDays?: number;
}

export const docPath = (outDir: string, cis: string) =>
  join(outDir, "fr", "docs", `${cis}.json.gz`);

/** Fetches what the budget allows, then marks every medicine that has docs. Returns how many have. */
export async function scrapeNotices(meds: Medicine[], o: NoticeOptions): Promise<number> {
  const statePath = join(o.cacheDir, "fr", "docs-state.json");
  const state = (await readJson<Record<string, DocState>>(statePath)) ?? {};
  const maxAge = (o.maxAgeDays ?? 30) * 86_400_000;
  const now = Date.now();
  const stale = (cis: string) => {
    const s = state[cis];
    return !s || now - Date.parse(s.at) > maxAge;
  };
  // Never fetched before stale, marketed before not; then the oldest.
  const rank = (m: Medicine) => (state[m.id] ? 2 : 0) + (m.marketed ? 0 : 1);
  const queue = meds
    .filter((m) => stale(m.id))
    .sort(
      (a, b) => rank(a) - rank(b) || (state[a.id]?.at ?? "").localeCompare(state[b.id]?.at ?? ""),
    )
    .slice(0, o.limit)
    .map((m) => m.id);

  const deadline = now + o.minutes * 60_000;
  await mkdir(join(o.outDir, "fr", "docs"), { recursive: true });
  let fetched = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length && Date.now() < deadline) {
      const cis = queue.shift();
      if (!cis) break;
      try {
        const html = await (await get(extraitUrl(cis), { tries: 2, timeoutMs: 30_000 })).text();
        const sections = parseExtrait(html);
        const at = new Date().toISOString();
        if (sections.length) {
          const docs = Docs.parse({ id: cis, fetchedAt: at, sections });
          await writeFile(docPath(o.outDir, cis), Bun.gzipSync(JSON.stringify(docs)));
        }
        state[cis] = { at, n: sections.length };
        fetched++;
        if (fetched % 250 === 0) {
          log(`notices: ${fetched} fetched, ${queue.length} left in this run`);
          await writeJson(statePath, state);
        }
      } catch (err) {
        failed++;
        if (failed <= 10) log(`notices: ${cis} failed,`, err instanceof Error ? err.message : err);
      }
      await sleep(o.delayMs ?? 400);
    }
  };
  await Promise.all(Array.from({ length: o.concurrency ?? 3 }, worker));
  await writeJson(statePath, state);
  log(`notices: ${fetched} fetched, ${failed} failed, ${queue.length} left for the next run`);

  let withDocs = 0;
  for (const m of meds) {
    if ((state[m.id]?.n ?? 0) > 0 && (await exists(docPath(o.outDir, m.id)))) {
      m.docs = "static";
      withDocs++;
    }
  }
  return withDocs;
}
