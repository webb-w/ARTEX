import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const typescript = require("typescript");
const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  const resolvedRequest = request.startsWith("@/") ? sourceRoot + request.slice(2) : request;
  return resolveFilename.call(this, resolvedRequest, ...args);
};
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = typescript.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: typescript.ModuleKind.CommonJS, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
}
require.extensions[".css"] = () => undefined;
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === "next/navigation") return { ...load.call(this, request, ...args), useRouter: () => ({ replace() { return undefined; } }), usePathname: () => "/login" };
  if (request === "@/lib/fonts/registry") return { fontVars: "", fontRegistry: { geist: { label: "Geist", font: { variable: "" } } }, fontOptions: [] };
  return load.call(this, request, ...args);
};

function localeModule() {
  const filename = sourceRoot + "lib/locale.ts";
  assert.ok(existsSync(filename), "an explicit client locale contract must be available");
  return require(filename);
}

function storage(value) {
  return {
    value,
    getItem() { return this.value; },
    setItem(key, next) { this.key = key; this.value = next; },
  };
}

function withBrowser(localStorage, callback) {
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = { localStorage };
  globalThis.document = { documentElement: { lang: "zh-CN" } };
  try { return callback(); }
  finally {
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
  }
}

test("default exported application metadata is Korean while config originals remain unchanged", () => {
  const { metadata } = require(sourceRoot + "app/layout.tsx");
  const { APP_CONFIG } = require(sourceRoot + "config/app-config.ts");
  assert.deepEqual(metadata, {
    title: "ARTEX — 자율 침투 테스트 콘솔",
    description: "LLM 기반 자율 침투 테스트 시스템 콘솔",
  });
  assert.deepEqual(APP_CONFIG.meta, {
    title: "ARTEX — 自主渗透测试控制台",
    description: "LLM 驱动的自主渗透测试系统控制台",
  });
});

test("selected Korean locale updates browser title and description at explicit metadata boundaries", () => {
  const { applyLocale, readLocale } = localeModule();
  withBrowser(storage("ko-KR"), () => {
    const description = { content: "LLM 驱动的自主渗透测试系统控制台" };
    document.title = "ARTEX — 自主渗透测试控制台";
    document.querySelector = (selector) => {
      assert.equal(selector, 'meta[name="description"]');
      return description;
    };
    applyLocale(readLocale());
    assert.equal(document.title, "ARTEX — 자율 침투 테스트 콘솔");
    assert.equal(description.content, "LLM 기반 자율 침투 테스트 시스템 콘솔");
    assert.equal(document.documentElement.lang, "ko-KR");
  });
});

test("saved Chinese locale restores the exact original browser title and description", () => {
  const { applyLocale, readLocale } = localeModule();
  withBrowser(storage("zh-CN"), () => {
    const description = { content: "LLM 기반 자율 침투 테스트 시스템 콘솔" };
    document.title = "ARTEX — 자율 침투 테스트 콘솔";
    document.querySelector = (selector) => {
      assert.equal(selector, 'meta[name="description"]');
      return description;
    };
    applyLocale(readLocale());
    assert.equal(document.title, "ARTEX — 自主渗透测试控制台");
    assert.equal(description.content, "LLM 驱动的自主渗透测试系统控制台");
    assert.equal(document.documentElement.lang, "zh-CN");
  });
});

test("static document defaults to Korean and includes a labelled language control", () => {
  const { default: RootLayout } = require(sourceRoot + "app/layout.tsx");
  const markup = renderToStaticMarkup(React.createElement(RootLayout, null, "raw 用户内容"));
  assert.match(markup, /lang="ko-KR"/);
  assert.match(markup, /<select[^>]*aria-label="언어"/);
  assert.match(markup, /value="ko-KR"[^>]*selected/);
  assert.match(markup, /value="ko-KR"/);
  assert.match(markup, /raw 用户内容/);
});

