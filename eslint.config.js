// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'coverage/*', 'supabase/functions/*', '.expo/*'],
  },
  {
    rules: {
      'no-console': 'warn',
    },
  },
  {
    files: ['src/utils/logger.ts', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['tests/**'],
    rules: {
      // jest.mock factories must use require().
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
