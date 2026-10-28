import { describe, expect, test } from "bun:test";
import { parseCode } from "../../shared/codes/gs1";
import type { Manifest } from "../../shared/schema";
import { interleave, isOld } from "../data/repo";
import { countryOrder, owners } from "./resolve";

const all = ["fr", "de", "us", "uk"] as const;

describe("which country a code is looked up in first", () => {
  test("the country that issued the code, whatever the search scope", () => {
    const cip = parseCode("3400935955838");
    const pzn = parseCode("-00240365");
    const upc = parseCode("371309001051");
    if (!cip || !pzn || !upc) throw new Error("fixtures");
    expect(countryOrder(cip, "us", [...all])[0]).toBe("fr");
    expect(countryOrder(pzn, "all", [...all])[0]).toBe("de");
    expect(countryOrder(upc, "fr", [...all])[0]).toBe("us");
    expect(owners(pzn)).toEqual(["de"]);
  });

  test("otherwise the scope's country, then every other one", () => {
    const unknown = parseCode("1234567");
    if (!unknown) throw new Error("fixture");
    expect(countryOrder(unknown, "us", [...all])).toEqual(["us", "fr", "de", "uk"]);
    expect(countryOrder(unknown, "all", ["fr", "de"])).toEqual(["fr", "de"]);
    expect(countryOrder(unknown, "uk", ["fr", "de"])).toEqual(["fr", "de"]);
  });
});

describe("search across countries", () => {
  test("results are taken in turns, so every country shows its best ones", () => {
    expect(interleave([["fr1", "fr2", "fr3", "fr4"], ["de1"], [], ["us1", "us2"]], 5)).toEqual([
      "fr1",
      "de1",
      "us1",
      "fr2",
      "us2",
    ]);
  });
});

describe("index age", () => {
  const m = (generatedAt: string) => ({ generatedAt }) as Manifest;
  test("an index built twice a day is old after two days", () => {
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(isOld(m("2026-10-28T04:30:00Z"), now)).toBe(false);
    expect(isOld(m("2026-10-26T13:00:00Z"), now)).toBe(false);
    expect(isOld(m("2026-10-26T11:00:00Z"), now)).toBe(true);
  });
});
