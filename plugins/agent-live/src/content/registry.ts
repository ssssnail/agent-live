import { EventEmitter } from "node:events";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OfficeSpec } from "./schema.ts";
import { validateOfficeSpec, type ComponentLibraryView, type ValidationIssue } from "./validator.ts";

interface RegistryState {
	schemaVersion: 1;
	selectedOffice?: string;
}

export interface RegistryEntry {
	id: string;
	name: string;
	origin: "official" | "custom";
	selected: boolean;
}

export interface SaveResult {
	saved: boolean;
	issues: ValidationIssue[];
}

export interface OfficeRegistryOptions {
	root: string;
	library: ComponentLibraryView;
	officialOffices: OfficeSpec[];
	fallbackOffice?: string;
}

const SAFE_LOCAL_ID = /^local\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/;

export class OfficeRegistry {
	readonly root: string;
	readonly #library: ComponentLibraryView;
	readonly #official = new Map<string, OfficeSpec>();
	readonly #events = new EventEmitter();
	readonly #fallbackOffice: string;

	constructor(options: OfficeRegistryOptions) {
		this.root = path.resolve(options.root);
		this.#library = options.library;
		for (const office of options.officialOffices) this.#official.set(office.id, structuredClone(office));
		this.#fallbackOffice = options.fallbackOffice ?? "builtin/tech-open-office";
		if (!this.#official.has(this.#fallbackOffice)) throw new Error(`unknown fallback office ${this.#fallbackOffice}`);
	}

	onChange(listener: (id: string | undefined) => void) {
		this.#events.on("change", listener);
		return () => this.#events.off("change", listener);
	}

	async initialize() {
		await mkdir(this.#officeDir(), { recursive: true });
	}

	async list(): Promise<RegistryEntry[]> {
		await this.initialize();
		const selected = await this.selectedId();
		const entries: RegistryEntry[] = [...this.#official.values()].map((office) => ({ id: office.id, name: office.name, origin: "official", selected: office.id === selected }));
		for (const file of await readdir(this.#officeDir())) {
			if (!file.endsWith(".json")) continue;
			try {
				const office = await this.#readCustomFile(path.join(this.#officeDir(), file));
				entries.push({ id: office.id, name: office.name, origin: "custom", selected: office.id === selected });
			} catch (error) {
				console.warn(`Agent Live ignored invalid custom office ${file}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		return [
			...entries.filter((entry) => entry.origin === "official"),
			...entries.filter((entry) => entry.origin === "custom").sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
		];
	}

	async get(id: string): Promise<OfficeSpec | undefined> {
		const official = this.#official.get(id);
		if (official) return structuredClone(official);
		if (!SAFE_LOCAL_ID.test(id)) return undefined;
		try {
			return await this.#readCustomFile(this.#fileFor(id));
		} catch {
			return undefined;
		}
	}

	async save(spec: OfficeSpec): Promise<SaveResult> {
		const validation = validateOfficeSpec(spec, this.#library);
		if (!validation.valid) return { saved: false, issues: validation.issues };
		if (spec.origin !== "custom" || !SAFE_LOCAL_ID.test(spec.id)) return { saved: false, issues: [{ code: "official-read-only", path: "$.id", message: "only local/ custom offices can be saved" }] };
		await this.initialize();
		const destination = this.#fileFor(spec.id);
		const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
		await writeFile(temporary, `${JSON.stringify(spec, null, "\t")}\n`, { encoding: "utf8", mode: 0o600 });
		await rename(temporary, destination);
		this.#events.emit("change", spec.id);
		return { saved: true, issues: [] };
	}

	async remove(id: string) {
		if (!SAFE_LOCAL_ID.test(id)) return false;
		const selected = await this.selectedId();
		try {
			await rm(this.#fileFor(id));
		} catch (error: any) {
			if (error?.code === "ENOENT") return false;
			throw error;
		}
		if (selected === id) await this.select(this.#fallbackOffice);
		this.#events.emit("change", id);
		return true;
	}

	/** Remove every Agent Live-owned user file and restore the built-in fallback. */
	async reset() {
		const parent = path.dirname(this.root);
		const backup = path.join(parent, `.${path.basename(this.root)}.reset-${process.pid}-${Date.now()}`);
		let moved = false;
		try {
			await rename(this.root, backup);
			moved = true;
		} catch (error: any) {
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
		return { reset: true as const, selectedOffice: this.#fallbackOffice };
	}

	async select(id: string) {
		if (!(await this.get(id))) throw new Error(`unknown or invalid office ${id}`);
		await this.initialize();
		const state: RegistryState = { schemaVersion: 1, selectedOffice: id };
		const destination = this.#stateFile();
		const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
		await writeFile(temporary, `${JSON.stringify(state, null, "\t")}\n`, { encoding: "utf8", mode: 0o600 });
		await rename(temporary, destination);
		this.#events.emit("change", id);
	}

	async selectedId() {
		try {
			const state = JSON.parse(await readFile(this.#stateFile(), "utf8")) as RegistryState;
			if (state.schemaVersion === 1 && state.selectedOffice && await this.get(state.selectedOffice)) return state.selectedOffice;
		} catch {
			// Missing or corrupt state falls back without mutating user files.
		}
		return this.#fallbackOffice;
	}

	async selected() {
		return (await this.get(await this.selectedId())) ?? structuredClone(this.#official.get(this.#fallbackOffice)!);
	}

	#officeDir() { return path.join(this.root, "offices"); }
	#stateFile() { return path.join(this.root, "registry.json"); }
	#fileFor(id: string) { return path.join(this.#officeDir(), `${encodeURIComponent(id.slice("local/".length))}.json`); }

	async #readCustomFile(file: string): Promise<OfficeSpec> {
		const spec = JSON.parse(await readFile(file, "utf8"));
		const validation = validateOfficeSpec(spec, this.#library);
		if (!validation.valid || spec.origin !== "custom" || !SAFE_LOCAL_ID.test(spec.id)) throw new Error(`invalid custom office ${file}`);
		if (this.#fileFor(spec.id) !== file) throw new Error(`custom office filename does not match id ${spec.id}`);
		return spec;
	}
}
