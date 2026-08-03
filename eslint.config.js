import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Pre-existing countdown/validation effects call setState synchronously;
      // refactoring them is tracked work, not a lint-introduction blocker.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
);
