import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    'data/**',
    'backups/**',
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
    'apps/server/drizzle/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    // Feature modules co-locate small hooks/helpers with their components, so the
    // react-refresh "only export components" rule is intentionally not enabled.
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // Tests read loosely-typed JSON responses; `any` keeps them readable.
    files: ['**/test/**/*.ts', '**/*.test.{ts,tsx}', 'e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },
  {
    files: ['apps/server/**/*.{ts,mjs}', 'packages/**/*.ts', 'scripts/**/*.mjs', 'e2e/**/*.ts', '*.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
]);
