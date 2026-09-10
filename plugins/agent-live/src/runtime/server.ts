import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import type { Socket } from "node:net";
import { fileURLToPath } from "node:url";
import type { OfficeEvent } from "../core/protocol.ts";
import type { OfficeState } from "../core/state.ts";
import { SCENE_LIMITS } from "../core/limits.ts";

const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
};

function moduleDir(): string {
	try {
		return path.dirname(fileURLToPath((import.meta as { url: string }).url));
	} catch {
		return typeof __dirname !== "undefined" ? __dirname : process.cwd();
	}
}

const WEB_ROOT = [
	path.resolve(moduleDir(), "..", "..", "web"),
	path.resolve(moduleDir(), "..", "web"),
].find((candidate) => fs.existsSync(candidate)) ?? path.resolve(moduleDir(), "..", "..", "web");

export interface OfficeServer {
	url: string;
	port: number;
	close(): Promise<void>;
	open(query?: string): void;
}

export interface OfficeControls {
	token: string;
	status(): unknown;
	selectModel(model: string): Promise<unknown> | unknown;
	prompt(text: string, model?: string): Promise<unknown>;
	interrupt(): Promise<unknown>;
	resolveApproval(id: number | string, allow: boolean, forSession: boolean): Promise<unknown> | unknown;
}

export interface OfficeContentControls {
	list(): Promise<unknown>;
	resolve(id?: string): Promise<unknown>;
	subscribe?(listener: (change: unknown) => void): () => void;
}

export interface CreatorControls {
	execute(command: unknown): Promise<unknown>;
}

export function resolveViewerUrl(baseUrl: string, target = ""): string {
	if (!target) return baseUrl;
	const normalizedTarget = target.startsWith("/") ? target : `/${target}`;
	return new URL(normalizedTarget, baseUrl).toString();
}

/**
 * Static file host for the office UI plus an SSE endpoint carrying office events.
 * Server-sent events keep this dependency-free: the browser only ever listens.
 */
export async function startServer(
	state: OfficeState,
	options: { port: number; host?: string; controls?: OfficeControls; content?: OfficeContentControls; creator?: CreatorControls; creatorToken?: string; onViewerCountChange?: (count: number) => void },
): Promise<OfficeServer> {
	const host = options.host ?? "127.0.0.1";
	const clients = new Set<http.ServerResponse>();
	const sockets = new Set<Socket>();
	const accessToken = options.controls?.token ?? options.creatorToken;
	let closePromise: Promise<void> | null = null;

	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? "/", `http://${host}`);
		const controls = options.controls;
		if (!isLocalRequest(req)) {
			json(res, 403, { error: "local requests only" });
			return;
		}
		if (accessToken && ["/events", "/api/state", "/api/client/status"].includes(url.pathname) && !hasToken(req, url, accessToken)) {
			json(res, 403, { error: "forbidden" });
			return;
		}

		if (url.pathname === "/events") {
			res.writeHead(200, {
				"content-type": "text/event-stream",
				"cache-control": "no-cache, no-transform",
				connection: "keep-alive",
				"x-accel-buffering": "no",
			});
			res.write(": connected\n\n");
			// Reconnects need current state, not the full replay log. The browser
			// fetches complete history on demand from /api/state when replay starts.
			write(res, state.snapshot(false));
			clients.add(res);
			options.onViewerCountChange?.(clients.size);
			const unsubscribe = state.subscribe((event) => write(res, event));
			const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
			heartbeat.unref?.();
			req.on("close", () => {
				clearInterval(heartbeat);
				unsubscribe();
				clients.delete(res);
				options.onViewerCountChange?.(clients.size);
			});
			return;
		}

		if (url.pathname === "/api/state") {
			res.writeHead(200, { "content-type": MIME[".json"] });
			res.end(JSON.stringify(state.snapshot()));
			return;
		}

		if (url.pathname === "/api/scene-limits") {
			json(res, 200, SCENE_LIMITS);
			return;
		}

		if (options.content && url.pathname === "/api/offices" && req.method === "GET") {
			void options.content.list().then((value) => json(res, 200, value), (error) => json(res, 500, { error: (error as Error).message }));
			return;
		}

		if (options.content && url.pathname === "/api/office-content" && req.method === "GET") {
			void options.content.resolve(url.searchParams.get("id") ?? undefined).then((value) => json(res, 200, value), (error) => json(res, 404, { error: (error as Error).message }));
			return;
		}

		if (options.content?.subscribe && url.pathname === "/api/content-events" && req.method === "GET") {
			res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
			res.write(": connected\n\n");
			const unsubscribe = options.content.subscribe((change) => res.write(`data: ${JSON.stringify(change)}\n\n`));
			const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
			heartbeat.unref?.();
			req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
			return;
		}

		if (controls && url.pathname === "/api/client/status" && req.method === "GET") {
			json(res, 200, controls.status());
			return;
		}

		if (controls && url.pathname.startsWith("/api/client/") && req.method === "POST") {
			if (req.headers["x-agent-live-token"] !== controls.token) {
				json(res, 403, { error: "forbidden" });
				return;
			}
			void readJson(req).then(async (body) => {
				if (url.pathname === "/api/client/model") return controls.selectModel(String(body.model ?? ""));
				if (url.pathname === "/api/client/prompt") {
					return controls.prompt(String(body.text ?? ""), typeof body.model === "string" ? body.model : undefined);
				}
				if (url.pathname === "/api/client/interrupt") return controls.interrupt();
				if (url.pathname === "/api/client/approval") {
					return controls.resolveApproval(
						body.id as number | string,
						Boolean(body.allow),
						Boolean(body.forSession),
					);
				}
				throw new Error("unknown client endpoint");
			}).then(
				(result) => json(res, 200, result ?? { ok: true }),
				(error) => json(res, 400, { error: (error as Error).message }),
			);
			return;
		}

		if (options.creator && url.pathname === "/api/creator" && req.method === "POST") {
			const expectedToken = options.creatorToken ?? controls?.token;
			if (!expectedToken || req.headers["x-agent-live-token"] !== expectedToken) {
				json(res, 403, { error: "forbidden" });
				return;
			}
			void readJson(req).then((command) => options.creator!.execute(command)).then(
				(result) => json(res, 200, result),
				(error) => json(res, 400, { error: (error as Error).message }),
			);
			return;
		}

		serveStatic(url.pathname, res);
	});
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
	});

	const port = await listen(server, host, options.port);
	const url = `http://localhost:${port}`;

	return {
		url,
		port,
		open(target = "") {
			openInBrowser(resolveViewerUrl(url, target));
		},
		async close() {
			if (closePromise) return closePromise;
			closePromise = new Promise<void>((resolve) => {
				const forceClose = setTimeout(() => {
					for (const socket of sockets) socket.destroy();
				}, 2_000);
				for (const client of clients) client.end();
				clients.clear();
				server.close(() => {
					clearTimeout(forceClose);
					sockets.clear();
					resolve();
				});
			});
			return closePromise;
		},
	};
}

