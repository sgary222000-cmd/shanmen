import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base 使用相對路徑，讓建置結果可放在 GitHub Pages 子路徑或任何靜態網站。
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
