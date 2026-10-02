import type { AppServerMessage, JsonObject } from "./app-server-client.ts";

export interface InputQuestion {
	id: string;
	question: string;
	isSecret?: boolean;
	options?: Array<{ label: string; description?: string }> | null;
}

// App Server 0.160.0 server requests. Keep transport-specific answers here,
// outside the shared OfficeEvent/renderer contract.
export const interactiveMethods = new Set([
	"item/commandExecution/requestApproval", "item/fileChange/requestApproval",
	"item/permissions/requestApproval", "item/tool/requestUserInput",
	"mcpServer/elicitation/request",
]);

function record(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

// MCP's standard flat form subset. Unknown constraints are not silently ignored:
// unsupported forms can be declined, but never accepted without validation.
export function validateForm(schema: unknown, content: unknown): void {
	if (!record(schema) || schema.type !== "object" || !record(schema.properties) || !record(content)) throw new Error("Expected a JSON object matching the requested form");
	for (const key of Object.keys(schema)) if (!["type", "properties", "required", "$schema", "title", "description", "additionalProperties"].includes(key)) throw new Error(`Unsupported form constraint: ${key}`);
	for (const key of Array.isArray(schema.required) ? schema.required : []) if (!Object.hasOwn(content, String(key))) throw new Error(`Missing field: ${key}`);
	for (const [key, value] of Object.entries(content)) {
		const rule = schema.properties[key];
		if (!record(rule)) throw new Error(`Unknown field: ${key}`);
		for (const constraint of Object.keys(rule)) if (!["type", "title", "description", "default", "enum", "enumNames", "minLength", "maxLength", "minimum", "maximum"].includes(constraint)) throw new Error(`Unsupported form constraint: ${key}.${constraint}`);
		const valid = rule.type === "string" ? typeof value === "string"
			: rule.type === "boolean" ? typeof value === "boolean"
			: rule.type === "number" ? typeof value === "number" && Number.isFinite(value)
			: rule.type === "integer" ? Number.isInteger(value) : false;
		if (!valid) throw new Error(`Invalid field type: ${key}`);
		if (Array.isArray(rule.enum) && !rule.enum.includes(value)) throw new Error(`Invalid choice: ${key}`);
		if (typeof value === "string" && (value.length < Number(rule.minLength ?? 0) || value.length > Number(rule.maxLength ?? Infinity))) throw new Error(`Invalid field length: ${key}`);
		if (typeof value === "number" && (value < Number(rule.minimum ?? -Infinity) || value > Number(rule.maximum ?? Infinity))) throw new Error(`Invalid field value: ${key}`);
	}
}

export function requestAnswer(request: AppServerMessage, allow: boolean, forSession = false, input?: unknown): JsonObject {
	const params = request.params ?? {};
	switch (request.method) {
		case "item/commandExecution/requestApproval":
		case "item/fileChange/requestApproval":
			return { decision: allow ? (forSession ? "acceptForSession" : "accept") : "decline" };
		case "item/permissions/requestApproval": {
			const requested = record(params.permissions) ? params.permissions : {};
			// The browser can approve only the exact request, never supply new permissions.
			return { permissions: allow ? {
				...(requested.network ? { network: requested.network } : {}),
				...(requested.fileSystem ? { fileSystem: requested.fileSystem } : {}),
			} : {}, scope: forSession ? "session" : "turn" };
		}
		case "item/tool/requestUserInput": {
			if (!allow) return { answers: {} };
			if (!record(input)) throw new Error("Please answer the questions first");
			const answers: JsonObject = Object.create(null);
			for (const question of params.questions as InputQuestion[]) {
				const answer = input[question.id];
				if (typeof answer !== "string" || !answer.trim()) throw new Error(`Missing answer: ${question.question}`);
				answers[question.id] = { answers: [answer] };
			}
			return { answers };
		}
		case "mcpServer/elicitation/request":
			if (!allow) return { action: "decline", content: null, _meta: null };
			if (params.mode === "url") return { action: "accept", content: null, _meta: null };
			validateForm(params.requestedSchema, input);
			return { action: "accept", content: input, _meta: null };
		default: throw new Error("Unsupported client request");
	}
}
