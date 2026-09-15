import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface, type Interface } from "node:readline";

export type JsonObject = Record<string, unknown>;

export interface AppServerMessage {
	method?: string;
	id?: number | string;
	params?: JsonObject;
	result?: unknown;
	error?: { code?: number; message?: string; data?: unknown };
}

type MessageListener = (message: AppServerMessage) => void;

const MACOS_BUNDLED_CODEX = "/Applications/ChatGPT.app/Contents/Resources/codex";

/** Prefer the desktop app's current protocol binary over an older PATH install. */
export function defaultCodexCommand(): string {
	if (process.env.AGENT_LIVE_CODEX_BIN) return process.env.AGENT_LIVE_CODEX_BIN;
	if (process.platform === "darwin" && existsSync(MACOS_BUNDLED_CODEX)) return MACOS_BUNDLED_CODEX;
	return "codex";
}

/**
 * Minimal JSON-RPC client for `codex app-server --stdio`.
 *
 * This class deliberately knows nothing about the office. It owns the child
 * process, request correlation and protocol lifecycle so the Codex-to-office
 * mapper can stay small and independently testable.
 */
export class CodexAppServerClient {
	private readonly options: {
		command?: string;
		args?: string[];
		cwd?: string;
		onStderr?: (text: string) => void;
	};
	private child: ChildProcessWithoutNullStreams | null = null;
	private lines: Interface | null = null;
	private nextId = 1;
	private closing = false;
	private readonly pending = new Map<
		number | string,
		{ resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
	>();
	private readonly listeners = new Set<MessageListener>();
	private readonly disconnectListeners = new Set<(error: Error) => void>();
	private disconnected = false;

	constructor(options: {
			command?: string;
			args?: string[];
			cwd?: string;
			onStderr?: (text: string) => void;
		} = {}) {
		this.options = options;
	}

	onMessage(listener: MessageListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onDisconnect(listener: (error: Error) => void): () => void {
		this.disconnectListeners.add(listener);
		return () => this.disconnectListeners.delete(listener);
	}

	private disconnect(error: Error): void {
		this.failAll(error);
		if (this.closing || this.disconnected) return;
		this.disconnected = true;
		for (const listener of this.disconnectListeners) listener(error);
	}

	async start(): Promise<JsonObject> {
		if (this.child) throw new Error("Codex App Server is already running");
		this.closing = false;
		this.disconnected = false;
		const command = this.options.command ?? defaultCodexCommand();
		const args = this.options.args ?? ["app-server", "--stdio"];
		const child = spawn(command, args, {
			cwd: this.options.cwd,
			env: process.env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.child = child;
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => this.options.onStderr?.(chunk));
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
			clientInfo: { name: "agent-live", title: "Agent Live", version: "0.3.3" },
			capabilities: {
				experimentalApi: true,
				requestAttestation: false,
				optOutNotificationMethods: [],
			},
		});
		this.notify("initialized");
		return result as JsonObject;
	}

	request(method: string, params: JsonObject = {}, timeoutMs = 30_000): Promise<unknown> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Codex App Server request timed out: ${method}`));
			}, timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			try {
				this.write({ method, id, params });
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error);
			}
		});
	}

	notify(method: string, params?: JsonObject): void {
		this.write(params ? { method, params } : { method });
	}

	respond(id: number | string, result: unknown): void {
		this.write({ id, result });
	}

	respondError(id: number | string, code: number, message: string): void {
		this.write({ id, error: { code, message } });
	}

	async close(): Promise<void> {
		const child = this.child;
		if (!child) return;
		this.closing = true;
		this.lines?.close();
		this.lines = null;
		child.stdin.end();
		if (!await waitForExit(child, 1_000)) {
			child.kill("SIGTERM");
			if (!await waitForExit(child, 1_000)) {
				child.kill("SIGKILL");
				await waitForExit(child, 1_000);
			}
		}
		this.child = null;
		this.failAll(new Error("Codex App Server closed"));
	}

	private handleLine(line: string): void {
		let message: AppServerMessage;
		try {
			message = JSON.parse(line) as AppServerMessage;
		} catch {
			return;
		}

		if (message.id !== undefined && !message.method) {
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

	private write(message: AppServerMessage): void {
		if (!this.child?.stdin.writable) throw new Error("Codex App Server is not running");
		this.child.stdin.write(`${JSON.stringify(message)}\n`);
	}

	private failAll(error: Error): void {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
	return new Promise((resolve) => {
		const onExit = () => { clearTimeout(timer); resolve(true); };
		const timer = setTimeout(() => {
			child.off("exit", onExit);
			resolve(child.exitCode !== null || child.signalCode !== null);
		}, timeoutMs);
		child.once("exit", onExit);
	});
}
