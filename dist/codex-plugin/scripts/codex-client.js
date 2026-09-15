#!/usr/bin/env node

// plugins/agent-live/src/adapters/codex/launcher.ts
import { randomBytes } from "node:crypto";

// plugins/agent-live/src/core/limits.ts
var SCENE_LIMITS = Object.freeze({
  agents: 16,
  seats: 8,
  npcs: 12,
  props: 80,
  animatedProps: 24,
  activities: 16,
  effects: 40,
  visibleBubbles: 4,
  queuedBubbles: 8
});

// plugins/agent-live/src/core/state.ts
var MAX_LOG = 200;
var MAX_HISTORY = 4e3;
var THOUGHT_FLUSH_MS = 180;
var MIN_THOUGHT_CHARS = 12;
var OfficeState = class {
  agents = /* @__PURE__ */ new Map();
  log = [];
  history = [];
  listeners = /* @__PURE__ */ new Set();
  session;
  thoughtBuffers = /* @__PURE__ */ new Map();
  thoughtTimer;
  seats = /* @__PURE__ */ new Set();
  constructor(cwd2) {
    this.session = {
      cwd: cwd2,
      busy: false,
      turns: 0,
      startedAt: Date.now()
    };
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event) {
    this.history.push({ at: Date.now(), event: structuredClone(event) });
    if (this.history.length > MAX_HISTORY) this.history.shift();
    for (const listener of this.listeners) {
      try {
        listener(structuredClone(event));
      } catch {
      }
    }
  }
  snapshot(includeHistory = true) {
    return structuredClone({
      type: "snapshot",
      agents: [...this.agents.values()],
      log: this.log.slice(-60),
      session: this.session,
      history: includeHistory ? this.history.slice() : []
    });
  }
  getAgent(id) {
    return this.agents.get(id);
  }
  sessionBusy() {
    return this.session.busy;
  }
  hasClients() {
    return this.listeners.size > 0;
  }
  updateSession(patch) {
    this.session = { ...this.session, ...patch };
    this.emit({ type: "session", session: this.session });
  }
  claimSeat() {
    for (let i = 0; i < SCENE_LIMITS.seats; i++) {
      if (!this.seats.has(i)) {
        this.seats.add(i);
        return i;
      }
    }
    return -1;
  }
  join(id, init) {
    const existing = this.agents.get(id);
    if (existing) {
      Object.assign(existing, init);
      this.emit({ type: "agent_join", agent: existing });
      return existing;
    }
    if (this.agents.size >= SCENE_LIMITS.agents) return void 0;
    const seat = this.claimSeat();
    const agent = {
      id,
      state: "idle",
      tokens: 0,
      cost: 0,
      toolCalls: 0,
      joinedAt: Date.now(),
      ...seat >= 0 ? { seat } : {},
      ...init
    };
    this.agents.set(id, agent);
    this.emit({ type: "agent_join", agent });
    this.addLog(id, "join", `${agent.name} \u4E0A\u73ED\u4E86`);
    return agent;
  }
  leave(id, ok) {
    const agent = this.agents.get(id);
    if (!agent) return;
    if (agent.seat !== void 0) this.seats.delete(agent.seat);
    this.agents.delete(id);
    this.emit({ type: "agent_leave", id, ok });
    this.addLog(id, "leave", `${agent.name} ${ok === true ? "\u4EA4\u4ED8\u5B8C\u6210\uFF0C\u4E0B\u73ED" : ok === false ? "\u5F02\u5E38\u9000\u51FA" : "\u7ED3\u675F\u5DE5\u4F5C"}`);
  }
  setState(id, state, detail) {
    const agent = this.agents.get(id);
    if (!agent) return;
    agent.state = state;
    agent.detail = detail;
    this.emit({ type: "agent_state", id, state, detail });
  }
  setTask(id, task) {
    const agent = this.agents.get(id);
    if (!agent) return;
    agent.task = task;
    this.emit({ type: "task", id, task });
  }
  /** Thinking tokens arrive fast; batch them so the renderer gets readable chunks. */
  pushThought(id, delta) {
    if (!delta) return;
    this.thoughtBuffers.set(id, (this.thoughtBuffers.get(id) ?? "") + delta);
    if (this.thoughtTimer) return;
    this.thoughtTimer = setTimeout(() => {
      this.thoughtTimer = void 0;
      this.flushThoughts(false);
    }, THOUGHT_FLUSH_MS);
    if (typeof this.thoughtTimer.unref === "function") this.thoughtTimer.unref();
  }
  flushThoughts(force = true) {
    for (const [id, text] of this.thoughtBuffers) {
      const clean = text.replace(/\s+/g, " ").trim();
      if (!force && clean.length < MIN_THOUGHT_CHARS) continue;
      this.thoughtBuffers.delete(id);
      if (!clean) continue;
      const agent = this.agents.get(id);
      if (agent) agent.thought = clean.slice(-160);
      this.emit({ type: "thought", id, text: clean });
      this.addLog(id, "thought", clean, false);
    }
  }
  say(id, text) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    this.emit({ type: "say", id, text: clean.slice(0, 400) });
    this.addLog(id, "say", clean.slice(0, 400), false);
  }
  startAction(id, toolCallId, action, label) {
    const agent = this.agents.get(id);
    if (agent) {
      agent.action = action;
      agent.toolCalls += 1;
      agent.state = "working";
      agent.detail = label;
    }
    this.emit({ type: "action", id, action, label, toolCallId });
    this.addLog(id, "tool", label, false);
  }
  endAction(id, toolCallId, ok) {
    const agent = this.agents.get(id);
    if (agent) agent.action = void 0;
    this.emit({ type: "action_end", id, toolCallId, ok });
  }
  delegate(from, to, task) {
    this.emit({ type: "delegate", from, to, task });
    const fromName = this.agents.get(from)?.name ?? from;
    const toName = this.agents.get(to)?.name ?? to;
    this.addLog(from, "delegate", `${fromName} \u2192 ${toName}: ${task.slice(0, 120)}`);
  }
  addUsage(id, tokens, cost) {
    const agent = this.agents.get(id);
    if (!agent) return;
    if (Number.isFinite(tokens) && tokens >= 0) agent.tokens = tokens;
    if (Number.isFinite(cost) && cost >= 0) agent.cost = cost;
    this.emit({ type: "usage", id, tokens: agent.tokens, cost: agent.cost });
  }
  addLog(agentId, kind, text, broadcast = true) {
    const item = { at: Date.now(), agentId, kind, text };
    this.log.push(item);
    if (this.log.length > MAX_LOG) this.log.shift();
    if (broadcast) this.emit({ type: "log", item });
  }
  dispose() {
    if (this.thoughtTimer) clearTimeout(this.thoughtTimer);
    this.thoughtTimer = void 0;
    this.thoughtBuffers.clear();
    this.listeners.clear();
    this.agents.clear();
    this.seats.clear();
    this.log = [];
    this.history = [];
  }
};

