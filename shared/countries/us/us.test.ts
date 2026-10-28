import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dashed, labelSections, ndcCandidates, ndcFromGtin, parseNdc } from "./parse";

const dir = join(import.meta.dir, "fixtures");
const ndc = JSON.parse(readFileSync(join(dir, "ndc.json"), "utf8"));
const label = JSON.parse(readFileSync(join(dir, "label.json"), "utf8")).results[0];

describe("NDC directory", () => {
  const { meds, codes } = parseNdc(ndc, "2026-10-28");

  test("human products only; bulk ingredients are left out", () => {
    expect(meds.map((m) => m.id)).toEqual(["71309-001", "71334-220"]);
  });

  test("a product NDC listed twice (two SPL versions) is one medicine with every pack", () => {
    const first = ndc.results[0];
    const older = {
      ...first,
      brand_name: "OLD NAME",
      marketing_start_date: "20100101",
      packaging: [{ package_ndc: "71309-001-99", description: "older pack" }],
    };
    const out = parseNdc({ results: [older, first] }, "2026-10-28");
    expect(out.meds).toHaveLength(1);
    expect(out.meds[0]?.name).toStartWith("Extra Strength No-Pain");
    expect(out.meds[0]?.packs.map((p) => p.code).sort()).toEqual([
      "7130900105",
      "7130900140",
      "7130900199",
    ]);
    expect(out.codes["7130900199"]).toBe("71309-001");
  });

  test("a product with its packages, keyed by dashless NDC-10", () => {
    const m = meds[0];
    expect(m).toMatchObject({
      name: "Extra Strength No-Pain (acetaminophen)",
      form: "tablet",
      otc: true,
      docs: "live",
      ref: "873f01dd-0701-5fd3-e053-2a95a90a6463",
    });
    expect(codes["7130900105"]).toBe("71309-001");
    expect(m?.links[0]?.url).toContain("dailymed.nlm.nih.gov");
  });
});

describe("codes", () => {
  test("a UPC-A carries the NDC-10", () => {
    expect(ndcFromGtin("0371309001051")).toBe("7130900105");
    expect(ndcFromGtin("3400949497294")).toBeUndefined();
  });
  test("an 11-digit billing NDC maps back to the NDC-10s it may be", () => {
    expect(ndcCandidates("71309000105")).toContain("7130900105");
    expect(ndcCandidates("7130900105")).toEqual(["7130900105"]);
    expect(dashed("7130900105")).toContain("71309-001-05");
  });
});

describe("label", () => {
  test("an OTC Drug Facts label becomes leaflet sections", () => {
    const sections = labelSections(label);
    expect(sections.length).toBeGreaterThan(4);
    expect(sections.every((s) => s.doc === "notice")).toBe(true);
    expect(sections.find((s) => s.id === "label-purpose")?.text).toBe(
      "Pain reliever/fever reducer",
    );
  });
});
