// Garden state: the individual birds living in the garden (each with its own
// name and maybe a rare colour variant), eggs warming in the nest, and owned
// decor. Persisted in its own localStorage key; purchases are paid for out of
// the coin wallet (engine.js).
//
// SAVE COMPATIBILITY — this key already holds a real player's garden, so:
//   • the key name never changes;
//   • `owned` ({species: count}) is the original format and is still written
//     (kept equal to the per-species count of `birds`), so an older build of
//     the app would still show the same flock;
//   • a save without `birds` (or with fewer birds than `owned` says, e.g. after
//     an older build bought one) is reconciled on load by adding individuals;
//   • birds in one of the old fantasy colours (gold/white/night/rose/mint) are
//     converted on load to one of their species' real variants; the old value
//     is kept in `variantWas` (see migrateVariants);
//   • `discovered` ({species: time}) remembers every species the player ever
//     had, so the Vogelbuch keeps it after the last one is sold. Saves
//     from before birds could be sold get it filled in on load from their
//     birds (and collected variants).
//   • placeable decor (isPlaceable in garden-data.js) lives in `items`:
//     [{uid: 'd<N>', id, at, pos: {x, z} | null}], one entry per piece, pos
//     null = in storage ("Lager"). `decor` ({id: {on, at}}) is the original
//     format and is still written for those ids (on = at least one piece is
//     placed), so an older build still shows the same decor. A save without
//     `items` (or owning decor that has no pieces, e.g. bought by an older
//     build) gets one piece per owned id on load: on → at its default spot,
//     off → in storage. Pond (terrain) and effects stay in `decor` only.
//     Invariant: for placeable ids, decor[id] exists ⇔ the garden has a piece
//     of it — anything that ever removes the last piece must delete decor[id].
//   • `nestPos` ({x, z}, optional) is where the player moved the nest in the
//     3D garden; absent = NEST_SPOT.

import {
  birdById, STARTER, eggTierById, speciesForTier, VARIANT_PITY,
  NEST_CAPACITY, decorById, NEW_SPECIES_WEIGHT, SELL_SHARE, SELL_VARIANT_FACTOR,
  isPlaceable, NEST_SPOT,
} from './garden-data.js';
import { variantsOf, variantFor, resolveVariantId } from './garden-variants.js';
import { spendCoins, addSaleCoins } from './engine.js';

const KEY = 'microbioBirdsV1';
// The garden as it was right before the last resetGarden() (the raw saved
// string). Nothing reads it; it is there so an accidental reset can be undone
// by hand: localStorage.setItem('microbioBirdsV1', localStorage.getItem('microbioBirdsV1-backup')).
const BACKUP_KEY = 'microbioBirdsV1-backup';
const NAME_MAX = 18;

let state = load();

function fresh() {
  return { owned: {}, birds: [], nextUid: 1, eggs: [], decor: {}, items: [], variantsSeen: {}, discovered: {}, hatched: 0, sinceVariant: 0 };
}

function load() {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
  const firstRun = !s || typeof s !== 'object' || !s.owned || typeof s.owned !== 'object';
  const st = Object.assign(fresh(), firstRun ? {} : s);
  // A save from before decor pieces had positions gets `items` written now,
  // even if it owns no placeable decor yet.
  const itemsMissing = !firstRun && !Array.isArray(s.items);
  if (!Array.isArray(st.birds)) st.birds = [];
  if (!Array.isArray(st.eggs)) st.eggs = [];
  if (!st.decor || typeof st.decor !== 'object') st.decor = {};
  if (!Array.isArray(st.items)) st.items = [];
  if (!st.variantsSeen || typeof st.variantsSeen !== 'object') st.variantsSeen = {};
  if (!st.discovered || typeof st.discovered !== 'object') st.discovered = {};
  if (!Number.isFinite(st.nextUid) || st.nextUid < 1) st.nextUid = 1;
  // Never hand out a uid that already exists (defensive against hand-edited
  // saves). Birds 'b<N>', eggs 'e<N>' and decor pieces 'd<N>' share the counter.
  for (const x of [...st.birds, ...st.eggs, ...st.items]) {
    const n = parseInt(String((x && x.uid) || '').slice(1), 10);
    if (Number.isFinite(n) && n >= st.nextUid) st.nextUid = n + 1;
  }
  if (firstRun) st.owned = { [STARTER]: 1 };

  // Reconcile individuals with the legacy per-species counts.
  const have = {};
  let added = 0;
  for (const b of st.birds) have[b.species] = (have[b.species] || 0) + 1;
  for (const [species, n] of Object.entries(st.owned)) {
    for (let i = have[species] || 0; i < n; i++, added++) {
      st.birds.push({
        uid: 'b' + st.nextUid++, species, variant: null, name: '',
        from: firstRun && species === STARTER ? 'starter' : 'legacy', at: firstRun ? Date.now() : null,
      });
    }
  }
  syncOwned(st);
  const migrated = migrateVariants(st);
  const found = noteDiscovered(st);
  const placed = migrateDecorItems(st);
  if (firstRun || itemsMissing || added || migrated || found || placed) persist(st);
  return st;
}