// plugins/agent-live/src/runtime/server.ts
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};
function moduleDir() {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return typeof __dirname !== "undefined" ? __dirname : process.cwd();
  }
}
var WEB_ROOT = [
  path.resolve(moduleDir(), "..", "..", "web"),
  path.resolve(moduleDir(), "..", "web")
].find((candidate) => fs.existsSync(candidate)) ?? path.resolve(moduleDir(), "..", "..", "web");
function resolveViewerUrl(baseUrl, target = "") {
  if (!target) return baseUrl;
  const normalizedTarget = target.startsWith("/") ? target : `/${target}`;
  return new URL(normalizedTarget, baseUrl).toString();
}
async function startServer(state, options) {
  const host = options.host ?? "127.0.0.1";
  const clients = /* @__PURE__ */ new Set();
  const sockets = /* @__PURE__ */ new Set();
  const accessToken = options.controls?.token ?? options.creatorToken;
  let closePromise = null;
  const server = http.createServer((req, res) => {
    const url2 = new URL(req.url ?? "/", `http://${host}`);
    const controls = options.controls;
    if (!isLocalRequest(req)) {
      json(res, 403, { error: "local requests only" });
      return;
    }
    if (accessToken && (url2.pathname === "/events" || url2.pathname.startsWith("/api/") && url2.pathname !== "/api/scene-limits") && !hasToken(req, url2, accessToken)) {
      json(res, 403, { error: "forbidden" });
      return;
    }
    if (url2.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no"
      });
      res.write(": connected\n\n");
      write(res, state.snapshot(false));
      clients.add(res);
      options.onViewerCountChange?.(clients.size);
      const unsubscribe = state.subscribe((event) => write(res, event));
      const heartbeat = setInterval(() => res.write(": ping\n\n"), 25e3);
      heartbeat.unref?.();
      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
        clients.delete(res);
        options.onViewerCountChange?.(clients.size);
      });
      return;
    }
    if (url2.pathname === "/api/state") {
      res.writeHead(200, { "content-type": MIME[".json"] });
      res.end(JSON.stringify(state.snapshot()));
      return;
    }
    if (url2.pathname === "/api/scene-limits") {
      json(res, 200, SCENE_LIMITS);
      return;
    }
    if (options.content && url2.pathname === "/api/offices" && req.method === "GET") {
      void options.content.list().then((value) => json(res, 200, value), (error) => json(res, 500, { error: error.message }));
      return;
    }
    if (options.content?.select && url2.pathname === "/api/office-selection" && req.method === "POST") {
      if (!accessToken || req.headers["x-agent-live-token"] !== accessToken) {
        json(res, 403, { error: "forbidden" });
        return;
      }
      void readJson(req).then((body) => options.content.select(String(body.id ?? ""))).then(
        (value) => json(res, 200, value ?? { ok: true }),
        (error) => json(res, 400, { error: error.message })
      );
      return;
    }
    if (options.content && url2.pathname === "/api/office-content" && req.method === "GET") {
      void options.content.resolve(url2.searchParams.get("id") ?? void 0).then((value) => json(res, 200, value), (error) => json(res, 404, { error: error.message }));
      return;
    }
    if (options.content?.subscribe && url2.pathname === "/api/content-events" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
      res.write(": connected\n\n");
      const unsubscribe = options.content.subscribe((change) => res.write(`data: ${JSON.stringify(change)}

`));
      const heartbeat = setInterval(() => res.write(": ping\n\n"), 25e3);
      heartbeat.unref?.();
      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
      return;
    }
    if (controls && url2.pathname === "/api/client/status" && req.method === "GET") {
      json(res, 200, controls.status());
      return;
    }
    if (controls && url2.pathname.startsWith("/api/client/") && req.method === "POST") {
      if (req.headers["x-agent-live-token"] !== controls.token) {
        json(res, 403, { error: "forbidden" });
        return;
      }
      void readJson(req).then(async (body) => {
        if (url2.pathname === "/api/client/model") return controls.selectModel(String(body.model ?? ""));
        if (url2.pathname === "/api/client/prompt") {
          return controls.prompt(String(body.text ?? ""), typeof body.model === "string" ? body.model : void 0);
        }
        if (url2.pathname === "/api/client/interrupt") return controls.interrupt();
        if (url2.pathname === "/api/client/approval") {
          return controls.resolveApproval(
            body.id,
            Boolean(body.allow),
            Boolean(body.forSession)
          );
        }
        throw new Error("unknown client endpoint");
      }).then(
        (result) => json(res, 200, result ?? { ok: true }),
        (error) => json(res, 400, { error: error.message })
      );
      return;
    }
    if (options.creator && url2.pathname === "/api/creator" && req.method === "POST") {
      const expectedToken = options.creatorToken ?? controls?.token;
      if (!expectedToken || req.headers["x-agent-live-token"] !== expectedToken) {
        json(res, 403, { error: "forbidden" });
        return;
      }
      void readJson(req).then((command) => options.creator.execute(command)).then(
        (result) => json(res, 200, result),
        (error) => json(res, 400, { error: error.message })
      );
      return;
    }
    serveStatic(url2.pathname, res);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  const port2 = await listen(server, host, options.port);
  const url = `http://localhost:${port2}`;
  return {
    url,
    port: port2,
    open(target = "") {
      openInBrowser(resolveViewerUrl(url, target));
    },
    async close() {
      if (closePromise) return closePromise;
      closePromise = new Promise((resolve2) => {
        const forceClose = setTimeout(() => {
          for (const socket of sockets) socket.destroy();
        }, 2e3);
        for (const client of clients) client.end();
        clients.clear();
        server.close(() => {
          clearTimeout(forceClose);
          sockets.clear();
          resolve2();
        });
      });
      return closePromise;
    }
  };
}
function json(res, status, value) {
  res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
function hasToken(req, url, expected) {
  return req.headers["x-agent-live-token"] === expected || url.searchParams.get("token") === expected;
}
function isLocalRequest(req) {
  const local = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "::1"]);
  try {
    const hostname = new URL(`http://${req.headers.host ?? ""}`).hostname;
    if (!local.has(hostname)) return false;
    const origin = req.headers.origin;
    if (origin && !local.has(new URL(origin).hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
function readJson(req) {
  return new Promise((resolve2, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) reject(new Error("request body is too large"));
    });
    req.on("end", () => {
      try {
        resolve2(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
function write(res, event) {
  try {
    res.write(`data: ${JSON.stringify(event)}

`);
  } catch {
  }
}
function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(WEB_ROOT, rel);
  const relative2 = path.relative(WEB_ROOT, filePath);
  if (relative2.startsWith("..") || path.isAbsolute(relative2)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end(`not found: ${rel}`);
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(data);
  });
}
function listen(server, host, startPort, attempts = 12) {
  return new Promise((resolve2, reject) => {
    let port2 = startPort;
    let left = attempts;
    const onError = (err) => {
      if (err.code === "EADDRINUSE" && left-- > 0) {
        port2 += 1;
        server.listen(port2, host);
        return;
      }
      server.off("error", onError);
      reject(err);
    };
    server.on("error", onError);
    server.once("listening", () => {
      server.off("error", onError);
      resolve2(server.address().port);
    });
    server.listen(port2, host);
  });
}
function openInBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32" : "xdg-open";
  const args2 = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args2, { stdio: "ignore", detached: true });
  child.once("error", () => {
  });
  child.unref();
}

// plugins/agent-live/src/runtime/content-service.ts
import os from "node:os";
import path5 from "node:path";
import { existsSync as existsSync2 } from "node:fs";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// plugins/agent-live/src/content/library.ts
import { readFile as readFile2 } from "node:fs/promises";
import path2 from "node:path";
async function readJson2(file) {
  return JSON.parse(await readFile2(file, "utf8"));
}
async function loadComponentLibrary(contentRoot) {
  const root = path2.join(contentRoot, "component-library");
  const [catalog, props, npcTemplates, agentProfileTemplates, activityRecipes, activityImplementations] = await Promise.all([
    readJson2(path2.join(root, "catalog.json")),
    readJson2(path2.join(root, "props.json")),
    readJson2(path2.join(root, "npc-templates.json")),
    readJson2(path2.join(root, "agent-profile-templates.json")),
    readJson2(path2.join(root, "activity-recipes.json")),
    readJson2(path2.join(root, "activity-implementations.json"))
  ]);
  const layouts = /* @__PURE__ */ new Map();
  for (const entry of catalog.layouts) layouts.set(entry.id, await readJson2(path2.join(contentRoot, "layouts", `${entry.id.replace(/^builtin\//, "")}.json`)));
  return {
    descriptors: {
      styles: catalog.styles,
      layouts: catalog.layouts,
      agentSkins: catalog.agentSkins,
      atmospheres: catalog.atmospheres,
      environments: catalog.environments
    },
    styles: new Set(catalog.styles.map((entry) => entry.id)),
    layouts,
    agentSkins: new Set(catalog.agentSkins.map((entry) => entry.id)),
    props: new Map(props.entries.map((entry) => [entry.id, entry])),
    npcTemplates: new Map(npcTemplates.entries.map((entry) => [entry.id, entry])),
    agentProfileTemplates: new Map(agentProfileTemplates.entries.map((entry) => [entry.id, entry])),
    activityRecipes: new Map(activityRecipes.entries.map((entry) => [entry.id, entry])),
    activityImplementations: new Map(activityImplementations.entries.map((entry) => [`${entry.layout}|${entry.recipe}`, entry])),
    atmospheres: new Set(catalog.atmospheres.map((entry) => entry.id)),
    environments: new Set(catalog.environments.map((entry) => entry.id)),
    defaultNpcTemplate: npcTemplates.defaultTemplate,
    npcProfilePolicy: npcTemplates.defaultInstancePolicy
  };
}
async function loadOfficialOffices(contentRoot) {
  const catalog = await readJson2(path2.join(contentRoot, "catalog.json"));
  const publicIds = catalog.presets.filter((entry) => entry.visibility !== "internal").map((entry) => entry.id);
  return Promise.all(publicIds.map((id) => readJson2(path2.join(contentRoot, "official-offices", `${id}.json`))));
}

// plugins/agent-live/src/content/registry.ts
import { EventEmitter } from "node:events";
import { mkdir, readFile as readFile3, readdir, rename, rm, writeFile } from "node:fs/promises";
import path3 from "node:path";

// plugins/agent-live/src/content/schema.ts
var OFFICE_SPEC_SCHEMA_VERSION = 1;
var GENDER_VALUES = ["female", "male", "nonbinary", "unspecified"];
var POSE_VALUES = ["stand", "sit"];
var ORIENTATION_VALUES = ["horizontal", "vertical"];
var WEATHER_VALUES = ["clear", "cloudy", "rain", "snow"];
var OFFICE_SPEC_DEFAULTS = Object.freeze({
  style: "builtin/pixel-classic",
  agentSkin: "builtin/tiny-developers",
  atmosphere: "builtin/default-atmosphere",
  environment: "builtin/local-office-environment",
  agentProfile: Object.freeze({ template: "builtin/host-agent" }),
  placements: Object.freeze([]),
  npcs: Object.freeze([]),
  activities: Object.freeze([])
});
var SPEC_KEYS = /* @__PURE__ */ new Set(["schemaVersion", "kind", "id", "name", "origin", "basePreset", "layout", "style", "agentSkin", "placements", "npcs", "activities", "atmosphere", "environment", "environmentOverrides", "agentProfile", "texts"]);
var PATCH_KEYS = /* @__PURE__ */ new Set(["schemaVersion", "kind", "id", "base", "name", "components", "placements", "npcs", "activities", "environmentOverrides", "agentProfile", "texts"]);
var COMPONENT_KEYS = /* @__PURE__ */ new Set(["layout", "style", "agentSkin", "atmosphere", "environment"]);
var PLACEMENT_KEYS = /* @__PURE__ */ new Set(["id", "component", "slot", "orientation"]);
var NPC_KEYS = /* @__PURE__ */ new Set(["id", "template", "profile", "name", "title", "gender", "appearance", "spawn", "shift", "pose"]);
var APPEARANCE_KEYS = /* @__PURE__ */ new Set(["skin", "hair", "shirt", "trim", "badge"]);
var AGENT_PROFILE_KEYS = /* @__PURE__ */ new Set(["template", "name", "title", "appearance"]);
var SHIFT_KEYS = /* @__PURE__ */ new Set(["start", "end", "endLatest"]);
var ENVIRONMENT_KEYS = /* @__PURE__ */ new Set(["clock", "weather", "lighting", "npcSchedule"]);
var CLOCK_KEYS = /* @__PURE__ */ new Set(["mode", "fixedTime"]);
var WEATHER_KEYS = /* @__PURE__ */ new Set(["fallback"]);
var LIGHTING_KEYS = /* @__PURE__ */ new Set(["auto"]);
var NPC_SCHEDULE_KEYS = /* @__PURE__ */ new Set(["defaultShift", "roleOverrides"]);
var COLLECTION_PATCH_KEYS = /* @__PURE__ */ new Set(["upsert", "remove"]);
var ACTIVITY_PATCH_KEYS = /* @__PURE__ */ new Set(["enable", "disable"]);
function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function issue(issues, path6, message) {
  issues.push({ path: path6, message });
}
function exactKeys(value, allowed, path6, issues) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, `${path6}.${key}`, "unknown field");
}
function requiredString(value, path6, issues) {
  if (typeof value !== "string" || value.trim() === "") issue(issues, path6, "must be a non-empty string");
}
function optionalString(value, path6, issues) {
  if (value !== void 0) requiredString(value, path6, issues);
}
function stringArray(value, path6, issues) {
  if (!Array.isArray(value)) return issue(issues, path6, "must be an array");
  for (let index = 0; index < value.length; index += 1) requiredString(value[index], `${path6}[${index}]`, issues);
}
function enumValue(value, allowed, path6, issues, optional = false) {
  if (optional && value === void 0) return;
  if (typeof value !== "string" || !allowed.includes(value)) issue(issues, path6, `must be one of: ${allowed.join(", ")}`);
}
function validateShift(value, path6, issues) {
  if (!object(value)) return issue(issues, path6, "must be an object");
  exactKeys(value, SHIFT_KEYS, path6, issues);
  requiredString(value.start, `${path6}.start`, issues);
  requiredString(value.end, `${path6}.end`, issues);
  optionalString(value.endLatest, `${path6}.endLatest`, issues);
}
function validateAppearance(value, path6, issues) {
  if (!object(value)) return issue(issues, path6, "must be an object");
  exactKeys(value, APPEARANCE_KEYS, path6, issues);
  for (const [key, color] of Object.entries(value)) optionalString(color, `${path6}.${key}`, issues);
}
function validatePlacement(value, path6, issues) {
  if (!object(value)) return issue(issues, path6, "must be an object");
  exactKeys(value, PLACEMENT_KEYS, path6, issues);
  requiredString(value.id, `${path6}.id`, issues);
  requiredString(value.component, `${path6}.component`, issues);
  requiredString(value.slot, `${path6}.slot`, issues);
  enumValue(value.orientation, ORIENTATION_VALUES, `${path6}.orientation`, issues, true);
}
function validateNpc(value, path6, issues) {
  if (!object(value)) return issue(issues, path6, "must be an object");
  exactKeys(value, NPC_KEYS, path6, issues);
  requiredString(value.id, `${path6}.id`, issues);
  for (const key of ["template", "profile", "name", "title", "spawn"]) optionalString(value[key], `${path6}.${key}`, issues);
  enumValue(value.gender, GENDER_VALUES, `${path6}.gender`, issues, true);
  enumValue(value.pose, POSE_VALUES, `${path6}.pose`, issues, true);
  if (value.appearance !== void 0) validateAppearance(value.appearance, `${path6}.appearance`, issues);
  if (value.shift !== void 0) validateShift(value.shift, `${path6}.shift`, issues);
}
function validateAgentProfile(value, path6, issues) {
  if (!object(value)) return issue(issues, path6, "must be an object");
  exactKeys(value, AGENT_PROFILE_KEYS, path6, issues);
  requiredString(value.template, `${path6}.template`, issues);
  optionalString(value.name, `${path6}.name`, issues);
  optionalString(value.title, `${path6}.title`, issues);
  if (value.appearance !== void 0) validateAppearance(value.appearance, `${path6}.appearance`, issues);
}
function validateEnvironment(value, path6, issues) {
  if (!object(value)) return issue(issues, path6, "must be an object");
  exactKeys(value, ENVIRONMENT_KEYS, path6, issues);
  if (value.clock !== void 0) {
    if (!object(value.clock)) issue(issues, `${path6}.clock`, "must be an object");
    else {
      exactKeys(value.clock, CLOCK_KEYS, `${path6}.clock`, issues);
      enumValue(value.clock.mode, ["local", "fixed"], `${path6}.clock.mode`, issues);
      optionalString(value.clock.fixedTime, `${path6}.clock.fixedTime`, issues);
    }
  }
  if (value.weather !== void 0) {
    if (!object(value.weather)) issue(issues, `${path6}.weather`, "must be an object");
    else {
      exactKeys(value.weather, WEATHER_KEYS, `${path6}.weather`, issues);
      enumValue(value.weather.fallback, WEATHER_VALUES, `${path6}.weather.fallback`, issues);
    }
  }
  if (value.lighting !== void 0) {
    if (!object(value.lighting)) issue(issues, `${path6}.lighting`, "must be an object");
    else {
      exactKeys(value.lighting, LIGHTING_KEYS, `${path6}.lighting`, issues);
      if (typeof value.lighting.auto !== "boolean") issue(issues, `${path6}.lighting.auto`, "must be a boolean");
    }
  }
  if (value.npcSchedule !== void 0) {
    if (!object(value.npcSchedule)) issue(issues, `${path6}.npcSchedule`, "must be an object");
    else {
      exactKeys(value.npcSchedule, NPC_SCHEDULE_KEYS, `${path6}.npcSchedule`, issues);
      if (value.npcSchedule.defaultShift !== void 0) validateShift(value.npcSchedule.defaultShift, `${path6}.npcSchedule.defaultShift`, issues);
      if (value.npcSchedule.roleOverrides !== void 0) {
        if (!object(value.npcSchedule.roleOverrides)) issue(issues, `${path6}.npcSchedule.roleOverrides`, "must be an object");
        else for (const [role, shift] of Object.entries(value.npcSchedule.roleOverrides)) validateShift(shift, `${path6}.npcSchedule.roleOverrides.${role}`, issues);
      }
    }
  }
}
function validateTexts(value, issues) {
  if (!object(value)) return issue(issues, "$.texts", "must be an object");
  if (Object.keys(value).length > 8) issue(issues, "$.texts", "maximum 8 text areas");
  for (const [key, text] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]*$/.test(key)) issue(issues, `$.texts.${key}`, "invalid text area id");
    if (typeof text !== "string" || [...text].length > 120 || /[\r\n\u0000-\u001f]/.test(text)) issue(issues, `$.texts.${key}`, "must be single-line plain text of at most 120 characters");
  }
}
function validateOfficeSpecShape(input) {
  const issues = [];
  if (!object(input)) return [{ path: "$", message: "must be an object" }];
  exactKeys(input, SPEC_KEYS, "$", issues);
  if (input.schemaVersion !== OFFICE_SPEC_SCHEMA_VERSION) issue(issues, "$.schemaVersion", `must equal ${OFFICE_SPEC_SCHEMA_VERSION}`);
  if (input.kind !== "office-spec") issue(issues, "$.kind", "must equal office-spec");
  for (const key of ["id", "name", "layout", "style", "agentSkin", "atmosphere", "environment"]) requiredString(input[key], `$.${key}`, issues);
  enumValue(input.origin, ["official", "custom"], "$.origin", issues);
  optionalString(input.basePreset, "$.basePreset", issues);
  if (!Array.isArray(input.placements)) issue(issues, "$.placements", "must be an array");
  else input.placements.forEach((value, index) => validatePlacement(value, `$.placements[${index}]`, issues));
  if (!Array.isArray(input.npcs)) issue(issues, "$.npcs", "must be an array");
  else input.npcs.forEach((value, index) => validateNpc(value, `$.npcs[${index}]`, issues));
  stringArray(input.activities, "$.activities", issues);
  if (input.environmentOverrides !== void 0) validateEnvironment(input.environmentOverrides, "$.environmentOverrides", issues);
  if (input.agentProfile !== void 0) validateAgentProfile(input.agentProfile, "$.agentProfile", issues);
  if (input.texts !== void 0) validateTexts(input.texts, issues);
  return issues;
}
function validateCollectionPatch(value, path6, issues, itemValidator) {
  if (!object(value)) return issue(issues, path6, "must be an object");
  exactKeys(value, COLLECTION_PATCH_KEYS, path6, issues);
  if (value.upsert !== void 0) {
    if (!Array.isArray(value.upsert)) issue(issues, `${path6}.upsert`, "must be an array");
    else value.upsert.forEach((item, index) => itemValidator(item, `${path6}.upsert[${index}]`, issues));
  }
  if (value.remove !== void 0) stringArray(value.remove, `${path6}.remove`, issues);
}
function validateOfficePatchShape(input) {
  const issues = [];
  if (!object(input)) return [{ path: "$", message: "must be an object" }];
  exactKeys(input, PATCH_KEYS, "$", issues);
  if (input.schemaVersion !== OFFICE_SPEC_SCHEMA_VERSION) issue(issues, "$.schemaVersion", `must equal ${OFFICE_SPEC_SCHEMA_VERSION}`);
  if (input.kind !== "office-patch") issue(issues, "$.kind", "must equal office-patch");
  requiredString(input.base, "$.base", issues);
  optionalString(input.id, "$.id", issues);
  optionalString(input.name, "$.name", issues);
  if (input.components !== void 0) {
    if (!object(input.components)) issue(issues, "$.components", "must be an object");
    else {
      exactKeys(input.components, COMPONENT_KEYS, "$.components", issues);
      if (input.components.layout !== void 0) {
        issue(issues, "$.components.layout", "an Office keeps its room; edit the Office that already uses that layout instead");
      }
      for (const [key, value] of Object.entries(input.components)) optionalString(value, `$.components.${key}`, issues);
    }
  }
  if (input.placements !== void 0) validateCollectionPatch(input.placements, "$.placements", issues, validatePlacement);
  if (input.npcs !== void 0) validateCollectionPatch(input.npcs, "$.npcs", issues, validateNpc);
  if (input.activities !== void 0) {
    if (!object(input.activities)) issue(issues, "$.activities", "must be an object");
    else {
      exactKeys(input.activities, ACTIVITY_PATCH_KEYS, "$.activities", issues);
      if (input.activities.enable !== void 0) stringArray(input.activities.enable, "$.activities.enable", issues);
      if (input.activities.disable !== void 0) stringArray(input.activities.disable, "$.activities.disable", issues);
    }
  }
  if (input.environmentOverrides !== void 0 && input.environmentOverrides !== null) validateEnvironment(input.environmentOverrides, "$.environmentOverrides", issues);
  if (input.agentProfile !== void 0 && input.agentProfile !== null) validateAgentProfile(input.agentProfile, "$.agentProfile", issues);
  if (input.texts !== void 0 && input.texts !== null) validateTexts(input.texts, issues);
  return issues;
}

