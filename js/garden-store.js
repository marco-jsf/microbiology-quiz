// Ownership state for the garden: which birds the player has bought, and how
// many of each (each owned copy is one bird living in the scene). Persisted in
// its own localStorage key; purchases are paid for out of the coin wallet.

import { birdById, STARTER } from './garden-data.js';
import { spendCoins } from './engine.js';

const KEY = 'microbioBirdsV1';

let state = load();
function load() {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
  if (!s || typeof s !== 'object' || !s.owned) {
    s = { owned: { [STARTER]: 1 } };   // first run — gift the starter bird
  }
  return s;
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

export function ownedCount(id) { return state.owned[id] || 0; }
export function isOwned(id) { return ownedCount(id) > 0; }
// {id: count} of everything the player owns — the flock the garden should spawn.
export function ownedFlock() { return { ...state.owned }; }

// Attempt to buy one of `id`. Returns true on success (coins deducted, count++).
export function buy(id) {
  const def = birdById(id);
  if (!def || !spendCoins(def.cost)) return false;
  state.owned[id] = ownedCount(id) + 1;
  save();
  return true;
}

export function resetGarden() { state = { owned: { [STARTER]: 1 } }; save(); }
