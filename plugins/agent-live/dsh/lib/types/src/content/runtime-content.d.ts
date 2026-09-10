import type { OfficeSpec } from "./schema.ts";
import type { ComponentLibraryView } from "./validator.ts";
/** Compiles a validated Office Spec into the renderer's current in-memory content graph. */
export declare function resolveRuntimeContent(spec: OfficeSpec, contentRoot: string, library: ComponentLibraryView): Promise<{
    preset: Record<string, unknown>;
    style: any;
    layout: any;
    agentSkin: any;
    agentProfile: {
        appearance: any;
        title?: string | undefined;
        name?: string | undefined;
        template: any;
    };
    props: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        contract: string;
        types: {
            [k: string]: {
                size: any;
                capabilities: any;
                renderer: any;
            };
        };
    };
    npcs: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        contract: string;
        entries: {
            role: any;
            id: string;
            template?: string;
            profile?: string;
            name?: string;
            title?: string;
            gender?: import("./schema.ts").Gender;
            appearance?: import("./schema.ts").Appearance;
            spawn?: string;
            shift?: import("./schema.ts").Shift;
            pose?: import("./schema.ts").NpcPose;
        }[];
    };
    lifeActivities: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        contract: string;
        entries: any[];
    };
    atmosphere: any;
    environment: any;
}>;
