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
//     is kept in `variantWas` (see migrateVariants).

import {
  birdById, STARTER, eggTierById, speciesForTier, VARIANT_PITY,
  NEST_CAPACITY, decorById, NEW_SPECIES_WEIGHT,
} from './garden-data.js';
import { variantsOf, variantFor, resolveVariantId } from './garden-variants.js';
import { spendCoins } from './engine.js';

const KEY = 'microbioBirdsV1';
// The garden as it was right before the last resetGarden() (the raw saved
// string). Nothing reads it; it is there so an accidental reset can be undone
// by hand: localStorage.setItem('microbioBirdsV1', localStorage.getItem('microbioBirdsV1-backup')).
const BACKUP_KEY = 'microbioBirdsV1-backup';
const NAME_MAX = 18;

let state = load();

function fresh() {
  return { owned: {}, birds: [], nextUid: 1, eggs: [], decor: {}, variantsSeen: {}, hatched: 0, sinceVariant: 0 };
}

function load() {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
  const firstRun = !s || typeof s !== 'object' || !s.owned || typeof s.owned !== 'object';
  const st = Object.assign(fresh(), firstRun ? {} : s);
  if (!Array.isArray(st.birds)) st.birds = [];
  if (!Array.isArray(st.eggs)) st.eggs = [];
  if (!st.decor || typeof st.decor !== 'object') st.decor = {};
  if (!st.variantsSeen || typeof st.variantsSeen !== 'object') st.variantsSeen = {};
  if (!Number.isFinite(st.nextUid) || st.nextUid < 1) st.nextUid = 1;
  // Never hand out a uid that already exists (defensive against hand-edited saves).
  for (const x of [...st.birds, ...st.eggs]) {
    const n = parseInt(String(x.uid || '').slice(1), 10);
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
  if (firstRun || added || migrated) persist(st);
  return st;
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
function save() { syncOwned(state); persist(state); }
// Another tab may have written the save since this tab loaded it. Every mutation
// starts from the latest persisted state, so a stale tab can't overwrite (and
// lose) birds, eggs or decor that were added elsewhere.
function refresh() { state = load(); }

/* ---------- change notifications ----------
 * Events: 'bird-added' {bird} (bought in the shop) · 'bird-renamed' {bird}
 *         'eggs' {eggs} (bought / warmed / hatched) · 'decor' {}
 *         'reset' {} (garden wiped; followed by 'decor' and 'eggs')
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
    emit('decor'); emit('eggs', { eggs: listEggs() });
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
// eggs existed, or the starter). Birds are never removed, so that is the same
// as owning one — old saves need no new field. Only discovered species can be
// bought; new ones come from eggs.
export function isDiscovered(id) { return isOwned(id); }
// {id: count} of everything the player owns (all variants count toward their species).
export function ownedFlock() { return { ...state.owned }; }
// Every individual bird, oldest first: [{uid, species, variant, name, from, at}].
// from: 'starter' | 'shop' | 'egg' | 'legacy' (owned before birds had identities; at = null).
export function listBirds() { return state.birds.map(copy); }
export function getBird(uid) { return copy(state.birds.find(b => b.uid === uid)); }

// Buy one more normal-coloured `id` of a DISCOVERED species. Returns the new
// bird, or null if the species is still undiscovered or unaffordable.
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

/* ---------- decor ---------- */
export function ownsDecor(id) { return !!state.decor[id]; }
export function isDecorOn(id) { return !!state.decor[id]?.on; }
// Ids of owned decor that is switched on (objects and effects).
export function activeDecor() { return Object.keys(state.decor).filter(id => state.decor[id].on && decorById(id)); }
// Buy decor `id` (placed/switched on right away). Returns true on success.
export function buyDecor(id) {
  refresh();
  const d = decorById(id);
  if (!d || ownsDecor(id) || !spendCoins(d.cost)) return false;
  state.decor[id] = { on: true, at: Date.now() };
  save();
  emit('decor');
  return true;
}
export function setDecorOn(id, on) {
  refresh();
  if (!ownsDecor(id)) return;
  state.decor[id].on = !!on;
  save();
  emit('decor');
}

// Start the garden over: every bird, egg and decor item and the Vogelbuch
// (discovered species and variants) are wiped; the player keeps one starter
// bird. Coins (engine.js) and quiz progress are separate saves and stay. The
// garden as it was is kept under BACKUP_KEY. Uids keep counting up, so no new
// bird can reuse the uid of one the scene still shows.
export function resetGarden() {
  refresh();
  try { const prev = localStorage.getItem(KEY); if (prev) localStorage.setItem(BACKUP_KEY, prev); } catch (e) { }
  const nextUid = state.nextUid;
  state = fresh();
  state.nextUid = nextUid;
  state.birds.push(newBird(STARTER, null, 'starter'));
  save();
  emit('reset'); emit('decor'); emit('eggs', { eggs: [] });
}
