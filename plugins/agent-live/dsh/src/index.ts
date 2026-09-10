import type { Context } from "@deepseek-ai/cordis";
import { registerCreator } from "./creator.ts";

export const inject = ["commands", "sessions", "sessionProjections", "skills", "systemPrompt", "tools"];

/** Register the native view's bounded Creator capabilities in the DSH Host. */
export async function apply(ctx: Context): Promise<void> {
  await registerCreator(ctx);
}
