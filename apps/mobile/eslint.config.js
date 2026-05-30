const expoFlat = require('eslint-config-expo/flat')

module.exports = [
  ...expoFlat,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/array-type': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    ignores: ['.expo/', 'node_modules/', 'dist/'],
  },
]
