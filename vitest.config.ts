import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  coverage: {
    provider: 'v8',
    include: ['src/**/*.ts'],
    thresholds: {
      statements: 95,
      branches: 80,
      functions: 95,
      lines: 95,
    },
  },
});
