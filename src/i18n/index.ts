/**
 * Typed messages without a library (the pattern of maxgfr/cursus): English is
 * the source and defines every key, French must have the same keys, kinds and
 * placeholders (i18n.test.ts). Both catalogs are small and ship in the bundle.
 */
import { en } from "./en";
import { fr } from "./fr";

export interface Plural {
  readonly one: string;
  readonly other: string;
}
export type Message = string | Plural;

type Source = typeof en;
export type Shape<T> = {
  readonly [N in keyof T]: {
    readonly [K in keyof T[N]]: T[N][K] extends string
      ? string
      : T[N][K] extends Plural
        ? Plural
        : never;
  };
};
export type Catalog = Shape<Source>;

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const CATALOGS: Record<Locale, Catalog> = { en, fr };

type Namespace = keyof Source;
type KeysOf<N extends Namespace> = Extract<keyof Source[N], string>;
export type Key = { [N in Namespace]: `${N}.${KeysOf<N>}` }[Namespace];
type PluralKey = {
  [N in Namespace]: {
    [K in KeysOf<N>]: Source[N][K] extends Plural ? `${N}.${K}` : never;
  }[KeysOf<N>];
}[Namespace];

/** A key whose message is plain text (not a plural). */
export type TextKey = Exclude<Key, PluralKey>;

export type Params = Readonly<Record<string, string | number>>;
export type Translate = {
  (key: TextKey, params?: Params): string;
  (key: PluralKey, params: Params & { readonly count: number }): string;
};

export function lookup(catalog: Catalog, key: string): Message | undefined {
  const dot = key.indexOf(".");
  const table = (catalog as unknown as Record<string, Record<string, Message> | undefined>)[
    key.slice(0, dot)
  ];
  return table?.[key.slice(dot + 1)];
}

export const intlTag = (locale: Locale) => (locale === "fr" ? "fr-FR" : "en-GB");

export function createTranslator(locale: Locale): Translate {
  const catalog = CATALOGS[locale];
  const rules = new Intl.PluralRules(intlTag(locale));
  const numbers = new Intl.NumberFormat(intlTag(locale));
  const translate = (key: string, params?: Params): string => {
    const message = lookup(catalog, key) ?? lookup(CATALOGS.en, key);
    if (message === undefined) return key;
    const template =
      typeof message === "string"
        ? message
        : rules.select(Number(params?.count ?? 0)) === "one"
          ? message.one
          : message.other;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const v = params?.[name];
      return v === undefined ? match : typeof v === "number" ? numbers.format(v) : v;
    });
  };
  return translate as Translate;
}

export function isLocale(v: unknown): v is Locale {
  return LOCALES.some((l) => l === v);
}

/** The stored choice, else the device's first language we have, else English. */
export function detectLocale(stored: string | null, languages: readonly string[]): Locale {
  if (isLocale(stored)) return stored;
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}

const DATE_STYLES: Record<"short" | "long" | "time", Intl.DateTimeFormatOptions> = {
  short: { dateStyle: "medium" },
  long: { dateStyle: "full" },
  time: { dateStyle: "medium", timeStyle: "short" },
};

export function formatDate(
  locale: Locale,
  iso: string,
  style: "short" | "long" | "time" = "short",
): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(intlTag(locale), DATE_STYLES[style]).format(d);
}

export function formatPrice(locale: Locale, value: number, currency: string): string {
  return new Intl.NumberFormat(intlTag(locale), { style: "currency", currency }).format(value);
}
