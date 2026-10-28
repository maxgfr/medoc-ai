import { describe, expect, test } from "bun:test";
import * as dmd from "./fixtures/dmd";
import { dmdFileOf, parseDmd } from "./parse";

describe("dm+d", () => {
  const { meds, codes } = parseDmd(dmd);

  test("one medicine per valid AMP, with its VMP's substances, form and route", () => {
    expect(meds).toHaveLength(1);
    expect(meds[0]).toMatchObject({
      id: "3271211000001109",
      country: "uk",
      name: "Calpol Infant 120mg/5ml oral suspension",
      holder: "Johnson & Johnson Ltd",
      form: "oral suspension",
      routes: ["oral"],
      substances: [{ name: "Paracetamol", strength: "120 mg", per: "5 ml" }],
      otc: true,
      marketed: true,
    });
  });

  test("current GTINs resolve to the AMP; ended ones do not", () => {
    expect(codes["5010123456784"]).toBe("3271211000001109");
    expect(codes["5010123450003"]).toBeUndefined();
  });

  test("leaflets are searched on MHRA and EMC", () => {
    expect(meds[0]?.links.map((l) => l.kind)).toEqual(["mhra", "emc"]);
    expect(meds[0]?.links[0]?.url).toContain("search=Calpol%20Infant");
  });

  test("zip entry names", () => {
    expect(dmdFileOf("week432026/f_ampp2_3281026.xml")).toBe("ampp");
    expect(dmdFileOf("f_gtin2_0_3281026.xml")).toBe("gtin");
    expect(dmdFileOf("readme.txt")).toBeUndefined();
  });
});
