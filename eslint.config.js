import js from "@eslint/js";
import {
  configureVueProject,
  defineConfigWithVueTs,
  vueTsConfigs,
} from "@vue/eslint-config-typescript";
import prettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

configureVueProject({ rootDir: import.meta.dirname });

export default defineConfigWithVueTs(
  { ignores: ["**/node_modules/", "**/dist/", "**/coverage/", "quake/", "**/drizzle/migrations/"] },
  js.configs.recommended,
  pluginVue.configs["flat/recommended"],
  vueTsConfigs.strictTypeChecked,
  vueTsConfigs.stylisticTypeChecked,
  { languageOptions: { globals: globals.node } },
  { files: ["apps/web/**/*.{ts,vue}"], languageOptions: { globals: globals.browser } },
  { files: ["**/test/**"], rules: { "vue/one-component-per-file": "off" } },
  { files: ["**/*.js"], ...tseslint.configs.disableTypeChecked },
  prettier,
);
