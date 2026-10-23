import pkg from "../package.json" with { type: "json" };

/** Printed in `<meta name="generator">`; read from package.json so version bumps never drift. */
export const CV_RENDER_VERSION: string = pkg.version;
