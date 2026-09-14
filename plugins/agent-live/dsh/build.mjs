import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const moduleId = "agent-live-dsh-adapter";
const contentToken = "__AGENT_LIVE_CONTENT_URI__";
const localeToken = "__AGENT_LIVE_LOCALE__";

await mkdir(new URL("./lib", import.meta.url), { recursive: true });

const frame = await build({
  entryPoints: [new URL("./src/frame-runtime.ts", import.meta.url).pathname],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  write: false,
  loader: { ".json": "json" },
});
const frameScript = frame.outputFiles[0].text;
// The V2 stylesheet imports the shared shell when served as a normal page.
// A DSH conversation view runs from srcDoc, so absolute CSS imports would be
// resolved against the DSH host and silently lose the complete base layout.
// Embed both layers to keep the view self-contained and network-free.
const baseCss = await readFile(new URL("../web/style.css", import.meta.url), "utf8");
const v2Css = await readFile(new URL("../web/v2/style.css", import.meta.url), "utf8");
const officeCss = `${baseCss}\n${v2Css.replace(/^@import[^;]+;\s*/u, "")}`;
const frameTemplate = await readFile(new URL("./src/frame.html", import.meta.url), "utf8");
const frameDocument = frameTemplate
  .replace("/*__AGENT_LIVE_CSS__*/", officeCss)
  .replace("/*__AGENT_LIVE_SCRIPT__*/", frameScript.replaceAll("</script", "<\\/script"));

if (process.env.AGENT_LIVE_DSH_FRAME_PREVIEW) {
  await writeFile(process.env.AGENT_LIVE_DSH_FRAME_PREVIEW, frameDocument);
}

/** The host-side frame factory, also emitted on request so tests exercise the real one. */
const frameDocumentModule = `const document = ${JSON.stringify(frameDocument)};
export default function frameDocument(content, locale) {
  return document
    .replace(${JSON.stringify(contentToken)}, encodeURIComponent(JSON.stringify(content ?? null)))
    .replace(${JSON.stringify(localeToken)}, locale === "zh-CN" ? "zh-CN" : "en");
}
`;
if (process.env.AGENT_LIVE_DSH_FRAME_MODULE) {
  await writeFile(process.env.AGENT_LIVE_DSH_FRAME_MODULE, frameDocumentModule);
}

const embeddedAssets = {
  name: "agent-live-embedded-assets",
  setup(build) {
    build.onResolve({ filter: /^agent-live-frame-document$/ }, (args) => ({ path: args.path, namespace: "agent-live" }));
    build.onLoad({ filter: /.*/, namespace: "agent-live" }, (args) => ({
      contents: frameDocumentModule,
      loader: "js",
    }));
  },
};

await build({
  entryPoints: [new URL("./src/index.ts", import.meta.url).pathname],
  outfile: new URL("./lib/index.js", import.meta.url).pathname,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: ["@deepseek-ai/*", "zod"],
});

await build({
  entryPoints: [new URL("./src/client.tsx", import.meta.url).pathname],
  outfile: new URL("./lib/client.js", import.meta.url).pathname,
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external: ["react", "react/jsx-runtime", "@deepseek-ai/*"],
  plugins: [embeddedAssets],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(moduleId)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: "return module.exports; } });",
  },
});
