import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { type LlmSettings, resolveCapabilities } from "llm-connect";
import { parseExtrait } from "../../shared/countries/fr/notice";
import type { DocSection } from "../../shared/schema";
import { createTranslator } from "../i18n";
import { AiError, aiError, type CallContext } from "./call";
import { buildContext, interactionPriority, validCitations } from "./context";
import { ask, interactions, readBox, summarize } from "./medical";

const settings: LlmSettings = {
  apiKey: "sk-test-123456",
  model: "gpt-test",
  providerId: "openai",
  providerNpm: "@ai-sdk/openai",
  language: "fr",
};
const t = createTranslator("en");

function answering(json: unknown) {
  const prompts: unknown[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(options.prompt);
      return {
        content: [{ type: "text", text: JSON.stringify(json) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
  return { model, prompts };
}

const caps = (vision: boolean) =>
  resolveCapabilities({
    kind: "openai",
    modelId: "gpt-test",
    override: { vision, contextWindow: 128_000 },
  });

const sections = parseExtrait(
  readFileSync(
    join(import.meta.dir, "../../shared/countries/fr/fixtures/extrait-60234100.html"),
    "utf8",
  ),
);
const doliprane = { key: "m1", medName: "DOLIPRANE 1000 mg, comprimé", sections };

const ctx = (model: MockLanguageModelV4, vision = true): CallContext => ({
  settings,
  t,
  model,
  capabilities: caps(vision),
});

describe("context", () => {
  test("keeps the sections a priority wants, within the budget, in page order", () => {
    const c = buildContext([doliprane], 3_000, interactionPriority);
    expect([...c.ids.keys()]).toEqual(["notice-2", "rcp-4.3", "rcp-4.5"]);
    expect(c.ids.has("rcp-4.5")).toBe(true);
    expect(c.ids.has("notice-1")).toBe(false);
    expect(c.text.length).toBeLessThan(3_800);
  });

  test("several medicines get prefixed ids; unknown citations are dropped", () => {
    const other = {
      key: "m2",
      medName: "OTHER",
      sections: [
        { id: "rcp-4.5", doc: "rcp", title: "4.5.", level: 2, text: "Nothing." } as DocSection,
      ],
    };
    const c = buildContext([doliprane, other], 20_000, interactionPriority);
    expect(c.ids.has("m1:rcp-4.5")).toBe(true);
    expect(c.ids.has("m2:rcp-4.5")).toBe(true);
    expect(validCitations(["m2:rcp-4.5", "m9:rcp-1", " m2:rcp-4.5 "], c)).toEqual(["m2:rcp-4.5"]);
  });
});

describe("calls", () => {
  test("summary: the leaflet goes to the model, citations are checked", async () => {
    const { model, prompts } = answering({
      purpose: ["Douleur et fièvre"],
      howToTake: ["1 comprimé, à renouveler après 4 heures"],
      doNotTake: [],
      sideEffects: [],
      warnings: [],
      citations: ["notice-1", "invented-9"],
    });
    const out = await summarize(ctx(model), "fr", doliprane);
    expect(out.purpose).toEqual(["Douleur et fièvre"]);
    expect(out.citations).toEqual(["notice-1"]);
    expect(JSON.stringify(prompts[0])).toContain("Answer in French");
    expect(JSON.stringify(prompts[0])).toContain("Antivitamines K");
  });

  test("question with history", async () => {
    const { model, prompts } = answering({ answer: "Non.", found: true, citations: ["rcp-4.6"] });
    const out = await ask(ctx(model), "en", doliprane, "Pregnant?", [
      { question: "Max dose?", answer: "4 g" },
    ]);
    expect(out).toMatchObject({ answer: "Non.", found: true, citations: ["rcp-4.6"] });
    expect(JSON.stringify(prompts[0])).toContain("Max dose?");
  });

  test("interactions between medicines", async () => {
    const { model } = answering({
      pairs: [
        {
          a: "DOLIPRANE",
          b: "COUMADINE",
          severity: "caution",
          explanation: "INR",
          citations: ["m1:rcp-4.5"],
        },
      ],
      notes: [],
    });
    const out = await interactions(ctx(model), "fr", [
      doliprane,
      { ...doliprane, key: "m2", medName: "COUMADINE" },
    ]);
    expect(out.pairs[0]?.citations).toEqual(["m1:rcp-4.5"]);
  });

  test("a photo needs a vision model", async () => {
    const { model } = answering({});
    await expect(
      readBox(ctx(model, false), { data: new Uint8Array([1]), mediaType: "image/jpeg" }),
    ).rejects.toBeInstanceOf(AiError);
  });

  test("errors are translated and never show the key", () => {
    const err = aiError(
      Object.assign(new Error("Incorrect API key sk-test-123456"), { statusCode: 401 }),
      { settings, t },
    );
    expect(err.message).not.toContain("sk-test-123456");
  });
});