function json(res: http.ServerResponse, status: number, value: unknown): void {
	res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
	res.end(JSON.stringify(value));
}

function hasToken(req: http.IncomingMessage, url: URL, expected: string): boolean {
	return req.headers["x-agent-live-token"] === expected || url.searchParams.get("token") === expected;
}

function isLocalRequest(req: http.IncomingMessage): boolean {
	const local = new Set(["localhost", "127.0.0.1", "::1"]);
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

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		let body = "";
		req.setEncoding("utf8");
		req.on("data", (chunk) => {
			body += chunk;
			if (body.length > 1_000_000) reject(new Error("request body is too large"));
		});
		req.on("end", () => {
			try {
				resolve(body ? JSON.parse(body) : {});
			} catch {
				reject(new Error("invalid JSON"));
			}
		});
		req.on("error", reject);
	});
}

function write(res: http.ServerResponse, event: OfficeEvent): void {
	try {
		res.write(`data: ${JSON.stringify(event)}\n\n`);
	} catch {
		// Client vanished mid-write; the close handler cleans up.
	}
}

function serveStatic(pathname: string, res: http.ServerResponse): void {
	const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
	const filePath = path.resolve(WEB_ROOT, rel);
	const relative = path.relative(WEB_ROOT, filePath);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
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
			"cache-control": "no-cache",
		});
		res.end(data);
	});
}

/** Walks forward from the preferred port so several pi sessions can coexist. */
function listen(
	server: http.Server,
	host: string,
	startPort: number,
	attempts = 12,
): Promise<number> {
	return new Promise((resolve, reject) => {
		let port = startPort;
		let left = attempts;

		const onError = (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE" && left-- > 0) {
				port += 1;
				server.listen(port, host);
				return;
			}
			server.off("error", onError);
			reject(err);
		};

		server.on("error", onError);
		server.once("listening", () => {
			server.off("error", onError);
			resolve((server.address() as { port: number }).port);
		});
		server.listen(port, host);
	});
}

function openInBrowser(url: string): void {
	const command =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "rundll32"
				: "xdg-open";
	const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
	const child = spawn(command, args, { stdio: "ignore", detached: true });
	child.once("error", () => {
		// Headless environment or missing opener; the user can open the URL manually.
	});
	child.unref();
}
