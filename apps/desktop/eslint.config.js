// @ts-check
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import root from "../../eslint.config.js";

export default [
  { ignores: ["release/**"] },
  ...root,
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat["recommended-latest"],
    languageOptions: { globals: { ...globals.browser } },
  },
];
