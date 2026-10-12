"use client";

import { resolveLocale } from "@/lib/locale";
import { useLocale } from "@/lib/locale-provider";

export function LanguageSelector() {
  const { locale, setLocale, t } = useLocale();
  return (
    <select
      aria-label={t("语言")}
      value={locale}
      onChange={(event) => setLocale(resolveLocale(event.target.value))}
      className="h-8 rounded-md border bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
    >
      <option value="zh-CN" lang="zh-CN">简体中文</option>
      <option value="ko-KR" lang="ko-KR">한국어</option>
    </select>
  );
}
