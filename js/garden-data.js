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

export const RARITY_LABEL = { normal: 'Normal', rare: 'Selten', epic: 'Episch' };

// Short profile for the bird inspector card. `de` is the German species name
// (the shop keeps the asset-pack names in `BIRDS[].name`). `likes` names decor
// objects this species is especially drawn to in the scene.
export const SPECIES_INFO = {
  pigeon: { de: 'Stadttaube', latin: 'Columba livia f. domestica',
    fact: 'Stammt von der Felsentaube ab. Brieftauben finden über Hunderte Kilometer nach Hause – mit Sonnenstand und Magnetsinn.' },
  sparrow: { de: 'Haussperling', latin: 'Passer domesticus',
    fact: 'Lebt seit Jahrtausenden in der Nähe des Menschen und nimmt gern ein Staubbad, um das Gefieder zu pflegen.' },
  crow: { de: 'Krähe', latin: 'Corvus',
    fact: 'Krähen erkennen einzelne Menschengesichter wieder und merken sich jahrelang, wer freundlich zu ihnen war.' },
  dove: { de: 'Türkentaube', latin: 'Streptopelia decaocto',
    fact: 'Kam erst im 20. Jahrhundert aus Südosteuropa zu uns – ihr dreisilbiges „gu-guuu-gu“ hört man heute in fast jedem Ort.' },
  peacock: { de: 'Pfau', latin: 'Pavo cristatus',
    fact: 'Die prächtige Schleppe ist gar nicht der Schwanz, sondern bis zu 200 verlängerte Oberschwanzdeckfedern.' },
  flamingo: { de: 'Flamingo', latin: 'Phoenicopterus', likes: ['pond'],
    fact: 'Rosa wird er erst durch Carotinoide aus seiner Nahrung – Algen und kleine Krebse, die er kopfüber aus dem Wasser filtert.' },
  kiwi: { de: 'Kiwi', latin: 'Apteryx',
    fact: 'Der einzige Vogel mit Nasenlöchern an der Schnabelspitze – er erschnüffelt Würmer im Boden.' },
  shoebill: { de: 'Schuhschnabel', latin: 'Balaeniceps rex', likes: ['pond'],
    fact: 'Steht oft minutenlang regungslos im Sumpf und begrüßt Artgenossen mit lautem Schnabelklappern.' },
  toucan: { de: 'Tukan', latin: 'Ramphastos',
    fact: 'Der riesige Schnabel ist innen wabenartig hohl und federleicht – und hilft beim Abgeben von Körperwärme.' },
  macaw: { de: 'Blauer Ara', latin: 'Anodorhynchus',
    fact: 'Knackt mit seinem kräftigen Schnabel sogar steinharte Palmnüsse. Große Aras können über 50 Jahre alt werden.' },
};
export function speciesInfo(id) { return SPECIES_INFO[id] || { de: birdById(id)?.name || id, latin: '', fact: '' }; }

/* ---------- Eggs ----------
 * Bought in the shop, then sit in the garden nest. Every graded quiz answer
 * adds its score (0..1) as "warmth" to every egg in the nest; at `need` the
 * egg is ready and hatches when tapped in the garden. The species is drawn
 * uniformly from BIRDS of the same rarity; `variantChance` is the chance of a
 * rare colour variant (variants can ONLY come from eggs, never the shop). */
export const EGG_TIERS = [
  { id: 'normal', name: 'Einfaches Ei', cost: 30, need: 10, variantChance: 0.12 },
  { id: 'rare', name: 'Seltenes Ei', cost: 150, need: 20, variantChance: 0.15 },
  { id: 'epic', name: 'Episches Ei', cost: 450, need: 35, variantChance: 0.20 },
];
export const NEST_CAPACITY = 3;
// Bad-luck protection: at most this many hatches in a row without a variant —
// after VARIANT_PITY − 1 misses, the next hatch is guaranteed to be one.
export const VARIANT_PITY = 8;
export function eggTierById(id) { return EGG_TIERS.find(t => t.id === id); }
export function speciesForTier(tier) { return BIRDS.filter(b => b.rarity === tier); }

