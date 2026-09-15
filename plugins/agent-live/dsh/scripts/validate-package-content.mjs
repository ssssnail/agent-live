import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalogUrl = new URL("../lib/content/component-library/catalog.json", import.meta.url);
const officesUrl = new URL("../lib/content/catalog.json", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
const offices = JSON.parse(await readFile(officesUrl, "utf8"));

assert(pkg.files.includes("lib/content/**/*.json"), "published files omit bundled Office content");
assert(Array.isArray(catalog.layouts) && catalog.layouts.length > 0, "bundled component catalog has no layouts");
assert(Array.isArray(offices.presets) && offices.presets.some((entry) => entry.visibility !== "internal"), "bundled Office catalog has no public Offices");

console.log("dsh package content: runtime catalogs are bundled and readable");
