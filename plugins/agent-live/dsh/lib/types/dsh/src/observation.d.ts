import type { SessionListState } from "@deepseek-ai/dsh-api-session-controller/client";
import type { ChatSnapshot } from "@deepseek-ai/dsh-client-ui-chat/client";
import type { DshObservation } from "./adapter.ts";
export declare function projectedTokenCount(value: unknown): number | undefined;
export declare function buildObservation(input: {
    sessionId: string;
    running: boolean;
    chat?: ChatSnapshot;
    model?: {
        model: string;
        reasoningEffort?: string;
    } | null;
    tokens?: number;
    childCatalog: readonly {
        id: unknown;
        label?: string;
    }[];
    childActivity: ReadonlyMap<string, boolean>;
    summaries: SessionListState["byId"];
}): DshObservation;
