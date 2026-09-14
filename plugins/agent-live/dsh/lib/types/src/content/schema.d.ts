export declare const OFFICE_SPEC_SCHEMA_VERSION: 1;
export declare const GENDER_VALUES: readonly ["female", "male", "nonbinary", "unspecified"];
export declare const POSE_VALUES: readonly ["stand", "sit"];
export declare const ORIENTATION_VALUES: readonly ["horizontal", "vertical"];
export declare const WEATHER_VALUES: readonly ["clear", "cloudy", "rain", "snow"];
export declare const OFFICE_SPEC_DEFAULTS: Readonly<{
    style: "builtin/pixel-classic";
    agentSkin: "builtin/tiny-developers";
    atmosphere: "builtin/default-atmosphere";
    environment: "builtin/local-office-environment";
    agentProfile: Readonly<{
        template: "builtin/host-agent";
    }>;
    placements: readonly never[];
    npcs: readonly never[];
    activities: readonly never[];
}>;
export type Gender = (typeof GENDER_VALUES)[number];
export type NpcPose = (typeof POSE_VALUES)[number];
export type PropOrientation = (typeof ORIENTATION_VALUES)[number];
export type Weather = (typeof WEATHER_VALUES)[number];
export interface Shift {
    start: string;
    end: string;
    /** Optional latest departure; each NPC gets a stable daily time in the range. */
    endLatest?: string;
}
export interface Appearance {
    skin?: string;
    hair?: string;
    shirt?: string;
    trim?: string;
    badge?: string;
}
export interface OfficePlacement {
    id: string;
    component: string;
    slot: string;
    orientation?: PropOrientation;
}
export interface OfficeNpc {
    id: string;
    template?: string;
    profile?: string;
    name?: string;
    title?: string;
    gender?: Gender;
    appearance?: Appearance;
    spawn?: string;
    shift?: Shift;
    pose?: NpcPose;
}
export interface AgentProfile {
    template: string;
    name?: string;
    title?: string;
    appearance?: Appearance;
}
export interface EnvironmentOverrides {
    clock?: {
        mode: "local" | "fixed";
        fixedTime?: string;
    };
    weather?: {
        fallback: Weather;
    };
    lighting?: {
        auto: boolean;
    };
    npcSchedule?: {
        defaultShift?: Shift;
        roleOverrides?: Record<string, Shift>;
    };
}
export interface OfficeSpec {
    schemaVersion: typeof OFFICE_SPEC_SCHEMA_VERSION;
    kind: "office-spec";
    id: string;
    name: string;
    origin: "official" | "custom";
    basePreset?: string;
    layout: string;
    style: string;
    agentSkin: string;
    placements: OfficePlacement[];
    npcs: OfficeNpc[];
    activities: string[];
    atmosphere: string;
    environment: string;
    agentProfile?: AgentProfile;
    environmentOverrides?: EnvironmentOverrides;
    /** Plain text for named, fixed display areas; empty text hides an area. */
    texts?: Record<string, string>;
}
export interface OfficePatch {
    schemaVersion: typeof OFFICE_SPEC_SCHEMA_VERSION;
    kind: "office-patch";
    id?: string;
    base: string;
    name?: string;
    components?: {
        style?: string;
        agentSkin?: string;
        atmosphere?: string;
        environment?: string;
    };
    placements?: {
        upsert?: OfficePlacement[];
        remove?: string[];
    };
    npcs?: {
        upsert?: OfficeNpc[];
        remove?: string[];
    };
    activities?: {
        enable?: string[];
        disable?: string[];
    };
    environmentOverrides?: EnvironmentOverrides | null;
    agentProfile?: AgentProfile | null;
    texts?: Record<string, string> | null;
}
export interface OfficeSeed {
    schemaVersion: typeof OFFICE_SPEC_SCHEMA_VERSION;
    kind: "office-seed";
    id: string;
    name: string;
    layout: string;
    style?: string;
    agentSkin?: string;
    atmosphere?: string;
    environment?: string;
    agentProfile?: AgentProfile;
}
export interface SchemaIssue {
    path: string;
    message: string;
}
export declare function validateOfficeSpecShape(input: unknown): SchemaIssue[];
export declare function validateOfficePatchShape(input: unknown): SchemaIssue[];
export declare function validateOfficeSeedShape(input: unknown): SchemaIssue[];
