import { baseConfig } from "./wdio.base";

export const config = baseConfig(["./specs/**/*.e2e.ts"], 180_000);