// Function declarations, not const arrows: load() runs (via `let state = load()`)
// before the module's later const initialisers have run.
function validPos(p) { return !!p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.z); }
function round2(v) { return Math.round(v * 100) / 100; }
function spotPos(id) {
  const spot = decorById(id).spot;
  return { x: spot[0], z: spot[1] };
}

// Bring `items` (one entry per placeable decor piece) in line with the catalog
// and with `decor`, then `decor`'s legacy flags in line with `items`, and drop a
// malformed `nestPos`. Idempotent; true if anything changed. Runs after the
// uid scan in load(), so the uids it hands out are new.
function migrateDecorItems(st) {
  let changed = false;
  // Pieces the catalog can't place (any more) are dropped; broken fields repaired.
  const kept = st.items.filter(it => it && typeof it === 'object' && isPlaceable(it.id));
  if (kept.length !== st.items.length) { st.items = kept; changed = true; }
  const uids = new Set();
  for (const it of st.items) {
    if (typeof it.uid !== 'string' || !/^d\d+$/.test(it.uid) || uids.has(it.uid)) {
      it.uid = 'd' + st.nextUid++;
      changed = true;
    }
    uids.add(it.uid);
    if (it.pos !== null && !validPos(it.pos)) { it.pos = null; changed = true; }
    if (!Number.isFinite(it.at)) {
      const at = st.decor[it.id]?.at;
      it.at = Number.isFinite(at) && at > 0 ? at : Date.now();
      changed = true;
    }
  }
  // Owned placeable decor without a piece: a save from before pieces existed,
  // or one an older build bought since. Switched on → standing at its default
  // spot, off → in storage.
  const have = new Set(st.items.map(it => it.id));
  for (const id of Object.keys(st.decor)) {
    const rec = st.decor[id];
    if (!rec || !isPlaceable(id) || have.has(id)) continue;
    st.items.push({
      uid: 'd' + st.nextUid++, id,
      at: Number.isFinite(rec.at) && rec.at > 0 ? rec.at : Date.now(),
      pos: rec.on ? spotPos(id) : null,
    });
    changed = true;
  }
  if (syncDecorFlags(st)) changed = true;
  if ('nestPos' in st && !validPos(st.nestPos)) { delete st.nestPos; changed = true; }
  return changed;
}

// Keep `decor` meaningful for older builds: every placeable id the garden has
// pieces of counts as owned, and as switched on while one of them is placed.
// True if anything changed.
function syncDecorFlags(st) {
  const group = {};
  for (const it of st.items) {
    const g = group[it.id] || (group[it.id] = { on: false, at: Infinity });
    if (it.pos) g.on = true;
    if (it.at < g.at) g.at = it.at;
  }
  let changed = false;
  for (const [id, g] of Object.entries(group)) {
    const prev = st.decor[id];
    const at = prev?.at || g.at;
    if (prev && prev.on === g.on && prev.at === at) continue;
    st.decor[id] = { ...prev, on: g.on, at };
    changed = true;
  }
  return changed;
}

