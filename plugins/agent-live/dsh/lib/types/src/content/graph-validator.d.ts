/**
 * Structural rules for a renderable content graph — the single source of truth.
 *
 * Two consumers share this module:
 *  - the browser imports the generated `web/v2/graph-validator.js`
 *    (see `tsconfig.web-validator.json` and `scripts/web-validator.mjs`);
 *  - the local server imports the TypeScript module directly, so the same rules
 *    gate saving an Office Spec and serving `/api/office-content`.
 *
 * Keep this file dependency-free, platform-neutral, and side-effect-free: it is
 * compiled for the browser and bundled into every host integration.
 */
/** Capabilities every layout must expose as a walkable work station. */
export declare const WORK_CAPABILITIES: readonly ["research", "create", "compute", "plan", "communicate", "collaborate"];
/** Renderer-resolved destinations that deliberately do not belong to a layout. */
export declare const DYNAMIC_ACTIVITY_TARGETS: Set<string>;
export interface ContentIssue {
    code: string;
    path: string;
    message: string;
}
/**
 * What an activity needs to be staged: a named prop instance, or a capability
 * any matching prop type can provide. The named form is the legacy syntax;
 * capability requirements let the same implementation be reused across layouts
 * and stop a prop swap from satisfying an activity by id alone.
 */
export type ActivityRequirement = string | {
    prop: string;
} | {
    capability: string;
};
export interface ResolvedRequirements {
    /** Resolved instance id per requirement, aligned by index; null when unresolved. */
    bindings: (string | null)[];
    issues: ContentIssue[];
}
/**
 * Resolves activity requirements against the props actually present, so both
 * syntaxes stay valid while content migrates.
 */
export declare function resolveActivityRequirements(requires: readonly unknown[] | undefined, instances: Iterable<readonly [string, string]>, capabilitiesOf: (type: string) => readonly string[], activity: string): ResolvedRequirements;
export declare function assertManifest(value: unknown, kind: string): void;
/**
 * Layout structure rules. `propTypeNames` are the type names a layout may
 * reference; the library stores props namespaced while the rendered graph does
 * not, so both callers normalize before calling.
 */
export declare function layoutIssues(layout: any, propTypeNames: Iterable<string>): ContentIssue[];
/** Every reason the browser would refuse to render this resolved content graph. */
export declare function graphIssues(content: any): ContentIssue[];
/** Browser entry point: refuse the first structural problem, exactly as rendered. */
export declare function validateRegistry(content: unknown): void;
/** Server entry point: report every problem at once for the Creator surface. */
export declare function graphIssueMessages(content: unknown): string[];