// plugins/agent-live/src/content/graph-validator.ts
var WORK_CAPABILITIES = ["research", "create", "compute", "plan", "communicate", "collaborate"];
var DYNAMIC_ACTIVITY_TARGETS = /* @__PURE__ */ new Set(["near-colleague"]);
function namedInstance(requirement) {
  if (typeof requirement === "string") return requirement;
  if (requirement && typeof requirement.prop === "string") return requirement.prop;
  return void 0;
}
function resolveActivityRequirements(requires, instances, capabilitiesOf, activity) {
  const table = [...instances];
  const bindings = [];
  const issues = [];
  for (const requirement of requires ?? []) {
    const named = namedInstance(requirement);
    if (named !== void 0) {
      const present = table.some(([instanceId]) => instanceId === named);
      bindings.push(present ? named : null);
      if (!present) issues.push({ code: "missing-activity-prop", path: "$", message: `${activity} \u7F3A\u5C11 Prop\uFF1A${named}` });
      continue;
    }
    const capability = requirement && typeof requirement.capability === "string" ? requirement.capability : void 0;
    if (!capability) {
      bindings.push(null);
      issues.push({ code: "invalid-activity-requirement", path: "$", message: `${activity} \u7684\u4F9D\u8D56\u5FC5\u987B\u662F\u5177\u540D\u9053\u5177\u6216\u80FD\u529B\u9700\u6C42` });
      continue;
    }
    const match = table.find(([, type]) => capabilitiesOf(type).includes(capability));
    bindings.push(match ? match[0] : null);
    if (!match) issues.push({ code: "missing-activity-capability", path: "$", message: `${activity} \u9700\u8981 ${capability} \u80FD\u529B\uFF0C\u5F53\u524D\u529E\u516C\u5BA4\u6CA1\u6709\u63D0\u4F9B\u8BE5\u80FD\u529B\u7684\u9053\u5177` });
  }
  return { bindings, issues };
}
function assertManifest(value, kind) {
  const manifest = value;
  if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== kind || !manifest.id || !manifest.version) {
    throw new Error(`\u65E0\u6548\u7684 ${kind} \u5185\u5BB9\u6E05\u5355`);
  }
}
function manifestKindFor(key) {
  if (key === "agentSkin") return "agent-skin";
  if (key === "lifeActivities") return "life-activities";
  return key;
}
function validClock(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}
function shiftIssue(value, code, path6, label) {
  if (!value || !validClock(value.start) || !validClock(value.end)) return { code, path: path6, message: `${label} \u5FC5\u987B\u63D0\u4F9B\u6709\u6548\u7684 HH:MM \u8D77\u6B62\u65F6\u95F4` };
  if (value.endLatest !== void 0 && !validClock(value.endLatest)) return { code, path: `${path6}.endLatest`, message: `${label} \u7684\u6700\u665A\u4E0B\u73ED\u65F6\u95F4\u5FC5\u987B\u662F\u6709\u6548\u7684 HH:MM` };
  return null;
}
function layoutIssues(layout, propTypeNames) {
  if (!layout || typeof layout !== "object") return [{ code: "missing-layout", path: "$.layout", message: "Layout \u7F3A\u5931" }];
  const issues = [];
  if (layout.contract !== "single-office-v1") issues.push({ code: "invalid-layout-contract", path: "$.layout", message: `\u4E0D\u652F\u6301\u7684 Layout \u5408\u540C\uFF1A${layout.contract}` });
  if (layout.canvas?.width !== 384 || layout.canvas?.height !== 216) issues.push({ code: "invalid-layout-canvas", path: "$.layout", message: "single-office-v1 \u5FC5\u987B\u4F7F\u7528 384\xD7216 \u903B\u8F91\u753B\u5E03" });
  if (!Array.isArray(layout.seats) || layout.seats.length !== 8) issues.push({ code: "invalid-layout-seats", path: "$.layout", message: "Demo Layout \u5FC5\u987B\u63D0\u4F9B 8 \u4E2A\u5EA7\u4F4D" });
  if (!Array.isArray(layout.navigation?.lanes) || !layout.navigation.lanes.length) issues.push({ code: "invalid-layout-navigation", path: "$.layout", message: "Layout \u7F3A\u5C11\u5BFC\u822A\u901A\u9053" });
  const propTypes = new Set(propTypeNames);
  const textIds = /* @__PURE__ */ new Set();
  if (layout.textSlots !== void 0 && (!Array.isArray(layout.textSlots) || layout.textSlots.length > 8)) {
    issues.push({ code: "invalid-text-slots", path: "$.layout.textSlots", message: "maximum 8 text areas" });
  } else for (const slot of layout.textSlots ?? []) {
    const valid = slot && typeof slot.id === "string" && /^[a-z][a-z0-9-]*$/.test(slot.id) && !textIds.has(slot.id) && [slot.x, slot.y, slot.width, slot.height, slot.maxLength].every(Number.isFinite) && slot.x >= 0 && slot.y >= 0 && slot.width >= 12 && slot.height >= 9 && slot.x + slot.width <= 384 && slot.y + slot.height <= 216 && slot.maxLength >= 1 && slot.maxLength <= 120 && [slot.text, slot.defaultText].every((text) => text === void 0 || typeof text === "string" && [...text].length <= slot.maxLength);
    if (!valid) issues.push({ code: "invalid-text-slot", path: "$.layout.textSlots", message: "invalid, duplicate or out-of-bounds text area" });
    if (slot?.id) textIds.add(slot.id);
  }
  const propInstances = /* @__PURE__ */ new Set();
  for (const instance of layout.propInstances ?? []) {
    if (!propTypes.has(instance?.type)) issues.push({ code: "unknown-layout-prop", path: "$.layout.propInstances", message: `\u672A\u77E5 Prop Type\uFF1A${instance?.type}` });
    if (!instance?.id || propInstances.has(instance.id)) issues.push({ code: "invalid-layout-prop", path: "$.layout.propInstances", message: `\u91CD\u590D\u6216\u65E0\u6548\u7684 Prop \u5B9E\u4F8B\uFF1A${instance?.id ?? "\u2014"}` });
    propInstances.add(instance?.id);
  }
  for (const capability of WORK_CAPABILITIES) {
    if (!layout.stations?.[capability]) issues.push({ code: "missing-layout-station", path: `$.layout.stations.${capability}`, message: `Layout \u7F3A\u5C11\u5DE5\u4F5C\u80FD\u529B\uFF1A${capability}` });
  }
  return issues;
}
function graphIssues(content) {
  const issues = [];
  for (const [key, value] of Object.entries(content ?? {})) {
    if (key === "preset" || key === "agentProfile") continue;
    try {
      assertManifest(value, manifestKindFor(key));
    } catch (error) {
      issues.push({ code: "invalid-manifest", path: `$.${key}`, message: error.message });
    }
  }
  const profile = content?.agentProfile;
  if (!profile || typeof profile !== "object" || typeof profile.template !== "string" || !profile.template || !profile.appearance || typeof profile.appearance !== "object" || Array.isArray(profile.appearance)) {
    issues.push({ code: "invalid-agent-profile", path: "$.agentProfile", message: "\u65E0\u6548\u7684 Agent Profile" });
  }
  const layout = content?.layout;
  issues.push(...layoutIssues(layout, Object.keys(content?.props?.types ?? {})));
  const instances = (layout?.propInstances ?? []).map((instance) => [instance?.id, instance?.type]);
  const capabilitiesOf = (type) => content?.props?.types?.[type]?.capabilities ?? [];
  ;
  (content?.npcs?.entries ?? []).forEach((npc, index) => {
    const path6 = `$.npcs.entries[${index}]`;
    if (!npc?.id || !npc.role || !layout?.targets?.[npc.spawn]) issues.push({ code: "invalid-npc", path: path6, message: `\u65E0\u6548\u7684 NPC\uFF1A${npc?.id ?? "\u2014"}` });
    const shift = npc?.shift ? shiftIssue(npc.shift, "invalid-npc-shift", path6, `NPC ${npc.id} \u7684 shift`) : null;
    if (shift) issues.push(shift);
  });
  ;
  (content?.lifeActivities?.entries ?? []).forEach((activity, index) => {
    const path6 = `$.lifeActivities.entries[${index}]`;
    if (!activity?.id || !["agent", "npc", "person"].includes(activity.participant?.kind) || !activity.steps?.length) {
      issues.push({ code: "invalid-activity", path: path6, message: `\u65E0\u6548\u7684 Life Activity\uFF1A${activity?.id ?? "\u2014"}` });
      return;
    }
    if (activity.participant?.minAgents != null && (!Number.isInteger(activity.participant.minAgents) || activity.participant.minAgents < 2)) {
      issues.push({ code: "invalid-activity-participant", path: path6, message: `${activity.id} \u7684 minAgents \u5FC5\u987B\u662F\u81F3\u5C11 2 \u7684\u6574\u6570` });
    }
    const resolved = resolveActivityRequirements(activity.requires, instances, capabilitiesOf, activity.id);
    issues.push(...resolved.issues.map((issue2) => ({ ...issue2, path: path6 })));
    for (const step of activity.steps ?? []) {
      if (!layout?.targets?.[step?.target] && !DYNAMIC_ACTIVITY_TARGETS.has(step?.target)) issues.push({ code: "missing-activity-target", path: path6, message: `${activity.id} \u7F3A\u5C11 Target\uFF1A${step?.target}` });
      for (const target of step?.targets ?? []) {
        if (!layout?.targets?.[target]) issues.push({ code: "missing-activity-target", path: path6, message: `${activity.id} \u7F3A\u5C11 Group Target\uFF1A${target}` });
      }
    }
  });
  const environment = content?.environment;
  if (!environment || !["local", "fixed"].includes(environment.clock?.mode)) {
    issues.push({ code: "invalid-environment", path: "$.environment", message: "Environment \u7684 clock.mode \u5FC5\u987B\u662F local \u6216 fixed" });
  } else {
    if (environment.clock.mode === "fixed" && !validClock(environment.clock.fixedTime)) issues.push({ code: "invalid-environment", path: "$.environment.clock.fixedTime", message: "Environment \u7684 fixedTime \u65E0\u6548" });
    if (!Array.isArray(environment.clock?.phases) || !environment.clock.phases.length) issues.push({ code: "invalid-environment", path: "$.environment.clock", message: "Environment \u7F3A\u5C11 day phases" });
    for (const phase of environment.clock?.phases ?? []) {
      if (!phase?.id || !validClock(phase.start)) issues.push({ code: "invalid-environment", path: "$.environment.clock.phases", message: "Environment \u5305\u542B\u65E0\u6548\u7684 day phase" });
    }
    if (!Array.isArray(environment.weather?.allowedConditions) || !environment.weather.allowedConditions.length) {
      issues.push({ code: "invalid-environment", path: "$.environment.weather", message: "Environment \u7F3A\u5C11\u5929\u6C14\u7C7B\u578B" });
    }
    const allowedWeather = new Set(environment.weather?.allowedConditions ?? []);
    for (const condition of [environment.weather?.condition, environment.weather?.fallback]) {
      if (condition != null && !allowedWeather.has(condition)) {
        issues.push({ code: "invalid-environment", path: "$.environment.weather", message: `Environment \u7684\u5929\u6C14 ${condition} \u4E0D\u5728 allowedConditions \u4E2D` });
      }
    }
    const shift = environment.npcSchedule?.defaultShift ? shiftIssue(environment.npcSchedule.defaultShift, "invalid-environment", "$.environment.npcSchedule", "Environment \u7684 NPC \u9ED8\u8BA4\u73ED\u6B21") : null;
    if (shift) issues.push(shift);
    for (const [role, value] of Object.entries(environment.npcSchedule?.roleOverrides ?? {})) {
      const roleIssue = shiftIssue(value, "invalid-environment", `$.environment.npcSchedule.roleOverrides.${role}`, `Environment \u7684 ${role} \u73ED\u6B21`);
      if (roleIssue) issues.push(roleIssue);
    }
  }
  return issues;
}
function graphIssueMessages(content) {
  return graphIssues(content).map((issue2) => issue2.message);
}

