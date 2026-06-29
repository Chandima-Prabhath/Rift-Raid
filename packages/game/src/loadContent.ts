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
 *
 * This function is async because the Node path uses dynamic imports of
 * node:fs etc., which keeps those imports out of the browser bundle.
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
    // Bind to preserve `this` context.
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
  // Vite browser path.
  if (
    typeof import.meta !== 'undefined' &&
    typeof (import.meta as { glob?: unknown }).glob === 'function'
  ) {
    return collectVite();
  }
  // Node path.
  return collectNode();
}

function collectVite(): Record<ContentCategory, Array<{ raw: unknown; path: string }>> {
  const result = emptyResult();
  const modules = (
    import.meta as unknown as {
      glob: (
        pattern: string,
        options: { eager: boolean; as: string }
      ) => Record<string, { default: unknown }>;
    }
  ).glob('./content/**/*.json', { eager: true, as: 'json' });
  for (const [filePath, mod] of Object.entries(modules)) {
    const category = categorize(filePath);
    if (category) {
      result[category].push({ raw: mod.default, path: filePath });
    }
  }
  return result;
}

async function collectNode(): Promise<
  Record<ContentCategory, Array<{ raw: unknown; path: string }>>
> {
  const result = emptyResult();
  // Dynamic import keeps these out of the browser bundle.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const thisDir = path.dirname(url.fileURLToPath(import.meta.url));
  const candidates = [
    path.join(thisDir, 'content'), // src/ in dev (tsx runs from src)
    path.join(thisDir, '..', 'content'), // dist/ → ../content in built mode
    path.join(process.cwd(), 'packages', 'game', 'src', 'content'),
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