test("missing and unsupported choices default to ko-KR; explicit saved zh-CN is honored", () => {
  const { readLocale, saveLocale } = localeModule();
  for (const value of [null, "", "en", "ko", "invalid", '"ko-KR"']) {
    withBrowser(storage(value), () => assert.equal(readLocale(), "ko-KR"));
  }
  withBrowser(storage("zh-CN"), () => assert.equal(readLocale(), "zh-CN"));
  const persisted = storage("ko-KR");
  withBrowser(persisted, () => {
    assert.equal(readLocale(), "ko-KR");
    assert.equal(saveLocale("zh-CN"), "zh-CN");
    assert.equal(persisted.value, "zh-CN");
    assert.equal(saveLocale("ko-KR"), "ko-KR");
    assert.equal(persisted.value, "ko-KR");
    assert.equal(saveLocale("unsupported"), "ko-KR");
    assert.equal(persisted.value, "ko-KR");
  });
  assert.equal(readLocale(), "ko-KR");
});

test("optional storage may throw or be absent without preventing language switching", () => {
  const { readLocale, saveLocale, applyLocale } = localeModule();
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  withBrowser(broken, () => {
    assert.equal(readLocale(), "ko-KR");
    assert.equal(saveLocale("ko-KR"), "ko-KR");
    applyLocale("ko-KR");
    assert.equal(document.documentElement.lang, "ko-KR");
    applyLocale("zh-CN");
    assert.equal(document.documentElement.lang, "zh-CN");
  });
  withBrowser(undefined, () => assert.equal(readLocale(), "ko-KR"));
});

test("translation preserves original fallback and interpolates payloads without translating them", () => {
  const { translateUi } = localeModule();
  assert.equal(translateUi("zh-CN", "任务"), "任务");
  assert.equal(translateUi("ko-KR", "任务"), "작업");
  assert.equal(translateUi("zh-CN", "Unknown UI key"), "Unknown UI key");
  assert.equal(translateUi("ko-KR", "Unknown UI key"), "Unknown UI key");
  assert.equal(translateUi("ko-KR", "toString"), "toString");
  assert.equal(translateUi("ko-KR", "__proto__"), "__proto__");
  const payload = "待处理 {0} 用户输入 中文 / raw report";
  assert.equal(translateUi("ko-KR", "删除 {0}？", payload), `삭제: ${payload}?`);
});

test("known status labels localize while unknown API statuses remain raw", () => {
  const { statusMeta } = require(sourceRoot + "lib/status.ts");
  assert.deepEqual(statusMeta("task", "running"), { label: "运行中", tone: "blue" });
  assert.deepEqual(statusMeta("task", "running", "ko-KR"), { label: "실행 중", tone: "blue" });
  assert.deepEqual(statusMeta("task", "待处理", "ko-KR"), { label: "待处理", tone: "neutral" });
  assert.deepEqual(statusMeta("task", "toString", "ko-KR"), { label: "toString", tone: "neutral" });
});

test("selected language renders Korean auth, placeholders and status without touching form payloads", () => {
  assert.ok(existsSync(sourceRoot + "lib/locale-provider.tsx"), "UI language selection must rerender explicit labels");
  const { LocaleContext } = require(sourceRoot + "lib/locale-provider.tsx");
  const { translateUi } = localeModule();
  const { default: Login } = require(sourceRoot + "app/(auth)/login/page.tsx");
  const { StatusBadge } = require(sourceRoot + "components/status-badge.tsx");
  const { LanguageSelector } = require(sourceRoot + "components/language-selector.tsx");
  const payload = "用户输入 / 모델 지침 / raw API";
  const render = (locale) => renderToStaticMarkup(React.createElement(LocaleContext.Provider, {
    value: { locale, setLocale() { return undefined; }, t: (key, ...values) => translateUi(locale, key, ...values) },
  }, React.createElement(React.Fragment, null,
    React.createElement(LanguageSelector), React.createElement(Login),
    React.createElement(StatusBadge, { domain: "task", value: "running" }),
    React.createElement("textarea", { defaultValue: payload }),
  )));
  const chinese = render("zh-CN");
  const korean = render("ko-KR");
  assert.match(chinese, /正在检查登录状态…/);
  assert.match(korean, /로그인 상태 확인 중…/);
  assert.match(korean, /aria-label="언어"/);
  assert.match(korean, /value="ko-KR"[^>]*selected/);
  assert.match(korean, /실행 중/);
  for (const markup of [chinese, korean]) assert.match(markup, /用户输入 \/ 모델 지침 \/ raw API/);
});

