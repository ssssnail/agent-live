#!/usr/bin/env node
import * as fs from "node:fs";

const root = new URL("../web/v2/locales/", import.meta.url);
const english = JSON.parse(fs.readFileSync(new URL("en.json", root), "utf8"));
const chinese = JSON.parse(fs.readFileSync(new URL("zh-CN.json", root), "utf8"));
const enKeys = Object.keys(english.strings ?? {}).sort();
const zhKeys = Object.keys(chinese.strings ?? {}).sort();
if (JSON.stringify(enKeys) !== JSON.stringify(zhKeys)) throw new Error("Locale string keys do not match");
if (english.locale !== "en" || chinese.locale !== "zh-CN") throw new Error("Unexpected locale identifiers");
console.log(`Locale validation passed: ${enKeys.length} shared UI strings`);
