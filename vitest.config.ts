import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['dist/**', 'test/**'],
      thresholds: {
        lines: 80,
        statements: 80,
      },
    },
  },
});
