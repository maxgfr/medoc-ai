/**
 * Every model call goes through llm-connect: the model from the saved
 * settings, the provider options for it, a check of what it accepts before any
 * request, and errors described without the key (as in calorie-ai-tracker).
 */
import { generateText, type LanguageModel, type ModelMessage, Output } from "ai";
import {
  type Capabilities,
  callOptions,
  callProblem,
  describeError,
  type LlmErrorCode,
  type LlmSettings,
  loadModel,
} from "llm-connect";
import type { z } from "zod";
import type { TextKey, Translate } from "../i18n";
import { capabilitiesOf } from "./settings";

export interface CallContext {
  settings: LlmSettings;
  t: Translate;
  signal?: AbortSignal;
  /** Replaces the model the settings point to (tests). */
  model?: LanguageModel;
  /** Replaces what the catalog says the model takes (tests). */
  capabilities?: Capabilities;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

const FAILURES: Record<LlmErrorCode, TextKey> = {
  auth: "ai.errAuth",
  "auth-or-network": "ai.errNetwork",
  "rate-limit": "ai.errRate",
  overloaded: "ai.errOverloaded",
  "context-length": "ai.errContext",
  "invalid-request": "ai.errInvalid",
  "not-found": "ai.errNotFound",
  server: "ai.errServer",
  unknown: "ai.errUnknown",
};

/** A readable error for any failed call: what it means, then the provider's message. */
export function aiError(err: unknown, ctx: Pick<CallContext, "settings" | "t">): AiError {
  if (err instanceof AiError) return err;
  const e = describeError(err, ctx.settings.apiKey);
  const meaning = ctx.t(FAILURES[e.code]);
  const detail = e.message.trim();
  return new AiError(detail ? `${meaning} (${detail.replace(/\.$/, "")}.)` : meaning, e.retryable);
}

export function hasImage(messages: ModelMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some(
        (p) => p.type === "image" || (p.type === "file" && p.mediaType.startsWith("image")),
      ),
  );
}

/** Checks the call against the model before any request; returns its capabilities. */
export function preflight(ctx: CallContext, messages: ModelMessage[]): Capabilities {
  const capabilities = ctx.capabilities ?? capabilitiesOf(ctx.settings);
  if (hasImage(messages) && !capabilities.vision) throw new AiError(ctx.t("ai.errVision"));
  const problem = callProblem(ctx.settings, { messages }, capabilities);
  if (problem) throw new AiError(problem.message);
  return capabilities;
}

/** One structured answer, checked against `schema`. */
export async function structured<S extends z.ZodType>(
  ctx: CallContext,
  schema: S,
  name: string,
  instructions: string,
  messages: ModelMessage[],
): Promise<z.infer<S>> {
  const capabilities = preflight(ctx, messages);
  try {
    const res = await generateText({
      model: ctx.model ?? (await loadModel(ctx.settings)),
      instructions,
      messages,
      output: Output.object({ schema, name }),
      maxRetries: 1,
      ...(ctx.signal ? { abortSignal: ctx.signal } : {}),
      ...callOptions(ctx.settings, { capabilities }),
    });
    return res.output as z.infer<S>;
  } catch (err) {
    if (ctx.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    throw aiError(err, ctx);
  }
}

/** How many characters of documents a call may carry: a share of the model's context window. */
export function documentBudget(ctx: CallContext): number {
  const window = (ctx.capabilities ?? capabilitiesOf(ctx.settings)).contextWindow ?? 32_000;
  // About 3.5 characters per token; half the window for documents, capped so a call stays cheap.
  return Math.max(8_000, Math.min(180_000, Math.floor(window * 3.5 * 0.5)));
}
