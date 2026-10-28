/**
 * bun run verify-live --base https://maxgfr.github.io/medoc-ai/ [--dist dist]
 *
 * After a deployment, reads the site as visitors get it: the app version is
 * the build just deployed, every country's manifest is the index just built,
 * the canary codes resolve to their medicine through the published shards,
 * and a leaflet file opens. GitHub Pages can take a minute to serve a new
 * deployment, so each check is retried for a few minutes before failing.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import {
  COUNTRIES,
  type CountryId,
  Docs,
  Manifest,
  type Medicine,
  shardOf,
} from "../shared/schema";
import { CANARIES } from "./audit";
import { sleep } from "./io";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "https://maxgfr.github.io/medoc-ai/" },
    dist: { type: "string", default: "dist" },
    "max-wait": { type: "string", default: "300" },
  },
});
const base = (values.base ?? "").replace(/\/?$/, "/");
const dist = values.dist ?? "dist";
const deadline = Date.now() + Number(values["max-wait"]) * 1000;

async function live(path: string): Promise<Response> {
  const res = await fetch(`${base}${path}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res;
}

/** Retries `check` until it passes or the deadline; returns the last failure, or null. */
async function eventually(name: string, check: () => Promise<void>): Promise<string | null> {
  let last = "";
  for (;;) {
    try {
      await check();
      console.log(`✅ ${name}`);
      return null;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    if (Date.now() > deadline) {
      console.log(`::error title=Live site::${name}: ${last}`);
      return `${name}: ${last}`;
    }
    await sleep(15_000);
  }
}

const local = async <T>(path: string) => JSON.parse(await readFile(join(dist, path), "utf8")) as T;
const failures: string[] = [];
const note = (f: string | null) => f && failures.push(f);

const build = await local<{ version: string; commit: string }>("version.json");
note(
  await eventually(`app ${build.version} (${build.commit}) is the one served`, async () => {
    const served = (await (await live("version.json")).json()) as {
      version: string;
      commit: string;
    };
    if (served.commit !== build.commit || served.version !== build.version)
      throw new Error(`the site serves ${served.version} (${served.commit})`);
  }),
);

const countries = (await local<string[]>("data/countries.json")).filter((c): c is CountryId =>
  (COUNTRIES as readonly string[]).includes(c),
);
for (const c of countries) {
  const built = Manifest.parse(await local(`data/${c}/manifest.json`));
  note(
    await eventually(
      `${c}: index ${built.version} of ${built.generatedAt} is the one served`,
      async () => {
        const served = Manifest.parse(await (await live(`data/${c}/manifest.json`)).json());
        if (served.version !== built.version)
          throw new Error(`the site serves ${served.version} of ${served.generatedAt}`);
      },
    ),
  );
  for (const [code, id, what] of CANARIES[c] ?? []) {
    note(
      await eventually(`${c}: ${code} opens ${what}`, async () => {
        const codes = (await (
          await live(`data/${c}/codes/${shardOf(code)}.json`)
        ).json()) as Record<string, string>;
        if (codes[code] !== id) throw new Error(`resolves to ${codes[code] ?? "nothing"}`);
        const meds = (await (await live(`data/${c}/meds/${shardOf(id)}.json`)).json()) as Record<
          string,
          Medicine
        >;
        if (!meds[id]) throw new Error(`medicine ${id} is missing`);
        if (meds[id].docs === "static") {
          const bytes = new Uint8Array(
            await (await live(`data/${c}/docs/${id}.json.gz`)).arrayBuffer(),
          );
          const text =
            bytes[0] === 0x1f
              ? gunzipSync(bytes).toString("utf8")
              : new TextDecoder().decode(bytes);
          if (!Docs.parse(JSON.parse(text)).sections.length)
            throw new Error("its leaflet is empty");
        }
      }),
    );
  }
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed on ${base}`);
  process.exit(1);
}
console.log(`\nThe live site serves this deployment: ${base}`);
