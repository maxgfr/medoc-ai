/**
 * The leaflet and RCP text of French specialties, scraped from their BDPM page
 * (no bulk file has it) for the AI features. Incremental: each run fetches the
 * pages never fetched, then those older than their refresh age (2 days for
 * marketed medicines, 7 for the others), oldest first, within a page and time
 * budget, at a polite rate. Leaflets of specialties gone from the BDPM are
 * deleted. The state lives in the Action's cache between runs.
 */

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseExtrait, textDate } from "../shared/countries/fr/notice";
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
  /** Pages fetched at once (2); each worker waits `delayMs` (600) between pages: about 3 pages a second. */
  concurrency?: number;
  delayMs?: number;
  /** Pages older than this are fetched again: marketed medicines, then the others. */
  maxAgeDays?: { marketed: number; other: number };
}

export const REFRESH_DAYS = { marketed: 2, other: 7 };

/** Failures in a row before a pause, the pause, and the pauses allowed in one run. */
export const BREAKER = { failures: 8, pauseMs: 120_000, pauses: 3 };

export const docPath = (outDir: string, cis: string) =>
  join(outDir, "fr", "docs", `${cis}.json.gz`);

/** Fetches what the budget allows, then marks every medicine that has docs. Returns how many have. */
export async function scrapeNotices(meds: Medicine[], o: NoticeOptions): Promise<number> {
  const statePath = join(o.cacheDir, "fr", "docs-state.json");
  const state = (await readJson<Record<string, DocState>>(statePath)) ?? {};
  const ages = o.maxAgeDays ?? REFRESH_DAYS;
  const now = Date.now();
  const stale = (m: Medicine) => {
    const s = state[m.id];
    return !s || now - Date.parse(s.at) > (m.marketed ? ages.marketed : ages.other) * 86_400_000;
  };

  // Specialties gone from the BDPM: their leaflet goes too.
  const current = new Set(meds.map((m) => m.id));
  const dir = join(o.outDir, "fr", "docs");
  await mkdir(dir, { recursive: true });
  let removed = 0;
  for (const f of await readdir(dir)) {
    const cis = f.replace(/\.json\.gz$/, "");
    if (current.has(cis)) continue;
    await rm(join(dir, f), { force: true });
    delete state[cis];
    removed++;
  }
  if (removed) log(`notices: ${removed} leaflets of withdrawn specialties removed`);

  // Never fetched before stale, marketed before not; then the oldest.
  const rank = (m: Medicine) => (state[m.id] ? 2 : 0) + (m.marketed ? 0 : 1);
  const queue = meds
    .filter((m) => stale(m))
    .sort(
      (a, b) => rank(a) - rank(b) || (state[a.id]?.at ?? "").localeCompare(state[b.id]?.at ?? ""),
    )
    .slice(0, o.limit)
    .map((m) => m.id);

  const deadline = now + o.minutes * 60_000;
  let fetched = 0;
  let failed = 0;
  // The BDPM is a public service: a server that stops answering gets a break, and after a few
  // breaks the run leaves the rest for the next one rather than getting the runners blocked.
  let consecutive = 0;
  let pauses = 0;
  let pauseUntil = 0;
  let stopped = false;
  const worker = async () => {
    while (queue.length && Date.now() < deadline && !stopped) {
      if (Date.now() < pauseUntil) {
        await sleep(pauseUntil - Date.now());
        continue;
      }
      const cis = queue.shift();
      if (!cis) break;
      let html: string;
      try {
        html = await (await get(extraitUrl(cis), { tries: 2, timeoutMs: 30_000 })).text();
        consecutive = 0;
      } catch (err) {
        failed++;
        queue.push(cis);
        if (failed <= 10) log(`notices: ${cis} failed,`, err instanceof Error ? err.message : err);
        if (++consecutive >= BREAKER.failures && Date.now() >= pauseUntil) {
          consecutive = 0;
          if (++pauses > BREAKER.pauses) {
            stopped = true;
            log("notices: the BDPM keeps failing; the rest is left for the next run");
          } else {
            pauseUntil = Date.now() + BREAKER.pauseMs;
            log(`notices: the BDPM is not answering; pause ${pauses} of ${BREAKER.pauses}`);
          }
        }
        continue;
      }
      try {
        const sections = parseExtrait(html);
        const at = new Date().toISOString();
        // A page that had a leaflet and comes back without one is more likely an error page than a withdrawal.
        if (!sections.length && (state[cis]?.n ?? 0) > 0)
          throw new Error("no leaflet in the page any more");
        if (sections.length) {
          const updatedAt = textDate(html);
          const docs = Docs.parse({
            id: cis,
            fetchedAt: at,
            ...(updatedAt ? { updatedAt } : {}),
            sections,
          });
          await writeFile(docPath(o.outDir, cis), Bun.gzipSync(JSON.stringify(docs)));
        } else await rm(docPath(o.outDir, cis), { force: true });
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
      await sleep(o.delayMs ?? 600);
    }
  };
  await Promise.all(Array.from({ length: o.concurrency ?? 2 }, worker));
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
