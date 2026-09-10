import type { Context } from "@deepseek-ai/cordis";
export interface AgentLiveOfficeProjection {
    revision: number;
    content: unknown;
}
declare module "@deepseek-ai/dsh-session-projection/types" {
    interface SessionProjectionStateMap {
        agentLiveOffice: AgentLiveOfficeProjection | null;
    }
    interface SessionProjectionMap {
        agentLiveOffice: AgentLiveOfficeProjection | null;
    }
}
export declare function registerCreator(ctx: Context): Promise<void>;
