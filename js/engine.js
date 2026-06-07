// Scoring, spaced-repetition / mastery tracking, and session building.
const LS_KEY = 'microbioQuizV1';
const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 14, 30]; // days per Leitner level 0..5

let srs = load();
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
function save() { localStorage.setItem(LS_KEY, JSON.stringify(srs)); }

export function getSRS() { return srs; }
export function resetProgress() { srs = {}; save(); resetWallet(); }

/* ---------- Gold-coin wallet (gamification currency) ----------
 * Stored separately from the SRS map so it survives independently and is
 * trivial for the future garden minigame to read/spend against. */
const COIN_KEY = 'microbioCoinsV1';
let wallet = loadWallet();
function loadWallet() {
  try {
    return Object.assign({ coins: 0, streak: 0, bestStreak: 0, earnedTotal: 0, spentTotal: 0 },
      JSON.parse(localStorage.getItem(COIN_KEY)) || {});
  } catch (e) { return { coins: 0, streak: 0, bestStreak: 0, earnedTotal: 0, spentTotal: 0 }; }
}
function saveWallet() { localStorage.setItem(COIN_KEY, JSON.stringify(wallet)); }

export function getWallet() { return { ...wallet }; }
export function getCoins() { return wallet.coins; }
export function resetWallet() { wallet = { coins: 0, streak: 0, bestStreak: 0, earnedTotal: 0, spentTotal: 0 }; saveWallet(); }

// Spend coins (returns false if the player can't afford it) — for the minigame.
export function spendCoins(n) {
  n = Math.max(0, Math.round(n));
  if (n > wallet.coins) return false;
  wallet.coins -= n; wallet.spentTotal += n; saveWallet(); return true;
}

// Reward for one graded answer. Returns a breakdown so the UI can explain it.
//   base       = round(score × 5)           → {0,1,3,4,5} for the usual scores
//   streakBonus= +1 per consecutive ace, capped at +3 (resets on any non-ace)
//   milestone  = +3 the first time a card is ever fully aced
export function awardCoins(score, { firstFullCorrect = false } = {}) {
  const base = Math.round(score * 5);
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
  return srs[id] || (srs[id] = { level: 0, due: 0, seen: 0, correct: 0, wrong: 0, scoreSum: 0 });
}
export function isNew(id) { return !srs[id] || srs[id].seen === 0; }
export function isDue(id) { return cardState(id).due <= Date.now(); }
export function isWeak(id) {
  const s = srs[id];
  if (!s || !s.seen) return true;
  return s.level <= 1 || (s.scoreSum / s.seen) < 0.6;
}
export function masteryLevel(id) {
  const s = srs[id];
  if (!s || !s.seen) return 'new';
  if (s.level >= 4) return 'mastered';
  if (s.level >= 2) return 'learning';
  return 'weak';
}

// Scoring.
//  • Single-answer (radio): all-or-nothing — 1 only if the one correct option is chosen.
//  • Multi-select: exam-style partial credit — every option graded,
//    score = correctly-classified / total → exactly {0,.25,.5,.75,1} for 4 options.
export function scoreItem(item, selectedSet) {
  const opts = item.options;
  if (!item.multi) {
    const correctIdx = opts.findIndex(o => o.correct);
    return (selectedSet.size === 1 && selectedSet.has(correctIdx)) ? 1 : 0;
  }
  let correctClass = 0;
  opts.forEach((o, i) => { if (selectedSet.has(i) === !!o.correct) correctClass++; });
  return correctClass / opts.length;
}

export function gradeScore(id, score) {
  const s = cardState(id);
  const wasAced = !!s.aced;
  s.seen++;
  s.scoreSum += score;
  if (score >= 0.999) { s.correct++; s.level = Math.min(s.level + 1, 5); s.aced = true; }
  else if (score >= 0.5) { s.correct++; /* partial — hold level */ }
  else { s.wrong++; s.level = Math.max(s.level - 1, 0); }
  s.due = Date.now() + INTERVALS[s.level] * DAY;
  save();
  return { firstFullCorrect: score >= 0.999 && !wasAced };
}

// Aggregate mastery for an entity across all of its attribute questions.
//   • `expectedIds` (preferred) = every question the entity now generates
//     (from quizgen.entityItemIds). Untouched attributes count as level-0 so an
//     organism is only "mastered" once *all* its facts are mastered — this is
//     what surfaces "which attributes don't sit yet".
//   • Without it we fall back to the legacy `entityId:*` key scan (max level),
//     keeping older callers and pre-expansion behaviour working.
export const MASTER_LEVEL = 4, MAX_LEVEL = 5;
function aggregate(entityId, expectedIds) {
  if (expectedIds && expectedIds.length) {
    let seen = 0, scoreSum = 0, levelSum = 0, minLevel = MAX_LEVEL;
    for (const id of expectedIds) {
      const s = srs[id];
      const lvl = s && s.seen ? s.level : 0;
      levelSum += lvl; minLevel = Math.min(minLevel, lvl);
      if (s) { seen += s.seen; scoreSum += s.scoreSum; }
    }
    return { seen, scoreSum, avgLevel: levelSum / expectedIds.length, minLevel, count: expectedIds.length };
  }
  const keys = Object.keys(srs).filter(k => k === entityId || k.startsWith(entityId + ':'));
  let seen = 0, scoreSum = 0, lvl = 0;
  for (const k of keys) { const s = srs[k]; seen += s.seen; scoreSum += s.scoreSum; lvl = Math.max(lvl, s.level); }
  return { seen, scoreSum, avgLevel: lvl, minLevel: lvl, count: keys.length };
}
export function entityMastery(entityId, expectedIds) {
  const g = aggregate(entityId, expectedIds);
  if (!g.seen) return 'new';
  if (g.minLevel >= MASTER_LEVEL) return 'mastered';   // every attribute mastered
  if (g.avgLevel >= 2) return 'learning';
  return 'weak';
}

// Detailed level / mastery progress for one entity — for the profile dialog.
// `level` is the average Leitner level across the entity's attribute questions
// (untouched attributes pull it down); mastery is hit when all reach MASTER_LEVEL.
export function entityProgress(entityId, expectedIds) {
  const g = aggregate(entityId, expectedIds);
  const level = g.avgLevel;
  return {
    level: Math.round(level * 10) / 10, seen: g.seen, count: g.count,
    mastery: entityMastery(entityId, expectedIds),
    avg: g.seen ? g.scoreSum / g.seen : 0,
    toMaster: Math.round(Math.max(0, MASTER_LEVEL - level) * 10) / 10,
    pct: Math.min(1, level / MASTER_LEVEL)
  };
}

export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Build an interleaved session queue from an item pool.
export function buildQueue(items, { scope }) {
  let pool = items.slice();
  if (scope === 'weak') pool = pool.filter(it => isWeak(it.id));
  if (scope === 'due') pool = pool.filter(it => isDue(it.id) && !isNew(it.id));
  return shuffle(pool);
}
