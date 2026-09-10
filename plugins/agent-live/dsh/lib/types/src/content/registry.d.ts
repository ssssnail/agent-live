import { EventEmitter } from "node:events";
import type { OfficeSpec } from "./schema.ts";
import { type ComponentLibraryView, type ValidationIssue } from "./validator.ts";
export interface RegistryEntry {
    id: string;
    name: string;
    origin: "official" | "custom";
    selected: boolean;
}
export interface SaveResult {
    saved: boolean;
    issues: ValidationIssue[];
}
export interface OfficeRegistryOptions {
    root: string;
    library: ComponentLibraryView;
    officialOffices: OfficeSpec[];
    fallbackOffice?: string;
}
export declare class OfficeRegistry {
    #private;
    readonly root: string;
    constructor(options: OfficeRegistryOptions);
    onChange(listener: (id: string | undefined) => void): () => EventEmitter<[never]>;
    initialize(): Promise<void>;
    list(): Promise<RegistryEntry[]>;
    get(id: string): Promise<OfficeSpec | undefined>;
    save(spec: OfficeSpec): Promise<SaveResult>;
    remove(id: string): Promise<boolean>;
    select(id: string): Promise<void>;
    selectedId(): Promise<string>;
    selected(): Promise<OfficeSpec>;
}
