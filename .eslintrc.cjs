/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-hooks', 'security'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:security/recommended-legacy',
  ],
  ignorePatterns: ['dist', 'node_modules', 'public/mockServiceWorker.js', '*.cjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // Rendering anything as HTML is forbidden in this codebase; JSX escaping is
    // the defence against user-controlled notes and display names.
    'no-restricted-properties': [
      'error',
      {
        object: 'window',
        property: 'eval',
        message: 'eval is not permitted.',
      },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
        message: 'dangerouslySetInnerHTML is forbidden — render user content as text.',
      },
      {
        selector:
          'CallExpression[callee.object.name=/^(localStorage|sessionStorage)$/]',
        message: 'Tokens and session data must never touch web storage.',
      },
    ],
    // Fixture and mock generators use non-crypto randomness by design.
    'security/detect-object-injection': 'off',
    'security/detect-non-literal-fs-filename': 'off',
  },
};
