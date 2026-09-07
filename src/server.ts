import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { OfficeEvent } from "./protocol.ts";
import type { OfficeState } from "./state.ts";

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

const WEB_ROOT = path.resolve(moduleDir(), "..", "web");

export interface OfficeServer {
	url: string;
	port: number;
	close(): Promise<void>;
	open(query?: string): void;
}

/**
 * Static file host for the office UI plus an SSE endpoint carrying office events.
 * Server-sent events keep this dependency-free: the browser only ever listens.
 */
export async function startServer(
	state: OfficeState,
	options: { port: number; host?: string },
): Promise<OfficeServer> {
	const host = options.host ?? "127.0.0.1";
	const clients = new Set<http.ServerResponse>();

	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? "/", `http://${host}`);

		if (url.pathname === "/events") {
			res.writeHead(200, {
				"content-type": "text/event-stream",
				"cache-control": "no-cache, no-transform",
				connection: "keep-alive",
				"x-accel-buffering": "no",
			});
			res.write(": connected\n\n");
			write(res, state.snapshot());
			clients.add(res);
			const unsubscribe = state.subscribe((event) => write(res, event));
			const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
			heartbeat.unref?.();
			req.on("close", () => {
				clearInterval(heartbeat);
				unsubscribe();
				clients.delete(res);
			});
			return;
		}

		if (url.pathname === "/api/state") {
			res.writeHead(200, { "content-type": MIME[".json"] });
			res.end(JSON.stringify(state.snapshot()));
			return;
		}

		serveStatic(url.pathname, res);
	});

	const port = await listen(server, host, options.port);
	const url = `http://localhost:${port}`;

	return {
		url,
		port,
		open(query = "") {
			openInBrowser(query ? `${url}/${query}` : url);
		},
		async close() {
			for (const client of clients) client.end();
			clients.clear();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
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
	if (!filePath.startsWith(WEB_ROOT)) {
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
				? "cmd"
				: "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	try {
		spawn(command, args, { stdio: "ignore", detached: true }).unref();
	} catch {
		// Headless environment; the user can open the URL manually.
	}
}
