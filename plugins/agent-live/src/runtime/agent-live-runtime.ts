import { OfficeState } from "../core/state.ts";
import { startServer, type OfficeServer } from "./server.ts";

/** Shared host-neutral owner for state, local HTTP/SSE service, and cleanup. */
export class AgentLiveRuntime {
	readonly state: OfficeState;
	private server: OfficeServer | null = null;

	constructor(readonly cwd: string) {
		this.state = new OfficeState(cwd);
	}

	async start(options: Parameters<typeof startServer>[1]): Promise<OfficeServer> {
		if (this.server) return this.server;
		this.server = await startServer(this.state, options);
		return this.server;
	}

	async close(): Promise<void> {
		const server = this.server;
		this.server = null;
		await server?.close();
		this.state.dispose();
	}
}
