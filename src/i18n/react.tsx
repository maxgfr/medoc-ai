import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { createTranslator, detectLocale, intlTag, type Locale, type Translate } from "./index";

const STORAGE_KEY = "medoc-ai:locale";

interface I18nValue {
  locale: Locale;
  t: Translate;
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    detectLocale(localStorage.getItem(STORAGE_KEY), navigator.languages ?? []),
  );
  useEffect(() => {
    document.documentElement.lang = intlTag(locale);
  }, [locale]);
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: createTranslator(locale),
      setLocale: (l) => {
        localStorage.setItem(STORAGE_KEY, l);
        setLocaleState(l);
      },
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useT must be used inside <I18nProvider>");
  return v;
}

export const useT = () => useI18n().t;
export const useLocale = () => useI18n().locale;
export const useSetLocale = () => useI18n().setLocale;