// Every species the player has a bird of, or a collected variant of, counts as
// discovered (never removed again). Idempotent; true if anything was added.
function noteDiscovered(st) {
  let changed = false;
  const mark = (species, at) => {
    if (!species || st.discovered[species]) return;
    st.discovered[species] = Number.isFinite(at) && at > 0 ? at : Date.now();
    changed = true;
  };
  for (const b of st.birds) if (b) mark(b.species, b.at);
  for (const [key, at] of Object.entries(st.variantsSeen)) mark(key.slice(0, key.indexOf(':')), at);
  return changed;
}

// Convert variant ids the species no longer has (the old fantasy colours) in
// birds and in the collection. Idempotent; returns true if anything changed.
function migrateVariants(st) {
  let changed = false;
  for (const b of st.birds) {
    if (!b || !b.variant) continue;
    const id = resolveVariantId(b.species, b.variant);
    if (id === b.variant) continue;
    if (!b.variantWas) b.variantWas = b.variant;
    b.variant = id;
    changed = true;
  }
  for (const key of Object.keys(st.variantsSeen)) {
    const i = key.indexOf(':');
    if (i < 0) continue;
    const species = key.slice(0, i), old = key.slice(i + 1);
    const id = resolveVariantId(species, old);
    if (id === old) continue;
    const at = st.variantsSeen[key], nk = `${species}:${id}`;
    delete st.variantsSeen[key];
    const prev = st.variantsSeen[nk];
    st.variantsSeen[nk] = Number.isFinite(prev) && Number.isFinite(at) ? Math.min(prev, at) : (prev || at || Date.now());
    changed = true;
  }
  return changed;
}

function syncOwned(st) {
  const owned = {};
  for (const b of st.birds) owned[b.species] = (owned[b.species] || 0) + 1;
  st.owned = owned;
}
function persist(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } }
function save() { syncOwned(state); syncDecorFlags(state); persist(state); }
// Another tab may have written the save since this tab loaded it. Every mutation
// starts from the latest persisted state, so a stale tab can't overwrite (and
// lose) birds, eggs or decor that were added elsewhere.
function refresh() { state = load(); }

/* ---------- change notifications ----------
 * Events: 'bird-added' {bird} (bought in the shop) · 'bird-renamed' {bird}
 *         'bird-sold' {bird, coins} (it is no longer in the store)
 *         'eggs' {eggs} (bought / warmed / hatched) · 'decor' {} (any decor change:
 *         bought, placed, stored, switched on/off)
 *         'place-request' {uid} (the UI wants the scene to start placing that
 *         decor piece; sent right after buying one, and by requestPlacement)
 *         'nest' {} (the nest was moved) · 'reset' {} (garden wiped; followed
 *         by 'decor', 'eggs' and 'nest')
 * Hatching does NOT emit 'bird-added' — the garden scene spawns the hatchling
 * itself from hatchEgg()'s return value so it can animate the reveal. */
const listeners = new Set();
export function onGardenChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(type, data = {}) {
  for (const fn of [...listeners]) { try { fn(type, data); } catch (e) { console.error(e); } }
}
// The save changed in another tab: reload and let the scene/shop/badge catch up.
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', e => {
    if (e.key !== KEY && e.key !== null) return;
    refresh();
    for (const b of state.birds) emit('bird-renamed', { bird: copy(b) });
    emit('decor'); emit('eggs', { eggs: listEggs() }); emit('nest');
  });
}

const copy = o => (o ? { ...o } : o);
function newBird(species, variant, from) {
  return { uid: 'b' + state.nextUid++, species, variant: variant || null, name: '', from, at: Date.now() };
}

