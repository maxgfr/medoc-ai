import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BDPM_FILES, type BdpmFile, parseBdpm } from "../shared/countries/fr/parse";
import { shardOf } from "../shared/schema";
import { decodeBytes } from "../shared/text";
import { auditCountry } from "./audit";
import { writeIndex } from "./write";

const fixtures = join(import.meta.dir, "../shared/countries/fr/fixtures");

async function build(): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "medoc-audit-"));
  const files: Partial<Record<BdpmFile, string>> = {};
  for (const f of BDPM_FILES) {
    try {
      files[f] = decodeBytes(readFileSync(join(fixtures, `${f}.txt`)));
    } catch {}
  }
  await writeIndex(out, "fr", {
    ...parseBdpm(files, "2026-10-28"),
    sources: [],
    attribution: "test",
    licence: "test",
    search: "static",
    docs: 0,
  });
  return out;
}

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));

describe("data audit", () => {
  let out = "";
  beforeAll(async () => {
    out = await build();
  });

  test("a sound index passes, its canaries resolve", async () => {
    const r = await auditCountry(out, "fr", { minimum: 1 });
    expect(r.errors).toEqual([]);
    expect(r.stats.medicines).toBe(3);
  });

  test("a code that points nowhere, a duplicate, a wrong count and a broken canary fail", async () => {
    const broken = await build();
    const code = "3400935955838";
    const codesPath = join(broken, "fr", "codes", `${shardOf(code)}.json`);
    write(codesPath, { ...read(codesPath), [code]: "99999999" });
    const manifestPath = join(broken, "fr", "manifest.json");
    write(manifestPath, {
      ...read(manifestPath),
      counts: { ...read(manifestPath).counts, medicines: 4 },
    });
    const searchPath = join(broken, "fr", "search.json");
    const search = read(searchPath);
    write(searchPath, [...search, search[0]]);
    const r = await auditCountry(broken, "fr", { minimum: 1 });
    const text = r.errors.join("\n");
    expect(text).toContain("3400935955838 → 99999999, which is not in the index");
    expect(text).toContain("manifest says 4");
    expect(text).toContain("listed twice");
    expect(text).toContain("canary: 3400935955838");
  });

  test("an index far smaller than usual is an error; an old one a warning", async () => {
    const r = await auditCountry(out, "fr", { now: Date.now() + 3 * 86_400_000 });
    expect(r.errors.join()).toContain("minimum 10000");
    expect(r.warnings.join()).toContain("hours ago");
  });
});
