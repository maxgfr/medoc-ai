import { describe, expect, test } from "bun:test";
import { brandKey, eparLinks } from "./countries/ema";

describe("EMA EPAR links", () => {
  test("brand keys ignore strength, form, case and accents", () => {
    expect(brandKey("HEMLIBRA 30 mg/ml, solution injectable")).toBe("hemlibra");
    expect(brandKey("Hemlibra")).toBe("hemlibra");
    expect(brandKey("ÉVRYSDI 0,75 mg/ml")).toBe("evrysdi");
  });

  test("a name two EMA entries share links to neither", () => {
    const links = eparLinks([
      { category: "Human", name_of_medicine: "Hemlibra", medicine_url: "https://ema/hemlibra" },
      { category: "Human", name_of_medicine: "Twin", medicine_url: "https://ema/twin-1" },
      { category: "Human", name_of_medicine: "Twin", medicine_url: "https://ema/twin-2" },
      { category: "Veterinary", name_of_medicine: "Vet", medicine_url: "https://ema/vet" },
    ]);
    expect([...links.entries()]).toEqual([["hemlibra", "https://ema/hemlibra"]]);
  });
});
