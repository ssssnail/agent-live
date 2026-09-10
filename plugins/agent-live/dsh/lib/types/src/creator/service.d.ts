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
        office: import("../content/schema.ts").OfficeSpec;
        error?: undefined;
    }>;
    createFromLayout(layout: string, name: string): Promise<{
        saved: true;
        office: import("../content/schema.ts").OfficeSpec;
        errors?: undefined;
    } | {
        saved: false;
        errors: import("../content/validator.ts").ValidationIssue[];
        office?: undefined;
    }>;
    listComponents(): {
        layouts: any[];
        styles: any[];
        agentSkins: any[];
        props: any[];
        npcTemplates: any[];
        agentProfileTemplates: any[];
        activities: any[];
        atmospheres: any[];
        environments: any[];
    };
    /** Validate, persist and select one customization without exposing draft state. */
    customize(patchInput: unknown, baseOffice?: string): Promise<{
        saved: boolean;
        errors: import("../content/validator.ts").ValidationIssue[];
        adjustments: import("../content/compiler.ts").CompileAdjustment[];
        office?: undefined;
    } | {
        saved: boolean;
        office: import("../content/schema.ts").OfficeSpec;
        errors: never[];
        adjustments: import("../content/compiler.ts").CompileAdjustment[];
    }>;
}
