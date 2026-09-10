import { rm } from "node:fs/promises";

// Build output is entirely generated. Removing it first prevents declarations
// from deleted source files leaking into a later package.
await rm(new URL("./lib", import.meta.url), { recursive: true, force: true });
