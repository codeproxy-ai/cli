import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  coverage: {
    provider: 'v8',
    include: ['src/**/*.ts'],
    thresholds: {
      statements: 93,
      branches: 80,
      functions: 85,
      lines: 93,
    },
  },
});