function renderInLocale(locale, component, props) {
  const { LocaleContext } = require(sourceRoot + "lib/locale-provider.tsx");
  const { translateUi } = localeModule();
  return renderToStaticMarkup(React.createElement(LocaleContext.Provider, {
    value: { locale, setLocale() { return undefined; }, t: (key, ...values) => translateUi(locale, key, ...values) },
  }, React.createElement(component, props)));
}

test("shared copy and pagination chrome localize, but supplied content remains raw", () => {
  const { CopyButton } = require(sourceRoot + "components/copy-button.tsx");
  const { TablePagination } = require(sourceRoot + "components/table-pagination.tsx");
  assert.match(renderInLocale("ko-KR", CopyButton, { text: "原始待处理" }), /복사/);
  assert.match(renderInLocale("zh-CN", CopyButton, { text: "原始待处理" }), /复制/);
  assert.match(renderInLocale("ko-KR", CopyButton, { text: "raw", label: "用户标签" }), /用户标签/);
  const props = { page: 1, pageSize: 10, total: 20, onPageChange() { return undefined; }, onPageSizeChange() { return undefined; } };
  assert.match(renderInLocale("ko-KR", TablePagination, props), /aria-label="다음 페이지"/);
  assert.match(renderInLocale("zh-CN", TablePagination, props), /aria-label="下一页"/);
});

test("application page UI renders Korean, with original zh-CN available", () => {
  const { default: AgentsPage } = require(sourceRoot + "app/(main)/system/agents/page.tsx");
  assert.match(renderInLocale("ko-KR", AgentsPage), /Agent 목록/);
  assert.match(renderInLocale("zh-CN", AgentsPage), /Agent 清单/);
});

test("date range labels use Korean month names only in Korean, preserving original date format", () => {
  const { DateRangePicker } = require(sourceRoot + "components/date-range-picker.tsx");
  const range = { from: new Date(2026, 8, 3, 12), to: new Date(2026, 8, 10, 12) };
  assert.match(renderInLocale("ko-KR", DateRangePicker, { value: range }), /3 9월 2026 - 10 9월 2026/);
  assert.match(renderInLocale("zh-CN", DateRangePicker, { value: range }), /3 Sep 2026 - 10 Sep 2026/);
  assert.equal(range.from.getTime(), new Date(2026, 8, 3, 12).getTime());
});

test("static navigation and field metadata localize while protocol and entered field values stay original", () => {
  const { NavMain } = require(sourceRoot + "app/(main)/_components/sidebar/nav-main.tsx");
  const { SidebarProvider } = require(sourceRoot + "components/ui/sidebar.tsx");
  const { sidebarItems } = require(sourceRoot + "navigation/sidebar/sidebar-items.ts");
  const { TooltipProvider } = require(sourceRoot + "components/ui/tooltip.tsx");
  const Navigation = () => React.createElement(TooltipProvider, null, React.createElement(SidebarProvider, null, React.createElement(NavMain, { items: sidebarItems })));
  assert.match(renderInLocale("ko-KR", Navigation), /대시보드/);
  assert.match(renderInLocale("zh-CN", Navigation), /仪表盘/);
});

test("Korean notification filter summaries localize all count and status labels without modifying raw filters", () => {
  const { FilterSummary } = require(sourceRoot + "app/(main)/system/notify/_components/channel-form.tsx");
  const filter = { vulnclass_include: ["用户原始关键词"], vulnclass_exclude: ["raw excluded term"], asset_ids: [42, 43], on_status_change: true };
  const original = JSON.parse(JSON.stringify(filter));
  assert.match(renderInLocale("zh-CN", FilterSummary, { filter }), /类型含 1 词 · 排除 1 词 · 2 个资产 · 含状态变更/);
  assert.match(renderInLocale("ko-KR", FilterSummary, { filter }), /유형 포함 키워드 1개 · 제외 키워드 1개 · 자산 2개 · 상태 변경 포함/);
  assert.deepEqual(filter, original);
});

