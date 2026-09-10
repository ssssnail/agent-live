import { OfficeState } from "../core/state.ts";
import { startServer, type OfficeServer } from "./server.ts";
import { OfficeContentService } from "./content-service.ts";
import { ResourceGuard } from "./resource-guard.ts";

/** Shared host-neutral owner for state, local HTTP/SSE service, and cleanup. */
export class AgentLiveRuntime {
	readonly cwd: string;
	readonly state: OfficeState;
	private server: OfficeServer | null = null;
	private readonly dataRoot?: string;
	private readonly resources = new ResourceGuard();
	private closed = false;

	constructor(cwd: string, options: { dataRoot?: string } = {}) {
		this.cwd = cwd;
		this.state = new OfficeState(cwd);
		this.dataRoot = options.dataRoot;
		this.resources.track("office-state", () => this.state.dispose());
	}

	async start(options: Parameters<typeof startServer>[1]): Promise<OfficeServer> {
		if (this.closed) throw new Error("Agent Live Runtime is closed");
		if (this.server) return this.server;
		try {
			const contentService = options.content ? undefined : await OfficeContentService.create({ dataRoot: this.dataRoot });
			const server = await startServer(this.state, { ...options, content: options.content ?? contentService });
			this.server = server;
			this.resources.track("office-server", () => server.close());
			return server;
		} catch (error) {
			this.closed = true;
			await this.resources.close().catch(() => undefined);
			throw error;
		}
	}

	async close(): Promise<void> {
		this.closed = true;
		this.server = null;
		await this.resources.close();
	}
}