// plugins/agent-live/src/content/validator.ts
function add(issues, code, path6, message) {
  issues.push({ code, path: path6, message });
}
function validClock2(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}
function validateShift2(value, path6, issues) {
  if (!validClock2(value?.start) || !validClock2(value?.end)) add(issues, "invalid-shift", path6, "shift must contain valid HH:MM start and end values");
  if (value?.endLatest !== void 0 && !validClock2(value.endLatest)) add(issues, "invalid-shift", `${path6}.endLatest`, "endLatest must be a valid HH:MM value");
}
function validateLayoutContract(layout, library, issues) {
  const propTypeNames = [...library.props.keys()].map((id) => id.replace(/^(builtin|local)\//, ""));
  for (const issue2 of layoutIssues(layout, propTypeNames)) add(issues, issue2.code, issue2.path, issue2.message);
}
var OFFICE_ID = /^(builtin|local)\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/;
var INSTANCE_ID = /^[a-z0-9][a-z0-9-]*$/;
var COLOR = /^#[0-9a-f]{6}$/i;
function validateOfficeSpec(spec, library) {
  const issues = validateOfficeSpecShape(spec).map((entry) => ({ ...entry, code: "invalid-shape" }));
  if (issues.length || !spec || typeof spec !== "object") return { valid: false, issues };
  const value = spec;
  if (!OFFICE_ID.test(value.id)) add(issues, "invalid-office-id", "$.id", "office id must use a safe builtin/ or local/ identifier");
  if (value.origin === "official" && !value.id.startsWith("builtin/")) add(issues, "invalid-office-origin", "$.origin", "official offices require a builtin/ id");
  if (value.origin === "custom" && !value.id.startsWith("local/")) add(issues, "invalid-office-origin", "$.origin", "custom offices require a local/ id");
  if (!library.layouts.has(value.layout)) add(issues, "unknown-layout", "$.layout", `unknown layout ${value.layout}`);
  if (!library.styles.has(value.style)) add(issues, "unknown-style", "$.style", `unknown style ${value.style}`);
  if (!library.agentSkins.has(value.agentSkin)) add(issues, "unknown-agent-skin", "$.agentSkin", `unknown agent skin ${value.agentSkin}`);
  if (!library.atmospheres.has(value.atmosphere)) add(issues, "unknown-atmosphere", "$.atmosphere", `unknown atmosphere ${value.atmosphere}`);
  if (!library.environments.has(value.environment)) add(issues, "unknown-environment", "$.environment", `unknown environment ${value.environment}`);
  if (value.agentProfile) {
    if (!library.agentProfileTemplates.has(value.agentProfile.template)) add(issues, "unknown-agent-profile-template", "$.agentProfile.template", `unknown Agent Profile template ${value.agentProfile.template}`);
    for (const [field, color] of Object.entries(value.agentProfile.appearance ?? {})) if (!COLOR.test(String(color))) add(issues, "invalid-color", `$.agentProfile.appearance.${field}`, "appearance colors must use #RRGGBB");
  }
  const layout = library.layouts.get(value.layout);
  if (!layout) return { valid: false, issues };
  validateLayoutContract(layout, library, issues);
  for (const [id, text] of Object.entries(value.texts ?? {})) {
    const slot = (layout.textSlots ?? []).find((entry) => entry.id === id);
    if (!slot) add(issues, "unknown-text-area", `$.texts.${id}`, `unknown text area ${id}`);
    else if ([...text].length > slot.maxLength) add(issues, "text-too-long", `$.texts.${id}`, `maximum ${slot.maxLength} characters`);
  }
  const slots = new Map((layout.placementSlots ?? []).map((slot) => [slot.id, slot]));
  const placementIds = /* @__PURE__ */ new Set();
  const occupiedSlots = /* @__PURE__ */ new Set();
  for (let index = 0; index < value.placements.length; index += 1) {
    const placement = value.placements[index];
    const path6 = `$.placements[${index}]`;
    if (!INSTANCE_ID.test(placement.id)) add(issues, "invalid-placement-id", `${path6}.id`, "placement id must be a safe lowercase identifier");
    if (placementIds.has(placement.id)) add(issues, "duplicate-placement", `${path6}.id`, `duplicate placement id ${placement.id}`);
    placementIds.add(placement.id);
    const component = library.props.get(placement.component);
    if (!component) add(issues, "unknown-prop", `${path6}.component`, `unknown prop ${placement.component}`);
    const slot = slots.get(placement.slot);
    if (!slot) add(issues, "unknown-slot", `${path6}.slot`, `unknown slot ${placement.slot}`);
    else {
      if (occupiedSlots.has(placement.slot)) add(issues, "occupied-slot", `${path6}.slot`, `slot ${placement.slot} is already occupied`);
      occupiedSlots.add(placement.slot);
      const propType = placement.component.replace(/^builtin\//, "");
      if (component && !slot.accepts?.includes(propType)) add(issues, "incompatible-slot", path6, `${placement.component} is not accepted by ${placement.slot}`);
      if (component && (component.size.width > slot.maxSize?.width || component.size.height > slot.maxSize?.height)) add(issues, "prop-too-large", path6, `${placement.component} exceeds ${placement.slot}`);
    }
  }
  if (value.placements.length > SCENE_LIMITS.props) add(issues, "too-many-props", "$.placements", `maximum ${SCENE_LIMITS.props} props`);
  const npcIds = /* @__PURE__ */ new Set();
  for (let index = 0; index < value.npcs.length; index += 1) {
    const npc = value.npcs[index];
    const path6 = `$.npcs[${index}]`;
    if (!INSTANCE_ID.test(npc.id)) add(issues, "invalid-npc-id", `${path6}.id`, "NPC id must be a safe lowercase identifier");
    if (npcIds.has(npc.id)) add(issues, "duplicate-npc", `${path6}.id`, `duplicate NPC id ${npc.id}`);
    npcIds.add(npc.id);
    const template = npc.template ? library.npcTemplates.get(npc.template) : void 0;
    if (!npc.template || !template) add(issues, "unknown-npc-template", `${path6}.template`, `unknown NPC template ${npc.template ?? "(missing)"}`);
    if (npc.profile && (!template?.defaultProfiles || !template.defaultProfiles.some((profile) => profile.id === npc.profile))) add(issues, "unknown-npc-profile", `${path6}.profile`, `unknown profile ${npc.profile}`);
    if (npc.gender && !GENDER_VALUES.includes(npc.gender)) add(issues, "invalid-gender", `${path6}.gender`, `unsupported gender ${npc.gender}`);
    if (npc.pose && !POSE_VALUES.includes(npc.pose)) add(issues, "invalid-pose", `${path6}.pose`, `unsupported pose ${npc.pose}`);
    for (const [field, color] of Object.entries(npc.appearance ?? {})) if (!COLOR.test(String(color))) add(issues, "invalid-color", `${path6}.appearance.${field}`, "appearance colors must use #RRGGBB");
    if (!npc.spawn || !layout.npcSpawns?.includes(npc.spawn) || !layout.targets?.[npc.spawn]) add(issues, "invalid-npc-spawn", `${path6}.spawn`, `invalid NPC spawn ${npc.spawn ?? "(missing)"}`);
    if (npc.shift) validateShift2(npc.shift, `${path6}.shift`, issues);
  }
  if (value.npcs.length > SCENE_LIMITS.npcs) add(issues, "too-many-npcs", "$.npcs", `maximum ${SCENE_LIMITS.npcs} NPCs`);
  const activities = /* @__PURE__ */ new Set();
  const propInstances = /* @__PURE__ */ new Map();
  const replaceableIds = new Set((layout.placementSlots ?? []).map((slot) => slot.occupiedBy).filter(Boolean));
  for (const instance of layout.propInstances ?? []) if (!replaceableIds.has(instance.id)) propInstances.set(instance.id, instance.type);
  for (const placement of value.placements) propInstances.set(placement.id, placement.component.replace(/^(builtin|local)\//, ""));
  const capabilitiesOf = (type) => {
    const prop = library.props.get(`builtin/${type}`) ?? library.props.get(`local/${type}`) ?? library.props.get(type);
    return prop?.capabilities ?? [];
  };
  const preparedSlots = /* @__PURE__ */ new Map();
  for (const slot of layout.placementSlots ?? []) {
    const builtin = (layout.propInstances ?? []).find((instance) => instance.id === slot.occupiedBy);
    if (!builtin) continue;
    for (const capability of capabilitiesOf(builtin.type)) if (!preparedSlots.has(capability)) preparedSlots.set(capability, slot.id);
  }
  const npcRoles = new Set(value.npcs.map((npc) => library.npcTemplates.get(npc.template ?? "")?.role).filter(Boolean));
  for (let index = 0; index < value.activities.length; index += 1) {
    const activityId = value.activities[index];
    const path6 = `$.activities[${index}]`;
    if (activities.has(activityId)) add(issues, "duplicate-activity", path6, `duplicate activity ${activityId}`);
    activities.add(activityId);
    const recipe = library.activityRecipes.get(activityId);
    if (!recipe) add(issues, "unknown-activity", path6, `unknown activity ${activityId}`);
    else if (!library.activityImplementations.has(`${value.layout}|${activityId}`)) add(issues, "unsupported-activity-layout", path6, `${activityId} has no implementation for ${value.layout}`);
    else {
      const implementation = library.activityImplementations.get(`${value.layout}|${activityId}`);
      const resolved = resolveActivityRequirements(implementation?.definition?.requires, propInstances, capabilitiesOf, activityId);
      for (const issue2 of resolved.issues) add(issues, issue2.code, path6, issue2.message);
      if (!resolved.issues.length) {
        (implementation?.definition?.requires ?? []).forEach((requirement, requirementIndex) => {
          const capability = requirement && typeof requirement === "object" && typeof requirement.capability === "string" ? requirement.capability : void 0;
          const bound = resolved.bindings[requirementIndex];
          const placement = capability && bound ? value.placements.find((entry) => entry.id === bound) : void 0;
          if (!placement) return;
          const prepared = preparedSlots.get(capability);
          if (prepared === placement.slot) return;
          add(issues, "capability-prop-slot", path6, `${placement.id} provides ${capability} from ${placement.slot}, but ${activityId} performs where this layout prepared ${capability}${prepared ? ` (${prepared})` : ""}; keep the prop where it is instead of relocating it`);
        });
      }
      if (!resolved.issues.length && recipe.participantKinds?.includes("npc") && recipe.participantKinds.length === 1 && recipe.participantRoles?.length && !recipe.participantRoles.some((role) => npcRoles.has(role))) {
        add(issues, "missing-activity-participant", path6, `${activityId} has no compatible NPC in this office`);
      }
    }
  }
  if (value.activities.length > SCENE_LIMITS.activities) add(issues, "too-many-activities", "$.activities", `maximum ${SCENE_LIMITS.activities} activities`);
  const overrides = value.environmentOverrides;
  if (overrides?.clock?.mode === "fixed" && !validClock2(overrides.clock.fixedTime)) add(issues, "invalid-fixed-time", "$.environmentOverrides.clock.fixedTime", "fixed clock requires a valid HH:MM value");
  if (overrides?.clock?.mode === "local" && overrides.clock.fixedTime !== void 0) add(issues, "unused-fixed-time", "$.environmentOverrides.clock.fixedTime", "local clock cannot include fixedTime");
  if (overrides?.weather && !WEATHER_VALUES.includes(overrides.weather.fallback)) add(issues, "invalid-weather", "$.environmentOverrides.weather.fallback", "unsupported weather");
  if (overrides?.npcSchedule?.defaultShift) validateShift2(overrides.npcSchedule.defaultShift, "$.environmentOverrides.npcSchedule.defaultShift", issues);
  for (const [role, shift] of Object.entries(overrides?.npcSchedule?.roleOverrides ?? {})) {
    if (![...library.npcTemplates.values()].some((template) => template.role === role)) add(issues, "unknown-npc-role", `$.environmentOverrides.npcSchedule.roleOverrides.${role}`, `unknown NPC role ${role}`);
    validateShift2(shift, `$.environmentOverrides.npcSchedule.roleOverrides.${role}`, issues);
  }
  return { valid: issues.length === 0, issues };
}

// plugins/agent-live/src/content/registry.ts
var SAFE_LOCAL_ID = /^local\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/;
var OfficeRegistry = class {
  root;
  #library;
  #official = /* @__PURE__ */ new Map();
  #events = new EventEmitter();
  #fallbackOffice;
  constructor(options) {
    this.root = path3.resolve(options.root);
    this.#library = options.library;
    for (const office of options.officialOffices) this.#official.set(office.id, structuredClone(office));
    this.#fallbackOffice = options.fallbackOffice ?? "builtin/tech-open-office";
    if (!this.#official.has(this.#fallbackOffice)) throw new Error(`unknown fallback office ${this.#fallbackOffice}`);
  }
  onChange(listener) {
    this.#events.on("change", listener);
    return () => this.#events.off("change", listener);
  }
  async initialize() {
    await mkdir(this.#officeDir(), { recursive: true });
  }
  async list() {
    await this.initialize();
    const selected = await this.selectedId();
    const entries = [...this.#official.values()].map((office) => ({ id: office.id, name: office.name, origin: "official", selected: office.id === selected }));
    for (const file of await readdir(this.#officeDir())) {
      if (!file.endsWith(".json")) continue;
      try {
        const office = await this.#readCustomFile(path3.join(this.#officeDir(), file));
        entries.push({ id: office.id, name: office.name, origin: "custom", selected: office.id === selected });
      } catch (error) {
        console.warn(`Agent Live ignored invalid custom office ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return [
      ...entries.filter((entry) => entry.origin === "official"),
      ...entries.filter((entry) => entry.origin === "custom").sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    ];
  }
  async get(id) {
    const official = this.#official.get(id);
    if (official) return structuredClone(official);
    if (!SAFE_LOCAL_ID.test(id)) return void 0;
    try {
      return await this.#readCustomFile(this.#fileFor(id));
    } catch {
      return void 0;
    }
  }
  async save(spec) {
    const validation = validateOfficeSpec(spec, this.#library);
    if (!validation.valid) return { saved: false, issues: validation.issues };
    if (spec.origin !== "custom" || !SAFE_LOCAL_ID.test(spec.id)) return { saved: false, issues: [{ code: "official-read-only", path: "$.id", message: "only local/ custom offices can be saved" }] };
    await this.initialize();
    const destination = this.#fileFor(spec.id);
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(spec, null, "	")}
`, { encoding: "utf8", mode: 384 });
    await rename(temporary, destination);
    this.#events.emit("change", spec.id);
    return { saved: true, issues: [] };
  }
  async remove(id) {
    if (!SAFE_LOCAL_ID.test(id)) return false;
    const selected = await this.selectedId();
    try {
      await rm(this.#fileFor(id));
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
    if (selected === id) await this.select(this.#fallbackOffice);
    this.#events.emit("change", id);
    return true;
  }
  /** Remove every Agent Live-owned user file and restore the built-in fallback. */
  async reset() {
    const parent = path3.dirname(this.root);
    const backup = path3.join(parent, `.${path3.basename(this.root)}.reset-${process.pid}-${Date.now()}`);
    let moved = false;
    try {
      await rename(this.root, backup);
      moved = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    try {
      await this.initialize();
      await this.select(this.#fallbackOffice);
      if (moved) await rm(backup, { recursive: true, force: true });
    } catch (error) {
      await rm(this.root, { recursive: true, force: true });
      if (moved) await rename(backup, this.root);
      throw error;
    }
    return { reset: true, selectedOffice: this.#fallbackOffice };
  }
  async select(id) {
    if (!await this.get(id)) throw new Error(`unknown or invalid office ${id}`);
    await this.initialize();
    const state = { schemaVersion: 1, selectedOffice: id };
    const destination = this.#stateFile();
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, "	")}
`, { encoding: "utf8", mode: 384 });
    await rename(temporary, destination);
    this.#events.emit("change", id);
  }
  async selectedId() {
    try {
      const state = JSON.parse(await readFile3(this.#stateFile(), "utf8"));
      if (state.schemaVersion === 1 && state.selectedOffice && await this.get(state.selectedOffice)) return state.selectedOffice;
    } catch {
    }
    return this.#fallbackOffice;
  }
  async selected() {
    return await this.get(await this.selectedId()) ?? structuredClone(this.#official.get(this.#fallbackOffice));
  }
  #officeDir() {
    return path3.join(this.root, "offices");
  }
  #stateFile() {
    return path3.join(this.root, "registry.json");
  }
  #fileFor(id) {
    return path3.join(this.#officeDir(), `${encodeURIComponent(id.slice("local/".length))}.json`);
  }
  async #readCustomFile(file) {
    const spec = JSON.parse(await readFile3(file, "utf8"));
    const validation = validateOfficeSpec(spec, this.#library);
    if (!validation.valid || spec.origin !== "custom" || !SAFE_LOCAL_ID.test(spec.id)) throw new Error(`invalid custom office ${file}`);
    if (this.#fileFor(spec.id) !== file) throw new Error(`custom office filename does not match id ${spec.id}`);
    return spec;
  }
};

// plugins/agent-live/src/content/runtime-content.ts
import { readFile as readFile4 } from "node:fs/promises";
import path4 from "node:path";
var readJson3 = async (file) => JSON.parse(await readFile4(file, "utf8"));
var short = (id) => id.replace(/^builtin\//, "");
async function asset(contentRoot, family, id, suffix = "") {
  const name = suffix && short(id).endsWith(suffix) ? short(id).slice(0, -suffix.length) : short(id);
  return readJson3(path4.join(contentRoot, family, `${name}.json`));
}
async function resolveRuntimeContent(spec, contentRoot, library) {
  const layout = structuredClone(library.layouts.get(spec.layout));
  if (!layout) throw new Error(`unknown layout ${spec.layout}`);
  layout.textSlots = (layout.textSlots ?? []).map((slot) => ({ ...slot, text: spec.texts?.[slot.id] ?? slot.defaultText ?? "" }));
  const officialId = short(spec.layout);
  const scaffold = await readJson3(path4.join(contentRoot, "presets", `${officialId}.json`));
  const [style, agentSkin, atmosphere, environment] = await Promise.all([
    asset(contentRoot, "styles", spec.style),
    asset(contentRoot, "agent-skins", spec.agentSkin),
    asset(contentRoot, "atmospheres", spec.atmosphere, "-atmosphere"),
    asset(contentRoot, "environments", spec.environment, "-environment")
  ]);
  const slottedIds = new Set((layout.placementSlots ?? []).map((slot) => slot.occupiedBy).filter(Boolean));
  for (const placement of spec.placements) slottedIds.add(placement.id);
  layout.propInstances = (layout.propInstances ?? []).filter((entry) => !slottedIds.has(entry.id));
  for (const placement of spec.placements) {
    const slot = layout.placementSlots.find((entry) => entry.id === placement.slot);
    layout.propInstances.push({ id: placement.id, type: short(placement.component), x: slot.x, y: slot.y, ...placement.orientation ? { orientation: placement.orientation } : {} });
  }
  const propTypes = Object.fromEntries([...library.props.values()].map((entry) => [short(entry.id), { size: entry.size, capabilities: entry.capabilities, renderer: entry.renderer }]));
  const props = { schemaVersion: 1, kind: "props", id: `local/${short(spec.id)}-props`, name: `${spec.name} props`, version: "1.0.0", contract: "single-office-v1", types: propTypes };
  const npcs = {
    schemaVersion: 1,
    kind: "npcs",
    id: `local/${short(spec.id)}-npcs`,
    name: `${spec.name} NPCs`,
    version: "1.0.0",
    contract: "single-office-v1",
    entries: spec.npcs.map((npc) => ({ ...structuredClone(npc), role: library.npcTemplates.get(npc.template)?.role }))
  };
  const capabilitiesOf = (type) => propTypes[type]?.capabilities ?? [];
  const activityInstances = (layout.propInstances ?? []).map((entry) => [entry.id, entry.type]);
  const activityIds = [...spec.activities];
  const entries = activityIds.map((id) => {
    const implementation = library.activityImplementations.get(`${spec.layout}|${id}`);
    if (!implementation) throw new Error(`activity ${id} has no implementation compatible with ${spec.layout}`);
    const definition = structuredClone(implementation.definition);
    return { ...definition, bindings: resolveActivityRequirements(definition.requires, activityInstances, capabilitiesOf, id).bindings };
  });
  const lifeActivities = { schemaVersion: 1, kind: "life-activities", id: `local/${short(spec.id)}-activities`, name: `${spec.name} activities`, version: "1.0.0", contract: "single-office-v1", entries };
  const agentProfileTemplate = library.agentProfileTemplates.get(spec.agentProfile?.template ?? "builtin/host-agent");
  const agentProfile = {
    template: agentProfileTemplate?.id ?? "builtin/host-agent",
    ...spec.agentProfile?.name ? { name: spec.agentProfile.name } : {},
    ...spec.agentProfile?.title ? { title: spec.agentProfile.title } : {},
    appearance: { ...agentProfileTemplate?.defaultAppearance ?? {}, ...spec.agentProfile?.appearance ?? {} }
  };
  if (spec.environmentOverrides?.clock) environment.clock = { ...environment.clock, ...spec.environmentOverrides.clock };
  if (spec.environmentOverrides?.weather) environment.weather = { ...environment.weather, ...spec.environmentOverrides.weather };
  if (spec.environmentOverrides?.lighting) environment.lighting = { ...environment.lighting, enabled: spec.environmentOverrides.lighting.auto };
  if (spec.environmentOverrides?.npcSchedule) environment.npcSchedule = {
    ...environment.npcSchedule,
    ...spec.environmentOverrides.npcSchedule,
    roleOverrides: { ...environment.npcSchedule?.roleOverrides ?? {}, ...spec.environmentOverrides.npcSchedule.roleOverrides ?? {} }
  };
  const preset2 = { ...scaffold, id: spec.id, name: spec.name, officeSpec: spec.id };
  delete preset2.content;
  return {
    preset: preset2,
    style,
    layout,
    agentSkin,
    agentProfile,
    props,
    npcs,
    lifeActivities,
    atmosphere,
    environment
  };
}

// plugins/agent-live/src/content/compiler.ts
function compileOfficeSpec(input, library) {
  const validation = validateOfficeSpec(input, library);
  if (!validation.valid) return { errors: validation.issues, adjustments: [] };
  return { draft: structuredClone(input), errors: [], adjustments: [] };
}
function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
function upsertById(base, updates, removals, path6, adjustments, merge = (previous, update) => ({ ...previous ?? {}, ...structuredClone(update) })) {
  const values = new Map(base.map((entry) => [entry.id, structuredClone(entry)]));
  for (const id of removals) {
    if (!values.delete(id)) adjustments.push({ code: "remove-missing", path: path6, message: `${id} did not exist and was ignored` });
  }
  for (const update of updates) values.set(update.id, merge(values.get(update.id), update));
  return [...values.values()];
}
function truncate(values, maximum, path6, adjustments) {
  if (values.length <= maximum) return values;
  adjustments.push({ code: "capacity-truncated", path: path6, message: `${values.length - maximum} extra item(s) were ignored; maximum is ${maximum}` });
  return values.slice(0, maximum);
}
function resolveNpc(npc, library, layout) {
  const templateId = npc.template ?? library.defaultNpcTemplate;
  const template = library.npcTemplates.get(templateId);
  if (!template) return { ...npc, template: templateId };
  const profiles = template.defaultProfiles ?? [];
  const selected = npc.profile ? profiles.find((profile) => profile.id === npc.profile) : profiles.length ? profiles[hash(npc.id) % profiles.length] : void 0;
  const role = template.role;
  const spawnCandidates = (layout.npcSpawns ?? []).filter((spawn3) => {
    if (role === "boss") return /boss|director|manager/.test(spawn3);
    if (role === "cleaner") return /clean|service|staff|entry/.test(spawn3) && !/boss/.test(spawn3);
    if (role === "receptionist") return /reception|staff|entry/.test(spawn3) && !/boss/.test(spawn3);
    if (role === "secretary" || role === "attendant") return /secretary|service|staff|entry/.test(spawn3) && !/boss/.test(spawn3);
    return /staff|entry/.test(spawn3) && !/boss|clean|service|reception|secretary/.test(spawn3);
  });
  const requestedSpawn = npc.spawn;
  const requestedIsRoleSafe = requestedSpawn && (spawnCandidates.includes(requestedSpawn) || role !== "colleague");
  const fallbackSpawn = spawnCandidates[hash(`${npc.id}:spawn`) % Math.max(1, spawnCandidates.length)] ?? layout.npcSpawns?.[hash(`${npc.id}:spawn`) % Math.max(1, layout.npcSpawns?.length ?? 0)];
  return {
    id: npc.id,
    template: templateId,
    ...selected?.id ? { profile: selected.id } : {},
    name: npc.name ?? selected?.name ?? template.name,
    title: npc.title ?? template.defaultTitle,
    gender: npc.gender ?? selected?.gender ?? template.defaultGender,
    appearance: { ...template.defaultAppearance, ...selected?.appearance ?? {}, ...npc.appearance ?? {} },
    spawn: requestedIsRoleSafe ? requestedSpawn : fallbackSpawn,
    ...npc.shift ? { shift: structuredClone(npc.shift) } : {},
    pose: npc.pose ?? template.defaultPose
  };
}
function mergeNpc(previous, update) {
  return {
    ...previous ?? {},
    ...structuredClone(update),
    ...previous?.appearance || update.appearance ? { appearance: { ...previous?.appearance ?? {}, ...update.appearance ?? {} } } : {},
    ...previous?.shift || update.shift ? { shift: { ...previous?.shift ?? {}, ...update.shift ?? {} } } : {}
  };
}
function mergeEnvironment(base, patch) {
  const clock = patch.clock ? { ...base?.clock ?? {}, ...patch.clock } : base?.clock;
  if (clock?.mode === "local") delete clock.fixedTime;
  const npcSchedule = patch.npcSchedule ? {
    ...base?.npcSchedule ?? {},
    ...patch.npcSchedule,
    roleOverrides: { ...base?.npcSchedule?.roleOverrides ?? {}, ...patch.npcSchedule.roleOverrides ?? {} }
  } : base?.npcSchedule;
  return {
    ...clock ? { clock } : {},
    ...patch.weather || base?.weather ? { weather: { ...base?.weather ?? {}, ...patch.weather ?? {} } } : {},
    ...patch.lighting || base?.lighting ? { lighting: { ...base?.lighting ?? {}, ...patch.lighting ?? {} } } : {},
    ...npcSchedule ? { npcSchedule } : {}
  };
}
function duplicates(values) {
  const seen = /* @__PURE__ */ new Set();
  return values.filter((value) => seen.has(value) || !seen.add(value));
}
function patchOfficeId(base) {
  return base.origin === "custom" ? base.id : `local/${base.id.replace(/^builtin\//, "")}`;
}
function presetIdForLocalId(localId) {
  return localId.startsWith("local/") ? `builtin/${localId.slice("local/".length)}` : void 0;
}
function ownerPresetId(base) {
  return base.origin === "official" ? base.id : base.basePreset;
}
function compileOfficePatch(base, patchInput, library) {
  const shapeIssues = validateOfficePatchShape(patchInput).map((entry) => ({ ...entry, code: "invalid-patch-shape" }));
  if (shapeIssues.length) return { errors: shapeIssues, adjustments: [] };
  const patch = patchInput;
  if (patch.base !== base.id) return { errors: [{ code: "base-mismatch", path: "$.base", message: `patch base ${patch.base} does not match ${base.id}` }], adjustments: [] };
  const baseValidation = validateOfficeSpec(base, library);
  if (!baseValidation.valid) return { errors: baseValidation.issues.map((entry) => ({ ...entry, path: `$.base${entry.path.slice(1)}` })), adjustments: [] };
  const operationErrors = [];
  for (const [path6, values] of [
    ["$.placements.upsert", (patch.placements?.upsert ?? []).map((entry) => entry.id)],
    ["$.placements.remove", patch.placements?.remove ?? []],
    ["$.npcs.upsert", (patch.npcs?.upsert ?? []).map((entry) => entry.id)],
    ["$.npcs.remove", patch.npcs?.remove ?? []],
    ["$.activities.enable", patch.activities?.enable ?? []],
    ["$.activities.disable", patch.activities?.disable ?? []]
  ]) {
    for (const id of new Set(duplicates(values))) operationErrors.push({ code: "duplicate-operation", path: path6, message: `${id} appears more than once` });
  }
  const enabled = new Set(patch.activities?.enable ?? []);
  for (const id of patch.activities?.disable ?? []) if (enabled.has(id)) operationErrors.push({ code: "conflicting-operation", path: "$.activities", message: `${id} cannot be enabled and disabled together` });
  if (operationErrors.length) return { errors: operationErrors, adjustments: [] };
  const adjustments = [];
  const components = patch.components ?? {};
  const layoutId = base.layout;
  const layout = library.layouts.get(layoutId);
  if (!layout) return { errors: [{ code: "unknown-layout", path: "$.layout", message: `unknown layout ${layoutId}` }], adjustments: [] };
  const placements = upsertById(base.placements, patch.placements?.upsert ?? [], patch.placements?.remove ?? [], "$.placements", adjustments);
  const npcs = upsertById(base.npcs, patch.npcs?.upsert ?? [], patch.npcs?.remove ?? [], "$.npcs", adjustments, mergeNpc);
  const activities = new Set(base.activities);
  for (const id of patch.activities?.disable ?? []) {
    if (!activities.delete(id)) adjustments.push({ code: "disable-missing", path: "$.activities.disable", message: `${id} was not enabled and was ignored` });
  }
  for (const id of patch.activities?.enable ?? []) activities.add(id);
  const draft = {
    schemaVersion: OFFICE_SPEC_SCHEMA_VERSION,
    kind: "office-spec",
    id: patch.id ?? patchOfficeId(base),
    name: patch.name ?? base.name,
    origin: "custom",
    basePreset: base.origin === "official" ? base.id : base.basePreset,
    layout: layoutId,
    style: components.style ?? base.style,
    agentSkin: components.agentSkin ?? base.agentSkin,
    placements: truncate(placements, SCENE_LIMITS.props, "$.placements", adjustments),
    npcs: truncate(npcs, SCENE_LIMITS.npcs, "$.npcs", adjustments).map((npc) => resolveNpc(npc, library, layout)),
    activities: truncate([...activities], SCENE_LIMITS.activities, "$.activities", adjustments),
    atmosphere: components.atmosphere ?? base.atmosphere,
    environment: components.environment ?? base.environment,
    ...patch.texts === null ? {} : base.texts || patch.texts ? { texts: { ...base.texts, ...patch.texts } } : {},
    ...patch.environmentOverrides === null ? {} : patch.environmentOverrides || base.environmentOverrides ? { environmentOverrides: mergeEnvironment(base.environmentOverrides, patch.environmentOverrides ?? {}) } : {},
    ...patch.agentProfile === null ? {} : patch.agentProfile || base.agentProfile ? { agentProfile: { ...base.agentProfile ?? OFFICE_SPEC_DEFAULTS.agentProfile, ...patch.agentProfile ?? {}, appearance: { ...base.agentProfile?.appearance ?? {}, ...patch.agentProfile?.appearance ?? {} } } } : {}
  };
  const compiled = compileOfficeSpec(draft, library);
  return { draft: compiled.draft, errors: compiled.errors, adjustments: [...adjustments, ...compiled.adjustments] };
}

// plugins/agent-live/src/runtime/content-service.ts
function pluginRoot() {
  return path5.resolve(path5.dirname(fileURLToPath2(import.meta.url)), "../..");
}
function bundledContentRoot() {
  const directory = path5.dirname(fileURLToPath2(import.meta.url));
  const candidates = [
    path5.resolve(directory, "content"),
    path5.resolve(directory, "../../web/v2/content"),
    path5.resolve(directory, "../web/v2/content")
  ];
  return candidates.find((candidate) => existsSync2(candidate)) ?? path5.join(pluginRoot(), "web/v2/content");
}
var OfficeContentService = class _OfficeContentService {
  registry;
  #contentRoot;
  library;
  constructor(contentRoot, library, registry) {
    this.#contentRoot = contentRoot;
    this.library = library;
    this.registry = registry;
  }
  static async create(options = {}) {
    const contentRoot = options.contentRoot ?? bundledContentRoot();
    const library = await loadComponentLibrary(contentRoot);
    const officialOffices = await loadOfficialOffices(contentRoot);
    const dataRoot = options.dataRoot ?? process.env.AGENT_LIVE_DATA_DIR ?? path5.join(os.homedir(), ".agent-live");
    const registry = new OfficeRegistry({ root: dataRoot, library, officialOffices });
    return new _OfficeContentService(contentRoot, library, registry);
  }
  list() {
    return this.registry.list();
  }
  select(id) {
    return this.registry.select(id);
  }
  async resolve(id) {
    const office = id ? await this.registry.get(id) : await this.registry.selected();
    if (!office) throw new Error(`unknown or invalid office ${id}`);
    const compiled = compileOfficeSpec(office, this.library);
    if (!compiled.draft) throw new Error(`office ${id} failed compilation: ${compiled.errors.map((issue2) => issue2.message).join("; ")}`);
    const graph = await resolveRuntimeContent(compiled.draft, this.#contentRoot, this.library);
    const issues = graphIssueMessages(graph);
    if (issues.length) throw new Error(`office ${office.id} produced content the viewer cannot render: ${issues.join("; ")}`);
    return graph;
  }
  subscribe(listener) {
    const stopRegistry = this.registry.onChange((officeId) => listener({ type: "office", officeId }));
    return stopRegistry;
  }
};

// plugins/agent-live/src/runtime/resource-guard.ts
var DEFAULT_CLEANUP_TIMEOUT_MS = 5e3;
var ResourceGuard = class {
  resources = [];
  closePromise = null;
  closed = false;
  track(name, dispose, options = {}) {
    if (this.closed || this.closePromise) throw new Error(`Cannot track ${name}: resource guard is closing`);
    const resource = { name, dispose, timeoutMs: options.timeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS };
    this.resources.push(resource);
    return () => {
      const index = this.resources.indexOf(resource);
      if (index >= 0) this.resources.splice(index, 1);
    };
  }
  close() {
    if (this.closePromise) return this.closePromise;
    if (this.closed) return Promise.resolve();
    this.closePromise = this.disposeAll().finally(() => {
      this.closed = true;
      this.closePromise = null;
    });
    return this.closePromise;
  }
  async disposeAll() {
    const failures = [];
    for (const resource of this.resources.splice(0).reverse()) {
      try {
        await withTimeout(Promise.resolve().then(resource.dispose), resource.timeoutMs, resource.name);
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (failures.length) throw new AggregateError(failures, "One or more Agent Live resources failed to close");
  }
};
function withTimeout(operation, timeoutMs, name) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return operation;
  return new Promise((resolve2, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out closing ${name} after ${timeoutMs}ms`)), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve2(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// plugins/agent-live/src/runtime/agent-live-runtime.ts
var AgentLiveRuntime = class {
  cwd;
  state;
  server = null;
  dataRoot;
  resources = new ResourceGuard();
  closed = false;
  constructor(cwd2, options = {}) {
    this.cwd = cwd2;
    this.state = new OfficeState(cwd2);
    this.dataRoot = options.dataRoot;
    this.resources.track("office-state", () => this.state.dispose());
  }
  async start(options) {
    if (this.closed) throw new Error("Agent Live Runtime is closed");
    if (this.server) return this.server;
    let server = null;
    try {
      const contentService = options.content ? void 0 : await OfficeContentService.create({ dataRoot: this.dataRoot });
      server = await startServer(this.state, { ...options, content: options.content ?? contentService });
      if (this.closed) throw new Error("Agent Live Runtime is closed");
      this.server = server;
      this.resources.track("office-server", () => server.close());
      return server;
    } catch (error) {
      this.closed = true;
      await server?.close().catch(() => void 0);
      await this.resources.close().catch(() => void 0);
      throw error;
    }
  }
  async close() {
    this.closed = true;
    this.server = null;
    await this.resources.close();
  }
};

// plugins/agent-live/src/creator/service.ts
var COMPONENT_CATEGORIES = ["summary", "room", "npcs", "props", "activities", "appearance", "environment", "all"];
function roomView(library, office) {
  const layout = library.layouts.get(office.layout);
  if (!layout) return null;
  const occupants = /* @__PURE__ */ new Map();
  for (const slot of layout.placementSlots ?? []) occupants.set(slot.id, null);
  for (const placement of office.placements) occupants.set(placement.slot, placement.id);
  return {
    name: layout.name,
    zones: (layout.zones ?? []).map((zone) => ({ id: zone.id, name: zone.name, x: zone.x, y: zone.y, width: zone.width, height: zone.height })),
    slots: (layout.placementSlots ?? []).map((slot) => ({ id: slot.id, zone: slot.zone, accepts: slot.accepts ?? [], maxSize: slot.maxSize, occupiedBy: occupants.get(slot.id) ?? null })),
    npcSpawns: layout.npcSpawns ?? [],
    textSlots: (layout.textSlots ?? []).map((slot) => ({ id: slot.id, name: slot.name, maxLength: slot.maxLength, text: office.texts?.[slot.id] ?? slot.defaultText ?? "" })),
    placements: office.placements.map((placement) => ({ id: placement.id, component: placement.component, slot: placement.slot, ...placement.orientation ? { orientation: placement.orientation } : {} }))
  };
}
var CreatorService = class {
  #registry;
  #library;
  constructor(registry, library) {
    this.#registry = registry;
    this.#library = library;
  }
  async listOffices() {
    return this.#registry.list();
  }
  async selectOffice(id) {
    const office = await this.#registry.get(id);
    if (!office) return { selected: false, error: `unknown or invalid office ${id}` };
    await this.#registry.select(id);
    return { selected: true, office };
  }
  async resetAllData() {
    return this.#registry.reset();
  }
  /**
   * Capabilities the model may map a request onto. `room` describes the room of
   * the currently selected Office only — zones, placement slots and NPC spawns —
   * because "add a plant" or "put a water cooler in the lounge" is only reliable
   * when the model can see what this Office actually offers. Rooms are never
   * presented as a choice.
   */
  async listComponents(category = "summary") {
    const office = await this.#registry.selected();
    const full = {
      room: roomView(this.#library, office),
      styles: structuredClone(this.#library.descriptors.styles),
      agentSkins: structuredClone(this.#library.descriptors.agentSkins),
      props: structuredClone([...this.#library.props.values()]),
      npcTemplates: structuredClone([...this.#library.npcTemplates.values()]),
      agentProfileTemplates: structuredClone([...this.#library.agentProfileTemplates.values()]),
      activities: [...this.#library.activityRecipes.values()].map((entry) => ({ ...structuredClone(entry), rooms: [...this.#library.activityImplementations.values()].filter((implementation) => implementation.recipe === entry.id).map((implementation) => implementation.layout) })),
      atmospheres: structuredClone(this.#library.descriptors.atmospheres),
      environments: structuredClone(this.#library.descriptors.environments)
    };
    if (category === "all") return full;
    if (category === "room") return { room: full.room };
    if (category === "npcs") return { npcTemplates: full.npcTemplates };
    if (category === "props") return { room: full.room, props: full.props };
    if (category === "activities") return { activities: full.activities };
    if (category === "appearance") return { styles: full.styles, agentSkins: full.agentSkins, agentProfileTemplates: full.agentProfileTemplates };
    if (category === "environment") return { atmospheres: full.atmospheres, environments: full.environments };
    return {
      // The compact view is also the model's edit baseline. Supplying the
      // bounded, user-editable state here avoids filesystem inspection and
      // repeated catalog calls just to discover an NPC id or text slot.
      office: {
        id: office.id,
        name: office.name,
        origin: office.origin,
        agentProfile: structuredClone(office.agentProfile ?? null),
        texts: structuredClone(office.texts ?? {}),
        npcs: office.npcs.map((npc) => ({
          id: npc.id,
          template: npc.template,
          name: npc.name,
          title: npc.title,
          gender: npc.gender,
          spawn: npc.spawn
        }))
      },
      counts: {
        styles: full.styles.length,
        agentSkins: full.agentSkins.length,
        props: full.props.length,
        npcTemplates: full.npcTemplates.length,
        activities: full.activities.length,
        atmospheres: full.atmospheres.length,
        environments: full.environments.length
      },
      categories: COMPONENT_CATEGORIES.filter((entry) => entry !== "summary")
    };
  }
  /** Validate, persist and select one customization without exposing draft state. */
  async customize(patchInput, baseOffice) {
    if (!patchInput || typeof patchInput !== "object" || Array.isArray(patchInput)) {
      return { saved: false, errors: [{ code: "invalid-patch-shape", path: "$", message: "patch must be an object" }], adjustments: [] };
    }
    const base = baseOffice ? await this.#registry.get(baseOffice) : await this.#registry.selected();
    if (!base) return { saved: false, errors: [{ code: "unknown-base", path: "$.base", message: `unknown or invalid base office ${baseOffice}` }], adjustments: [] };
    const patch = {
      ...patchInput,
      schemaVersion: 1,
      kind: "office-patch",
      base: base.id
    };
    const compiled = compileOfficePatch(base, patch, this.#library);
    if (!compiled.draft) return { saved: false, errors: compiled.errors, adjustments: compiled.adjustments };
    const owner = ownerPresetId(base);
    const targetId = patchOfficeId(base);
    const refuse = (code, message) => ({
      saved: false,
      errors: [{ code, path: "$.id", message }],
      adjustments: compiled.adjustments
    });
    if (compiled.draft.id !== targetId) {
      if (await this.#registry.get(compiled.draft.id)) {
        return refuse("id-conflict", `${compiled.draft.id} already exists; a patch cannot overwrite another Office`);
      }
      const reserved = presetIdForLocalId(compiled.draft.id);
      if (reserved && reserved !== owner && await this.#registry.get(reserved)) {
        return refuse("reserved-office-id", `${compiled.draft.id} is the editable copy of ${reserved}`);
      }
    } else {
      const existing = await this.#registry.get(targetId);
      if (existing && existing.basePreset !== owner) {
        const occupant = existing.basePreset ? `an Office based on ${existing.basePreset}` : "an Office without a base Preset";
        return refuse("id-conflict", `${targetId} already holds ${occupant}; it will not be overwritten`);
      }
    }
    const saved = await this.#registry.save(compiled.draft);
    if (!saved.saved) return { saved: false, errors: saved.issues, adjustments: compiled.adjustments };
    await this.#registry.select(compiled.draft.id);
    return { saved: true, office: structuredClone(compiled.draft), errors: [], adjustments: compiled.adjustments };
  }
};

// plugins/agent-live/src/creator/commands.ts
function object2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact(input, fields) {
  const allowed = /* @__PURE__ */ new Set(["command", ...fields]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`unknown command field(s): ${unknown.join(", ")}`);
}
var CreatorCommandRouter = class {
  #creator;
  constructor(creator) {
    this.#creator = creator;
  }
  async execute(value) {
    try {
      if (!object2(value) || typeof value.command !== "string") throw new Error("command is required");
      switch (value.command) {
        case "reset":
          exact(value, []);
          return { ok: true, data: await this.#creator.resetAllData() };
        case "list_offices":
          exact(value, []);
          return { ok: true, data: await this.#creator.listOffices() };
        case "list_components":
          exact(value, ["category"]);
          if (value.category !== void 0 && !COMPONENT_CATEGORIES.includes(value.category)) throw new Error(`unknown component category ${String(value.category)}`);
          return { ok: true, data: await this.#creator.listComponents(value.category) };
        case "customize": {
          exact(value, ["base", "patch"]);
          if (value.base !== void 0 && (typeof value.base !== "string" || !value.base)) throw new Error("base must be a non-empty string");
          const result = await this.#creator.customize(value.patch, value.base);
          return result.saved ? { ok: true, data: result, adjustments: result.adjustments } : { ok: false, error: "Office customization was rejected; the current office was not changed", issues: result.errors, adjustments: result.adjustments };
        }
        default:
          throw new Error(`unknown Creator command ${value.command}`);
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
};

// plugins/agent-live/src/adapters/codex/app-server-client.ts
import { spawn as spawn2 } from "node:child_process";
import { existsSync as existsSync3 } from "node:fs";
import { createInterface } from "node:readline";
var MACOS_BUNDLED_CODEX = "/Applications/ChatGPT.app/Contents/Resources/codex";
function defaultCodexCommand() {
  if (process.env.AGENT_LIVE_CODEX_BIN) return process.env.AGENT_LIVE_CODEX_BIN;
  if (process.platform === "darwin" && existsSync3(MACOS_BUNDLED_CODEX)) return MACOS_BUNDLED_CODEX;
  return "codex";
}
var CodexAppServerClient = class {
  options;
  child = null;
  lines = null;
  nextId = 1;
  closing = false;
  pending = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  disconnectListeners = /* @__PURE__ */ new Set();
  disconnected = false;
  constructor(options = {}) {
    this.options = options;
  }
  onMessage(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onDisconnect(listener) {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }
  disconnect(error) {
    this.failAll(error);
    if (this.closing || this.disconnected) return;
    this.disconnected = true;
    for (const listener of this.disconnectListeners) listener(error);
  }
  async start() {
    if (this.child) throw new Error("Codex App Server is already running");
    this.closing = false;
    this.disconnected = false;
    const command = this.options.command ?? defaultCodexCommand();
    const args2 = this.options.args ?? ["app-server", "--stdio"];
    const child = spawn2(command, args2, {
      cwd: this.options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => this.options.onStderr?.(chunk));
    child.stdin.on("error", (error) => this.disconnect(error));
    child.once("error", (error) => this.disconnect(error));
    child.once("exit", (code, signal) => {
      this.child = null;
      this.lines?.close();
      this.lines = null;
      if (!this.closing) {
        this.disconnect(new Error(`Codex App Server exited (${code ?? signal ?? "unknown"})`));
      }
    });
    this.lines = createInterface({ input: child.stdout });
    this.lines.on("line", (line) => this.handleLine(line));
    const result = await this.request("initialize", {
      clientInfo: { name: "agent-live", title: "Agent Live", version: "0.3.4" },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: []
      }
    });
    this.notify("initialized");
    return result;
  }
  request(method, params = {}, timeoutMs = 3e4) {
    const id = this.nextId++;
    return new Promise((resolve2, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex App Server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve2, reject, timer });
      try {
        this.write({ method, id, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  notify(method, params) {
    this.write(params ? { method, params } : { method });
  }
  respond(id, result) {
    this.write({ id, result });
  }
  respondError(id, code, message) {
    this.write({ id, error: { code, message } });
  }
  async close() {
    const child = this.child;
    if (!child) return;
    this.closing = true;
    this.lines?.close();
    this.lines = null;
    child.stdin.end();
    if (!await waitForExit(child, 1e3)) {
      child.kill("SIGTERM");
      if (!await waitForExit(child, 1e3)) {
        child.kill("SIGKILL");
        await waitForExit(child, 1e3);
      }
    }
    this.child = null;
    this.failAll(new Error("Codex App Server closed"));
  }
  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id !== void 0 && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? "Codex App Server request failed"));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    for (const listener of this.listeners) listener(message);
  }
  write(message) {
    if (!this.child?.stdin.writable) throw new Error("Codex App Server is not running");
    this.child.stdin.write(`${JSON.stringify(message)}
`);
  }
  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
};
function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve2) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve2(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve2(child.exitCode !== null || child.signalCode !== null);
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

// plugins/agent-live/src/core/mapping.ts
var DELEGATION_TOOLS = /^(subagent|task|dispatch_agent|spawn_agent|agent)$/i;
var ACTION_BY_TOOL = [
  [/^(read|ls|glob|grep|find|rg|search_files|list)/i, "archive"],
  [/^(write|edit|multi_edit|apply_patch|create|notebook)/i, "type"],
  [/^(bash|shell|exec|run|terminal)/i, "server"],
  [/^(todo|plan|task_list|note)/i, "whiteboard"],
  [/(browser|web|fetch|http|curl|search)/i, "phone"],
  [/^(ask_user|question|confirm)/i, "phone"]
];
function isDelegationTool(toolName) {
  return DELEGATION_TOOLS.test(toolName);
}
function actionForTool(toolName) {
  if (isDelegationTool(toolName)) return "delegate";
  for (const [pattern, action] of ACTION_BY_TOOL) {
    if (pattern.test(toolName)) return action;
  }
  return "type";
}
function short2(value, max = 64) {
  if (value === void 0 || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}\u2026` : clean;
}
function baseName(p) {
  const text = short2(p, 120);
  if (!text) return "";
  const parts = text.split("/");
  return parts.length > 2 ? `\u2026/${parts.slice(-2).join("/")}` : text;
}
function labelForTool(toolName, args2 = {}) {
  const a = args2 ?? {};
  switch (true) {
    case /^read/i.test(toolName):
      return `\u67E5\u9605 ${baseName(a.path ?? a.file ?? a.filePath)}`;
    case /^(ls|list|glob|find)/i.test(toolName):
      return `\u7FFB\u627E ${baseName(a.path ?? a.pattern ?? a.glob_pattern ?? ".")}`;
    case /^(grep|rg|search)/i.test(toolName):
      return `\u68C0\u7D22 /${short2(a.pattern ?? a.query, 32)}/`;
    case /^(write|create)/i.test(toolName):
      return `\u65B0\u5EFA ${baseName(a.path)}`;
    case /^(edit|multi_edit|apply_patch)/i.test(toolName):
      return `\u4FEE\u6539 ${baseName(a.path ?? a.file)}`;
    case /^(bash|shell|exec|run|terminal)/i.test(toolName):
      return `\u6267\u884C ${short2(a.command ?? a.cmd, 56)}`;
    case /^(todo|plan|task_list)/i.test(toolName):
      return "\u66F4\u65B0\u4EFB\u52A1\u677F";
    case /browser/i.test(toolName):
      return `\u8054\u7F51 ${short2(a.url ?? a.args ?? a.action ?? "browser", 40)}`;
    case /^(web|fetch|http|curl)/i.test(toolName):
      return `\u8054\u7F51 ${short2(a.url ?? a.search_term ?? a.query, 40)}`;
    case /^(ask_user|question|confirm)/i.test(toolName):
      return `\u8BF7\u793A ${short2(a.question, 40)}`;
    case isDelegationTool(toolName):
      return `\u6D3E\u6D3B ${short2(describeDelegation(a).map((t) => t.agent).join(", "), 40)}`;
    default: {
      const hint = short2(a.path ?? a.command ?? a.query ?? a.name, 40);
      return hint ? `${toolName} ${hint}` : toolName;
    }
  }
}
function describeDelegation(args2 = {}) {
  const a = args2 ?? {};
  const out = [];
  const push = (agent, task, slot) => {
    out.push({
      agent: String(agent ?? "worker"),
      task: short2(task ?? "", 200) || "(\u672A\u63CF\u8FF0\u7684\u4EFB\u52A1)",
      slot
    });
  };
  if (Array.isArray(a.tasks)) {
    a.tasks.forEach((t, i) => push(t?.agent, t?.task, i));
  } else if (Array.isArray(a.chain)) {
    a.chain.forEach((t, i) => push(t?.agent, t?.task, i));
  } else if (a.agent || a.task || a.prompt || a.description) {
    push(a.agent ?? a.subagent_type, a.task ?? a.prompt ?? a.description, 0);
  }
  return out;
}

// plugins/agent-live/src/core/agents.ts
var DEFAULT_LEAVE_DELAY_MS = 2600;
var ROLE_NAMES = {
  scout: "\u4FA6\u5BDF\u5458",
  planner: "\u89C4\u5212\u5E08",
  reviewer: "\u8BC4\u5BA1\u5458",
  worker: "\u5DE5\u7A0B\u5E08",
  tester: "\u6D4B\u8BD5\u5458",
  writer: "\u6587\u6848"
};
function roleForAgent(name, fallback = "\u5916\u63F4") {
  return ROLE_NAMES[name.trim().toLowerCase()] ?? fallback;
}
var AgentRegistry = class {
  state;
  mainId;
  leaveDelayMs;
  children = /* @__PURE__ */ new Set();
  completed = /* @__PURE__ */ new Set();
  leaveTimers = /* @__PURE__ */ new Map();
  constructor(state, options = {}) {
    this.state = state;
    this.mainId = options.mainId ?? "main";
    this.leaveDelayMs = options.leaveDelayMs ?? DEFAULT_LEAVE_DELAY_MS;
  }
  join(id, init) {
    return this.state.join(id, init);
  }
  spawn(input) {
    const parent = input.parent ?? this.mainId;
    const existing = this.state.getAgent(input.id);
    if (existing && this.isSettling(input.id)) return existing;
    const agent = this.state.join(input.id, {
      name: input.name,
      role: input.role ?? roleForAgent(input.name),
      parent,
      task: input.task
    });
    if (!agent) return void 0;
    this.children.add(input.id);
    this.completed.delete(input.id);
    if (!existing) this.state.delegate(parent, input.id, input.task);
    this.state.setState(input.id, "thinking", "\u63A5\u5230\u534F\u4F5C\u4EFB\u52A1");
    this.syncParentState();
    return agent;
  }
  updateIdentity(id, patch) {
    const current = this.state.getAgent(id);
    if (!current) return;
    this.state.join(id, {
      name: patch.name,
      role: patch.role ?? roleForAgent(patch.name, current.role),
      parent: current.parent,
      model: current.model,
      task: patch.task ?? current.task
    });
  }
  setState(id, state, detail) {
    this.state.setState(id, state, detail);
  }
  setTask(id, task) {
    this.state.setTask(id, task);
  }
  thought(id, text) {
    this.state.pushThought(id, text);
  }
  say(id, text) {
    this.state.say(id, text);
  }
  startAction(id, toolCallId, action, label) {
    this.state.startAction(id, toolCallId, action, label);
  }
  endAction(id, toolCallId, ok) {
    this.state.endAction(id, toolCallId, ok);
  }
  usage(id, tokens, cost) {
    this.state.addUsage(id, tokens, cost);
  }
  complete(id, ok, detail = ok ? "\u5DF2\u4EA4\u4ED8" : "\u672A\u5B8C\u6210") {
    this.finish(id, ok, detail);
  }
  cancel(id, detail = "\u5DF2\u505C\u6B62") {
    this.finish(id, void 0, detail);
  }
  finish(id, outcome, detail) {
    if (!this.state.getAgent(id) || this.leaveTimers.has(id)) return;
    this.completed.add(id);
    this.state.setState(id, outcome === false ? "error" : "done", detail);
    this.syncParentState();
    const timer = setTimeout(() => {
      this.leaveTimers.delete(id);
      this.children.delete(id);
      this.completed.delete(id);
      this.state.leave(id, outcome);
      this.syncParentState();
    }, this.leaveDelayMs);
    timer.unref?.();
    this.leaveTimers.set(id, timer);
  }
  settleChildren(ok) {
    for (const id of this.children) this.complete(id, ok);
  }
  cancelChildren() {
    for (const id of this.children) this.cancel(id);
  }
  has(id) {
    return this.children.has(id);
  }
  activeChildren() {
    let count = 0;
    for (const id of this.children) if (!this.completed.has(id)) count += 1;
    return count;
  }
  isSettling(id) {
    return this.completed.has(id) || this.leaveTimers.has(id);
  }
  dispose() {
    for (const timer of this.leaveTimers.values()) clearTimeout(timer);
    this.leaveTimers.clear();
    this.children.clear();
    this.completed.clear();
  }
  syncParentState() {
    const count = this.activeChildren();
    if (count > 0) {
      this.state.setState(this.mainId, "waiting", `\u7B49\u5F85 ${count} \u4F4D\u540C\u4E8B`);
    } else if (this.state.sessionBusy()) {
      this.state.setState(this.mainId, "thinking", "\u7EE7\u7EED\u63A8\u8FDB");
    }
  }
};

// plugins/agent-live/src/adapters/codex/adapter.ts
var MAIN = "main";
var APPROVAL_TIMEOUT_MS = 12e4;
var CodexOfficeSession = class {
  state;
  client;
  agents;
  options;
  threadId = "";
  turnId = "";
  activeTurns = /* @__PURE__ */ new Map();
  /**
   * Turns that already reported completion. A short turn can finish before its
   * `turn/start` response is read, so registration has to ignore it instead of
   * resurrecting a settled turn and leaving the session busy forever.
   */
  finishedTurns = /* @__PURE__ */ new Set();
  startingTurn = false;
  turns = 0;
  activeActions = /* @__PURE__ */ new Map();
  childAgents = /* @__PURE__ */ new Map();
  childLeaveTimers = /* @__PURE__ */ new Map();
  approvals = /* @__PURE__ */ new Map();
  approvalTimers = /* @__PURE__ */ new Map();
  unsubscribe = null;
  unsubscribeDisconnect = null;
  connectionError = null;
  models = [];
  model = "";
  effort = "";
  interrupting = false;
  stopRequested = false;
  constructor(state, client, options) {
    this.state = state;
    this.client = client;
    this.agents = new AgentRegistry(state);
    this.options = options;
  }
  async start() {
    this.unsubscribe = this.client.onMessage((message) => this.handleMessage(message));
    this.unsubscribeDisconnect = this.client.onDisconnect((error) => {
      this.connectionError = error.message;
      this.turnId = "";
      this.activeTurns.clear();
      this.finishedTurns.clear();
      this.startingTurn = false;
      this.interrupting = false;
      this.stopRequested = false;
      this.clearApprovals(error.message, false);
      for (const [id, action] of this.activeActions) this.state.endAction(action.agentId, id, false);
      this.activeActions.clear();
      this.settleChildren(false);
      this.state.updateSession({ busy: false });
      this.state.setState(MAIN, "error", error.message);
      this.state.addLog(MAIN, "system", error.message);
    });
    await this.client.start();
    this.models = await this.listModels();
    const inherited = await this.readSourceConfiguration();
    const fallback = this.models.find((item) => item.isDefault) ?? this.models[0];
    this.model = inherited.model || fallback?.id || "";
    this.effort = inherited.effort || fallback?.defaultReasoningEffort || "";
    const startParams = {
      cwd: this.options.cwd,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
      serviceName: "Agent Live"
    };
    if (this.model) startParams.model = this.model;
    const result = await this.client.request("thread/start", startParams);
    const response = result;
    if (!response.thread?.id) throw new Error("Codex did not return a thread id");
    this.threadId = response.thread.id;
    const model = response.thread.model ?? response.model ?? this.model ?? "codex";
    this.model = model;
    this.effort = response.thread.reasoningEffort ?? this.effort;
    this.state.updateSession({ cwd: this.options.cwd, model, thinkingLevel: this.effort || void 0, busy: false });
    this.agents.join(MAIN, { name: "\u79D1\u8FEA", role: model, model });
    return { threadId: this.threadId, model, models: this.models };
  }
  getStatus() {
    const request = this.approvals.values().next().value;
    return {
      threadId: this.threadId,
      model: this.model,
      models: this.models,
      busy: this.startingTurn || this.activeTurns.size > 0,
      interrupting: this.interrupting,
      error: this.connectionError,
      approval: request ? this.approvalView(request) : null
    };
  }
  selectModel(model) {
    if (this.turnId) throw new Error("Cannot change model while Codex is working");
    if (!this.models.some((item) => item.id === model)) throw new Error(`Unknown Codex model: ${model}`);
    this.updateModel(model);
  }
  async prompt(text, model) {
    if (this.connectionError) throw new Error(this.connectionError);
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) throw new Error("Prompt cannot be empty");
    if (!this.threadId) throw new Error("Codex session has not started");
    if (this.turnId || this.startingTurn) throw new Error("Codex is already working");
    this.startingTurn = true;
    this.stopRequested = false;
    try {
      if (model && model !== this.model) this.selectModel(model);
      this.state.setTask(MAIN, clean.slice(0, 300));
      this.state.updateSession({ busy: true });
      this.state.setState(MAIN, "thinking", "\u63A5\u5230\u65B0\u9700\u6C42");
      const params = {
        threadId: this.threadId,
        input: [{ type: "text", text, text_elements: [] }]
      };
      if (this.effort) params.effort = this.effort;
      if (model) params.model = model;
      const result = await this.client.request("turn/start", params);
      const turnId = result.turn?.id;
      if (!turnId) throw new Error("Codex did not return a turn id");
      if (this.finishedTurns.has(turnId)) return { turnId };
      this.turnId = turnId;
      this.activeTurns.set(this.threadId, turnId);
      this.syncBusyState();
      return { turnId };
    } catch (error) {
      this.state.updateSession({ busy: false });
      this.state.setState(MAIN, "error", "\u4EFB\u52A1\u542F\u52A8\u5931\u8D25");
      throw error;
    } finally {
      this.startingTurn = false;
    }
  }
  async interrupt() {
    if (this.interrupting) return;
    const turns = [...this.activeTurns.entries()];
    if (this.threadId && this.turnId && this.activeTurns.get(this.threadId) !== this.turnId) {
      turns.unshift([this.threadId, this.turnId]);
    }
    if (!turns.length) return;
    this.interrupting = true;
    this.stopRequested = true;
    this.state.setState(MAIN, "waiting", "\u6B63\u5728\u505C\u6B62");
    try {
      const results = await Promise.allSettled(turns.map(
        ([threadId, turnId]) => this.client.request("turn/interrupt", { threadId, turnId })
      ));
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length === results.length) throw failures[0].reason;
    } catch (error) {
      this.interrupting = false;
      throw error;
    }
  }
  resolveApproval(id, allow, forSession = false) {
    const request = this.approvals.get(id);
    if (!request) throw new Error("Approval request is no longer pending");
    this.approvals.delete(id);
    const timer = this.approvalTimers.get(id);
    if (timer) clearTimeout(timer);
    this.approvalTimers.delete(id);
    if (request.method === "item/commandExecution/requestApproval") {
      this.client.respond(id, { decision: allow ? forSession ? "acceptForSession" : "accept" : "decline" });
    } else if (request.method === "item/fileChange/requestApproval") {
      this.client.respond(id, { decision: allow ? forSession ? "acceptForSession" : "accept" : "decline" });
    } else {
      this.client.respondError(id, -32601, "This approval type is not supported by Agent Live yet");
    }
    this.state.setState(MAIN, this.approvals.size ? "waiting" : "thinking", this.approvals.size ? "\u7B49\u5F85\u4F60\u7684\u786E\u8BA4" : allow ? "\u7EE7\u7EED\u63A8\u8FDB" : "\u8C03\u6574\u65B9\u6848");
  }
  async close() {
    this.unsubscribeDisconnect?.();
    this.unsubscribeDisconnect = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clearApprovals("Agent Live closed before approval was resolved", !this.connectionError);
    for (const timer of this.childLeaveTimers.values()) clearTimeout(timer);
    this.childLeaveTimers.clear();
    this.childAgents.clear();
    this.agents.dispose();
    await this.client.close();
  }
  async listModels() {
    const models = [];
    let cursor = null;
    do {
      const result = await this.client.request("model/list", { cursor, limit: 100 });
      const page = result;
      for (const item of page.data ?? []) {
        if (item.hidden) continue;
        const id = String(item.model ?? item.id ?? "");
        if (!id) continue;
        models.push({
          id,
          name: String(item.displayName ?? id),
          description: String(item.description ?? ""),
          isDefault: Boolean(item.isDefault),
          defaultReasoningEffort: typeof item.defaultReasoningEffort === "string" ? item.defaultReasoningEffort : void 0
        });
      }
      cursor = page.nextCursor ?? null;
    } while (cursor);
    return models;
  }
  async readSourceConfiguration() {
    if (!this.options.sourceThreadId) return { model: "", effort: "" };
    try {
      const result = await this.client.request("thread/read", {
        threadId: this.options.sourceThreadId,
        includeTurns: false
      });
      const thread = result.thread;
      return {
        model: String(thread?.model ?? ""),
        effort: String(thread?.reasoningEffort ?? thread?.reasoning_effort ?? "")
      };
    } catch {
      return { model: "", effort: "" };
    }
  }
  handleMessage(message) {
    if (message.id !== void 0 && message.method) {
      this.handleServerRequest(message);
      return;
    }
    const params = message.params ?? {};
    const agentId = this.agentIdFor(params);
    switch (message.method) {
      case "turn/started": {
        const eventThreadId = this.messageThreadId(params);
        const eventTurnId = String(params.turn?.id ?? "");
        if (eventThreadId && eventTurnId) this.activeTurns.set(eventThreadId, eventTurnId);
        this.syncBusyState();
        if (this.stopRequested && eventThreadId && eventTurnId) {
          void this.client.request("turn/interrupt", { threadId: eventThreadId, turnId: eventTurnId }).catch((error) => {
            this.state.addLog(MAIN, "system", `Unable to stop late Codex turn: ${error instanceof Error ? error.message : String(error)}`);
          });
          break;
        }
        if (!agentId) break;
        if (agentId !== MAIN) {
          this.state.setState(agentId, "thinking", "\u5F00\u59CB\u534F\u4F5C");
          break;
        }
        this.turnId = String(params.turn?.id ?? this.turnId);
        this.state.updateSession({ busy: true });
        this.state.setState(MAIN, "thinking", "\u6784\u601D\u4E2D");
        break;
      }
      case "item/started":
        this.itemStarted(params.item, agentId);
        break;
      case "item/completed":
        this.itemCompleted(params.item, agentId);
        break;
      case "item/reasoning/summaryTextDelta":
        if (!this.acceptAgentEvent(agentId)) break;
        this.state.pushThought(agentId, String(params.delta ?? ""));
        if (!this.hasActiveAction(agentId)) this.state.setState(agentId, "thinking", "\u601D\u8003\u4E2D");
        break;
      case "item/agentMessage/delta":
        if (!this.acceptAgentEvent(agentId)) break;
        if (!this.hasActiveAction(agentId)) this.state.setState(agentId, "talking", "\u6C47\u62A5\u4E2D");
        break;
      case "thread/tokenUsage/updated": {
        const tokenUsage = params.tokenUsage;
        const total = tokenUsage?.total;
        this.state.addUsage(agentId, Number(total?.totalTokens ?? 0), 0);
        break;
      }
      case "model/rerouted": {
        const model = String(params.toModel ?? "");
        if (!model) break;
        this.updateModel(model);
        break;
      }
      case "turn/completed": {
        const eventThreadId = this.messageThreadId(params);
        const eventTurnId = String(params.turn?.id ?? "");
        if (eventThreadId) this.activeTurns.delete(eventThreadId);
        this.rememberFinishedTurn(eventTurnId);
        this.syncBusyState();
        if (!agentId) break;
        if (agentId !== MAIN) {
          const childStatus = String(params.turn?.status ?? "completed");
          const childCancelled = this.interrupting || ["interrupted", "cancelled"].includes(childStatus);
          this.finishChild(agentId, childCancelled ? void 0 : childStatus === "completed");
          if (!this.activeTurns.size && !this.turnId) {
            this.interrupting = false;
            this.state.setState(MAIN, "idle", "\u5F85\u547D");
          }
          break;
        }
        this.state.flushThoughts();
        this.clearApprovals("Turn completed before approval was resolved");
        const status = String(params.turn?.status ?? "completed");
        const cancelled = this.interrupting || ["interrupted", "cancelled"].includes(status);
        for (const [id, action] of this.activeActions) {
          if (action.agentId !== MAIN) continue;
          this.state.endAction(action.agentId, id, cancelled);
          this.activeActions.delete(id);
        }
        this.turnId = "";
        if (!this.activeTurns.size) this.interrupting = false;
        this.turns += 1;
        this.state.updateSession({ busy: this.activeTurns.size > 0, turns: this.turns });
        if (cancelled) this.state.setState(MAIN, "idle", "\u5DF2\u505C\u6B62");
        else if (status === "failed") this.state.setState(MAIN, "error", "\u4EFB\u52A1\u5931\u8D25");
        else if (this.activeTurns.size) this.state.setState(MAIN, "waiting", `\u7B49\u5F85 ${this.activeTurns.size} \u4F4D\u540C\u4E8B`);
        else this.state.setState(MAIN, "idle", "\u5F85\u547D");
        if (!this.activeTurns.size) this.settleChildren(cancelled ? void 0 : status !== "failed");
        break;
      }
    }
  }
  updateModel(model) {
    this.model = model;
    this.state.updateSession({ model });
    this.agents.join(MAIN, { name: "\u79D1\u8FEA", role: model, model });
  }
  itemStarted(item, agentId) {
    if (!item?.id || !item.type) return;
    if (item.type === "collabAgentToolCall") this.syncCollaboration(item);
    if (item.type === "subAgentActivity" || item.type === "SubAgentActivity") this.syncSubAgentActivity(item);
    if (!this.acceptAgentEvent(agentId)) return;
    const mapped = mapItem(item);
    if (!mapped) return;
    this.activeActions.set(item.id, { agentId });
    this.state.startAction(agentId, item.id, mapped.action, mapped.label);
  }
  itemCompleted(item, fallbackAgentId) {
    if (!item?.id || !item.type) return;
    if (item.type === "collabAgentToolCall") this.syncCollaboration(item);
    if (item.type === "subAgentActivity" || item.type === "SubAgentActivity") this.syncSubAgentActivity(item);
    const agentId = this.activeActions.get(item.id)?.agentId ?? fallbackAgentId;
    if (!this.acceptAgentEvent(agentId)) {
      this.activeActions.delete(item.id);
      return;
    }
    if (item.type === "agentMessage") {
      this.state.flushThoughts();
      if (item.text) this.state.say(agentId, item.text);
      return;
    }
    if (!this.activeActions.delete(item.id)) return;
    const ok = !["failed", "declined"].includes(String(item.status ?? "completed"));
    this.state.endAction(agentId, item.id, ok);
    if (agentId !== MAIN || this.state.sessionBusy() && this.agents.activeChildren() === 0) {
      this.state.setState(agentId, "thinking", ok ? "\u7EE7\u7EED\u63A8\u8FDB" : "\u5904\u7406\u62A5\u9519");
    }
  }
  syncSubAgentActivity(item) {
    const threadId = String(item.agentThreadId ?? item.agent_thread_id ?? "");
    if (!threadId) return;
    const childId = `codex:${threadId}`;
    const kind = String(item.kind ?? item.status ?? "").toLowerCase();
    const agentPath = String(item.agentPath ?? item.agent_path ?? "");
    if (threadId === this.threadId || agentPath === "/root") return;
    const name = agentPath.split("/").filter(Boolean).at(-1) || "Teammate";
    this.childAgents.set(threadId, childId);
    if (["completed", "failed", "errored", "cancelled", "shutdown"].includes(kind)) {
      this.finishChild(childId, kind === "completed");
      return;
    }
    if (this.agents.isSettling(childId)) return;
    const existing = this.state.getAgent(childId);
    if (!existing) {
      this.agents.spawn({ id: childId, name, role: roleForAgent(name), parent: MAIN, task: name });
    } else if (name !== "Teammate" && existing.name !== name) {
      this.agents.updateIdentity(childId, { name, role: roleForAgent(name), task: existing.task ?? name });
    }
    this.agents.setState(childId, kind === "started" ? "thinking" : "working", kind === "started" ? "\u63A5\u5230\u534F\u4F5C\u4EFB\u52A1" : "\u534F\u4F5C\u4E2D");
  }
  agentIdFor(params) {
    const threadId = this.messageThreadId(params);
    if (!threadId || threadId === this.threadId) return MAIN;
    return this.childAgents.get(threadId) ?? "";
  }
  messageThreadId(params) {
    return String(params.threadId ?? params.thread_id ?? "");
  }
  syncBusyState() {
    this.state.updateSession({ busy: this.startingTurn || this.activeTurns.size > 0 });
  }
  /** Remember a settled turn id for the short window of an in-flight `turn/start`. */
  rememberFinishedTurn(turnId) {
    if (!turnId) return;
    if (this.finishedTurns.size >= 64) this.finishedTurns.clear();
    this.finishedTurns.add(turnId);
  }
  acceptAgentEvent(agentId) {
    return Boolean(agentId) && !this.agents.isSettling(agentId) && (agentId !== MAIN || this.state.sessionBusy());
  }
  hasActiveAction(agentId) {
    for (const action of this.activeActions.values()) if (action.agentId === agentId) return true;
    return false;
  }
  syncCollaboration(item) {
    const tool = String(item.tool ?? "");
    const receivers = item.receiverAgents ?? item.receiver_agents ?? [];
    const receiverThreadIds = item.receiverThreadIds ?? item.receiver_thread_ids ?? [];
    const prompt = String(item.prompt ?? "\u534F\u4F5C\u4EFB\u52A1").replace(/\s+/g, " ").trim().slice(0, 300);
    const targets = [
      ...receivers.map((receiver) => ({
        threadId: String(receiver.threadId ?? receiver.thread_id ?? ""),
        name: String(receiver.agentNickname ?? receiver.agent_nickname ?? "Teammate")
      })),
      ...receiverThreadIds.map((threadId) => ({ threadId: String(threadId), name: "Teammate" }))
    ];
    for (const receiver of targets) {
      const threadId = receiver.threadId;
      if (!threadId) continue;
      const childId = `codex:${threadId}`;
      const name = receiver.name;
      this.childAgents.set(threadId, childId);
      if (this.agents.isSettling(childId)) continue;
      if (!this.state.getAgent(childId)) {
        this.agents.spawn({ id: childId, name, role: roleForAgent(name), parent: MAIN, task: prompt });
      }
    }
    const states = item.agentsStates ?? item.agents_states ?? {};
    for (const [threadId, rawState] of Object.entries(states)) {
      const childId = this.childAgents.get(threadId);
      if (!childId) continue;
      const state = typeof rawState === "string" ? rawState : Object.keys(rawState ?? {})[0] ?? "";
      if (["completed", "failed", "errored", "cancelled", "shutdown"].includes(state)) {
        this.finishChild(childId, state === "completed");
      } else if (tool !== "spawn_agent" && !this.agents.isSettling(childId)) {
        this.state.setState(childId, "working", "\u534F\u4F5C\u4E2D");
      }
    }
  }
  settleChildren(outcome) {
    if (outcome === void 0) this.agents.cancelChildren();
    else this.agents.settleChildren(outcome);
  }
  finishChild(childId, outcome) {
    if (!this.state.getAgent(childId) || this.childLeaveTimers.has(childId)) return;
    if (outcome === void 0) this.agents.cancel(childId);
    else this.agents.complete(childId, outcome);
    const timer = setTimeout(() => {
      this.childLeaveTimers.delete(childId);
      for (const [threadId, id] of this.childAgents) if (id === childId) this.childAgents.delete(threadId);
    }, 2600);
    timer.unref?.();
    this.childLeaveTimers.set(childId, timer);
  }
  handleServerRequest(message) {
    if (message.id === void 0 || !message.method) return;
    if (this.approvals.has(message.id)) return;
    if (!["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(message.method)) {
      this.client.respondError(message.id, -32601, "Unsupported Agent Live client request");
      return;
    }
    this.approvals.set(message.id, message);
    const timer = setTimeout(() => {
      if (!this.approvals.delete(message.id)) return;
      this.approvalTimers.delete(message.id);
      this.client.respond(message.id, { decision: "decline" });
      if (!this.approvals.size) this.state.setState(MAIN, this.state.sessionBusy() ? "thinking" : "idle", "Approval expired");
    }, APPROVAL_TIMEOUT_MS);
    timer.unref?.();
    this.approvalTimers.set(message.id, timer);
    this.state.setState(MAIN, "waiting", "\u7B49\u5F85\u4F60\u7684\u786E\u8BA4");
  }
  approvalView(message) {
    const params = message.params ?? {};
    const isCommand = message.method.includes("commandExecution");
    const detail = String(isCommand ? params.command ?? params.reason ?? "\u6267\u884C\u547D\u4EE4" : params.reason ?? "\u4FEE\u6539\u6587\u4EF6");
    return {
      id: message.id,
      method: message.method,
      title: isCommand ? "\u5141\u8BB8\u6267\u884C\u547D\u4EE4\uFF1F" : "\u5141\u8BB8\u4FEE\u6539\u6587\u4EF6\uFF1F",
      detail: detail.slice(0, 300)
    };
  }
  clearApprovals(reason, respond = true) {
    if (respond) for (const [id] of this.approvals) this.client.respondError(id, -32e3, reason);
    this.approvals.clear();
    for (const timer of this.approvalTimers.values()) clearTimeout(timer);
    this.approvalTimers.clear();
  }
};
function mapItem(item) {
  switch (item.type) {
    case "commandExecution":
      return { action: "server", label: labelForTool("bash", { command: item.command }) };
    case "fileChange":
      return { action: "type", label: "\u4FEE\u6539\u4EE3\u7801" };
    case "mcpToolCall":
    case "dynamicToolCall": {
      const tool = String(item.tool ?? "tool");
      const args2 = item.arguments ?? {};
      return { action: actionForTool(tool), label: labelForTool(tool, args2) };
    }
    case "webSearch":
      return { action: "phone", label: "\u8054\u7F51\u68C0\u7D22" };
    case "imageView":
      return { action: "archive", label: "\u67E5\u770B\u56FE\u7247" };
    case "collabAgentToolCall":
      return { action: "delegate", label: "\u534F\u8C03\u540C\u4E8B" };
    default:
      return null;
  }
}

// plugins/agent-live/src/adapters/codex/launcher.ts
async function launchCodexAdapter(options) {
  const viewerStartTimeoutMs2 = options.viewerStartTimeoutMs ?? 18e4;
  const viewerCloseGraceMs2 = options.viewerCloseGraceMs ?? 12e3;
  const token = randomBytes(24).toString("hex");
  const runtime = new AgentLiveRuntime(options.cwd);
  const appServer = new CodexAppServerClient({ cwd: options.cwd });
  let viewerCloseTimer = null;
  let viewerStartTimer = null;
  let hasSeenViewer = false;
  let closing = false;
  let closePromise = null;
  const session = new CodexOfficeSession(runtime.state, appServer, {
    cwd: options.cwd,
    sourceThreadId: options.sourceThreadId
  });
  const close = () => {
    if (closePromise) return closePromise;
    closing = true;
    if (viewerCloseTimer) clearTimeout(viewerCloseTimer);
    if (viewerStartTimer) clearTimeout(viewerStartTimer);
    viewerCloseTimer = null;
    viewerStartTimer = null;
    closePromise = (async () => {
      const results = await Promise.allSettled([session.close(), runtime.close()]);
      const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
      if (failures.length) throw new AggregateError(failures, "Codex Adapter did not close cleanly");
    })();
    return closePromise;
  };
  const autoClose = async () => {
    try {
      await close();
    } catch (error) {
      console.error(`Agent Live cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      options.onAutoClose?.();
    }
  };
  let server;
  try {
    const content = await OfficeContentService.create();
    if (options.preset) {
      const offices = await content.list();
      const selected = offices.find((office) => office.name === options.preset || office.id === options.preset || office.id === `builtin/${options.preset}`);
      if (!selected) throw new Error(`Unknown office: ${options.preset}`);
      await content.select(selected.id);
    }
    const creator = new CreatorCommandRouter(new CreatorService(content.registry, content.library));
    await session.start();
    server = await runtime.start({
      port: options.port,
      content,
      creator,
      creatorToken: token,
      onViewerCountChange(count) {
        if (count > 0) {
          hasSeenViewer = true;
          if (viewerStartTimer) clearTimeout(viewerStartTimer);
          viewerStartTimer = null;
          if (viewerCloseTimer) clearTimeout(viewerCloseTimer);
          viewerCloseTimer = null;
          return;
        }
        if (!hasSeenViewer || closing || viewerCloseTimer) return;
        viewerCloseTimer = setTimeout(() => void autoClose(), viewerCloseGraceMs2);
        viewerCloseTimer.unref?.();
      },
      controls: {
        token,
        status: () => session.getStatus(),
        selectModel(model) {
          session.selectModel(model);
          return { ok: true, model };
        },
        prompt: (text, model) => session.prompt(text, model),
        interrupt: () => session.interrupt(),
        resolveApproval(id, allow, forSession) {
          session.resolveApproval(id, allow, forSession);
          return { ok: true };
        }
      }
    });
  } catch (error) {
    await close().catch(() => void 0);
    throw error;
  }
  viewerStartTimer = setTimeout(() => {
    if (!hasSeenViewer) void autoClose();
  }, viewerStartTimeoutMs2);
  viewerStartTimer.unref?.();
  const query = new URLSearchParams({ client: "codex", token });
  const url = `${server.url}/v2.html?${query}`;
  if (options.open) server.open(`v2.html?${query}`);
  return { url, close };
}

// plugins/agent-live/scripts/codex-client.ts
var args = process.argv.slice(2);
var option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
};
var port = Number(option("--port", process.env.AGENT_LIVE_CODEX_PORT ?? "7792"));
var preset = option("--preset", "") || void 0;
var cwd = option("--cwd", process.cwd());
var viewerStartTimeoutMs = Number(process.env.AGENT_LIVE_VIEWER_START_TIMEOUT_MS ?? "180000");
var viewerCloseGraceMs = Number(process.env.AGENT_LIVE_VIEWER_CLOSE_GRACE_MS ?? "12000");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid --port");
if (!Number.isFinite(viewerStartTimeoutMs) || viewerStartTimeoutMs < 100) throw new Error("Invalid viewer start timeout");
if (!Number.isFinite(viewerCloseGraceMs) || viewerCloseGraceMs < 0) throw new Error("Invalid viewer close grace");
var handle = await launchCodexAdapter({
  cwd,
  port,
  preset,
  sourceThreadId: process.env.CODEX_THREAD_ID,
  viewerStartTimeoutMs,
  viewerCloseGraceMs,
  open: args.includes("--open"),
  onAutoClose: () => process.exit(0)
});
console.log(handle.url);
var stop = () => void handle.close().catch((error) => {
  console.error(`Agent Live cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
}).finally(() => process.exit(0));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
await new Promise(() => {
});
