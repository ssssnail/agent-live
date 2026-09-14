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
/**
 * Creates the smallest valid custom office around a registered room.
 * Internal primitive: Creator never starts from an empty room, it edits the
 * Preset Office that already owns the room (see CreatorService.customize).
 */
export declare function compileOfficeSeed(input: unknown, library: ComponentLibraryView): CompileResult;
/**
 * The id a patch targets when it does not name one: a Custom Office keeps its
 * identity, a Preset Office is copied into its single editable local Office.
 */
export declare function patchOfficeId(base: OfficeSpec): string;
export declare function compileOfficePatch(base: OfficeSpec, patchInput: unknown, library: ComponentLibraryView): CompileResult;
