/**
 * The three ways the app asks a model about leaflets: a plain-language
 * summary, a question, the interactions between someone's medicines. The
 * summary and the interactions come back structured; a question is answered in
 * Markdown, streamed. All cite the sections they rely on; the app shows the
 * section titles and keeps the medical disclaimer on screen.
 */
import { type ModelMessage, smoothStream, streamText } from "ai";
import {
  callOptions,
  effortLevels,
  languageName,
  loadModel,
  providerKindOf,
  type StopReason,
  stopReasonOf,
  usableEffort,
} from "llm-connect";
import { z } from "zod";
import type { Locale } from "../i18n";
import { AiError, aiError, type CallContext, documentBudget, preflight, structured } from "./call";
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

export interface Turn {
  question: string;
  answer: string;
}

/** How an answer ended when it did not end normally. */
export type AnswerEnd = "length" | "truncated" | "refusal" | "content-filter" | "stopped";

const UNFINISHED: Partial<Record<StopReason, AnswerEnd>> = {
  length: "length",
  truncated: "truncated",
  refusal: "refusal",
  "content-filter": "content-filter",
};

/** `[rcp-4.5]`, `[label-drug_interactions]`, `[m2:notice-3]`: a section id between brackets. */
export const CITATION = /\[((?:m\d+:)?(?:notice|rcp|label|ema)-[\w.-]+)\]/g;

/** The section ids an answer cites, among those the model was given, in order of first use. */
export function citationsIn(text: string, ids: ReadonlyMap<string, unknown>): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CITATION)) {
    const id = m[1] ?? "";
    if (ids.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export interface AskAnswer {
  text: string;
  citations: string[];
  end?: AnswerEnd;
  truncated: boolean;
  /** The model's summarized reasoning, when it thinks before answering (Claude, GPT-5, Gemini). */
  reasoning?: string;
}

/** Questions want a quick first word: the lightest effort the model takes, else its default. */
export const QUESTION_EFFORT = "low" as const;

/**
 * A question about a medicine, answered in Markdown from its documents and
 * streamed: `onText` gets the whole text so far, word by word; `onReasoning`
 * the model's reasoning summary while it thinks, which can take seconds before
 * the first word. Every claim cites its section as [id]; the app turns those
 * into links. Stopped halfway (ctx.signal), the answer keeps what came.
 */
export async function askStream(
  ctx: CallContext,
  locale: Locale,
  doc: SourceDoc,
  question: string,
  history: Turn[],
  onText: (text: string) => void,
  onReasoning?: (reasoning: string) => void,
): Promise<AskAnswer> {
  const context = buildContext([doc], documentBudget(ctx), summaryPriority);
  const messages: ModelMessage[] = [
    { role: "user", content: `${context.text}\n\nThe documents above are about ${doc.medName}.` },
    { role: "assistant", content: "I have read them." },
    ...history.slice(-4).flatMap((t) => [
      { role: "user" as const, content: t.question },
      { role: "assistant" as const, content: t.answer },
    ]),
    { role: "user", content: question },
  ];
  const capabilities = preflight(ctx, messages);
  const instructions = [
    RULES(locale),
    "Write the answer in Markdown: short paragraphs, bullet lists, **bold** for what matters most. No headings larger than ###, no tables unless they help, no images, no HTML.",
    "After each statement taken from a section, cite the section by its exact id in square brackets, like [rcp-4.5] or [notice-2]. Cite only ids given in the documents.",
    "When the documents do not answer the question, say so plainly and suggest asking a pharmacist.",
  ].join("\n");
  let text = "";
  let reasoning = "";
  let failure: unknown = null;
  const effort = usableEffort(
    QUESTION_EFFORT,
    effortLevels(providerKindOf(ctx.settings), ctx.settings.model),
  );
  // A stream that closes without a finish event was cut.
  let end: AnswerEnd | undefined = "truncated";
  try {
    const result = streamText({
      model: ctx.model ?? (await loadModel(ctx.settings)),
      instructions,
      messages,
      maxRetries: 1,
      ...(ctx.signal ? { abortSignal: ctx.signal } : {}),
      ...callOptions(ctx.settings, { capabilities, ...(effort ? { effort } : {}) }),
      // Providers send text in bursts: words come out one at a time, at reading pace.
      experimental_transform: smoothStream({ chunking: "word", delayInMs: 8 }),
      // Errors come through the stream below; the default would also log them.
      onError: () => {},
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        text += part.text;
        onText(text);
      } else if (part.type === "reasoning-delta") {
        reasoning += part.text;
        onReasoning?.(reasoning);
      } else if (part.type === "finish") {
        end =
          UNFINISHED[
            stopReasonOf(providerKindOf(ctx.settings), part.finishReason, part.rawFinishReason)
          ];
      } else if (part.type === "error") {
        failure = part.error;
      }
    }
  } catch (err) {
    failure = err;
  }
  const answer = (e: AnswerEnd | undefined): AskAnswer => ({
    text,
    citations: citationsIn(text, context.ids),
    truncated: context.truncated,
    ...(e ? { end: e } : {}),
    ...(reasoning.trim() ? { reasoning } : {}),
  });
  if (ctx.signal?.aborted) {
    if (text.trim()) return answer("stopped");
    throw new DOMException("Cancelled", "AbortError");
  }
  if (failure) throw aiError(failure, ctx);
  if (!text.trim())
    throw new AiError(
      ctx.t(end === "refusal" || end === "content-filter" ? "ai.endRefusal" : "ai.errUnknown"),
      true,
    );
  return answer(end);
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
          // A "file" part: the AI SDK deprecates "image" parts.
          { type: "file", data: image.data, mediaType: image.mediaType },
          { type: "text", text: "What does this medicine box say?" },
        ],
      },
    ],
  );
}
