import { type OfficeSpec } from "./schema.ts";
import { type ComponentLibraryView, type ValidationIssue } from "./validator.ts";
export interface CompileAdjustment {
    code: string;
    path: string;
    message: string;
}
export interface CompileResult {
    draft?: OfficeSpec;
    errors: ValidationIssue[];
    adjustments: CompileAdjustment[];
}
/** The common compilation gate used by both Official and Custom Office Specs. */
export declare function compileOfficeSpec(input: unknown, library: ComponentLibraryView): CompileResult;
/** Creates the smallest valid custom office around a registered Layout Template. */
export declare function compileOfficeSeed(input: unknown, library: ComponentLibraryView): CompileResult;
export declare function compileOfficePatch(base: OfficeSpec, patchInput: unknown, library: ComponentLibraryView): CompileResult;
