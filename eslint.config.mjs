import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";
import security from "eslint-plugin-security";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  security.configs.recommended,
  // UI strings live in messages/en.json (next-intl): reject literal JSX text (attributes such as name or htmlFor are not UI text).
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/**/*.test.tsx", "src/components/ui/**"],
    ...i18next.configs["flat/recommended"],
    rules: {
      "i18next/no-literal-string": ["error", { mode: "jsx-text-only" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    "coverage/**",
    ".stryker-tmp/**",
    "reports/**",
    "spikes/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
