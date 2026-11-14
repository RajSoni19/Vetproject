import {defineConfig,globalIgnores} from "eslint/config";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import nextPlugin from "@next/eslint-plugin-next";

const nextRequire=createRequire(fileURLToPath(import.meta.resolve("eslint-config-next/core-web-vitals")));
const reactHooks=nextRequire("eslint-plugin-react-hooks");

export default defineConfig([
  {
    files:["**/*.{js,jsx,cjs,mjs}"],
    plugins:{"@next/next":nextPlugin,"react-hooks":reactHooks},
    languageOptions:{parserOptions:{ecmaVersion:"latest",sourceType:"module",ecmaFeatures:{jsx:true}}},
    rules:{
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
  {
    files:["scripts/**/*.{js,jsx,cjs,mjs}","tests/**/*.{js,jsx,cjs,mjs}"],
    rules:{"@next/next/no-assign-module-variable":"off"},
  },
  globalIgnores([".next/**","out/**","build/**","coverage/**",".recovery/**",".master-stage-b/**","next-env.d.ts"]),
]);
