# Rift & Raid — Asset Setup

Copy your downloaded Kenney assets into this directory structure:

## Directory Layout

```
packages/game/assets/
├── characters/          ← Kenney Mini Characters (GLB format)
│   ├── character-male-a.glb
│   ├── character-male-b.glb
│   ├── character-female-a.glb
│   └── ...
├── structures/          ← Kenney Fantasy Town Kit (GLB format)
│   ├── wall.glb
│   ├── wall-wood.glb
│   ├── tower-round-base.glb
│   ├── tower-square-bottom-a.glb
│   └── ...
├── props/               ← Kenney Tower Defense Kit (GLB format)
│   ├── weapon-turret.glb
│   ├── detail-crystal.glb
│   ├── detail-crystal-large.glb
│   ├── detail-rocks.glb
│   ├── detail-rocks-large.glb
│   ├── tree.glb
│   └── ...
└── textures/            ← Shared textures (colormap.png from each pack)
    ├── characters-colormap.png
    ├── structures-colormap.png
    └── props-colormap.png
```

## How to Copy

From your downloaded packs, copy these specific files:

### Mini Characters → `characters/`
```bash
cp "/path/to/kenney_mini-characters/Models/GLB format/character-male-a.glb" packages/game/assets/characters/
cp "/path/to/kenney_mini-characters/Models/GLB format/character-male-b.glb" packages/game/assets/characters/
cp "/path/to/kenney_mini-characters/Models/GLB format/character-female-a.glb" packages/game/assets/characters/
cp "/path/to/kenney_mini-characters/Models/GLB format/character-female-b.glb" packages/game/assets/characters/
cp "/path/to/kenney_mini-characters/Models/GLB format/Textures/colormap.png" packages/game/assets/textures/characters-colormap.png
```

### Fantasy Town Kit → `structures/`
```bash
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/wall.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/wall-wood.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/wall-corner.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/wall-half.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/tower-round-base.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/tower-round-bottom-a.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/tower-square-bottom-a.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/pillar-stone.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/pillar-wood.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/roof-flat.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/roof-gable.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/fence.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/lantern.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/tree.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/tree-high.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/rock-small.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/rock-large.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/fountain-square.glb" packages/game/assets/structures/
cp "/path/to/kenney_fantasy-town-kit_2.0/Models/GLB format/Textures/colormap.png" packages/game/assets/textures/structures-colormap.png
```

### Tower Defense Kit → `props/`
```bash
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/weapon-turret.glb" packages/game/assets/props/
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/detail-crystal.glb" packages/game/assets/props/
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/detail-crystal-large.glb" packages/game/assets/props/
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/detail-rocks.glb" packages/game/assets/props/
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/detail-rocks-large.glb" packages/game/assets/props/
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/detail-tree.glb" packages/game/assets/props/
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/detail-tree-large.glb" packages/game/assets/props/
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/tower-round-base.glb" packages/game/assets/props/
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/tower-square-bottom-a.glb" packages/game/assets/props/
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/wood-structure.glb" packages/game/assets/props/
cp "/path/to/kenney_tower-defense-kit/Models/GLB format/Textures/colormap.png" packages/game/assets/textures/props-colormap.png
```

## Notes

- GLB files are self-contained (geometry + materials + textures embedded)
- The colormap.png is a shared texture atlas used by all models in each pack
- GLB files are gitignored (too large for git) — each developer copies their own
- The game will fall back to primitive shapes if GLB files are missing
