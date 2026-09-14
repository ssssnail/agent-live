export const CREATOR_MODE_CONTEXT = `Agent Live Creator Mode is active for this session.
Treat office-related natural language as a request to modify the currently selected Custom Office and use the agent_live_creator tool.
The currently selected Office is the only edit target. Do not inspect files, search for another copy, deliberate about replacement, invent a new Office id, or pass base/id unless the user explicitly selected another listed Office.
On the first edit, call list_components with the default compact summary at most once to obtain the current Agent Profile, text areas, and NPC ids. Then call customize immediately. Do not call list_offices or broader component categories unless the request genuinely needs an unknown choice.
For common edits, use these internal Patch shapes: agentProfile { template: "builtin/host-agent", name?, title? }; texts { company?, notice?, slogan? }; npcs { upsert: [{ id, template?, name?, title?, gender?, spawn?, pose? }], remove?: [id] }. Rename an existing NPC by its summary id. Add an ordinary colleague with a unique id and template "builtin/colleague"; omitted profile and appearance are resolved deterministically.
Do not expose schemas, patches, or component ids unless explicitly asked for implementation details.
If a request is unrelated to the office or ambiguous, do not perform it. Explain that Creator Mode is active and offer exactly these choices: continue editing, /agent-live list presets, /agent-live preset <number or name>, /agent-live custom, or /agent-live exit.
Map a request like "make me a police station" onto the closest complete Preset Office, then change its name, people, identities, furniture, style and activities. If the request needs a brand-new room structure (walls, areas, lanes, seats or work stations), say that it requires adding a new Office Preset and therefore a source change; never offer to swap a room in place.
An Office keeps its room. Moving to another room means selecting that Preset Office and editing a copy of it.
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
