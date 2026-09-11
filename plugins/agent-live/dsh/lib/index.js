// src/creator.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
import { z } from "zod";

// ../src/creator/commands.ts
function object(value) {
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
      if (!object(value) || typeof value.command !== "string") throw new Error("command is required");
      switch (value.command) {
        case "list_offices":
          exact(value, []);
          return { ok: true, data: await this.#creator.listOffices() };
        case "list_components":
          exact(value, []);
          return { ok: true, data: await this.#creator.listComponents() };
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

// ../src/core/limits.ts
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

// ../src/content/schema.ts
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
var SPEC_KEYS = /* @__PURE__ */ new Set(["schemaVersion", "kind", "id", "name", "origin", "basePreset", "layout", "style", "agentSkin", "placements", "npcs", "activities", "atmosphere", "environment", "environmentOverrides", "agentProfile"]);
var PATCH_KEYS = /* @__PURE__ */ new Set(["schemaVersion", "kind", "id", "base", "name", "components", "placements", "npcs", "activities", "environmentOverrides", "agentProfile"]);
var COMPONENT_KEYS = /* @__PURE__ */ new Set(["layout", "style", "agentSkin", "atmosphere", "environment"]);
var PLACEMENT_KEYS = /* @__PURE__ */ new Set(["id", "component", "slot", "orientation"]);
var NPC_KEYS = /* @__PURE__ */ new Set(["id", "template", "profile", "name", "title", "gender", "appearance", "spawn", "shift", "pose"]);
var APPEARANCE_KEYS = /* @__PURE__ */ new Set(["skin", "hair", "shirt", "trim", "badge"]);
var AGENT_PROFILE_KEYS = /* @__PURE__ */ new Set(["template", "name", "title", "appearance"]);
var SHIFT_KEYS = /* @__PURE__ */ new Set(["start", "end"]);
var ENVIRONMENT_KEYS = /* @__PURE__ */ new Set(["clock", "weather", "lighting", "npcSchedule"]);
var CLOCK_KEYS = /* @__PURE__ */ new Set(["mode", "fixedTime"]);
var WEATHER_KEYS = /* @__PURE__ */ new Set(["fallback"]);
var LIGHTING_KEYS = /* @__PURE__ */ new Set(["auto"]);
var NPC_SCHEDULE_KEYS = /* @__PURE__ */ new Set(["defaultShift", "roleOverrides"]);
var COLLECTION_PATCH_KEYS = /* @__PURE__ */ new Set(["upsert", "remove"]);
var ACTIVITY_PATCH_KEYS = /* @__PURE__ */ new Set(["enable", "disable"]);
function object2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function issue(issues, path5, message) {
  issues.push({ path: path5, message });
}
function exactKeys(value, allowed, path5, issues) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, `${path5}.${key}`, "unknown field");
}
function requiredString(value, path5, issues) {
  if (typeof value !== "string" || value.trim() === "") issue(issues, path5, "must be a non-empty string");
}
function optionalString(value, path5, issues) {
  if (value !== void 0) requiredString(value, path5, issues);
}
function stringArray(value, path5, issues) {
  if (!Array.isArray(value)) return issue(issues, path5, "must be an array");
  for (let index = 0; index < value.length; index += 1) requiredString(value[index], `${path5}[${index}]`, issues);
}
function enumValue(value, allowed, path5, issues, optional = false) {
  if (optional && value === void 0) return;
  if (typeof value !== "string" || !allowed.includes(value)) issue(issues, path5, `must be one of: ${allowed.join(", ")}`);
}
function validateShift(value, path5, issues) {
  if (!object2(value)) return issue(issues, path5, "must be an object");
  exactKeys(value, SHIFT_KEYS, path5, issues);
  requiredString(value.start, `${path5}.start`, issues);
  requiredString(value.end, `${path5}.end`, issues);
}
function validateAppearance(value, path5, issues) {
  if (!object2(value)) return issue(issues, path5, "must be an object");
  exactKeys(value, APPEARANCE_KEYS, path5, issues);
  for (const [key, color] of Object.entries(value)) optionalString(color, `${path5}.${key}`, issues);
}
function validatePlacement(value, path5, issues) {
  if (!object2(value)) return issue(issues, path5, "must be an object");
  exactKeys(value, PLACEMENT_KEYS, path5, issues);
  requiredString(value.id, `${path5}.id`, issues);
  requiredString(value.component, `${path5}.component`, issues);
  requiredString(value.slot, `${path5}.slot`, issues);
  enumValue(value.orientation, ORIENTATION_VALUES, `${path5}.orientation`, issues, true);
}
function validateNpc(value, path5, issues) {
  if (!object2(value)) return issue(issues, path5, "must be an object");
  exactKeys(value, NPC_KEYS, path5, issues);
  requiredString(value.id, `${path5}.id`, issues);
  for (const key of ["template", "profile", "name", "title", "spawn"]) optionalString(value[key], `${path5}.${key}`, issues);
  enumValue(value.gender, GENDER_VALUES, `${path5}.gender`, issues, true);
  enumValue(value.pose, POSE_VALUES, `${path5}.pose`, issues, true);
  if (value.appearance !== void 0) validateAppearance(value.appearance, `${path5}.appearance`, issues);
  if (value.shift !== void 0) validateShift(value.shift, `${path5}.shift`, issues);
}
function validateAgentProfile(value, path5, issues) {
  if (!object2(value)) return issue(issues, path5, "must be an object");
  exactKeys(value, AGENT_PROFILE_KEYS, path5, issues);
  requiredString(value.template, `${path5}.template`, issues);
  optionalString(value.name, `${path5}.name`, issues);
  optionalString(value.title, `${path5}.title`, issues);
  if (value.appearance !== void 0) validateAppearance(value.appearance, `${path5}.appearance`, issues);
}
function validateEnvironment(value, path5, issues) {
  if (!object2(value)) return issue(issues, path5, "must be an object");
  exactKeys(value, ENVIRONMENT_KEYS, path5, issues);
  if (value.clock !== void 0) {
    if (!object2(value.clock)) issue(issues, `${path5}.clock`, "must be an object");
    else {
      exactKeys(value.clock, CLOCK_KEYS, `${path5}.clock`, issues);
      enumValue(value.clock.mode, ["local", "fixed"], `${path5}.clock.mode`, issues);
      optionalString(value.clock.fixedTime, `${path5}.clock.fixedTime`, issues);
    }
  }
  if (value.weather !== void 0) {
    if (!object2(value.weather)) issue(issues, `${path5}.weather`, "must be an object");
    else {
      exactKeys(value.weather, WEATHER_KEYS, `${path5}.weather`, issues);
      enumValue(value.weather.fallback, WEATHER_VALUES, `${path5}.weather.fallback`, issues);
    }
  }
  if (value.lighting !== void 0) {
    if (!object2(value.lighting)) issue(issues, `${path5}.lighting`, "must be an object");
    else {
      exactKeys(value.lighting, LIGHTING_KEYS, `${path5}.lighting`, issues);
      if (typeof value.lighting.auto !== "boolean") issue(issues, `${path5}.lighting.auto`, "must be a boolean");
    }
  }
  if (value.npcSchedule !== void 0) {
    if (!object2(value.npcSchedule)) issue(issues, `${path5}.npcSchedule`, "must be an object");
    else {
      exactKeys(value.npcSchedule, NPC_SCHEDULE_KEYS, `${path5}.npcSchedule`, issues);
      if (value.npcSchedule.defaultShift !== void 0) validateShift(value.npcSchedule.defaultShift, `${path5}.npcSchedule.defaultShift`, issues);
      if (value.npcSchedule.roleOverrides !== void 0) {
        if (!object2(value.npcSchedule.roleOverrides)) issue(issues, `${path5}.npcSchedule.roleOverrides`, "must be an object");
        else for (const [role, shift] of Object.entries(value.npcSchedule.roleOverrides)) validateShift(shift, `${path5}.npcSchedule.roleOverrides.${role}`, issues);
      }
    }
  }
}
function validateOfficeSpecShape(input) {
  const issues = [];
  if (!object2(input)) return [{ path: "$", message: "must be an object" }];
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
  return issues;
}
function validateCollectionPatch(value, path5, issues, itemValidator) {
  if (!object2(value)) return issue(issues, path5, "must be an object");
  exactKeys(value, COLLECTION_PATCH_KEYS, path5, issues);
  if (value.upsert !== void 0) {
    if (!Array.isArray(value.upsert)) issue(issues, `${path5}.upsert`, "must be an array");
    else value.upsert.forEach((item, index) => itemValidator(item, `${path5}.upsert[${index}]`, issues));
  }
  if (value.remove !== void 0) stringArray(value.remove, `${path5}.remove`, issues);
}
function validateOfficePatchShape(input) {
  const issues = [];
  if (!object2(input)) return [{ path: "$", message: "must be an object" }];
  exactKeys(input, PATCH_KEYS, "$", issues);
  if (input.schemaVersion !== OFFICE_SPEC_SCHEMA_VERSION) issue(issues, "$.schemaVersion", `must equal ${OFFICE_SPEC_SCHEMA_VERSION}`);
  if (input.kind !== "office-patch") issue(issues, "$.kind", "must equal office-patch");
  requiredString(input.base, "$.base", issues);
  optionalString(input.id, "$.id", issues);
  optionalString(input.name, "$.name", issues);
  if (input.components !== void 0) {
    if (!object2(input.components)) issue(issues, "$.components", "must be an object");
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
    if (!object2(input.activities)) issue(issues, "$.activities", "must be an object");
    else {
      exactKeys(input.activities, ACTIVITY_PATCH_KEYS, "$.activities", issues);
      if (input.activities.enable !== void 0) stringArray(input.activities.enable, "$.activities.enable", issues);
      if (input.activities.disable !== void 0) stringArray(input.activities.disable, "$.activities.disable", issues);
    }
  }
  if (input.environmentOverrides !== void 0 && input.environmentOverrides !== null) validateEnvironment(input.environmentOverrides, "$.environmentOverrides", issues);
  if (input.agentProfile !== void 0 && input.agentProfile !== null) validateAgentProfile(input.agentProfile, "$.agentProfile", issues);
  return issues;
}

// ../src/content/graph-validator.ts
var WORK_CAPABILITIES = ["research", "create", "compute", "plan", "communicate", "collaborate"];
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
function shiftIssue(value, code, path5, label) {
  if (!value || !validClock(value.start) || !validClock(value.end)) return { code, path: path5, message: `${label} \u5FC5\u987B\u63D0\u4F9B\u6709\u6548\u7684 HH:MM \u8D77\u6B62\u65F6\u95F4` };
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
    const path5 = `$.npcs.entries[${index}]`;
    if (!npc?.id || !npc.role || !layout?.targets?.[npc.spawn]) issues.push({ code: "invalid-npc", path: path5, message: `\u65E0\u6548\u7684 NPC\uFF1A${npc?.id ?? "\u2014"}` });
    const shift = npc?.shift ? shiftIssue(npc.shift, "invalid-npc-shift", path5, `NPC ${npc.id} \u7684 shift`) : null;
    if (shift) issues.push(shift);
  });
  ;
  (content?.lifeActivities?.entries ?? []).forEach((activity, index) => {
    const path5 = `$.lifeActivities.entries[${index}]`;
    if (!activity?.id || !["agent", "npc"].includes(activity.participant?.kind) || !activity.steps?.length) {
      issues.push({ code: "invalid-activity", path: path5, message: `\u65E0\u6548\u7684 Life Activity\uFF1A${activity?.id ?? "\u2014"}` });
      return;
    }
    if (activity.participant?.minAgents != null && (!Number.isInteger(activity.participant.minAgents) || activity.participant.minAgents < 2)) {
      issues.push({ code: "invalid-activity-participant", path: path5, message: `${activity.id} \u7684 minAgents \u5FC5\u987B\u662F\u81F3\u5C11 2 \u7684\u6574\u6570` });
    }
    const resolved = resolveActivityRequirements(activity.requires, instances, capabilitiesOf, activity.id);
    issues.push(...resolved.issues.map((issue2) => ({ ...issue2, path: path5 })));
    for (const step of activity.steps ?? []) {
      if (!layout?.targets?.[step?.target]) issues.push({ code: "missing-activity-target", path: path5, message: `${activity.id} \u7F3A\u5C11 Target\uFF1A${step?.target}` });
      for (const target of step?.targets ?? []) {
        if (!layout?.targets?.[target]) issues.push({ code: "missing-activity-target", path: path5, message: `${activity.id} \u7F3A\u5C11 Group Target\uFF1A${target}` });
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

// ../src/content/validator.ts
function add(issues, code, path5, message) {
  issues.push({ code, path: path5, message });
}
function validClock2(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}
function validateShift2(value, path5, issues) {
  if (!validClock2(value?.start) || !validClock2(value?.end)) add(issues, "invalid-shift", path5, "shift must contain valid HH:MM start and end values");
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
  const slots = new Map((layout.placementSlots ?? []).map((slot) => [slot.id, slot]));
  const placementIds = /* @__PURE__ */ new Set();
  const occupiedSlots = /* @__PURE__ */ new Set();
  for (let index = 0; index < value.placements.length; index += 1) {
    const placement = value.placements[index];
    const path5 = `$.placements[${index}]`;
    if (!INSTANCE_ID.test(placement.id)) add(issues, "invalid-placement-id", `${path5}.id`, "placement id must be a safe lowercase identifier");
    if (placementIds.has(placement.id)) add(issues, "duplicate-placement", `${path5}.id`, `duplicate placement id ${placement.id}`);
    placementIds.add(placement.id);
    const component = library.props.get(placement.component);
    if (!component) add(issues, "unknown-prop", `${path5}.component`, `unknown prop ${placement.component}`);
    const slot = slots.get(placement.slot);
    if (!slot) add(issues, "unknown-slot", `${path5}.slot`, `unknown slot ${placement.slot}`);
    else {
      if (occupiedSlots.has(placement.slot)) add(issues, "occupied-slot", `${path5}.slot`, `slot ${placement.slot} is already occupied`);
      occupiedSlots.add(placement.slot);
      const propType = placement.component.replace(/^builtin\//, "");
      if (component && !slot.accepts?.includes(propType)) add(issues, "incompatible-slot", path5, `${placement.component} is not accepted by ${placement.slot}`);
      if (component && (component.size.width > slot.maxSize?.width || component.size.height > slot.maxSize?.height)) add(issues, "prop-too-large", path5, `${placement.component} exceeds ${placement.slot}`);
    }
  }
  if (value.placements.length > SCENE_LIMITS.props) add(issues, "too-many-props", "$.placements", `maximum ${SCENE_LIMITS.props} props`);
  const npcIds = /* @__PURE__ */ new Set();
  for (let index = 0; index < value.npcs.length; index += 1) {
    const npc = value.npcs[index];
    const path5 = `$.npcs[${index}]`;
    if (!INSTANCE_ID.test(npc.id)) add(issues, "invalid-npc-id", `${path5}.id`, "NPC id must be a safe lowercase identifier");
    if (npcIds.has(npc.id)) add(issues, "duplicate-npc", `${path5}.id`, `duplicate NPC id ${npc.id}`);
    npcIds.add(npc.id);
    const template = npc.template ? library.npcTemplates.get(npc.template) : void 0;
    if (!npc.template || !template) add(issues, "unknown-npc-template", `${path5}.template`, `unknown NPC template ${npc.template ?? "(missing)"}`);
    if (npc.profile && (!template?.defaultProfiles || !template.defaultProfiles.some((profile) => profile.id === npc.profile))) add(issues, "unknown-npc-profile", `${path5}.profile`, `unknown profile ${npc.profile}`);
    if (npc.gender && !GENDER_VALUES.includes(npc.gender)) add(issues, "invalid-gender", `${path5}.gender`, `unsupported gender ${npc.gender}`);
    if (npc.pose && !POSE_VALUES.includes(npc.pose)) add(issues, "invalid-pose", `${path5}.pose`, `unsupported pose ${npc.pose}`);
    for (const [field, color] of Object.entries(npc.appearance ?? {})) if (!COLOR.test(String(color))) add(issues, "invalid-color", `${path5}.appearance.${field}`, "appearance colors must use #RRGGBB");
    if (!npc.spawn || !layout.npcSpawns?.includes(npc.spawn) || !layout.targets?.[npc.spawn]) add(issues, "invalid-npc-spawn", `${path5}.spawn`, `invalid NPC spawn ${npc.spawn ?? "(missing)"}`);
    if (npc.shift) validateShift2(npc.shift, `${path5}.shift`, issues);
  }
  if (value.npcs.length > SCENE_LIMITS.npcs) add(issues, "too-many-npcs", "$.npcs", `maximum ${SCENE_LIMITS.npcs} NPCs`);
  const activities = /* @__PURE__ */ new Set();
  const propInstances = /* @__PURE__ */ new Map();
  for (const instance of layout.propInstances ?? []) propInstances.set(instance.id, instance.type);
  for (const placement of value.placements) propInstances.set(placement.id, placement.component.replace(/^(builtin|local)\//, ""));
  const capabilitiesOf = (type) => {
    const prop = library.props.get(`builtin/${type}`) ?? library.props.get(`local/${type}`) ?? library.props.get(type);
    return prop?.capabilities ?? [];
  };
  const npcRoles = new Set(value.npcs.map((npc) => library.npcTemplates.get(npc.template ?? "")?.role).filter(Boolean));
  for (let index = 0; index < value.activities.length; index += 1) {
    const activityId = value.activities[index];
    const path5 = `$.activities[${index}]`;
    if (activities.has(activityId)) add(issues, "duplicate-activity", path5, `duplicate activity ${activityId}`);
    activities.add(activityId);
    const recipe = library.activityRecipes.get(activityId);
    if (!recipe) add(issues, "unknown-activity", path5, `unknown activity ${activityId}`);
    else if (!library.activityImplementations.has(`${value.layout}|${activityId}`)) add(issues, "unsupported-activity-layout", path5, `${activityId} has no implementation for ${value.layout}`);
    else {
      const implementation = library.activityImplementations.get(`${value.layout}|${activityId}`);
      const resolved = resolveActivityRequirements(implementation?.definition?.requires, propInstances, capabilitiesOf, activityId);
      for (const issue2 of resolved.issues) add(issues, issue2.code, path5, issue2.message);
      if (!resolved.issues.length && recipe.participantKinds?.includes("npc") && recipe.participantKinds.length === 1 && recipe.participantRoles?.length && !recipe.participantRoles.some((role) => npcRoles.has(role))) {
        add(issues, "missing-activity-participant", path5, `${activityId} has no compatible NPC in this office`);
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

// ../src/content/compiler.ts
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
function upsertById(base, updates, removals, path5, adjustments, merge = (previous, update) => ({ ...previous ?? {}, ...structuredClone(update) })) {
  const values = new Map(base.map((entry) => [entry.id, structuredClone(entry)]));
  for (const id of removals) {
    if (!values.delete(id)) adjustments.push({ code: "remove-missing", path: path5, message: `${id} did not exist and was ignored` });
  }
  for (const update of updates) values.set(update.id, merge(values.get(update.id), update));
  return [...values.values()];
}
function truncate(values, maximum, path5, adjustments) {
  if (values.length <= maximum) return values;
  adjustments.push({ code: "capacity-truncated", path: path5, message: `${values.length - maximum} extra item(s) were ignored; maximum is ${maximum}` });
  return values.slice(0, maximum);
}
function resolveNpc(npc, library, layout) {
  const templateId = npc.template ?? library.defaultNpcTemplate;
  const template = library.npcTemplates.get(templateId);
  if (!template) return { ...npc, template: templateId };
  const profiles = template.defaultProfiles ?? [];
  const selected = npc.profile ? profiles.find((profile) => profile.id === npc.profile) : profiles.length ? profiles[hash(npc.id) % profiles.length] : void 0;
  return {
    id: npc.id,
    template: templateId,
    ...selected?.id ? { profile: selected.id } : {},
    name: npc.name ?? selected?.name ?? template.name,
    title: npc.title ?? template.defaultTitle,
    gender: npc.gender ?? selected?.gender ?? template.defaultGender,
    appearance: { ...template.defaultAppearance, ...selected?.appearance ?? {}, ...npc.appearance ?? {} },
    spawn: npc.spawn ?? layout.npcSpawns?.[hash(`${npc.id}:spawn`) % Math.max(1, layout.npcSpawns?.length ?? 0)],
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
function compileOfficePatch(base, patchInput, library) {
  const shapeIssues = validateOfficePatchShape(patchInput).map((entry) => ({ ...entry, code: "invalid-patch-shape" }));
  if (shapeIssues.length) return { errors: shapeIssues, adjustments: [] };
  const patch = patchInput;
  if (patch.base !== base.id) return { errors: [{ code: "base-mismatch", path: "$.base", message: `patch base ${patch.base} does not match ${base.id}` }], adjustments: [] };
  const baseValidation = validateOfficeSpec(base, library);
  if (!baseValidation.valid) return { errors: baseValidation.issues.map((entry) => ({ ...entry, path: `$.base${entry.path.slice(1)}` })), adjustments: [] };
  const operationErrors = [];
  for (const [path5, values] of [
    ["$.placements.upsert", (patch.placements?.upsert ?? []).map((entry) => entry.id)],
    ["$.placements.remove", patch.placements?.remove ?? []],
    ["$.npcs.upsert", (patch.npcs?.upsert ?? []).map((entry) => entry.id)],
    ["$.npcs.remove", patch.npcs?.remove ?? []],
    ["$.activities.enable", patch.activities?.enable ?? []],
    ["$.activities.disable", patch.activities?.disable ?? []]
  ]) {
    for (const id of new Set(duplicates(values))) operationErrors.push({ code: "duplicate-operation", path: path5, message: `${id} appears more than once` });
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
    id: patch.id ?? (base.origin === "custom" ? base.id : `local/${base.id.replace(/^builtin\//, "")}`),
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
    ...patch.environmentOverrides === null ? {} : patch.environmentOverrides || base.environmentOverrides ? { environmentOverrides: mergeEnvironment(base.environmentOverrides, patch.environmentOverrides ?? {}) } : {},
    ...patch.agentProfile === null ? {} : patch.agentProfile || base.agentProfile ? { agentProfile: { ...base.agentProfile ?? OFFICE_SPEC_DEFAULTS.agentProfile, ...patch.agentProfile ?? {}, appearance: { ...base.agentProfile?.appearance ?? {}, ...patch.agentProfile?.appearance ?? {} } } } : {}
  };
  const compiled = compileOfficeSpec(draft, library);
  return { draft: compiled.draft, errors: compiled.errors, adjustments: [...adjustments, ...compiled.adjustments] };
}

// ../src/creator/service.ts
function roomView(library, office) {
  const layout = library.layouts.get(office.layout);
  if (!layout) return null;
  const occupants = /* @__PURE__ */ new Map();
  for (const slot of layout.placementSlots ?? []) occupants.set(slot.id, slot.occupiedBy ?? null);
  for (const placement of office.placements) occupants.set(placement.slot, placement.id);
  return {
    name: layout.name,
    zones: (layout.zones ?? []).map((zone) => ({ id: zone.id, name: zone.name, x: zone.x, y: zone.y, width: zone.width, height: zone.height })),
    slots: (layout.placementSlots ?? []).map((slot) => ({ id: slot.id, zone: slot.zone, accepts: slot.accepts ?? [], maxSize: slot.maxSize, occupiedBy: occupants.get(slot.id) ?? null })),
    npcSpawns: layout.npcSpawns ?? [],
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
  /**
   * Capabilities the model may map a request onto. `room` describes the room of
   * the currently selected Office only — zones, placement slots and NPC spawns —
   * because "add a plant" or "put a water cooler in the lounge" is only reliable
   * when the model can see what this Office actually offers. Rooms are never
   * presented as a choice.
   */
  async listComponents() {
    const office = await this.#registry.selected();
    return {
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
    const saved = await this.#registry.save(compiled.draft);
    if (!saved.saved) return { saved: false, errors: saved.issues, adjustments: compiled.adjustments };
    await this.#registry.select(compiled.draft.id);
    return { saved: true, office: structuredClone(compiled.draft), errors: [], adjustments: compiled.adjustments };
  }
};

// ../src/creator/mode.ts
var CREATOR_MODE_CONTEXT = `Agent Live Creator Mode is active for this session.
Treat office-related natural language as a request to modify the currently selected Custom Office and use the agent_live_creator tool.
Do not expose schemas, patches, or component ids unless explicitly asked for implementation details.
If a request is unrelated to the office or ambiguous, do not perform it. Explain that Creator Mode is active and offer exactly these choices: continue editing, /agent-live list presets, /agent-live preset <number or name>, /agent-live custom, or /agent-live exit.
Map a request like "make me a police station" onto the closest complete Preset Office, then change its name, people, identities, furniture, style and activities. If the request needs a brand-new room structure (walls, areas, lanes, seats or work stations), say that it requires adding a new Office Preset and therefore a source change; never offer to swap a room in place.
An Office keeps its room. Moving to another room means selecting that Preset Office and editing a copy of it.
After every response, state that Creator Mode remains active and mention /agent-live exit.`;
var CreatorModeRegistry = class {
  #sessions = /* @__PURE__ */ new Set();
  enter(sessionId) {
    if (!sessionId) throw new TypeError("Creator Mode requires a session id");
    this.#sessions.add(sessionId);
  }
  exit(sessionId) {
    return this.#sessions.delete(sessionId);
  }
  isActive(sessionId) {
    return this.#sessions.has(sessionId);
  }
  clear() {
    this.#sessions.clear();
  }
};

// ../src/runtime/content-service.ts
import os from "node:os";
import path4 from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ../src/content/library.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
async function loadComponentLibrary(contentRoot) {
  const root = path.join(contentRoot, "component-library");
  const [catalog, props, npcTemplates, agentProfileTemplates, activityRecipes, activityImplementations] = await Promise.all([
    readJson(path.join(root, "catalog.json")),
    readJson(path.join(root, "props.json")),
    readJson(path.join(root, "npc-templates.json")),
    readJson(path.join(root, "agent-profile-templates.json")),
    readJson(path.join(root, "activity-recipes.json")),
    readJson(path.join(root, "activity-implementations.json"))
  ]);
  const layouts = /* @__PURE__ */ new Map();
  for (const entry of catalog.layouts) layouts.set(entry.id, await readJson(path.join(contentRoot, "layouts", `${entry.id.replace(/^builtin\//, "")}.json`)));
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
  const catalog = await readJson(path.join(contentRoot, "catalog.json"));
  const publicIds = catalog.presets.filter((entry) => entry.visibility !== "internal").map((entry) => entry.id);
  return Promise.all(publicIds.map((id) => readJson(path.join(contentRoot, "official-offices", `${id}.json`))));
}

// ../src/content/registry.ts
import { EventEmitter } from "node:events";
import { mkdir, readFile as readFile2, readdir, rename, rm, writeFile } from "node:fs/promises";
import path2 from "node:path";
var SAFE_LOCAL_ID = /^local\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/;
var OfficeRegistry = class {
  root;
  #library;
  #official = /* @__PURE__ */ new Map();
  #events = new EventEmitter();
  #fallbackOffice;
  constructor(options) {
    this.root = path2.resolve(options.root);
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
        const office = await this.#readCustomFile(path2.join(this.#officeDir(), file));
        entries.push({ id: office.id, name: office.name, origin: "custom", selected: office.id === selected });
      } catch (error) {
        console.warn(`Agent Live ignored invalid custom office ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return entries.sort((a, b) => a.origin.localeCompare(b.origin) || a.name.localeCompare(b.name));
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
      const state = JSON.parse(await readFile2(this.#stateFile(), "utf8"));
      if (state.schemaVersion === 1 && state.selectedOffice && await this.get(state.selectedOffice)) return state.selectedOffice;
    } catch {
    }
    return this.#fallbackOffice;
  }
  async selected() {
    return await this.get(await this.selectedId()) ?? structuredClone(this.#official.get(this.#fallbackOffice));
  }
  #officeDir() {
    return path2.join(this.root, "offices");
  }
  #stateFile() {
    return path2.join(this.root, "registry.json");
  }
  #fileFor(id) {
    return path2.join(this.#officeDir(), `${encodeURIComponent(id.slice("local/".length))}.json`);
  }
  async #readCustomFile(file) {
    const spec = JSON.parse(await readFile2(file, "utf8"));
    const validation = validateOfficeSpec(spec, this.#library);
    if (!validation.valid || spec.origin !== "custom" || !SAFE_LOCAL_ID.test(spec.id)) throw new Error(`invalid custom office ${file}`);
    if (this.#fileFor(spec.id) !== file) throw new Error(`custom office filename does not match id ${spec.id}`);
    return spec;
  }
};

// ../src/content/runtime-content.ts
import { readFile as readFile3 } from "node:fs/promises";
import path3 from "node:path";
var readJson2 = async (file) => JSON.parse(await readFile3(file, "utf8"));
var short = (id) => id.replace(/^builtin\//, "");
async function asset(contentRoot, family, id, suffix = "") {
  const name = suffix && short(id).endsWith(suffix) ? short(id).slice(0, -suffix.length) : short(id);
  return readJson2(path3.join(contentRoot, family, `${name}.json`));
}
async function resolveRuntimeContent(spec, contentRoot, library) {
  const layout = structuredClone(library.layouts.get(spec.layout));
  if (!layout) throw new Error(`unknown layout ${spec.layout}`);
  const officialId = short(spec.layout);
  const scaffold = await readJson2(path3.join(contentRoot, "presets", `${officialId}.json`));
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
  const entries = spec.activities.map((id) => {
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
  const preset = { ...scaffold, id: spec.id, name: spec.name, officeSpec: spec.id };
  delete preset.content;
  return {
    preset,
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

// ../src/runtime/content-service.ts
function pluginRoot() {
  return path4.resolve(path4.dirname(fileURLToPath(import.meta.url)), "../..");
}
function bundledContentRoot() {
  const directory = path4.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path4.resolve(directory, "../../web/v2/content"),
    path4.resolve(directory, "../web/v2/content")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? path4.join(pluginRoot(), "web/v2/content");
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
    const dataRoot = options.dataRoot ?? process.env.AGENT_LIVE_DATA_DIR ?? path4.join(os.homedir(), ".agent-live");
    const registry = new OfficeRegistry({ root: dataRoot, library, officialOffices });
    return new _OfficeContentService(contentRoot, library, registry);
  }
  list() {
    return this.registry.list();
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

// src/creator.ts
var commandOfficeProjections = /* @__PURE__ */ new Map();
var currentOfficeProjection = null;
function sessionEventContent(value) {
  return JSON.parse(JSON.stringify(value));
}
function officeProjection(value) {
  if (!value || typeof value !== "object") return null;
  const projection = value.officeProjection;
  if (!projection || typeof projection !== "object") return null;
  const candidate = projection;
  return typeof candidate.revision === "number" && "content" in candidate ? { revision: candidate.revision, content: candidate.content } : null;
}
function modelResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { officeProjection: _officeProjection, ...visible } = value;
  return visible;
}
var SKILL = `# Agent Live Creator

Use the agent_live_creator tool when Agent Live Creator Mode is active. The user enters with /agent-live custom and exits with /agent-live exit. There is no draft, preview, confirmation, save, undo, or discard step; every valid customization applies atomically.

Inspect list_offices and list_components when the available choices are not already known, then call customize once. Omit base to modify the currently selected Office, or provide an Office id to start from that Office. Customize validates, saves, selects, and immediately displays the result.

Never expose internal component ids, schemas, or patches unless the user explicitly asks for implementation details. Map unsupported input to the closest supported capability without interrupting generation, then summarize defaults, substitutions, ignored requests, and source-code-only requests after applying the change.

An Office keeps its room. Map a request like "make me a police station" onto the closest complete Preset Office, then change its name, people, identities, furniture, style and activities. A brand-new room structure needs a new Office Preset, which is a source change \u2014 say so instead of swapping a room in place.

The public commands are exactly: /agent-live list presets, /agent-live preset <number or exact name>, /agent-live custom, /agent-live exit.`;
function commandPayload(operation, args) {
  switch (operation) {
    case "list_offices":
    case "list_components":
      return { command: operation };
    case "customize":
      return { command: operation, ...args.base ? { base: args.base } : {}, patch: args.patch };
  }
}
async function registerCreator(ctx) {
  const content = await OfficeContentService.create();
  const service = new CreatorService(content.registry, content.library);
  const router = new CreatorCommandRouter(service);
  const modes = new CreatorModeRegistry();
  let selectedOfficeProjection = {
    revision: Date.now(),
    content: sessionEventContent(await content.resolve())
  };
  currentOfficeProjection = selectedOfficeProjection;
  ctx.on("session/disposed", (session) => {
    modes.exit(String(session.id));
  });
  ctx.systemPrompt.context({
    name: "agent-live-creator-mode",
    order: ctx.systemPrompt.getContextOrder("SUBAGENT_DELEGATION") + 10,
    text: (assembly) => assembly.agent && modes.isActive(String(assembly.agent.id)) ? CREATOR_MODE_CONTEXT : ""
  });
  const officeProjectionSchema = z.unknown();
  ctx.sessionProjections.register({
    key: "agentLiveOffice",
    stateSchema: officeProjectionSchema,
    init: () => currentOfficeProjection ?? selectedOfficeProjection,
    apply: (state, event) => {
      if (event.type === "command/done") {
        const next2 = commandOfficeProjections.get(String(event.data.commandId));
        if (!next2) return state;
        commandOfficeProjections.delete(String(event.data.commandId));
        return next2;
      }
      if (event.type !== "tool/result") return state;
      const meta = event.data.meta;
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) return state;
      const next = meta.agentLiveOffice;
      return next && typeof next === "object" ? next : state;
    },
    wire: { viewSchema: officeProjectionSchema, view: (state) => state },
    stateVersion: 3
  });
  ctx.skills.register({
    name: "agent-live-creator",
    description: "Create or modify a local Agent Live office from natural language.",
    whenToUse: "Use for Agent Live office customization, presets, NPCs, furniture, visual style, environment, schedules, or agent identity.",
    content: SKILL,
    source: "bundled"
  });
  ctx.commands.register({
    name: "agent-live",
    description: "Enter or exit Creator Mode, or inspect available Offices.",
    input: { hint: "custom | exit | list presets | preset <number/name>" },
    async handler(invocation) {
      const rawInput = invocation.rawInput.trim().replace(/\s+/g, " ");
      const input = rawInput.toLowerCase();
      const sessionId = String(invocation.agent.id);
      if (input === "custom") {
        modes.enter(sessionId);
        return { kind: "success", text: "Creator Mode is active. Describe an office change, or use /agent-live exit to leave." };
      }
      if (input === "exit") {
        return { kind: "success", text: modes.exit(sessionId) ? "Creator Mode exited." : "Creator Mode was not active." };
      }
      if (input === "list preset" || input === "list presets") {
        const offices = await service.listOffices();
        const lines = offices.map((office, index) => `${index + 1}. ${office.name}${office.selected ? " (selected)" : ""}`);
        const officialCount = offices.filter((office) => office.origin === "official").length;
        lines.splice(officialCount, 0, ...officialCount < offices.length ? ["", "Custom Offices:"] : []);
        lines.unshift("Preset Offices:");
        return { kind: "success", text: lines.join("\n") + "\n\nSelect with /agent-live preset <number or name>, then edit it with /agent-live custom." };
      }
      if (input.startsWith("preset ")) {
        const selector = rawInput.slice(rawInput.indexOf(" ") + 1).trim();
        const offices = await service.listOffices();
        const index = /^\d+$/.test(selector) ? Number(selector) - 1 : -1;
        const office = index >= 0 ? offices[index] : offices.find((entry) => entry.name.toLowerCase() === selector.toLowerCase());
        if (!office) return { kind: "error", text: `Unknown preset "${selector}". Use /agent-live list presets to see the available choices.` };
        const result = await service.selectOffice(office.id);
        if (!result.selected) return { kind: "error", text: result.error };
        selectedOfficeProjection = { revision: Date.now(), content: sessionEventContent(await content.resolve(office.id)) };
        currentOfficeProjection = selectedOfficeProjection;
        commandOfficeProjections.set(String(invocation.commandId), selectedOfficeProjection);
        modes.exit(sessionId);
        return { kind: "success", text: `Selected ${office.name}. Agent Live has updated.` };
      }
      if (input) return { kind: "error", text: "Use /agent-live custom, /agent-live exit, /agent-live list presets, or /agent-live preset <number or name>." };
      return { kind: "success", text: modes.isActive(sessionId) ? "Creator Mode is active. Use /agent-live exit to leave." : "Use /agent-live custom to start editing the office." };
    }
  });
  ctx.tools.register(defineTool({
    name: "agent_live_creator",
    description: "Inspect capabilities or directly validate, save, select, and display an Agent Live office customization.",
    parameters: {
      operation: { type: "string", required: true, enum: ["list_offices", "list_components", "customize"] },
      base: { type: "string", description: "Optional Office id to use as the base; defaults to the selected Office." },
      patch: { type: "json", description: "Requested changes expressed with the bounded Office Patch fields; metadata is filled internally." }
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(modelResult(value)) }],
      presentationMeta: (_args, value) => {
        const projection = officeProjection(value);
        return projection ? { agentLiveOffice: projection } : {};
      }
    },
    async execute(args, exec) {
      const result = await router.execute(commandPayload(args.operation, args));
      let projection = null;
      if (result.ok && args.operation === "customize") {
        const customized = result.data;
        if (customized.office?.id) {
          projection = { revision: Date.now(), content: sessionEventContent(await content.resolve(customized.office.id)) };
          selectedOfficeProjection = projection;
          currentOfficeProjection = projection;
        }
      }
      return {
        ...result,
        ...projection ? { officeProjection: projection } : {}
      };
    }
  }));
}

// src/index.ts
var inject = ["commands", "sessions", "sessionProjections", "skills", "systemPrompt", "tools"];
async function apply(ctx) {
  await registerCreator(ctx);
}
export {
  apply,
  inject
};
