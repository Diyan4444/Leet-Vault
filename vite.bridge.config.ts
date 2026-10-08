import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/page-bridge.ts'),
      name: 'LeetVaultPageBridge',
      formats: ['iife'],
      fileName: () => 'content/page-bridge.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
