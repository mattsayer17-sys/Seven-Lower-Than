const globals = require('globals');
module.exports = [
  {
    files: ['src/ui/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, claude: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-redeclare': 'error', 'no-const-assign': 'error', 'no-dupe-keys': 'error' },
  },
];
