/**
 * The three ways the app asks a model about leaflets: a plain-language
 * summary, a question, the interactions between someone's medicines. Answers
 * come back structured and cite the sections they rely on; the app shows the
 * section titles and keeps the medical disclaimer on screen.
 */
import { languageName } from "llm-connect";
import { z } from "zod";
import type { Locale } from "../i18n";
import { type CallContext, documentBudget, structured } from "./call";
import {
  buildContext,
  interactionPriority,
  type SourceDoc,
  summaryPriority,
  validCitations,
} from "./context";

const RULES = (locale: Locale) =>
  [
    `Answer in ${languageName(locale)}.`,
    "You help someone understand the official documents of their medicines. Use only the documents given between <section> tags: no outside knowledge, no guesses.",
    "Cite the id of every section you rely on.",
    "Never tell someone to start, stop or change a treatment; send them to their doctor or pharmacist for any decision. You are not a medical device.",
    "Write plainly, for someone without medical training.",
  ].join("\n");

export const Summary = z.object({
  purpose: z.array(z.string()).describe("What the medicine is for, short sentences"),
  howToTake: z.array(z.string()).describe("How and when to take it, usual doses as written"),
  doNotTake: z.array(z.string()).describe("Who must not take it, what to avoid with it"),
  sideEffects: z.array(z.string()).describe("Frequent or serious side effects and what to do"),
  warnings: z.array(z.string()).describe("Pregnancy, driving, storage and other points to know"),
  citations: z.array(z.string()).describe("Ids of the sections used"),
});
export type Summary = z.infer<typeof Summary>;

export async function summarize(ctx: CallContext, locale: Locale, doc: SourceDoc) {
  const context = buildContext([doc], documentBudget(ctx), summaryPriority);
  const out = await structured(ctx, Summary, "summary", RULES(locale), [
    {
      role: "user",
      content: `${context.text}\n\nSummarize the leaflet of ${doc.medName} in plain language: 2 to 5 short points per heading, leave a heading empty when the documents say nothing about it.`,
    },
  ]);
  return {
    ...out,
    citations: validCitations(out.citations, context),
    ids: context.ids,
    truncated: context.truncated,
  };
}

export const Answer = z.object({
  answer: z.string().describe("The answer, in a few short paragraphs"),
  found: z.boolean().describe("false when the documents do not answer the question"),
  citations: z.array(z.string()),
});

export interface Turn {
  question: string;
  answer: string;
}

export async function ask(
  ctx: CallContext,
  locale: Locale,
  doc: SourceDoc,
  question: string,
  history: Turn[] = [],
) {
  const context = buildContext([doc], documentBudget(ctx), summaryPriority);
  const out = await structured(
    ctx,
    Answer,
    "answer",
    `${RULES(locale)}\nWhen the documents do not answer, say so (found: false) and suggest asking a pharmacist.`,
    [
      { role: "user", content: `${context.text}\n\nThe documents above are about ${doc.medName}.` },
      { role: "assistant", content: "I have read them." },
      ...history.slice(-4).flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]),
      { role: "user", content: question },
    ],
  );
  return {
    ...out,
    citations: validCitations(out.citations, context),
    ids: context.ids,
    truncated: context.truncated,
  };
}

export const Severity = z.enum(["contraindicated", "avoid", "caution", "info"]);
export type Severity = z.infer<typeof Severity>;

export const Interactions = z.object({
  pairs: z.array(
    z.object({
      a: z.string().describe("Name of the first medicine, as given"),
      b: z.string().describe("Name of the second medicine, as given"),
      severity: Severity,
      explanation: z.string(),
      citations: z.array(z.string()),
    }),
  ),
  notes: z.array(z.string()).describe("Other points: the same substance twice, missing documents"),
});

export async function interactions(ctx: CallContext, locale: Locale, docs: SourceDoc[]) {
  const context = buildContext(docs, documentBudget(ctx), interactionPriority);
  const names = docs.map((d) => `- ${d.medName}`).join("\n");
  const out = await structured(
    ctx,
    Interactions,
    "interactions",
    `${RULES(locale)}\nSeverity: "contraindicated" when a document forbids the combination, "avoid" when it advises against it, "caution" for precautions, "info" for anything else worth knowing.`,
    [
      {
        role: "user",
        content: `${context.text}\n\nThese medicines are taken by the same person:\n${names}\n\nList every pair the documents mention as interacting (by substance or by class), and point out when two medicines contain the same active substance. Leave pairs out when no document says anything about them.`,
      },
    ],
  );
  return {
    ...out,
    pairs: out.pairs.map((p) => ({ ...p, citations: validCitations(p.citations, context) })),
    ids: context.ids,
    truncated: context.truncated,
  };
}

export const BoxReading = z.object({
  name: z.string().describe("Brand or medicine name as printed, empty when unreadable"),
  strength: z.string().describe("Dose per unit, e.g. 1000 mg"),
  form: z.string().describe("Tablet, syrup…"),
  codes: z.array(z.string()).describe("Every barcode number or CIP/NDC/GTIN printed, digits only"),
  lot: z.string(),
  expiry: z.string().describe("Expiry as YYYY-MM-DD or YYYY-MM, empty when not visible"),
});
export type BoxReading = z.infer<typeof BoxReading>;

export async function readBox(
  ctx: CallContext,
  image: { data: Uint8Array; mediaType: string },
): Promise<BoxReading> {
  return structured(
    ctx,
    BoxReading,
    "box",
    "You read the text printed on a medicine box in a photo. Copy what is printed, do not guess what is not visible.",
    [
      {
        role: "user",
        content: [
          { type: "image", image: image.data, mediaType: image.mediaType },
          { type: "text", text: "What does this medicine box say?" },
        ],
      },
    ],
  );
}
