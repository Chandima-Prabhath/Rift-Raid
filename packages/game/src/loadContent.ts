/**
 * Rift & Raid — Game content loader
 *
 * Loads all JSON config files from the content/ directory at runtime and
 * registers them with the ContentRegistry.
 *
 * Two modes:
 *   - Browser (Vite): uses Vite's import.meta.glob to bundle all JSON at build time.
 *   - Node (server): uses fs.readdirSync to scan the content directory.
 *
 * Adding new content = adding a JSON file to packages/game/src/content/.
 * No code changes needed in this file (Node mode auto-discovers).
 */

import type { ContentRegistry } from '@rift-and-raid/engine';

type ContentCategory = 'weapons' | 'abilities' | 'structures' | 'monsters';

const REGISTRY_METHODS: Record<ContentCategory, keyof ContentRegistry> = {
  weapons: 'registerWeapon',
  abilities: 'registerAbility',
  structures: 'registerStructure',
  monsters: 'registerMonster',
} as const;

export async function loadAllContent(registry: ContentRegistry): Promise<void> {
  const configs = await collectConfigs();

  for (const [category, items] of Object.entries(configs) as Array<
    [ContentCategory, Array<{ raw: unknown; path: string }>]
  >) {
    const methodName = REGISTRY_METHODS[category];
    const register = (
      registry[methodName] as (raw: unknown, path?: string) => void
    ).bind(registry);
    for (const { raw, path } of items) {
      register(raw, path);
    }
  }
}

async function collectConfigs(): Promise<
  Record<ContentCategory, Array<{ raw: unknown; path: string }>>
> {
  // Browser detection — Vite statically transforms import.meta.glob() calls
  // but does NOT expose import.meta.glob as a runtime function reference.
  // So we detect environment by checking for window.
  if (typeof window !== 'undefined') {
    return collectVite();
  }
  return collectNode();
}

/**
 * Vite browser path. The import.meta.glob call is statically analyzed by
 * Vite at build time and replaced with the bundled JSON modules.
 *
 * NOTE: This call MUST appear as the literal pattern `import.meta.glob(...)`
 * for Vite's static analyzer to pick it up. Typecasts can break it, so we
 * cast the result instead of the call.
 */
function collectVite(): Record<ContentCategory, Array<{ raw: unknown; path: string }>> {
  const result = emptyResult();
  // @ts-ignore — Vite injects import.meta.glob at build time; TS doesn't know about it.
  const modules: Record<string, { default: unknown }> = import.meta.glob('./content/**/*.json', {
    eager: true,
    query: '?json',
  });
  for (const [filePath, mod] of Object.entries(modules)) {
    const category = categorize(filePath);
    if (category) {
      // `mod.default` is the parsed JSON object.
      result[category].push({ raw: mod.default, path: filePath });
    }
  }
  return result;
}

/**
 * Node path. Uses dynamic imports of node:fs etc. to keep them out of the
 * browser bundle (Vite tree-shakes this branch since it's only reachable
 * when `typeof window === 'undefined'`).
 */
async function collectNode(): Promise<
  Record<ContentCategory, Array<{ raw: unknown; path: string }>>
> {
  const result = emptyResult();
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const thisDir = path.dirname(url.fileURLToPath(import.meta.url));
  const candidates = [
    path.join(thisDir, 'content'), // src/ in dev (tsx runs from src)
    path.join(thisDir, '..', 'content'), // dist/content → ../content (won't exist; tsc doesn't copy JSON)
    path.join(thisDir, '..', 'src', 'content'), // dist/loadContent.js → ../src/content (built mode fallback)
    path.join(process.cwd(), 'packages', 'game', 'src', 'content'),
    path.join(process.cwd(), 'src', 'content'), // when cwd is packages/game
  ];
  let root: string | null = null;
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory()) {
        root = c;
        break;
      }
    } catch {
      // try next
    }
  }
  if (!root) {
    throw new Error(`Content directory not found. Tried: ${candidates.join(', ')}`);
  }

  for (const category of Object.keys(result) as ContentCategory[]) {
    const dir = path.join(root, category);
    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(dir, file);
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      result[category].push({ raw, path: `${category}/${file}` });
    }
  }
  return result;
}

function emptyResult(): Record<ContentCategory, Array<{ raw: unknown; path: string }>> {
  return {
    weapons: [],
    abilities: [],
    structures: [],
    monsters: [],
  };
}

function categorize(filePath: string): ContentCategory | null {
  if (filePath.includes('/weapons/')) return 'weapons';
  if (filePath.includes('/abilities/')) return 'abilities';
  if (filePath.includes('/structures/')) return 'structures';
  if (filePath.includes('/monsters/')) return 'monsters';
  return null;
}
