/** Hard local-renderer limits. Presets may recommend fewer items. */
export const SCENE_LIMITS = Object.freeze({
	agents: 16,
	seats: 8,
	npcs: 12,
	props: 80,
	animatedProps: 24,
	activities: 16,
	effects: 40,
	visibleBubbles: 4,
	queuedBubbles: 8,
});

export type SceneLimitKey = keyof typeof SCENE_LIMITS;

export function withinSceneLimit(kind: SceneLimitKey, count: number): boolean {
	return Number.isInteger(count) && count >= 0 && count <= SCENE_LIMITS[kind];
}