test("explicit Chinese UI literal keys have Korean catalog entries", () => {
  const { koreanMessages } = require(sourceRoot + "lib/locale-messages.ts");
  const missing = new Set();
  function visitDirectory(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = directory + "/" + entry.name;
      if (entry.isDirectory()) visitDirectory(filename);
      else if (/\.tsx?$/.test(entry.name)) {
        const source = typescript.createSourceFile(filename, readFileSync(filename, "utf8"), typescript.ScriptTarget.Latest, true, entry.name.endsWith(".tsx") ? typescript.ScriptKind.TSX : typescript.ScriptKind.TS);
        function visit(node) {
          if (typescript.isCallExpression(node) && typescript.isIdentifier(node.expression) && /^(ui|t|loadUi)$/.test(node.expression.text)) {
            const message = node.arguments[0];
            if (message && typescript.isStringLiteralLike(message) && /[㐀-鿿]/.test(message.text) && !Object.hasOwn(koreanMessages, message.text)) missing.add(message.text);
          }
          typescript.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  visitDirectory(sourceRoot + "app");
  visitDirectory(sourceRoot + "components");
  assert.deepEqual([...missing].sort(), [], "explicit UI messages must not silently fall back to Chinese");
});

test("notification field labels localize without changing entered values or field keys", () => {
  const { ConfigField } = require(sourceRoot + "app/(main)/system/notify/_components/channel-form.tsx");
  const { CHANNEL_FIELDS } = require(sourceRoot + "app/(main)/system/notify/_components/channel-fields.ts");
  const props = { def: CHANNEL_FIELDS.email[0], value: "运行中", isSecret: false, onChange() { return undefined; } };
  const korean = renderInLocale("ko-KR", ConfigField, props);
  const chinese = renderInLocale("zh-CN", ConfigField, props);
  assert.match(korean, /SMTP 서버/);
  assert.match(chinese, /SMTP 服务器/);
  for (const markup of [korean, chinese]) {
    assert.match(markup, /value="运行中"/);
    assert.match(markup, /id="n-cfg-host"/);
  }
  assert.equal(props.value, "运行中");
});

test("localized transcript headings do not change command extraction or raw tool output", async () => {
  const filename = sourceRoot + "components/transcript.tsx";
  const componentModule = new Module(filename);
  componentModule.filename = filename;
  componentModule.paths = Module._nodeModulePaths(sourceRoot + "components");
  const { outputText } = typescript.transpileModule(readFileSync(filename, "utf8") + "\nexport { ToolBlock };", {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  });
  componentModule._compile(outputText, filename);
  const { translateUi } = localeModule();
  const command = "printf '原样用户输入'";
  const rawInput = JSON.stringify({ command, description: "模型说明原文" });
  const rawOutput = "失败 / tool output 原文 / {0}";
  for (const locale of ["zh-CN", "ko-KR"]) {
    const original = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useContext: React.useContext };
    const effects = [];
    const updates = [];
    React.useState = (value) => [value, (next) => { if (typeof next === "string") updates.push(next); }];
    React.useRef = (value) => ({ current: value });
    React.useEffect = (effect) => { effects.push(effect); };
    React.useContext = () => ({ locale, t: (key, ...values) => translateUi(locale, key, ...values), setLocale() { return undefined; } });
    try {
      componentModule.exports.ToolBlock({
        group: { type: "tool", key: 1, worker: "auto", use: { seq: 1, tool: "Bash", summary: command }, result: { seq: 2, tool: "Bash", summary: rawOutput } },
        getDetail: async (seq) => seq === 1 ? rawInput : rawOutput,
        focused: true,
      });
      for (const effect of effects) effect();
      await new Promise((resolve) => setImmediate(resolve));
      const detail = updates.find((value) => value.includes(rawOutput));
      assert.equal(detail, `【${translateUi(locale, "命令")}】\n${command}\n\n【${translateUi(locale, "输出")} ✓】\n${rawOutput}`);
      assert.equal(rawInput, JSON.stringify({ command, description: "模型说明原文" }));
    } finally { Object.assign(React, original); }
  }
});

test("switching language refreshes cached transcript headings, not payloads", async () => {
  const filename = sourceRoot + "components/transcript.tsx";
  const componentModule = new Module(filename);
  componentModule.filename = filename;
  componentModule.paths = Module._nodeModulePaths(sourceRoot + "components");
  const { outputText } = typescript.transpileModule(readFileSync(filename, "utf8") + "\nexport { ToolBlock };", {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  });
  componentModule._compile(outputText, filename);
  const { translateUi } = localeModule();
  const original = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useContext: React.useContext };
  const states = [];
  const refs = [];
  const payload = "printf '不翻译原文'";
  let stateIndex = 0;
  let refIndex = 0;
  let effects = [];
  let selectedLocale = "zh-CN";
  React.useState = (value) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = value;
    return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
  };
  React.useRef = (value) => {
    const index = refIndex++;
    if (!(index in refs)) refs[index] = { current: value };
    return refs[index];
  };
  React.useEffect = (effect) => { effects.push(effect); };
  React.useContext = () => ({ locale: selectedLocale, t: (key, ...values) => translateUi(selectedLocale, key, ...values), setLocale() { return undefined; } });
  try {
    for (const locale of ["zh-CN", "ko-KR"]) {
      selectedLocale = locale;
      stateIndex = 0;
      refIndex = 0;
      effects = [];
      componentModule.exports.ToolBlock({
        group: { type: "tool", key: 1, worker: "auto", use: { seq: 1, tool: "Bash", summary: payload } },
        getDetail: async () => JSON.stringify({ command: payload }),
        focused: true,
      });
      for (const effect of effects) effect();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(states[1], `【${translateUi(locale, "命令")}】\n${payload}`);
    }
  } finally { Object.assign(React, original); }
});

