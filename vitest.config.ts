import { defineConfig } from 'vitest/config';

// Tests unitaires des modules sans rendu (règles du jeu, ordres en français) : npm test
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
