import type { OfficeEvent } from "../../core/protocol.ts";
export interface DshMessageRecord {
    key: string;
    kind: "user" | "assistant" | "turn-error";
    text?: string;
    at: number;
    tokens?: number;
}
export interface DshToolRecord {
    callId: string;
    name: string;
    args: Record<string, unknown>;
    at: number;
    running: boolean;
    ok?: boolean;
}
export interface DshChildRecord {
    id: string;
    name: string;
    task?: string;
    running: boolean;
}
export interface DshObservation {
    sessionId: string;
    running: boolean;
    turns: number;
    model?: string;
    thinkingLevel?: string;
    tokens?: number;
    messages: readonly DshMessageRecord[];
    tools: readonly DshToolRecord[];
    children: readonly DshChildRecord[];
}
/** Stateful diff cursor over DSH's already-deduplicated public client snapshots. */
export declare class DshSnapshotAdapter {
    private static readonly SEEN_LIMIT;
    private readonly startedAt;
    private initialized;
    private previousSession;
    private previousSessionView;
    private previousState;
    private previousTokens;
    private readonly seenMessages;
    private readonly seenTools;
    private readonly activeTools;
    private readonly visibleChildren;
    constructor(now?: number);
    update(input: DshObservation): OfficeEvent[];
    private trimSeen;
    private bootstrap;
    private syncChildren;
    private childView;
}
