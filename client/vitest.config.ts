import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'frontend',
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(__dirname, 'tests/setupTests.ts')],
    css: false,
    include: ['client/**/*.test.{ts,tsx}'],
    exclude: ['server/**', 'shared/**', 'node_modules/**'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: '../coverage/frontend',
      all: true,
      include: ['client/**/*.{ts,tsx}', '../shared/**/*.ts'],
      exclude: [
        'client/**/*.test.tsx',
        'client/**/*.spec.tsx',
        'client/tests/**',
        'client/components/ui/**',
        'client/vite-env.d.ts',
        'client/vitest.config.ts',
        'client/lib/supabase.ts',
        'client/hooks/use-toast.ts',
        'client/hooks/use-mobile.tsx',
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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
});
