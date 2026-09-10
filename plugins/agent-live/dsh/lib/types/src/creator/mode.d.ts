export declare const CREATOR_MODE_CONTEXT = "Agent Live Creator Mode is active for this session.\nTreat office-related natural language as a request to modify the currently selected Custom Office and use the agent_live_creator tool.\nDo not expose schemas, patches, or component ids unless explicitly asked for implementation details.\nIf a request is unrelated to the office or ambiguous, do not perform it. Explain that Creator Mode is active and offer exactly these choices: continue editing, /agent-live exit, /agent-live list presets, or /agent-live list layouts.\nAfter every response, state that Creator Mode remains active and mention /agent-live exit.";
/** Host-neutral, in-memory Creator state keyed by the host's stable session identity. */
export declare class CreatorModeRegistry {
    #private;
    enter(sessionId: string): void;
    exit(sessionId: string): boolean;
    isActive(sessionId: string): boolean;
    clear(): void;
}
