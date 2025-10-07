import { configs } from "@sundaeswap/eslint-config";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...configs,
  {
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "no-use-before-define": "off",
    },
    languageOptions: {
      globals: {
        JSX: true,
        EventListenerOptions: true,
        EventListenerOrEventListenerObject: true,
        ...globals.browser,
        ...globals.node,
      },
    },
  },
];

export default config;
