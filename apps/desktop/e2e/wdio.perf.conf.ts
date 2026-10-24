import { baseConfig } from "./wdio.base";

/** `pnpm perf:cold-start`'s first step: the signed-in session the launches start from. */
export const config = baseConfig(["./perf/session.e2e.ts"], 180_000);
