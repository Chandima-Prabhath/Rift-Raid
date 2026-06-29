import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  server: {
    port: 5173,
    host: true, // allow LAN connections for boarding-house playtests
  },
  resolve: {
    // Let Vite resolve 'three' from node_modules naturally — works with both
    // npm and bun (bun creates symlinks at the root node_modules).
    alias: {
      '@rift-and-raid/shared': path.resolve(__dirname, '../shared/src'),
      '@rift-and-raid/engine': path.resolve(__dirname, '../engine/src'),
      '@rift-and-raid/game': path.resolve(__dirname, '../game/src'),
    },
  },
  optimizeDeps: {
    include: ['three'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
