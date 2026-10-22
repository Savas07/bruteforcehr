import { baseConfig } from "./wdio.base";

/** `pnpm capture`: screenshots for design critique (docs/BRIEF.md §5.5). */
export const config = baseConfig(["./capture/capture.e2e.ts"], 600_000);