/* ---------- birds ---------- */
export function ownedCount(id) { return state.owned[id] || 0; }
export function isOwned(id) { return ownedCount(id) > 0; }
// A species is discovered once the player has had one (hatched, bought before
// eggs existed, or the starter) — and stays so after its birds are sold.
// New species only come from eggs.
export function isDiscovered(id) { return !!state.discovered[id]; }
// {id: count} of everything the player owns (all variants count toward their species).
export function ownedFlock() { return { ...state.owned }; }
// Every individual bird, oldest first: [{uid, species, variant, name, from, at}].
// from: 'starter' | 'shop' | 'egg' | 'legacy' (owned before birds had identities; at = null).
export function listBirds() { return state.birds.map(copy); }
export function getBird(uid) { return copy(state.birds.find(b => b.uid === uid)); }

// Buy one more normal-coloured `id` of a DISCOVERED species. Returns the new
// bird, or null if the species is still undiscovered or unaffordable.
// (Not offered in the shop for now: birds only come from eggs.)
export function buy(id) {
  refresh();
  const def = birdById(id);
  if (!def || !isDiscovered(id) || !spendCoins(def.cost)) return null;
  const bird = newBird(id, null, 'shop');
  state.birds.push(bird);
  save();
  emit('bird-added', { bird: copy(bird) });
  return copy(bird);
}

// What `bird` sells for: SELL_SHARE of its species' value, × SELL_VARIANT_FACTOR
// for a rare colour variant.
export function sellValue(bird) {
  const def = bird && birdById(bird.species);
  if (!def) return 0;
  return Math.max(1, Math.round((def.cost || 0) * SELL_SHARE * (bird.variant ? SELL_VARIANT_FACTOR : 1)));
}
// The garden always keeps at least one bird.
export function canSell(uid) { return state.birds.length > 1 && state.birds.some(b => b.uid === uid); }

// Sell a bird: it leaves the garden (and the save) and the player gets
// sellValue() coins. Its species and variant stay in the Vogelbuch.
// Returns { bird, coins }, or null if it doesn't exist or is the last bird.
export function sellBird(uid) {
  refresh();
  if (!canSell(uid)) return null;
  const i = state.birds.findIndex(b => b.uid === uid);
  const [bird] = state.birds.splice(i, 1);
  const coins = sellValue(bird);
  save();                       // the bird is gone before any coins are paid out
  addSaleCoins(coins);
  emit('bird-sold', { bird: copy(bird), coins });
  return { bird: copy(bird), coins };
}

// Give a bird a name (trimmed, whitespace collapsed, max 18 chars; '' clears it).
// Returns the stored name, or null if the bird doesn't exist.
export function renameBird(uid, name) {
  refresh();
  const b = state.birds.find(x => x.uid === uid);
  if (!b) return null;
  b.name = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  save();
  emit('bird-renamed', { bird: copy(b) });
  return b.name;
}
export const BIRD_NAME_MAX = NAME_MAX;

/* ---------- eggs ---------- */
export function listEggs() { return state.eggs.map(copy); }
export function nestCapacity() { return NEST_CAPACITY; }
export function nestFull() { return state.eggs.length >= NEST_CAPACITY; }
export function isEggReady(egg) { return !!egg && egg.warmth >= egg.need; }
export function readyEggCount() { return state.eggs.filter(isEggReady).length; }

// Buy an egg of `tier` into the nest. Returns the egg, or null if the nest is
// full or the player can't afford it.
export function buyEgg(tier) {
  refresh();
  const t = eggTierById(tier);
  if (!t || nestFull() || !spendCoins(t.cost)) return null;
  const egg = { uid: 'e' + state.nextUid++, tier: t.id, warmth: 0, need: t.need, at: Date.now() };
  state.eggs.push(egg);
  save();
  emit('eggs', { eggs: listEggs() });
  return copy(egg);
}

// Called once per graded quiz answer: every egg gains `score` (0..1) warmth.
// Returns the eggs that became ready with THIS answer (for a "ready" toast).
export function warmEggs(score) {
  refresh();
  const s = Math.max(0, Math.min(1, Number(score) || 0));
  if (!state.eggs.length || s <= 0) return [];
  const nowReady = [];
  for (const e of state.eggs) {
    const was = isEggReady(e);
    e.warmth = Math.min(e.need, Math.round((e.warmth + s) * 100) / 100);
    if (!was && isEggReady(e)) nowReady.push(copy(e));
  }
  save();
  emit('eggs', { eggs: listEggs() });
  return nowReady;
}