function loadPrivateComponent(relativePath, exportName) {
  const filename = sourceRoot + relativePath;
  const componentModule = new Module(filename);
  componentModule.filename = filename;
  componentModule.paths = Module._nodeModulePaths(sourceRoot + "components");
  const { outputText } = typescript.transpileModule(readFileSync(filename, "utf8") + `\nexport { ${exportName} };`, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  });
  componentModule._compile(outputText, filename);
  return componentModule.exports[exportName];
}

async function withHookHarness(callback) {
  const names = ["useState", "useRef", "useEffect", "useMemo", "useCallback", "useContext"];
  const original = Object.fromEntries(names.map((name) => [name, React[name]]));
  const slots = new Map();
  let cursor = 0;
  let pending = [];
  let context;
  const sameDependencies = (before, after) => before && after && before.length === after.length && before.every((value, index) => Object.is(value, after[index]));
  function memo(factory, dependencies) {
    const index = cursor++;
    const previous = slots.get(index);
    if (!previous || !sameDependencies(previous.dependencies, dependencies)) slots.set(index, { value: factory(), dependencies });
    return slots.get(index).value;
  }
  React.useState = (initial) => {
    const index = cursor++;
    if (!slots.has(index)) slots.set(index, { kind: "state", value: typeof initial === "function" ? initial() : initial });
    const slot = slots.get(index);
    return [slot.value, (next) => { slot.value = typeof next === "function" ? next(slot.value) : next; }];
  };
  React.useRef = (value) => {
    const index = cursor++;
    if (!slots.has(index)) slots.set(index, { value: { current: value } });
    return slots.get(index).value;
  };
  React.useMemo = memo;
  React.useCallback = (value, dependencies) => memo(() => value, dependencies);
  React.useContext = () => { cursor++; return context; };
  React.useEffect = (effect, dependencies) => {
    const index = cursor++;
    const previous = slots.get(index);
    if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
      const slot = { dependencies, cleanup: previous?.cleanup };
      slots.set(index, slot);
      pending.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
    }
  };
  const { translateUi } = localeModule();
  const harness = {
    setLocale(locale) { context = { locale, t: (key, ...values) => translateUi(locale, key, ...values), setLocale() { return undefined; } }; },
    setContext(value) { context = value; },
    render(component, props) { cursor = 0; return component(props); },
    async flushEffects() { const effects = pending; pending = []; for (const effect of effects) effect(); await new Promise((resolve) => setImmediate(resolve)); },
    state(predicate) { return [...slots.values()].find((slot) => slot.kind === "state" && predicate(slot.value)); },
  };
  harness.setLocale("zh-CN");
  try { return await callback(harness); }
  finally {
    for (const slot of slots.values()) slot.cleanup?.();
    Object.assign(React, original);
  }
}

function elementsInTree(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elementsInTree);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...elementsInTree(tree.props.children)];
}

