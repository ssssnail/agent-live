import type { OfficeSpec } from "../content/schema.ts";
import type { ComponentLibraryView } from "../content/validator.ts";
import { OfficeRegistry } from "../content/registry.ts";
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
    /**
     * Capabilities the model may map a request onto. `room` describes the room of
     * the currently selected Office only — zones, placement slots and NPC spawns —
     * because "add a plant" or "put a water cooler in the lounge" is only reliable
     * when the model can see what this Office actually offers. Rooms are never
     * presented as a choice.
     */
    listComponents(): Promise<{
        room: {
            name: any;
            zones: any;
            slots: any;
            npcSpawns: any;
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
