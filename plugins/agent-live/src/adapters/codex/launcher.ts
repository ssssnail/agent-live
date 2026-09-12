import { randomBytes } from "node:crypto";
import { AgentLiveRuntime } from "../../runtime/agent-live-runtime.ts";
import { OfficeContentService } from "../../runtime/content-service.ts";
import { CreatorService } from "../../creator/service.ts";
import { CreatorCommandRouter } from "../../creator/commands.ts";
import { CodexAppServerClient } from "./app-server-client.ts";
import { CodexOfficeSession, type PendingApproval } from "./adapter.ts";

export interface CodexAdapterLaunchOptions {
	cwd: string;
	port: number;
	preset?: string;
	sourceThreadId?: string;
	viewerStartTimeoutMs?: number;
	viewerCloseGraceMs?: number;
	open?: boolean;
	onAutoClose?(): void;
}

export interface CodexAdapterHandle {
	url: string;
	close(): Promise<void>;
}

/** Owns the complete Codex-specific startup and shutdown policy. */
export async function launchCodexAdapter(options: CodexAdapterLaunchOptions): Promise<CodexAdapterHandle> {
	const viewerStartTimeoutMs = options.viewerStartTimeoutMs ?? 180_000;
	const viewerCloseGraceMs = options.viewerCloseGraceMs ?? 12_000;
	const token = randomBytes(24).toString("hex");
	const runtime = new AgentLiveRuntime(options.cwd);
	const appServer = new CodexAppServerClient({ cwd: options.cwd });

	let approval: PendingApproval | null = null;
	let viewerCloseTimer: ReturnType<typeof setTimeout> | null = null;
	let viewerStartTimer: ReturnType<typeof setTimeout> | null = null;
	let hasSeenViewer = false;
	let closing = false;
	let closePromise: Promise<void> | null = null;
	const session = new CodexOfficeSession(runtime.state, appServer, {
		cwd: options.cwd,
		sourceThreadId: options.sourceThreadId,
		onApproval(value) { approval = value; },
	});

	const close = (): Promise<void> => {
		if (closePromise) return closePromise;
		closing = true;
		if (viewerCloseTimer) clearTimeout(viewerCloseTimer);
		if (viewerStartTimer) clearTimeout(viewerStartTimer);
		viewerCloseTimer = null;
		viewerStartTimer = null;
		closePromise = (async () => {
			const results = await Promise.allSettled([session.close(), runtime.close()]);
			const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason);
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
				viewerCloseTimer = setTimeout(() => void autoClose(), viewerCloseGraceMs);
				viewerCloseTimer.unref?.();
			},
			controls: {
				token,
				status: () => ({ ...session.getStatus(), approval }),
				selectModel(model) { session.selectModel(model); return { ok: true, model }; },
				prompt: (text, model) => session.prompt(text, model),
				interrupt: () => session.interrupt(),
				resolveApproval(id, allow, forSession) {
					session.resolveApproval(id, allow, forSession);
					approval = null;
					return { ok: true };
				},
			},
		});
	} catch (error) {
		await close().catch(() => undefined);
		throw error;
	}

	viewerStartTimer = setTimeout(() => {
		if (!hasSeenViewer) void autoClose();
	}, viewerStartTimeoutMs);
	viewerStartTimer.unref?.();

	const query = new URLSearchParams({ client: "codex", token });
	const url = `${server.url}/v2.html?${query}`;
	if (options.open) server.open(`v2.html?${query}`);
	return { url, close };
}
