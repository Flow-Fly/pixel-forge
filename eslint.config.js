import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Local source edges belong to Fallow. These rules cover package specifiers
// and reject destinations that cannot be checked statically.
function runtimeImports(files, name, packages, node = false) {
  const escaped = packages.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const allowed = `^(?:\\.\\.?/|${node ? 'node:|' : ''}${escaped.length ? `(?:${escaped.join('|')})(?:/|$)` : '(?!)'})`;
  const forbidden = `^(?!${allowed.slice(1)})`;
  const message = `${name} imports must follow its runtime package contract.`;
  return {
    files,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: forbidden, message }] }],
      'no-restricted-syntax': [
        'error',
        {
          selector: `ImportExpression[source.type='Literal'][source.value=/${forbidden.replaceAll('/', '\\/')}/]`,
          message,
        },
        {
          selector: "ImportExpression[source.type!='Literal']",
          message: `${name} computed imports cannot establish a runtime destination.`,
        },
      ],
    },
  };
}

export default tseslint.config(
  runtimeImports(['src/**/*.ts'], 'Browser', [
    '@pixel-forge/shared',
    '@lit-labs/signals',
    '@sentry/browser',
    'idb',
    'lit',
    'pako',
    'uuid',
    'virtual:pwa-register',
  ]),
  runtimeImports(['shared/src/**/*.ts'], 'Shared', []),
  runtimeImports(
    ['server/src/**/*.ts'],
    'Server',
    [
      '@pixel-forge/shared',
      '@aws-sdk/client-s3',
      '@hono/node-server',
      'drizzle-orm',
      'hono',
      'postgres',
    ],
    true
  ),
  runtimeImports(['workers/telemetry/src/**/*.ts'], 'Worker', ['@pixel-forge/shared']),
  runtimeImports(['scripts/**/*.{mjs,js,ts}'], 'Tooling', ['@pixel-forge/shared'], true),
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // tsc already enforces noUnusedLocals/noUnusedParameters with the
      // underscore convention; mirror that here instead of double-reporting.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The codebase has a handful of deliberate `any`s (tracked in #71);
      // keep them visible as warnings without failing CI.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
      },
    },
  }
);
