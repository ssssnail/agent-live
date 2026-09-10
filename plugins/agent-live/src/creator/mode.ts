export const CREATOR_MODE_CONTEXT = `Agent Live Creator Mode is active for this session.
Treat office-related natural language as a request to modify the currently selected Custom Office and use the agent_live_creator tool.
Do not expose schemas, patches, or component ids unless explicitly asked for implementation details.
If a request is unrelated to the office or ambiguous, do not perform it. Explain that Creator Mode is active and offer exactly these choices: continue editing, /agent-live exit, /agent-live list presets, or /agent-live list layouts.
After every response, state that Creator Mode remains active and mention /agent-live exit.`;

/** Host-neutral, in-memory Creator state keyed by the host's stable session identity. */
export class CreatorModeRegistry {
	readonly #sessions = new Set<string>();

	enter(sessionId: string): void {
		if (!sessionId) throw new TypeError("Creator Mode requires a session id");
		this.#sessions.add(sessionId);
	}

	exit(sessionId: string): boolean { return this.#sessions.delete(sessionId); }

	isActive(sessionId: string): boolean { return this.#sessions.has(sessionId); }

	clear(): void { this.#sessions.clear(); }
}
