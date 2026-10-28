/**
 * Bring-your-own-model settings, from llm-connect: the catalog built live from
 * llm-models (models.json as the offline fallback), the key encrypted at rest
 * under a non-extractable WebCrypto key, a free connection test.
 */
import {
  createLlmSettingsStore,
  isConfigured,
  type LlmSettings,
  liveCatalog,
  providerKindOf,
  resolveCapabilities,
  type SlimModel,
  secureStorage,
} from "llm-connect";

export const llm = createLlmSettingsStore({
  catalog: liveCatalog({
    fallbackUrl: "./models.json",
    required: ["openai", "anthropic", "google"],
  }),
  storage: secureStorage({ prefsKey: "medoc-ai-settings", dbName: "medoc-ai-secrets" }),
});

let loaded: Promise<unknown> | null = null;
export function loadLlmSettings(): Promise<unknown> {
  loaded ??= llm.load().catch(() => null);
  return loaded;
}

/** The saved settings, when they can call a model. */
export function savedSettings(): LlmSettings | null {
  const saved = llm.getState().saved;
  return saved && isConfigured(saved) ? (saved as LlmSettings) : null;
}

function catalogModel(settings: LlmSettings): SlimModel | undefined {
  const catalog = llm.getState().catalog;
  if (!catalog || !settings.providerId) return undefined;
  return catalog[settings.providerId]?.models[settings.model];
}

/**
 * What the model takes. A catalog entry that lists no input modalities at all
 * says nothing about images, so vision is assumed then: only an entry that
 * lists modalities without "image" rules a model out.
 */
export function capabilitiesOf(settings: LlmSettings) {
  const entry = catalogModel(settings) as (SlimModel & { input?: string[] }) | undefined;
  const caps = resolveCapabilities({
    kind: providerKindOf(settings),
    modelId: settings.model,
    ...(entry ? { catalog: entry } : {}),
  });
  const unknown = !entry?.input;
  return unknown && !caps.vision ? { ...caps, vision: true } : caps;
}

export function modelLabel(settings: LlmSettings | null): string {
  if (!settings) return "";
  if (settings.customEndpoint) return settings.customModel || "Custom endpoint";
  return `${settings.providerName ?? settings.providerId ?? ""} · ${catalogModel(settings)?.name ?? settings.model}`;
}
