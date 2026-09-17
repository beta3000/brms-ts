import { createDefaultPreset } from 'ts-jest';

const presetConfig = createDefaultPreset({
  tsconfig: 'tsconfig.test.json',
});

/**
 * Jest configuration using ts-jest.
 *
 * Tests are transpiled to CommonJS for execution (the published library itself
 * is built as ESM + CJS by tsup; this only affects how tests run). The
 * moduleNameMapper lets the ESM-style `.js` import specifiers in the source
 * resolve to their `.ts` origins.
 *
 * @type {import('jest').Config}
 */
export default {
  ...presetConfig,
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/index.ts', '!src/**/types.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
