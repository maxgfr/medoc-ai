import { describe, expect, test } from "bun:test";
import { CATALOGS, type Catalog, createTranslator, detectLocale, type Message } from "./index";

function flatten(catalog: Catalog): Map<string, Message> {
  const out = new Map<string, Message>();
  for (const [ns, table] of Object.entries(catalog)) {
    for (const [k, m] of Object.entries(table as Record<string, Message>)) out.set(`${ns}.${k}`, m);
  }
  return out;
}

const placeholders = (m: Message) =>
  [
    ...new Set(
      (typeof m === "string" ? [m] : [m.one, m.other]).flatMap((s) =>
        [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]),
      ),
    ),
  ].sort();

describe("catalogs", () => {
  const source = flatten(CATALOGS.en);
  test("fr has the same keys, kinds and placeholders as en", () => {
    const fr = flatten(CATALOGS.fr);
    expect([...fr.keys()].sort()).toEqual([...source.keys()].sort());
    for (const [key, m] of source) {
      const other = fr.get(key);
      expect([key, typeof other]).toEqual([key, typeof m]);
      if (other) expect([key, placeholders(other)]).toEqual([key, placeholders(m)]);
    }
  });

  test("no empty text", () => {
    for (const c of Object.values(CATALOGS))
      for (const [key, m] of flatten(c))
        for (const s of typeof m === "string" ? [m] : [m.one, m.other])
          expect([key, s.trim().length > 0]).toEqual([key, true]);
  });

  test("plurals and numbers follow the language", () => {
    const fr = createTranslator("fr");
    expect(fr("home.alerts", { count: 1 })).toBe("1 point demande votre attention");
    expect(fr("home.alerts", { count: 1500 })).toMatch(
      /^1\s500 points demandent votre attention$/u,
    );
    expect(createTranslator("en")("home.alerts", { count: 2 })).toBe("2 things need attention");
  });

  test("locale: stored choice, then device languages, then English", () => {
    expect(detectLocale("en", ["fr-FR"])).toBe("en");
    expect(detectLocale(null, ["fr-CA", "en"])).toBe("fr");
    expect(detectLocale(null, ["de-DE"])).toBe("en");
  });
});
