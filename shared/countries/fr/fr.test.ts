import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeBytes } from "../../text";
import { parseExtrait } from "./notice";
import { BDPM_FILES, type BdpmFile, bdpmFileOf, parseBdpm } from "./parse";

const dir = join(import.meta.dir, "fixtures");

function fixtures(): Partial<Record<BdpmFile, string>> {
  const out: Partial<Record<BdpmFile, string>> = {};
  for (const f of BDPM_FILES) {
    try {
      out[f] = decodeBytes(readFileSync(join(dir, `${f}.txt`)));
    } catch {}
  }
  return out;
}

describe("BDPM files", () => {
  const { meds, codes, alerts } = parseBdpm(fixtures(), "2026-10-28");
  const doliprane = meds.find((m) => m.id === "60234100");

  test("mixed encodings decode to the same accents", () => {
    // CIS_bdpm is Windows-1252, CIS_CIP_bdpm UTF-8.
    expect(doliprane?.name).toBe("DOLIPRANE 1000 mg, comprimé");
    expect(doliprane?.packs[0]?.label).toContain("thermoformée");
  });

  test("a specialty joins its packs, substances, assessments and conditions", () => {
    expect(doliprane).toMatchObject({
      country: "fr",
      form: "comprimé",
      routes: ["orale"],
      marketed: true,
      authorisedAt: "2002-07-09",
      substances: [{ name: "PARACÉTAMOL", strength: "1000 mg", per: "un comprimé" }],
      smr: { level: "Important", date: "2015-04-01" },
    });
    expect(doliprane?.packs.map((p) => p.code)).toEqual(["3400935955838", "3400956369553"]);
    expect(doliprane?.packs[0]).toMatchObject({
      price: 2.18,
      reimbursement: "65%",
      marketed: true,
    });
    expect(doliprane?.links.some((l) => l.kind === "has")).toBe(true);
  });

  test("CIP13 and CIP7 both resolve to the CIS", () => {
    expect(codes["3400935955838"]).toBe("60234100");
    expect(codes["3595583"]).toBe("60234100");
  });

  test("shortages and safety information become alerts; MITM marks major medicines", () => {
    const brevibloc = meds.find((m) => m.id === "63922956");
    expect(brevibloc?.major).toBe(true);
    expect(brevibloc?.atc).toBe("C07AB09");
    const shortage = alerts.find((a) => a.kind === "shortage");
    expect(shortage).toMatchObject({ medIds: ["63922956"], start: "2026-10-26" });
    expect(brevibloc?.links.some((l) => l.kind === "ansm")).toBe(true);
    const safety = alerts.find((a) => a.kind === "safety");
    expect(safety?.title).toBe("Protoxyde d'azote : des intoxications en hausse");
    expect(safety?.url).toStartWith("https://ansm.sante.fr/");
  });

  test("expired safety information is left out", () => {
    const later = parseBdpm(fixtures(), "2027-01-01");
    expect(later.alerts.some((a) => a.kind === "safety")).toBe(false);
  });

  test("file names someone drops in", () => {
    expect(bdpmFileOf("CIS_bdpm.txt")).toBe("CIS_bdpm");
    expect(bdpmFileOf("CIS_InfoImportantes_20261028103010_bdpm.txt")).toBe("CIS_InfoImportantes");
    expect(bdpmFileOf("notes.txt")).toBeUndefined();
  });
});

describe("leaflet and RCP page", () => {
  const sections = parseExtrait(readFileSync(join(dir, "extrait-60234100.html"), "utf8"));
  const byId = new Map(sections.map((s) => [s.id, s]));

  test("RCP sections keep their numbers; third-level headings stay in their section", () => {
    const interactions = byId.get("rcp-4.5");
    expect(interactions?.title).toStartWith("4.5. Interactions");
    expect(interactions?.text).toContain("Antivitamines K");
    expect(interactions?.text).toContain("Flucloxacilline");
    expect(byId.get("rcp-4.3")?.text.length).toBeGreaterThan(20);
  });

  test("leaflet sections 1 to 6", () => {
    for (const n of [1, 2, 3, 4, 5])
      expect(byId.get(`notice-${n}`)?.text.length).toBeGreaterThan(50);
    expect(byId.get("notice-3")?.text).toContain("Voie orale");
  });

  test("no page chrome in the text", () => {
    for (const s of sections) {
      expect(s.text).not.toContain("Redirection vers le haut");
      expect(s.text).not.toMatch(/<\w/);
    }
  });
});
