// Shared ESLint 9 flat config for the React packages (admin web, mobile):
// the TypeScript base plus the rules of hooks.
const reactHooks = require('eslint-plugin-react-hooks');

const base = require('./index.js');

module.exports = [
  ...base,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