test("provider and language control honor storage and preserve child identity when switching", async () => {
  const { LocaleProvider } = require(sourceRoot + "lib/locale-provider.tsx");
  const { LanguageSelector } = require(sourceRoot + "components/language-selector.tsx");
  await withHookHarness(async (harness) => {
    const preference = storage("zh-CN");
    const child = React.createElement("textarea", { defaultValue: "用户输入 / unchanged guidance {0}" });
    harness.render(LocaleProvider, { children: child });
    await withBrowser(preference, () => harness.flushEffects());
    const original = harness.render(LocaleProvider, { children: child });
    assert.equal(original.props.value.locale, "zh-CN");
    harness.setContext(original.props.value);
    const selector = harness.render(LanguageSelector);
    assert.equal(selector.props["aria-label"], "语言");
    withBrowser(preference, () => {
      selector.props.onChange({ target: { value: "ko-KR" } });
      assert.equal(document.documentElement.lang, "ko-KR");
    });
    const switched = harness.render(LocaleProvider, { children: child });
    assert.equal(switched.props.value.locale, "ko-KR");
    assert.equal(preference.key, "locale");
    assert.equal(preference.value, "ko-KR");
    assert.equal(switched.props.children, original.props.children);
    assert.equal(switched.props.children.props.defaultValue, "用户输入 / unchanged guidance {0}");
    harness.setContext(switched.props.value);
    assert.equal(harness.render(LanguageSelector).props["aria-label"], "언어");
  });
});

test("switching language keeps interception group identities stable", async () => {
  const { default: InterceptPage } = require(sourceRoot + "app/(main)/system/intercept/page.tsx");
  await withHookHarness(async (harness) => {
    const keys = () => elementsInTree(harness.render(InterceptPage)).filter((element) => element.type === "div" && element.key !== null).map((element) => element.key);
    const original = keys();
    assert.ok(original.includes("执行类"));
    harness.setLocale("ko-KR");
    assert.deepEqual(keys(), original, "language switching must not remount editable tool groups");
  });
});

test("switching language preserves an unsaved judge prompt without reloading configuration", async () => {
  const JudgeCard = loadPrivateComponent("app/(main)/system/intercept/page.tsx", "JudgeCard");
  const { api } = require(sourceRoot + "lib/api.ts");
  const original = { interceptGetJudgeConfig: api.interceptGetJudgeConfig, llmProfiles: api.llmProfiles };
  let calls = 0;
  api.interceptGetJudgeConfig = async () => { calls++; return { enabled: false, prompt: "server prompt" }; };
  api.llmProfiles = async () => [];
  try {
    await withHookHarness(async (harness) => {
      harness.render(JudgeCard);
      await harness.flushEffects();
      const configuration = harness.state((value) => value?.prompt === "server prompt");
      assert.ok(configuration);
      configuration.value = { ...configuration.value, prompt: "用户未保存的模型指令 {0}" };
      harness.setLocale("ko-KR");
      harness.render(JudgeCard);
      await harness.flushEffects();
      assert.equal(configuration.value.prompt, "用户未保存的模型指令 {0}");
      assert.equal(calls, 1);
    });
  } finally { Object.assign(api, original); }
});

test("switching language preserves unsaved retry settings without reloading policy", async () => {
  const { RetryPolicyPanel } = require(sourceRoot + "app/(main)/system/llm/_components/retry.tsx");
  const { api } = require(sourceRoot + "lib/api.ts");
  const original = api.llmRetryPolicy;
  let calls = 0;
  api.llmRetryPolicy = async () => { calls++; return { connect: { attempts: 3 } }; };
  try {
    await withHookHarness(async (harness) => {
      harness.render(RetryPolicyPanel);
      await harness.flushEffects();
      const policy = harness.state((value) => value?.connect?.attempts === 3);
      assert.ok(policy);
      policy.value = { ...policy.value, connect: { attempts: 7 } };
      harness.setLocale("ko-KR");
      harness.render(RetryPolicyPanel);
      await harness.flushEffects();
      assert.equal(policy.value.connect.attempts, 7);
      assert.equal(calls, 1);
    });
  } finally { api.llmRetryPolicy = original; }
});

