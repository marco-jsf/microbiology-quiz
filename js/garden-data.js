// Bird catalog for the garden minigame.
//
// Two asset layouts ship in /assets/birds:
//   • single-file  — one PNG+JSON holds every animation; clips are sliced out
//                    of `meta.frameTags` by tag name. Declared via `sheet`+`tags`.
//   • multi-file   — one PNG+JSON *per* animation; the clip is the whole frame
//                    array. Declared via `dir`+`prefix`+`files`.
//
// `tags`/`files` map a LOGICAL action (idle/walk/jump/eat/fly) to the asset's
// own name for it. Birds simply omit actions they don't have — a kiwi has no
// `fly`, so it never takes off. The PNG path is always derived from the JSON
// path (.json → .png); `meta.image` in these packs is unreliable.

// `size`   — relative on-screen scale multiplier (frame dimensions don't encode
//            real-world size, so we set it by hand). 1.0 ≈ a crow.
// `rarity` — 'normal' | 'rare' | 'epic'; drives the shop tile colour.
// `cost`   — price in gold coins to buy one.
export const BIRDS = [
  // ---- single-file (frames object + frameTags) ----
  { id: 'pigeon', name: 'Pigeon', size: 0.8, rarity: 'normal', cost: 20, sheet: 'assets/birds/pigeon/Pigeon.json',
    tags: { idle: 'Idle', walk: 'Walk', jump: 'Jump', eat: 'Eat', fly: 'Fly' } },
  { id: 'sparrow', name: 'Sparrow', size: 0.7, rarity: 'normal', cost: 20, sheet: 'assets/birds/sparrow/Sparrow.json',
    tags: { idle: 'Idle', walk: 'Walk1', jump: 'Jump', eat: 'Peck/Eat', fly: 'Fly' } },
  { id: 'crow', name: 'Crow', size: 0.7, rarity: 'normal', cost: 35, sheet: 'assets/birds/crow/Crow.json',
    tags: { idle: 'idle', walk: 'walk', jump: 'Jump', eat: 'eat', fly: 'Fly' } },
  { id: 'dove', name: 'Collared Dove', size: 0.7, rarity: 'normal', cost: 35, sheet: 'assets/birds/collared_dove/Collared Dove.json',
    tags: { idle: 'Idle', walk: 'walk', jump: 'Jump', eat: 'Eat', fly: 'Fly' } },
  { id: 'peacock', name: 'Peacock', size: 1.5, rarity: 'epic', cost: 600, sheet: 'assets/birds/peacock/Peacock.json',
    tags: { idle: 'Idle', walk: 'Walk', jump: 'Jump', eat: 'Eat', fly: 'Fly' } },

  // ---- multi-file (one frame-array JSON per animation) ----
  { id: 'flamingo', name: 'Flamingo', size: 1.5, rarity: 'rare', cost: 120, dir: 'assets/birds/flamingo', prefix: 'Flamingo',
    files: { idle: 'Idle', walk: 'Walk', jump: 'Jump', eat: 'Eat', fly: 'Fly' } },
  { id: 'kiwi', name: 'Kiwi', size: 0.85, rarity: 'rare', cost: 100, dir: 'assets/birds/kiwi', prefix: 'Kiwi',
    files: { idle: 'Idle', walk: 'Walk', jump: 'Jump', eat: 'Peck' } }, // flightless
  { id: 'shoebill', name: 'Shoebill', size: 1.5, rarity: 'rare', cost: 300, dir: 'assets/birds/shoebill', prefix: 'Shoebill',
    files: { idle: 'Idle', walk: 'Walk', eat: 'Eat' } },                // stays grounded
  { id: 'toucan', name: 'Toucan', size: 0.8, rarity: 'rare', cost: 140, dir: 'assets/birds/toucan', prefix: 'Toucan',
    files: { idle: 'Idle', walk: 'Walk/Bounce', jump: 'Jump', eat: 'Peck', fly: 'Fly' } },
  { id: 'macaw', name: 'Blue Macaw', size: 0.8, rarity: 'epic', cost: 500, dir: 'assets/birds/blue_macaw', prefix: 'Blue Macaw',
    files: { idle: 'Idle', walk: 'Walk1', jump: 'Jump', eat: 'Peck', fly: 'Fly' } },
];

// The free starter bird every player begins with (so the garden isn't empty).
export const STARTER = 'pigeon';

export function birdById(id) { return BIRDS.find(b => b.id === id); }
