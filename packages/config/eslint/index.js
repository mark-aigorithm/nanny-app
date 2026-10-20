// Shared ESLint 9 flat config for the TypeScript packages (backend, shared).
// Each package's eslint.config.cjs re-exports this (or ./native.js for React).
//
// typescript-eslint's recommended rules without type information (fast, no
// tsconfig wiring), then eslint-config-prettier last so formatting is left to
// Prettier. The codebase's own conventions on top: no `any`, `import type`
// for type-only imports, and an unused variable is an error unless it starts
// with an underscore. console.warn/error are the server's logs (Vercel keeps
// them); a stray console.log warns, and the deliberate ones carry an
// eslint-disable line.
//
// Each package lints itself whole (`eslint .`): app code, tests, E2E flows and
// tooling config. Build output, native projects and generated files are
// ignored below.
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettier = require('eslint-config-prettier');

const TS_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

module.exports = [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/expo-env.d.ts',
    ],
  },
  ...tsPlugin.configs['flat/recommended'].map((entry) => ({ files: TS_FILES, ...entry })),
  {
    files: TS_FILES,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // `typeof import('x')` stays allowed: jest.requireActual needs it.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Tests, E2E drivers, seeds, scripts, tooling config and the web-preview
    // stubs talk to the terminal.
    files: [
      '**/__tests__/**',
      '**/__integration__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/test/**',
      '**/e2e/**',
      '**/scripts/**',
      '**/prisma/**',
      '**/src/mocks/*-web.tsx',
      '**/*.config.{ts,js,cjs,mjs}',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    // jest.mock factories are hoisted above imports, so they have to require().
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
];
