import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/leetcode-content.ts'),
      name: 'LeetCodeContent',
      formats: ['iife'],
      fileName: () => 'content/leetcode-content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
