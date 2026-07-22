import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['tests/**/*.database.test.ts', 'tests/**/*.storage.test.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
