import { defineConfig } from 'tsup';

/**
 * Configuración de empaquetado con tsup.
 *
 * Genera salida dual ESM (`.js`) y CommonJS (`.cjs`) más los tipos (`.d.ts`),
 * a partir del punto de entrada público `src/index.ts`.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'es2022',
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
