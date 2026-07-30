import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: {
    watch: {
      // These are reference/scratch folders, not app source — watching them has no benefit
      // and has crashed the dev server before (EBUSY on a file mid-write/locked by another
      // program in New_Development/).
      ignored: ['**/New_Development/**', '**/New_Switch_Design/**', '**/.superpowers/**'],
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
