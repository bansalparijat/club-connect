module.exports = {
  extends: ['expo'],
  rules: {
    'react/no-unescaped-entities': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/array-type': 'off',
    'react-hooks/set-state-in-effect': 'warn',
  },
}
