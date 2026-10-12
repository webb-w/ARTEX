"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { applyLocale, DEFAULT_LOCALE, type Locale, readLocale, saveLocale, translateUi, type UiTranslator } from "./locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: UiTranslator;
}

export const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (original, ...values) => translateUi(DEFAULT_LOCALE, original, ...values),
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Static prerender and first hydration agree; optional storage is read after mount.
  const [locale, updateLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    const saved = readLocale();
    updateLocale(saved);
    applyLocale(saved);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    const saved = saveLocale(next);
    updateLocale(saved);
    applyLocale(saved);
  }, []);
  const t = useCallback<UiTranslator>((original, ...values) => translateUi(locale, original, ...values), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

// Stable identity keeps UI-only error messages from restarting data-loading effects.
export function useUiEventTranslator(): UiTranslator {
  const { t } = useLocale();
  const translator = useRef(t);
  useEffect(() => { translator.current = t; }, [t]);
  return useCallback<UiTranslator>((original, ...values) => translator.current(original, ...values), []);
}
