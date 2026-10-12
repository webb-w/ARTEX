import { APP_CONFIG } from "../config/app-config";

import { getLocalStorageValue, setLocalStorageValue } from "./local-storage.client";
import { koreanMessages } from "./locale-messages";

export const LOCALES = ["zh-CN", "ko-KR"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko-KR";
export const LOCALE_STORAGE_KEY = "locale";
export type UiValue = string | number | boolean | null | undefined;
export type UiTranslator = (original: string, ...values: UiValue[]) => string;

export function resolveLocale(value: unknown): Locale {
  return value === "zh-CN" || value === "ko-KR" ? value : DEFAULT_LOCALE;
}

export function readLocale(): Locale {
  return resolveLocale(getLocalStorageValue(LOCALE_STORAGE_KEY));
}

export function saveLocale(value: unknown): Locale {
  const locale = resolveLocale(value);
  setLocalStorageValue(LOCALE_STORAGE_KEY, locale);
  return locale;
}

export function getLocaleMetadata(locale: Locale = DEFAULT_LOCALE) {
  return {
    title: translateUi(locale, APP_CONFIG.meta.title),
    description: translateUi(locale, APP_CONFIG.meta.description),
  };
}

export function applyLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  const metadata = getLocaleMetadata(locale);
  document.documentElement.lang = locale;
  document.title = metadata.title;
  const description = document.querySelector?.<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = metadata.description;
}

// Call only at explicit UI boundaries. Runtime data and guidance are not message keys.
export function translateUi(locale: Locale, original: string, ...values: UiValue[]): string {
  const message = locale === "ko-KR" && Object.hasOwn(koreanMessages, original) ? koreanMessages[original] : original;
  return message.replace(/\{(\d+)\}/g, (token, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : token,
  );
}
