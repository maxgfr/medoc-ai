import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { csvRows, decodeBytes } from "../../text";
import { emaId, germanProductInfoUrl, listUrls, parseGermany } from "./parse";

const dir = join(import.meta.dir, "fixtures");
const read = (f: string) => decodeBytes(readFileSync(join(dir, f)));

describe("Germany", () => {
  const out = parseGermany(
    {
      shortages: read("shortages.csv"),
      lists: [read("kinder.csv")],
      ema: JSON.parse(read("ema.json")),
    },
    "2026-10-28",
  );

  test("a product of the children's list, keyed by its PZN", () => {
    const id = out.codes["00240365"];
    const med = out.meds.find((m) => m.id === id);
    expect(med).toMatchObject({
      country: "de",
      name: "Ziagen 20 mg/ml Lösung zum Einnehmen - OP240ml",
      holder: "ViiV Healthcare B.V.",
      atc: "J05AF06",
      substances: [{ name: "Abacavir" }],
    });
    expect(med?.links[0]?.url).toContain("gelbe-liste.de/suche?term=00240365");
  });

  test("a row without PZN is left out", () => {
    expect(out.meds.some((m) => m.holder === "EMRA-MED Arzneimittel GmbH")).toBe(false);
  });

  test("a shortage (Windows-1252, quoted substances) becomes an alert, without contact details", () => {
    const id = out.codes["06977730"];
    const med = out.meds.find((m) => m.id === id);
    expect(med?.substances.length).toBeGreaterThan(10);
    const alert = out.alerts.find((a) => a.medIds.includes(id ?? ""));
    expect(alert).toMatchObject({ kind: "shortage", start: "2026-04-22", end: "2026-10-30" });
    expect(JSON.stringify(out)).not.toContain("@");
  });

  test("EMA products authorised in the EU, with their German product information", () => {
    const hemlibra = out.meds.find((m) => m.name === "Hemlibra");
    expect(hemlibra).toMatchObject({
      id: emaId("EMEA/H/C/004406"),
      atc: "B02BX06",
      docs: "static",
    });
    expect(hemlibra?.links[0]?.url).toBe(
      "https://www.ema.europa.eu/de/documents/product-information/hemlibra-epar-product-information_de.pdf",
    );
    expect(out.indications[hemlibra?.id ?? ""]).toContain("haemophilia A");
    expect(out.meds.filter((m) => m.id.startsWith("ema-"))).toHaveLength(1);
  });

  test("list links on the BfArM page, changelogs excluded", () => {
    const html = `<a href="https://www.bfarm.de/x/Liste_kinderarzneimittel_35absatz5a_sgb_v_csv_stand_20261021.csv?__blob=publicationFile">a</a>
      <a href="/x/changelog_Liste_kinderarzneimittel_stand.csv?__blob=publicationFile">b</a>
      <a href="/x/Dringlichkeitsliste_arzneimittelliste_stand_20261015_csv.csv?__blob=publicationFile&amp;v=2">c</a>`;
    expect(listUrls(html)).toEqual([
      "https://www.bfarm.de/x/Liste_kinderarzneimittel_35absatz5a_sgb_v_csv_stand_20261021.csv?__blob=publicationFile",
      "https://www.bfarm.de/x/Dringlichkeitsliste_arzneimittelliste_stand_20261015_csv.csv?__blob=publicationFile&v=2",
    ]);
    expect(germanProductInfoUrl("https://www.ema.europa.eu/en/medicines/human/EPAR/x")).toContain(
      "/de/documents/",
    );
  });

  test("CSV: quoted delimiters, doubled quotes, comment lines", () => {
    expect(csvRows('#Stand:1\na;"b;c";"say ""hi"""\n\nd;e;f\n', ";")).toEqual([
      ["a", "b;c", 'say "hi"'],
      ["d", "e", "f"],
    ]);
  });
});
