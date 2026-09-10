import type { OfficeAction } from "./protocol.ts";
export declare function isDelegationTool(toolName: string): boolean;
export declare function actionForTool(toolName: string): OfficeAction;
/** Human-readable one-liner shown in the speech bubble and the activity log. */
export declare function labelForTool(toolName: string, args?: Record<string, any>): string;
export interface DelegatedTask {
    agent: string;
    task: string;
    /** Index used to build a stable child id for parallel/chained runs. */
    slot: number;
}
/**
 * Normalises the shapes the subagent tool accepts (single / parallel / chain)
 * into a flat list of workers to bring into the office.
 */
export declare function describeDelegation(args?: Record<string, any>): DelegatedTask[];