/* ---------- Rare colour variants ----------
 * Applied to ANY species by gradient-mapping each sprite pixel's luminance
 * onto `stops` (dark → light), so outlines/eyes stay dark and shading reads.
 * `weight` is the relative draw weight once a variant is rolled. */
export const VARIANTS = [
  { id: 'gold', name: 'Gold', weight: 1, stops: ['#2e1a04', '#7a4f0e', '#c8921c', '#f2cb4c', '#fff3bf'] },
  { id: 'white', name: 'Weiß', weight: 3, stops: ['#3b4048', '#8d949c', '#cfd5db', '#f2f4f6', '#ffffff'] },
  { id: 'night', name: 'Mitternacht', weight: 3, stops: ['#0b0920', '#231f5c', '#4b44a6', '#8f86e6', '#d6d0ff'] },
  { id: 'rose', name: 'Rosé', weight: 3, stops: ['#2e0b18', '#7d2a4a', '#c75c84', '#f19bb8', '#ffe3ec'] },
  { id: 'mint', name: 'Mint', weight: 3, stops: ['#06231b', '#1b6b52', '#3fae88', '#8fe3c4', '#e6fff5'] },
];
export function variantById(id) { return VARIANTS.find(v => v.id === id); }

/* ---------- Decor ----------
 * kind 'object' — drawn in the scene, standing on the ground at fraction `x`
 *                 of the garden width. `interact` makes birds visit it:
 *                 'drink' / 'feed' → walk there and eat/peck for a while,
 *                 'wade' → like drink, strongly preferred by species whose
 *                 SPECIES_INFO.likes includes this decor id.
 * kind 'effect' — ambient animation layer (no position).
 * Owned decor can be switched on/off in the shop; nothing decays. */
export const DECOR = [
  { id: 'flowers', kind: 'object', name: 'Blumenbeet', cost: 60, x: 0.08,
    desc: 'Ein kleines Beet mit Wildblumen. Schmetterlinge landen gern darauf.' },
  { id: 'mushrooms', kind: 'object', name: 'Pilzgrüppchen', cost: 40, x: 0.17,
    desc: 'Ein paar rote Pilze im Gras.' },
  { id: 'birdbath', kind: 'object', name: 'Vogeltränke', cost: 120, x: 0.28, interact: 'drink',
    desc: 'Eine steinerne Schale mit Wasser – deine Vögel kommen zum Trinken.' },
  { id: 'pond', kind: 'object', name: 'Teich', cost: 300, x: 0.60, interact: 'wade',
    desc: 'Ein kleiner Teich. Flamingo und Schuhschnabel lieben ihn.' },
  { id: 'lantern', kind: 'object', name: 'Gartenlaterne', cost: 90, x: 0.74,
    desc: 'Eine Laterne mit sanft flackerndem Licht.' },
  { id: 'feeder', kind: 'object', name: 'Futterhaus', cost: 150, x: 0.84, interact: 'feed',
    desc: 'Ein Futterhaus auf einem Pfahl – darunter wird fleißig gepickt.' },
  { id: 'stones', kind: 'object', name: 'Findlinge', cost: 50, x: 0.95,
    desc: 'Zwei moosige Steine am Rand.' },

  { id: 'butterflies', kind: 'effect', name: 'Schmetterlinge', cost: 150,
    desc: 'Ein paar Schmetterlinge flattern durch den Garten.' },
  { id: 'petals', kind: 'effect', name: 'Blütenblätter', cost: 100,
    desc: 'Rosa Blütenblätter segeln langsam zu Boden.' },
  { id: 'fireflies', kind: 'effect', name: 'Glühwürmchen', cost: 120,
    desc: 'Sanft leuchtende Glühwürmchen schweben über dem Gras.' },
  { id: 'sunbeams', kind: 'effect', name: 'Sonnenstrahlen', cost: 80,
    desc: 'Weiche Lichtstrahlen fallen schräg in den Garten.' },
];
// Where the nest (eggs) sits — between the bird bath and the pond.
export const NEST_X = 0.42;
export function decorById(id) { return DECOR.find(d => d.id === id); }