test("switching language preserves edited skill content without reading the file again", async () => {
  const { default: SkillsPage } = require(sourceRoot + "app/(main)/system/skills/page.tsx");
  const { api } = require(sourceRoot + "lib/api.ts");
  const names = ["agents", "mcpServers", "missingSkills", "skills", "readSkillFile"];
  const original = Object.fromEntries(names.map((name) => [name, api[name]]));
  for (const name of names) api[name] = async () => [];
  let calls = 0;
  api.readSkillFile = async () => { calls++; return "original skill guidance"; };
  try {
    await withHookHarness(async (harness) => {
      harness.render(SkillsPage);
      await harness.flushEffects();
      harness.state((value) => value === null).value = { skill: "test-skill", path: "SKILL.md" };
      harness.render(SkillsPage);
      await harness.flushEffects();
      const content = harness.state((value) => value === "original skill guidance");
      assert.ok(content);
      content.value = "用户编辑的 Skill guidance {0}";
      harness.setLocale("ko-KR");
      harness.render(SkillsPage);
      await harness.flushEffects();
      assert.equal(content.value, "用户编辑的 Skill guidance {0}");
      assert.equal(calls, 1);
    });
  } finally { Object.assign(api, original); }
});

test("switching language preserves the current workspace directory", async () => {
  const { default: WorkspacePage } = require(sourceRoot + "app/(main)/function/workspace/page.tsx");
  const { api } = require(sourceRoot + "lib/api.ts");
  const original = api.workspaceList;
  const calls = [];
  api.workspaceList = async (path) => { calls.push(path); return { path, entries: [] }; };
  try {
    await withHookHarness(async (harness) => {
      harness.render(WorkspacePage);
      await harness.flushEffects();
      const path = harness.state((value) => value === "");
      path.value = "reports/用户目录";
      harness.setLocale("ko-KR");
      harness.render(WorkspacePage);
      await harness.flushEffects();
      assert.equal(path.value, "reports/用户目录");
      assert.deepEqual(calls, [""]);
    });
  } finally { api.workspaceList = original; }
});

test("unknown retest statuses and verdicts remain raw, including inherited property names", async () => {
  const { FindingRetestPanel } = require(sourceRoot + "components/finding-retest-panel.tsx");
  await withHookHarness(async (harness) => {
    harness.setLocale("ko-KR");
    harness.render(FindingRetestPanel, { findingId: "raw-id", readOnly: true });
    harness.state((value) => value === null).value = [
      { id: "1", status: "toString", created_at: "2026-09-03T00:00:00Z" },
      { id: "2", status: "completed", verdict: "__proto__", created_at: "2026-09-03T00:00:00Z" },
    ];
    const text = elementsInTree(harness.render(FindingRetestPanel, { findingId: "raw-id", readOnly: true })).flatMap((element) => element.props.children).filter((value) => typeof value === "string");
    assert.ok(text.includes("toString"));
    assert.ok(text.includes("__proto__"));
  });
});

test("unknown archive states preserve their raw keys", () => {
  const archiveStateLabel = loadPrivateComponent("app/(main)/function/tasks/page.tsx", "archiveStateLabel");
  const { translateUi } = localeModule();
  for (const key of ["待处理", "toString", "__proto__"]) {
    assert.equal(archiveStateLabel((message, ...values) => translateUi("ko-KR", message, ...values), key), key);
  }
});

test("unknown asset kinds preserve their raw keys", () => {
  const KindBadge = loadPrivateComponent("app/(main)/system/intercept/assets/page.tsx", "KindBadge");
  for (const key of ["待处理", "toString", "__proto__"]) {
    assert.match(renderInLocale("ko-KR", KindBadge, { kind: key }), new RegExp(key));
  }
});

test("original theme mode spelling remains available in zh-CN", () => {
  const { ThemeSwitcher } = require(sourceRoot + "app/(main)/_components/sidebar/theme-switcher.tsx");
  const { PreferencesStoreProvider } = require(sourceRoot + "stores/preferences/preferences-provider.tsx");
  const Theme = () => React.createElement(PreferencesStoreProvider, { themeMode: "light", themePreset: "default", contentLayout: "full-width", navbarStyle: "sticky", font: "geist" }, React.createElement(ThemeSwitcher));
  assert.match(renderInLocale("zh-CN", Theme), /aria-label="Current theme: light\. Click to cycle themes"/);
});

