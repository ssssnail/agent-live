import { type SchemaIssue } from "./schema.ts";
export interface ComponentLibraryView {
    descriptors: {
        styles: any[];
        layouts: any[];
        agentSkins: any[];
        atmospheres: any[];
        environments: any[];
    };
    styles: Set<string>;
    layouts: Map<string, any>;
    agentSkins: Set<string>;
    props: Map<string, any>;
    npcTemplates: Map<string, any>;
    agentProfileTemplates: Map<string, any>;
    activityRecipes: Map<string, any>;
    activityImplementations: Map<string, any>;
    atmospheres: Set<string>;
    environments: Set<string>;
    defaultNpcTemplate: string;
    npcProfilePolicy: {
        selection: string;
        seedFrom: string;
        persistResolvedProfile: boolean;
    };
}
export interface ValidationIssue extends SchemaIssue {
    code: string;
}
export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
}
export declare function validateOfficeSpec(spec: unknown, library: ComponentLibraryView): ValidationResult;
