import { loadComponentLibrary } from "../content/library.ts";
import { OfficeRegistry } from "../content/registry.ts";
export declare class OfficeContentService {
    #private;
    readonly registry: OfficeRegistry;
    readonly library: Awaited<ReturnType<typeof loadComponentLibrary>>;
    private constructor();
    static create(options?: {
        dataRoot?: string;
        contentRoot?: string;
    }): Promise<OfficeContentService>;
    list(): Promise<import("../content/registry.ts").RegistryEntry[]>;
    resolve(id?: string): Promise<{
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
                gender?: import("../content/schema.ts").Gender;
                appearance?: import("../content/schema.ts").Appearance;
                spawn?: string;
                shift?: import("../content/schema.ts").Shift;
                pose?: import("../content/schema.ts").NpcPose;
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
    subscribe(listener: (change: unknown) => void): () => import("events")<[never]>;
}
