import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share one MySQL test database, so run files sequentially.
    fileParallelism: false,
    pool: 'forks',
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setupEnv.ts'],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