function pickWeighted(list, w) {
  const total = list.reduce((a, x) => a + w(x), 0);
  let r = Math.random() * total;
  for (const x of list) { r -= w(x); if (r < 0) return x; }
  return list[list.length - 1];
}

// Hatch a READY egg. Rolls species (same rarity as the egg, undiscovered ones
// NEW_SPECIES_WEIGHT× as likely) and maybe a rare variant, adds the bird,
// removes the egg, saves — all immediately, so closing the tab mid-animation
// loses nothing. Returns
//   { bird, egg, isVariant, isNewVariant, isNewSpecies }   or null if the egg isn't ready.
export function hatchEgg(uid) {
  refresh();
  const i = state.eggs.findIndex(e => e.uid === uid);
  const egg = state.eggs[i];
  if (!egg || !isEggReady(egg)) return null;
  const t = eggTierById(egg.tier);
  const pool = speciesForTier(egg.tier);
  if (!t || !pool.length) return null;
  const def = pickWeighted(pool, d => (isDiscovered(d.id) ? 1 : NEW_SPECIES_WEIGHT));
  const isNewSpecies = !isDiscovered(def.id);
  if (isNewSpecies) state.discovered[def.id] = Date.now();

  let variant = null;
  const vs = variantsOf(def.id);
  if (vs.length && (state.sinceVariant >= VARIANT_PITY - 1 || Math.random() < t.variantChance)) {
    variant = pickWeighted(vs, v => v.weight || 1).id;
    // Re-roll once if this one is already in the collection for this species.
    if (state.variantsSeen[`${def.id}:${variant}`]) variant = pickWeighted(vs, v => v.weight || 1).id;
  }
  const key = `${def.id}:${variant}`;
  const isNewVariant = !!variant && !state.variantsSeen[key];
  if (variant) { state.sinceVariant = 0; if (isNewVariant) state.variantsSeen[key] = Date.now(); }
  else state.sinceVariant++;

  const bird = newBird(def.id, variant, 'egg');
  state.birds.push(bird);
  state.eggs.splice(i, 1);
  state.hatched++;
  save();
  emit('eggs', { eggs: listEggs() });
  return { bird: copy(bird), egg: copy(egg), isVariant: !!variant, isNewVariant, isNewSpecies };
}

/* ---------- rare variants (collection) ---------- */
export function hasSeenVariant(species, variant) { return !!state.variantsSeen[`${species}:${variant}`]; }
export function variantsSeenCount() {
  return Object.keys(state.variantsSeen).filter(k => {
    const i = k.indexOf(':');
    return i > 0 && !!variantFor(k.slice(0, i), k.slice(i + 1));
  }).length;
}
export function hatchedCount() { return state.hatched; }

/* ---------- decor ----------
 * Placeable objects (isPlaceable) are owned piece by piece: `items`, each
 * either placed at {x, z} in the 3D garden or in storage (pos null). The pond
 * (terrain) and the effects are bought once and switched on/off in `decor`. */
const copyItem = it => (it ? { ...it, pos: it.pos ? { ...it.pos } : null } : it);
const piecesOf = id => state.items.filter(it => it.id === id);

// Every decor piece in the order it came into the garden: [{uid, id, at, pos: {x, z} | null}].
export function listDecorItems() { return state.items.map(copyItem); }
export function getDecorItem(uid) { return copyItem(state.items.find(it => it.uid === uid)); }
// Pieces of `id` the garden owns (placed + stored), placed, in storage.
export function decorCount(id) { return piecesOf(id).length; }
export function placedCount(id) { return piecesOf(id).filter(it => it.pos).length; }
export function storedCount(id) { return piecesOf(id).filter(it => !it.pos).length; }

