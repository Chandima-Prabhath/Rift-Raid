import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  server: {
    port: 5173,
    host: true, // allow LAN connections for boarding-house playtests
  },
  resolve: {
    alias: {
      '@rift-and-raid/shared': path.resolve(__dirname, '../shared/src'),
      '@rift-and-raid/engine': path.resolve(__dirname, '../engine/src'),
      '@rift-and-raid/game': path.resolve(__dirname, '../game/src'),
      'three': path.resolve(__dirname, '../../node_modules/three'),
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
