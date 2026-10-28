import { describe, expect, test } from "bun:test";
import { citationLabel, linkCitations } from "./Markdown";

describe("citations in answers", () => {
  const titles = new Map([
    ["rcp-4.5", "4.5. Interactions avec d'autres médicaments"],
    ["m2:notice-3", "3. COMMENT PRENDRE [X]"],
    ["label-drug_interactions", 'Drug interactions with "quotes" and a very long title'],
  ]);

  test("a cited section becomes a short link to it, its full title as tooltip", () => {
    expect(linkCitations("Avec un AVK [rcp-4.5].", titles)).toBe(
      'Avec un AVK  [RCP 4.5](#cite:rcp-4.5 "4.5. Interactions avec d\'autres médicaments").',
    );
    expect(linkCitations("[m2:notice-3]", titles)).toBe(
      ' [Notice 3](#cite:m2%3Anotice-3 "3. COMMENT PRENDRE X")',
    );
  });

  test("an unknown section disappears", () => {
    expect(linkCitations("Inventé [rcp-9.9].", titles)).toBe("Inventé .");
  });

  test("other sections are labelled by the start of their title, without quotes or brackets", () => {
    expect(
      citationLabel("label-drug_interactions", titles.get("label-drug_interactions") ?? ""),
    ).toBe("Drug interactions with quot…");
  });
});
