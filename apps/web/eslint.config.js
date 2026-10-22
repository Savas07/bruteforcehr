// @ts-check
import astro from "eslint-plugin-astro";
import globals from "globals";
import root from "../../eslint.config.js";

export default [
  ...root,
  ...astro.configs.recommended,
  {
    files: ["src/**/*.astro"],
    languageOptions: { globals: { ...globals.browser } },
  },
];
