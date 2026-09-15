import { CreatorService } from "./service.ts";
import { COMPONENT_CATEGORIES, type ComponentCategory } from "./service.ts";

type CommandResult = { ok: true; data: unknown; adjustments?: unknown[] } | { ok: false; error: string; issues?: unknown[]; adjustments?: unknown[] };

function object(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exact(input: Record<string, unknown>, fields: string[]) {
	const allowed = new Set(["command", ...fields]);
	const unknown = Object.keys(input).filter((key) => !allowed.has(key));
	if (unknown.length) throw new Error(`unknown command field(s): ${unknown.join(", ")}`);
}

/** Closed command surface used by every host integration; it never executes arbitrary code or paths. */
export class CreatorCommandRouter {
	readonly #creator: CreatorService;

	constructor(creator: CreatorService) { this.#creator = creator; }

	async execute(value: unknown): Promise<CommandResult> {
		try {
			if (!object(value) || typeof value.command !== "string") throw new Error("command is required");
				switch (value.command) {
				case "reset":
					exact(value, []);
					return { ok: true, data: await this.#creator.resetAllData() };
				case "list_offices":
					exact(value, []);
					return { ok: true, data: await this.#creator.listOffices() };
				case "list_components":
					exact(value, ["category"]);
					if (value.category !== undefined && !COMPONENT_CATEGORIES.includes(value.category as ComponentCategory)) throw new Error(`unknown component category ${String(value.category)}`);
					return { ok: true, data: await this.#creator.listComponents(value.category as ComponentCategory | undefined) };
				case "customize": {
					exact(value, ["base", "patch"]);
					if (value.base !== undefined && (typeof value.base !== "string" || !value.base)) throw new Error("base must be a non-empty string");
					const result = await this.#creator.customize(value.patch, value.base as string | undefined);
					return result.saved ? { ok: true, data: result, adjustments: result.adjustments } : { ok: false, error: "Office customization was rejected; the current office was not changed", issues: result.errors, adjustments: result.adjustments };
				}
				default:
					throw new Error(`unknown Creator command ${value.command}`);
			}
		} catch (error) {
			return { ok: false, error: (error as Error).message };
		}
	}
}
