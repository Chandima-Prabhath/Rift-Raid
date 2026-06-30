import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite config — Rift & Raid client.
 *
 * IMPORTANT: workspace packages (@rift-and-raid/shared, /engine, /game) MUST
 * be imported from their compiled dist/ — NOT from src/. This is because:
 *
 *   1. The shared Schemas.ts uses @type decorators from @colyseus/schema.
 *      esbuild (used by Vite for transpilation) does not fully support
 *      TypeScript decorators at runtime — it strips them. The schema
 *      encoder requires the decorator metadata to be present at class-
 *      definition time, so we MUST use the tsc-compiled output.
 *
 *   2. Both server (Bun) and client (Vite) must share the SAME class
 *      definitions for the encoder/decoder to agree on type IDs.
 *
 * Workflow:
 *   - `bun run dev` calls `build:deps` first (tsc -b on shared/engine/game),
 *     then starts server + client concurrently.
 *   - Edits to shared/engine/game source require a rebuild. Run
 *     `bun run build:deps` again, or use the `dev:watch` script which
 *     watches and rebuilds on changes.
 */
export default defineConfig({
  root: __dirname,
  server: {
    port: 5173,
    host: true, // allow LAN connections for boarding-house playtests
  },
  resolve: {
    alias: {
      // Point at dist/ so both runtimes use the SAME decorator-processed code.
      '@rift-and-raid/shared': path.resolve(__dirname, '../shared/dist'),
      '@rift-and-raid/engine': path.resolve(__dirname, '../engine/dist'),
      '@rift-and-raid/game': path.resolve(__dirname, '../game/dist'),
    },
  },
  // Serve the game's 3D model assets at /assets/...
  publicDir: path.resolve(__dirname, '../game/assets'),
  optimizeDeps: {
    include: ['three'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