export function ownsDecor(id) { return isPlaceable(id) ? decorCount(id) > 0 : !!state.decor[id]; }
// Placeable: at least one piece stands in the garden. Else: switched on.
export function isDecorOn(id) { return isPlaceable(id) ? placedCount(id) > 0 : !!state.decor[id]?.on; }
// Ids of decor that shows in the garden: pond/effects switched on and placeable
// objects with a placed piece (what the 2D fallback garden draws).
export function activeDecor() {
  return Object.keys(state.decor).filter(id => decorById(id) && isDecorOn(id));
}
// Whether one more of `id` may be bought (ignores coins): placeable objects up
// to their `max`, everything else once.
export function canBuyDecor(id) {
  const d = decorById(id);
  if (!d) return false;
  return isPlaceable(id) ? decorCount(id) < (d.max || 1) : !ownsDecor(id);
}

// Buy decor `id`.
//   placeable → one more piece, in storage; emits 'decor' and then
//               'place-request' {uid} so the scene lets the player put it
//               down. Returns the new piece, or null (at max / unaffordable).
//   otherwise → owned once and switched on right away. Returns true/false.
export function buyDecor(id) {
  refresh();
  const d = decorById(id);
  if (isPlaceable(id)) {
    if (!canBuyDecor(id) || !spendCoins(d.cost)) return null;
    const item = { uid: 'd' + state.nextUid++, id, at: Date.now(), pos: null };
    state.items.push(item);
    save();
    emit('decor');
    emit('place-request', { uid: item.uid });
    return copyItem(item);
  }
  if (!d || ownsDecor(id) || !spendCoins(d.cost)) return false;
  state.decor[id] = { on: true, at: Date.now() };
  save();
  emit('decor');
  return true;
}
// Pond and effects only; placeable objects are placed or stored per piece.
export function setDecorOn(id, on) {
  refresh();
  if (isPlaceable(id) || !ownsDecor(id)) return;
  state.decor[id].on = !!on;
  save();
  emit('decor');
}

// Put piece `uid` down at world (x, z) (rounded to 2 decimals) — also used to
// move a placed one. The scene checks the ground and overlaps beforehand.
// False if there is no such piece or x/z aren't finite numbers.
export function placeDecor(uid, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  refresh();
  const it = state.items.find(i => i.uid === uid);
  if (!it) return false;
  it.pos = { x: round2(x), z: round2(z) };
  save();
  emit('decor');
  return true;
}
// Take piece `uid` out of the garden into storage. False if there is no such piece.
export function storeDecor(uid) {
  refresh();
  const it = state.items.find(i => i.uid === uid);
  if (!it) return false;
  it.pos = null;
  save();
  emit('decor');
  return true;
}
// Ask the scene to let the player place (or move) piece `uid`; nothing is saved.
export function requestPlacement(uid) {
  refresh();
  if (!state.items.some(it => it.uid === uid)) return false;
  emit('place-request', { uid });
  return true;
}

/* ---------- nest position (3D garden) ---------- */
export function nestPosition() {
  return validPos(state.nestPos) ? { x: state.nestPos.x, z: state.nestPos.z } : { x: NEST_SPOT[0], z: NEST_SPOT[1] };
}
// Move the nest to world (x, z) (rounded to 2 decimals). False for non-finite input.
export function setNestPosition(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  refresh();
  state.nestPos = { x: round2(x), z: round2(z) };
  save();
  emit('nest');
  return true;
}

// Start the garden over: every bird, egg and decor piece/item, the nest's
// position and the Vogelbuch (discovered species and variants) are wiped; the
// player keeps one starter bird. Coins (engine.js) and quiz progress are separate saves and stay. The
// garden as it was is kept under BACKUP_KEY. Uids keep counting up, so no new
// bird can reuse the uid of one the scene still shows.
export function resetGarden() {
  refresh();
  try { const prev = localStorage.getItem(KEY); if (prev) localStorage.setItem(BACKUP_KEY, prev); } catch (e) { }
  const nextUid = state.nextUid;
  state = fresh();
  state.nextUid = nextUid;
  state.birds.push(newBird(STARTER, null, 'starter'));
  state.discovered[STARTER] = Date.now();
  save();
  emit('reset'); emit('decor'); emit('eggs', { eggs: [] }); emit('nest');
}
