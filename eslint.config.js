import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'build'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js', 'scripts/*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  { files: ['eslint.config.js'], extends: [tseslint.configs.disableTypeChecked] },
  {
    files: ['scripts/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { console: 'readonly', URL: 'readonly' } },
  },
);
