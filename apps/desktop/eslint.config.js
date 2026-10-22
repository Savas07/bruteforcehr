// @ts-check
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import root from "../../eslint.config.js";

export default [
  { ignores: ["src-tauri/**"] },
  ...root,
  {
    files: ["src/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat["recommended-latest"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["e2e/**/*.ts"],
    languageOptions: { globals: { ...globals.mocha } },
  },
];
