import { describe, expect, test } from "bun:test";
import { href, parseRoute, type Route } from "./router";

describe("routes", () => {
  const routes: Route[] = [
    { name: "home" },
    { name: "search", q: "doliprane 1000" },
    {
      name: "med",
      country: "fr",
      id: "60234100",
      scan: { code: "3400935955838", lot: "A1", expiry: "2027-04-30", serial: "X/9" },
    },
    { name: "newItem", country: "us", med: "71309-001", scan: { code: "7130900105" } },
    { name: "newTreatment", country: "fr", med: "60234100", item: "i1" },
    { name: "med", country: "de", id: "pzn-00240365", scan: { code: "00240365", lot: "CH4711" } },
    { name: "today", date: "2026-10-28" },
    { name: "interactions" },
  ];
  test("every route survives a round trip through the hash", () => {
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });
  test("anything else is home", () => {
    expect(parseRoute("#/med/it/123")).toEqual({ name: "home" });
    expect(parseRoute("#/nope")).toEqual({ name: "home" });
  });
});
