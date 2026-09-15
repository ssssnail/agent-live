import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadComponentLibrary, loadOfficialOffices } from "../content/library.ts";
import { OfficeRegistry } from "../content/registry.ts";
import { resolveRuntimeContent } from "../content/runtime-content.ts";
import { compileOfficeSpec } from "../content/compiler.ts";
import { graphIssueMessages } from "../content/graph-validator.ts";

function pluginRoot() {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function bundledContentRoot() {
	const directory = path.dirname(fileURLToPath(import.meta.url));
	const candidates = [
		path.resolve(directory, "content"),
		path.resolve(directory, "../../web/v2/content"),
		path.resolve(directory, "../web/v2/content"),
	];
	return candidates.find((candidate) => existsSync(candidate)) ?? path.join(pluginRoot(), "web/v2/content");
}

export class OfficeContentService {
	readonly registry: OfficeRegistry;
	readonly #contentRoot: string;
	readonly library: Awaited<ReturnType<typeof loadComponentLibrary>>;

	private constructor(contentRoot: string, library: Awaited<ReturnType<typeof loadComponentLibrary>>, registry: OfficeRegistry) {
		this.#contentRoot = contentRoot;
		this.library = library;
		this.registry = registry;
	}

	static async create(options: { dataRoot?: string; contentRoot?: string } = {}) {
		const contentRoot = options.contentRoot ?? bundledContentRoot();
		const library = await loadComponentLibrary(contentRoot);
		const officialOffices = await loadOfficialOffices(contentRoot);
		const dataRoot = options.dataRoot ?? process.env.AGENT_LIVE_DATA_DIR ?? path.join(os.homedir(), ".agent-live");
		const registry = new OfficeRegistry({ root: dataRoot, library, officialOffices });
		return new OfficeContentService(contentRoot, library, registry);
	}

	list() { return this.registry.list(); }
	select(id: string) { return this.registry.select(id); }

	async resolve(id?: string) {
		const office = id ? await this.registry.get(id) : await this.registry.selected();
		if (!office) throw new Error(`unknown or invalid office ${id}`);
		const compiled = compileOfficeSpec(office, this.library);
		if (!compiled.draft) throw new Error(`office ${id} failed compilation: ${compiled.errors.map((issue) => issue.message).join("; ")}`);
		const graph = await resolveRuntimeContent(compiled.draft, this.#contentRoot, this.library);
		// The viewer applies the same rules; refusing here keeps "saved" and
		// "renderable" the same thing instead of failing in the browser.
		const issues = graphIssueMessages(graph);
		if (issues.length) throw new Error(`office ${office.id} produced content the viewer cannot render: ${issues.join("; ")}`);
		return graph;
	}

	subscribe(listener: (change: unknown) => void) {
		const stopRegistry = this.registry.onChange((officeId) => listener({ type: "office", officeId }));
		return stopRegistry;
	}
}
