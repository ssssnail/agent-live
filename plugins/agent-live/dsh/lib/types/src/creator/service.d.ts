import type { OfficeSpec } from "../content/schema.ts";
import type { ComponentLibraryView } from "../content/validator.ts";
import { OfficeRegistry } from "../content/registry.ts";
export declare const COMPONENT_CATEGORIES: readonly ["summary", "room", "npcs", "props", "activities", "appearance", "environment", "all"];
export type ComponentCategory = typeof COMPONENT_CATEGORIES[number];
export declare class CreatorService {
    #private;
    constructor(registry: OfficeRegistry, library: ComponentLibraryView);
    listOffices(): Promise<import("../content/registry.ts").RegistryEntry[]>;
    selectOffice(id: string): Promise<{
        selected: false;
        error: string;
        office?: undefined;
    } | {
        selected: true;
        office: OfficeSpec;
        error?: undefined;
    }>;
    resetAllData(): Promise<{
        reset: true;
        selectedOffice: string;
    }>;
    /**
     * Capabilities the model may map a request onto. `room` describes the room of
     * the currently selected Office only — zones, placement slots and NPC spawns —
     * because "add a plant" or "put a water cooler in the lounge" is only reliable
     * when the model can see what this Office actually offers. Rooms are never
     * presented as a choice.
     */
    listComponents(category?: ComponentCategory): Promise<{
        room: {
            name: any;
            zones: any;
            slots: any;
            npcSpawns: any;
            textSlots: any;
            placements: {
                orientation?: "horizontal" | "vertical" | undefined;
                id: string;
                component: string;
                slot: string;
            }[];
        } | null;
        styles: any[];
        agentSkins: any[];
        props: any[];
        npcTemplates: any[];
        agentProfileTemplates: any[];
        activities: any[];
        atmospheres: any[];
        environments: any[];
    } | {
        room: {
            name: any;
            zones: any;
            slots: any;
            npcSpawns: any;
            textSlots: any;
            placements: {
                orientation?: "horizontal" | "vertical" | undefined;
                id: string;
                component: string;
                slot: string;
            }[];
        } | null;
        npcTemplates?: undefined;
        props?: undefined;
        activities?: undefined;
        styles?: undefined;
        agentSkins?: undefined;
        agentProfileTemplates?: undefined;
        atmospheres?: undefined;
        environments?: undefined;
        office?: undefined;
        counts?: undefined;
        categories?: undefined;
    } | {
        npcTemplates: any[];
        room?: undefined;
        props?: undefined;
        activities?: undefined;
        styles?: undefined;
        agentSkins?: undefined;
        agentProfileTemplates?: undefined;
        atmospheres?: undefined;
        environments?: undefined;
        office?: undefined;
        counts?: undefined;
        categories?: undefined;
    } | {
        room: {
            name: any;
            zones: any;
            slots: any;
            npcSpawns: any;
            textSlots: any;
            placements: {
                orientation?: "horizontal" | "vertical" | undefined;
                id: string;
                component: string;
                slot: string;
            }[];
        } | null;
        props: any[];
        npcTemplates?: undefined;
        activities?: undefined;
        styles?: undefined;
        agentSkins?: undefined;
        agentProfileTemplates?: undefined;
        atmospheres?: undefined;
        environments?: undefined;
        office?: undefined;
        counts?: undefined;
        categories?: undefined;
    } | {
        activities: any[];
        room?: undefined;
        npcTemplates?: undefined;
        props?: undefined;
        styles?: undefined;
        agentSkins?: undefined;
        agentProfileTemplates?: undefined;
        atmospheres?: undefined;
        environments?: undefined;
        office?: undefined;
        counts?: undefined;
        categories?: undefined;
    } | {
        styles: any[];
        agentSkins: any[];
        agentProfileTemplates: any[];
        room?: undefined;
        npcTemplates?: undefined;
        props?: undefined;
        activities?: undefined;
        atmospheres?: undefined;
        environments?: undefined;
        office?: undefined;
        counts?: undefined;
        categories?: undefined;
    } | {
        atmospheres: any[];
        environments: any[];
        room?: undefined;
        npcTemplates?: undefined;
        props?: undefined;
        activities?: undefined;
        styles?: undefined;
        agentSkins?: undefined;
        agentProfileTemplates?: undefined;
        office?: undefined;
        counts?: undefined;
        categories?: undefined;
    } | {
        office: {
            id: string;
            name: string;
            origin: "official" | "custom";
            agentProfile: import("../content/schema.ts").AgentProfile | null;
            texts: Record<string, string>;
            npcs: {
                id: string;
                template: string | undefined;
                name: string | undefined;
                title: string | undefined;
                gender: "female" | "male" | "nonbinary" | "unspecified" | undefined;
                spawn: string | undefined;
            }[];
        };
        counts: {
            styles: number;
            agentSkins: number;
            props: number;
            npcTemplates: number;
            activities: number;
            atmospheres: number;
            environments: number;
        };
        categories: ("npcs" | "props" | "activities" | "environment" | "appearance" | "room" | "all")[];
        room?: undefined;
        npcTemplates?: undefined;
        props?: undefined;
        activities?: undefined;
        styles?: undefined;
        agentSkins?: undefined;
        agentProfileTemplates?: undefined;
        atmospheres?: undefined;
        environments?: undefined;
    }>;
    /** Validate, persist and select one customization without exposing draft state. */
    customize(patchInput: unknown, baseOffice?: string): Promise<{
        saved: boolean;
        errors: import("../content/validator.ts").ValidationIssue[];
        adjustments: import("../content/compiler.ts").CompileAdjustment[];
        office?: undefined;
    } | {
        saved: boolean;
        office: OfficeSpec;
        errors: never[];
        adjustments: import("../content/compiler.ts").CompileAdjustment[];
    }>;
}
