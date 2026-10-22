import { baseConfig } from "./wdio.base";

/** `pnpm capture:app:design`: the design build in the real app (build with `pnpm build:e2e:design`). */
export const config = baseConfig(["./capture/capture-design.e2e.ts"], 1_800_000);
