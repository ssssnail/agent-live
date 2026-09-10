/** Hard local-renderer limits. Presets may recommend fewer items. */
export declare const SCENE_LIMITS: Readonly<{
    agents: 16;
    seats: 8;
    npcs: 12;
    props: 80;
    animatedProps: 24;
    activities: 16;
    effects: 40;
    visibleBubbles: 4;
    queuedBubbles: 8;
}>;
export type SceneLimitKey = keyof typeof SCENE_LIMITS;
export declare function withinSceneLimit(kind: SceneLimitKey, count: number): boolean;
