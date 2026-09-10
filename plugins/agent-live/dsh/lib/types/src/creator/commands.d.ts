import { CreatorService } from "./service.ts";
type CommandResult = {
    ok: true;
    data: unknown;
    adjustments?: unknown[];
} | {
    ok: false;
    error: string;
    issues?: unknown[];
    adjustments?: unknown[];
};
/** Closed command surface used by every host integration; it never executes arbitrary code or paths. */
export declare class CreatorCommandRouter {
    #private;
    constructor(creator: CreatorService);
    execute(value: unknown): Promise<CommandResult>;
}
export {};
