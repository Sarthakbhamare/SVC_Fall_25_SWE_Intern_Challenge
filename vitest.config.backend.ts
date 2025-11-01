import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'backend',
    environment: 'node',
    globals: true,
    threads: false,
    isolate: true,
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage/backend',
      all: true,
      include: ['server/**/*.ts', 'shared/**/*.ts'],
      exclude: [
        'server/**/*.test.ts',
        'server/**/*.spec.ts',
        'server/node-build.ts',
        'server/tests/**',
        'shared/api.ts', // Type-only file with no runtime code
      ],
      thresholds: {
        global: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
    setupFiles: ['./server/tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, './shared'),
      '@server': resolve(__dirname, './server'),
    },
  },
});
