// Spaced-repetition / mastery tracking, coin wallet, and session building.
const LS_KEY = 'neuroQuizV1';
const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 14, 30]; // days per Leitner level 0..5

let srs = load();
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(srs)); } catch (e) { } }

export function getSRS() { return srs; }
export function resetProgress() { srs = {}; save(); }

/* ---------- Gold-coin wallet (gamification currency) ----------
 * Stored separately from the SRS map (key kept from the first version of the
 * app, so coins and birds bought in the garden carry over). */
const COIN_KEY = 'microbioCoinsV1';
let wallet = loadWallet();
function loadWallet() {
  try {
    return Object.assign({ coins: 0, streak: 0, bestStreak: 0, earnedTotal: 0, spentTotal: 0 },
      JSON.parse(localStorage.getItem(COIN_KEY)) || {});
  } catch (e) { return { coins: 0, streak: 0, bestStreak: 0, earnedTotal: 0, spentTotal: 0 }; }
}
function saveWallet() { try { localStorage.setItem(COIN_KEY, JSON.stringify(wallet)); } catch (e) { } }

// Re-read before reading/mutating: another open tab may have earned or spent coins.
export function getWallet() { wallet = loadWallet(); return { ...wallet }; }
export function getCoins() { wallet = loadWallet(); return wallet.coins; }

// Spend coins (returns false if the player can't afford it) — for the garden.
export function spendCoins(n) {
  wallet = loadWallet();
  n = Math.max(0, Math.round(n));
  if (n > wallet.coins) return false;
  wallet.coins -= n; wallet.spentTotal += n; saveWallet(); return true;
}

// Reward for one graded answer.
//   base        = round(score × 5)
//   streakBonus = +1 per consecutive ace, capped at +3 (resets on any non-ace)
//   milestone   = +3 the first time a card is ever fully aced
//   weight      = label/open questions are bigger tasks → ×2 base
export function awardCoins(score, { firstFullCorrect = false, weight = 1 } = {}) {
  wallet = loadWallet();
  const base = Math.round(score * 5 * weight);
  let streakBonus = 0;
  if (score >= 0.999) { wallet.streak++; streakBonus = Math.min(wallet.streak - 1, 3); }
  else { wallet.streak = 0; }
  wallet.bestStreak = Math.max(wallet.bestStreak, wallet.streak);
  const milestone = firstFullCorrect ? 3 : 0;
  const total = base + streakBonus + milestone;
  wallet.coins += total; wallet.earnedTotal += total;
  saveWallet();
  return { base, streakBonus, milestone, total, streak: wallet.streak };
}

export function cardState(id) {
  return srs[id] || { level: 0, due: 0, seen: 0, correct: 0, wrong: 0, scoreSum: 0 };
}
export function isNew(id) { return !srs[id] || srs[id].seen === 0; }
export function isDue(id) { return !isNew(id) && srs[id].due <= Date.now(); }
export function isWeak(id) {
  const s = srs[id];
  if (!s || !s.seen) return false;
  return s.level <= 1 || (s.scoreSum / s.seen) < 0.6;
}
export const MASTER_LEVEL = 4;
export function masteryLevel(id) {
  const s = srs[id];
  if (!s || !s.seen) return 'new';
  if (s.level >= MASTER_LEVEL) return 'mastered';
  if (s.level >= 2) return 'learning';
  return 'weak';
}

export function gradeScore(id, score) {
  const s = srs[id] || (srs[id] = { level: 0, due: 0, seen: 0, correct: 0, wrong: 0, scoreSum: 0 });
  const wasAced = !!s.aced;
  s.seen++;
  s.scoreSum += score;
  s.last = score;
  if (score >= 0.999) { s.correct++; s.level = Math.min(s.level + 1, 5); s.aced = true; }
  else if (score >= 0.5) { s.correct++; /* partial — hold level */ }
  else { s.wrong++; s.level = Math.max(s.level - 1, 0); }
  s.due = Date.now() + INTERVALS[s.level] * DAY;
  save();
  return { firstFullCorrect: score >= 0.999 && !wasAced };
}

export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Build a session queue.
//   scope: all | new | weak | due
//   size : max questions in the round (0 = all)
// For "all", cards that need work come first: weak+due → due → new → the rest.
export function buildQueue(items, { scope, size }) {
  let pool = items.slice();
  if (scope === 'new') pool = pool.filter(it => isNew(it.id));
  if (scope === 'weak') pool = pool.filter(it => isWeak(it.id));
  if (scope === 'due') pool = pool.filter(it => isDue(it.id));
  const rank = it => isNew(it.id) ? 2 : (isWeak(it.id) && isDue(it.id)) ? 0 : isDue(it.id) ? 1 : 3;
  const buckets = [[], [], [], []];
  for (const it of shuffle(pool)) buckets[rank(it)].push(it);
  let q = buckets.flat();
  if (size && q.length > size) q = q.slice(0, size);
  return shuffle(q);
}
