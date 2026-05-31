// Scoring, spaced-repetition / mastery tracking, and session building.
const LS_KEY = 'microbioQuizV1';
const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 14, 30]; // days per Leitner level 0..5

let srs = load();
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
function save() { localStorage.setItem(LS_KEY, JSON.stringify(srs)); }

export function getSRS() { return srs; }
export function resetProgress() { srs = {}; save(); }
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
  s.seen++;
  s.scoreSum += score;
  if (score >= 0.999) { s.correct++; s.level = Math.min(s.level + 1, 5); }
  else if (score >= 0.5) { s.correct++; /* partial — hold level */ }
  else { s.wrong++; s.level = Math.max(s.level - 1, 0); }
  s.due = Date.now() + INTERVALS[s.level] * DAY;
  save();
}

// Aggregate mastery for an entity = combine all of its generated items (`entityId:*`).
export function entityMastery(entityId) {
  const keys = Object.keys(srs).filter(k => k === entityId || k.startsWith(entityId + ':'));
  if (!keys.length) return 'new';
  let seen = 0, scoreSum = 0, lvl = 0;
  for (const k of keys) { const s = srs[k]; seen += s.seen; scoreSum += s.scoreSum; lvl = Math.max(lvl, s.level); }
  if (!seen) return 'new';
  if (lvl >= 4) return 'mastered';
  if (lvl >= 2) return 'learning';
  return 'weak';
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
