#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

const root = new URL("../web/v2/locales/", import.meta.url);
const english = JSON.parse(fs.readFileSync(new URL("en.json", root), "utf8"));
const chinese = JSON.parse(fs.readFileSync(new URL("zh-CN.json", root), "utf8"));
const enKeys = Object.keys(english.strings ?? {}).sort();
const zhKeys = Object.keys(chinese.strings ?? {}).sort();
if (JSON.stringify(enKeys) !== JSON.stringify(zhKeys)) throw new Error("Locale string keys do not match");
if (english.locale !== "en" || chinese.locale !== "zh-CN") throw new Error("Unexpected locale identifiers");
const emptyEntries = [english, chinese].flatMap(bundle => [
	...Object.entries(bundle.strings ?? {}),
	...Object.entries(bundle.text ?? {}),
]).filter(([, value]) => typeof value !== "string" || !value.trim());
if (emptyEntries.length) throw new Error(`Locale bundles contain empty translations: ${emptyEntries.map(([key]) => key).join(", ")}`);
const englishContent = Object.keys(english.text ?? {});
if (!englishContent.length) throw new Error("English locale must translate built-in Chinese content");
const chineseContent = Object.keys(chinese.text ?? {});
if (!chineseContent.length) throw new Error("Chinese locale must translate built-in English identifiers");
const contentRoot = new URL("../web/v2/content/", import.meta.url);
const chineseLeaves = new Set<string>();
const collectStrings = (value: unknown) => {
	if (typeof value === "string" && /[\u3400-\u9fff]/u.test(value)) chineseLeaves.add(value);
	else if (Array.isArray(value)) value.forEach(collectStrings);
	else if (value && typeof value === "object") Object.values(value).forEach(collectStrings);
};
for (const relative of fs.readdirSync(contentRoot, { recursive: true })) {
	if (!String(relative).endsWith(".json")) continue;
	collectStrings(JSON.parse(fs.readFileSync(path.join(contentRoot.pathname, String(relative)), "utf8")));
}
const patterns: RegExp[] = (english.patterns ?? []).map(({ source }: { source: string }) => new RegExp(source));
const untranslated = [...chineseLeaves].filter(value => !(value in (english.text ?? {})) && !patterns.some(pattern => pattern.test(value)));
if (untranslated.length) throw new Error(`English locale is missing built-in content: ${untranslated.join(", ")}`);
console.log(`Locale validation passed: ${enKeys.length} shared UI strings, ${englishContent.length} English content translations, ${chineseContent.length} Chinese content translations`);
