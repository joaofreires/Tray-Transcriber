import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/renderer',
  test: {
    environment: 'jsdom'
  },
  build: {
    // ensure build artifacts land in the project-root `dist-ts` folder rather
    // than inside `src/renderer` (the previous relative string depended on the
    // working directory when invoking `vite`).
    outDir: resolve(__dirname, 'dist-ts'),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    watch: {
      // Ignore large folders and build outputs to reduce number of watchers
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/dist-ts/**',
        '**/bundle/**',
        '**/python/**',
        'vite.config.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  }
});
