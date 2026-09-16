// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import tsdoc from 'eslint-plugin-tsdoc';

export default tseslint.config(
  {
    // Rutas ignoradas globalmente por ESLint.
    ignores: ['dist/**', 'docs/**', 'coverage/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    // Configuración con información de tipos para todo el TypeScript del repo.
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Prohibición dura de `any` (requisito del proyecto).
      '@typescript-eslint/no-explicit-any': 'error',
      // Preferir tipos explícitos en la API pública.
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
    },
  },
  {
    // La validación de sintaxis TSDoc solo aplica al código de la librería y sus pruebas.
    files: ['src/**/*.ts', 'tests/**/*.ts', 'examples/**/*.ts'],
    plugins: {
      tsdoc,
    },
    rules: {
      'tsdoc/syntax': 'error',
    },
  },
  {
    // Las pruebas pueden ser algo menos estrictas para facilitar el arreglo de casos.
    files: ['tests/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    // Archivos de configuración en JS: sin proyecto de tipos ni reglas type-aware.
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  // Desactiva reglas de estilo que colisionan con Prettier (debe ir al final).
  prettier,
);