test("data-loading and stream hooks do not depend on presentation language", () => {
  function visitDirectory(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = directory + "/" + entry.name;
      if (entry.isDirectory()) visitDirectory(filename);
      else if (entry.name.endsWith(".tsx")) {
        const source = typescript.createSourceFile(filename, readFileSync(filename, "utf8"), typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TSX);
        function visit(node) {
          if (typescript.isConditionalExpression(node) && typescript.isElementAccessExpression(node.condition) && typescript.isCallExpression(node.whenTrue) && node.whenTrue.expression.getText(source) === "ui" && node.whenTrue.arguments[0]?.getText(source) === node.condition.getText(source)) {
            assert.fail(`${filename}: raw label-map fallbacks require own-property guards`);
          }
          if (typescript.isCallExpression(node) && /use(?:Effect|Callback)$/.test(node.expression.getText(source))) {
            const [callback, dependencies] = node.arguments;
            const isEffect = /useEffect$/.test(node.expression.getText(source));
            const isLoader = typescript.isVariableDeclaration(node.parent) && /^(load|refresh|check)/.test(node.parent.name.getText(source));
            const hasDataOperation = callback && /\bapi\b|new EventSource\b/.test(callback.getText(source));
            if (hasDataOperation && (isEffect || isLoader) && dependencies && typescript.isArrayLiteralExpression(dependencies)) {
              const languageDependencies = dependencies.elements.filter((element) => /^(ui|t|locale)$/.test(element.getText(source)));
              assert.equal(languageDependencies.length, 0, `${filename}: UI translation must not restart data loading or streams`);
            }
          }
          typescript.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  visitDirectory(sourceRoot + "app");
  visitDirectory(sourceRoot + "components");
});

test("grouped finding timestamps follow the selected language without changing raw descriptions", async () => {
  const { default: FindingsPage } = require(sourceRoot + "app/(main)/function/findings/page.tsx");
  const timestamp = "2026-09-03T12:34:56Z";
  const expected = new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
  await withHookHarness(async (harness) => {
    harness.setLocale("ko-KR");
    harness.render(FindingsPage);
    harness.state((value) => value === "flat").value = "grouped";
    harness.state(Array.isArray).value = [{ task_id: null, task_description: "原始用户描述 {0}", count: 0, critical: 0, high: 0, medium: 0, low: 0, last_found_at: timestamp }];
    const text = elementsInTree(harness.render(FindingsPage)).flatMap((element) => element.props.children).filter((value) => typeof value === "string");
    assert.ok(text.includes(expected), "the group timestamp must use Korean date formatting");
    assert.ok(text.includes("原始用户描述 {0}"));
  });
});

test("root route preserves its server-side redirect and original destination", () => {
  const filename = sourceRoot + "app/(external)/page.tsx";
  const source = typescript.createSourceFile(filename, readFileSync(filename, "utf8"), typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TSX);
  assert.ok(!source.statements.some((statement) => typescript.isExpressionStatement(statement) && typescript.isStringLiteral(statement.expression) && statement.expression.text === "use client"), "the redirect-only route must not become a client view");
  const { default: Home } = require(filename);
  assert.throws(() => renderToStaticMarkup(React.createElement(Home)), (error) => error.digest?.includes("NEXT_REDIRECT;replace;/function/tasks;"));
});

test("localized client boundaries keep a single valid Next directive", () => {
  for (const relativePath of [
    "app/(main)/_components/sidebar/layout-controls.tsx",
    "app/(main)/_components/sidebar/search-dialog.tsx",
    "app/(main)/function/llm-records/page.tsx",
    "app/(main)/system/skills/page.tsx",
    "components/ui/chart.tsx",
  ]) {
    const source = typescript.createSourceFile(relativePath, readFileSync(sourceRoot + relativePath, "utf8"), typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TSX);
    const directives = source.statements.flatMap((statement, index) =>
      typescript.isExpressionStatement(statement) && typescript.isStringLiteral(statement.expression) && statement.expression.text === "use client" ? [index] : [],
    );
    assert.deepEqual(directives, [0], `${relativePath} must preserve its client directive before imports`);
  }
});

test("completed, intent and delivery status contracts use Korean without changing status keys", () => {
  const { statusMeta } = require(sourceRoot + "lib/status.ts");
  for (const [domain, key, original, expected] of [
    ["task", "done", "已完成", "완료됨"],
    ["intent", "open", "待领", "할당 대기"],
    ["delivery", "sending", "发送中", "전송 중"],
  ]) {
    assert.equal(statusMeta(domain, key, "ko-KR").label, expected);
    assert.equal(statusMeta(domain, key, "zh-CN").label, original);
  }
});
