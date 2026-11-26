import { loadChapters } from './data.js';
import * as engine from './engine.js';
import * as qt from './qtypes.js';
import { quizCardHTML, feedbackHTML, dashboardHTML } from './render.js';
import { mountGarden as mount2D, unmountGarden as unmount2D } from './garden.js';
import { warmEggs, listEggs, isEggReady, readyEggCount, onGardenChange } from './garden-store.js';

const $ = s => document.querySelector(s);
const view = $('#view');

const PREF_KEY = 'neuroQuizPrefs';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } })();
function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({
      chapterSel: state.chapterSel, topicSel: state.topicSel, format: state.format,
      scope: state.scope, examOnly: state.examOnly, size: state.size
    }));
  } catch (e) { }
}

const state = {
  chapters: [], mode: 'quiz',
  chapterSel: prefs.chapterSel || 'mixed', topicSel: prefs.topicSel || '', format: prefs.format || 'all',
  scope: prefs.scope || 'all', examOnly: !!prefs.examOnly, size: prefs.size ?? 30,
  pool: [], queue: [], idx: 0, current: null, st: null, answered: false,
  session: { seen: 0, scoreSum: 0 }
};

/* ---------- pool / session ---------- */
function filteredQuestions() {
  const chaps = state.chapterSel === 'mixed' ? state.chapters : state.chapters.filter(c => c.id === state.chapterSel);
  const types = state.format === 'all' ? null : qt.FORMAT_GROUPS[state.format].types;
  const items = [];
  for (const c of chaps) {
    for (const q of c.questions) {
      if (state.topicSel && state.chapterSel !== 'mixed' && q.topic !== state.topicSel) continue;
      if (types && !types.includes(q.type)) continue;
      if (state.examOnly && q.source !== 'exam') continue;
      items.push({ ...q, chapter: c.id, chapterTitle: c.title, chapterShort: c.short, chapterColor: c.color });
    }
  }
  return items;
}
function buildSession() {
  state.pool = filteredQuestions();
  state.queue = engine.buildQueue(state.pool, { scope: state.scope, size: state.size }).map(qt.prepare);
  state.idx = 0; state.answered = false;
  state.session = { seen: 0, scoreSum: 0 };
}

/* ---------- statbar ---------- */
function renderStatbar() {
  const weak = state.pool.filter(it => engine.isWeak(it.id)).length;
  const due = state.pool.filter(it => engine.isDue(it.id)).length;
  const acc = state.session.seen ? Math.round(100 * state.session.scoreSum / state.session.seen) : 0;
  $('#statbar').innerHTML = `
    <div class="stat"><div class="n">${state.queue.length}<span class="of">/${state.pool.length}</span></div><div class="l">Diese Runde / Auswahl</div></div>
    <div class="stat"><div class="n">${state.session.seen}</div><div class="l">Beantwortet</div></div>
    <div class="stat"><div class="n" style="color:${acc >= 70 ? 'var(--good)' : acc >= 40 ? 'var(--warn)' : 'var(--bad)'}">${acc}%</div><div class="l">Ø Punkte</div></div>
    <div class="stat"><div class="n" style="color:var(--warn)">${weak}</div><div class="l">Schwach · ${due} fällig</div></div>`;
}

/* ---------- render ---------- */
function render() {
  if (state.mode === 'garden') return;
  if (state.mode === 'dash') { view.innerHTML = dashboardHTML(state.chapters); $('#statbar').innerHTML = ''; return; }
  if (!state.queue.length) return renderEmpty();
  if (state.idx >= state.queue.length) return renderDone();
  const item = state.queue[state.idx];
  state.current = item; state.answered = false;
  state.st = qt.createState(item);
  view.innerHTML = quizCardHTML(item, state.st, state.idx, state.queue.length);
  qt.sync(item, state.st, view);
  updateActionBtn();
  renderStatbar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function rerenderInteract() {
  const item = state.current;
  $('#qinteract').innerHTML = qt.bodyHTML(item, state.st);
  $('#qhint').textContent = qt.hintFor(item, state.st);
  qt.sync(item, state.st, view);
  updateActionBtn();
}
function updateActionBtn() {
  const b = $('#actionBtn'); if (!b || state.answered) return;
  b.textContent = qt.actionLabel(state.current, state.st);
  b.disabled = !qt.canAct(state.current, state.st);
}
function renderEmpty() {
  const why = state.scope === 'due' ? 'Gerade ist nichts fällig – super!' : state.scope === 'weak' ? 'Keine schwachen Fragen in dieser Auswahl.' :
    state.scope === 'new' ? 'Alle Fragen dieser Auswahl hast du schon gesehen.' : 'Keine Fragen passen zu diesen Filtern.';
  view.innerHTML = `<div class="empty">${why}<br><br><button class="btn" id="resetFiltersBtn">Filter zurücksetzen</button></div>`;
  renderStatbar();
}
function renderDone() {
  const acc = state.session.seen ? Math.round(100 * state.session.scoreSum / state.session.seen) : 0;
  view.innerHTML = `<div class="card"><div class="card-body" style="align-items:center;justify-content:center;text-align:center">
      <div style="font-size:46px">🎉</div><h2 style="margin:8px 0">Runde geschafft!</h2>
      <p style="color:var(--mut)"><b style="color:var(--txt)">${state.session.seen}</b> Fragen beantwortet · Ø
      <b style="color:${acc >= 70 ? 'var(--good)' : 'var(--warn)'}">${acc}%</b></p>
      <div class="actions" style="max-width:430px">
        <button class="btn primary" id="againBtn">Neue Runde</button>
        <button class="btn" id="weakBtn">Schwache Fragen üben</button>
      </div></div></div>`;
  renderStatbar();
}

function submit() {
  const item = state.current, st = state.st;
  if (qt.preSubmit(item, st, view)) { qt.sync(item, st, view); updateActionBtn(); return; }
  const score = qt.score(item, st);
  const grade = engine.gradeScore(item.id, score);
  const reward = engine.awardCoins(score, { ...grade, weight: item.type === 'label' ? 2 : 1 });
  const hatchReady = warmEggs(score);   // every answer warms the eggs in the garden nest
  state.session.seen++; state.session.scoreSum += score; state.answered = true;
  qt.reveal(item, st, view);
  const fb = $('#fb'); const r = feedbackHTML(item, score, reward);
  fb.className = 'fb show ' + r.cls; fb.innerHTML = r.html;
  const eggNote = eggLine(hatchReady);
  if (eggNote) fb.querySelector('.score')?.insertAdjacentHTML('beforeend', eggNote);
  const b = $('#actionBtn');
  b.disabled = false; b.textContent = state.idx + 1 >= state.queue.length ? 'Fertig' : 'Weiter';
  const skip = $('#skipBtn'); if (skip) skip.remove();
  updateCoinDisplay(reward.total);
  if (hatchReady.length) eggReadyToast(hatchReady.length);
  renderStatbar();
  fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function next() { state.idx++; render(); }

/* ---------- coin display ---------- */
function updateCoinDisplay(justEarned = 0) {
  const el = $('#coinCount'); if (!el) return;
  el.textContent = engine.getCoins();
  if (justEarned > 0) {
    const badge = $('#coinDisplay');
    badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
    const toast = document.createElement('span');
    toast.className = 'coin-toast'; toast.textContent = '+' + justEarned;
    badge.appendChild(toast);
    setTimeout(() => toast.remove(), 1400);
  }
}

/* ---------- garden eggs (warmed by answering) ---------- */
// Small note in the feedback line: how close the nearest egg is to hatching.
function eggLine(justReady) {
  const eggs = listEggs();
  if (!eggs.length) return '';
  if (justReady.length) return ` <span class="egg-earn">🥚 ${justReady.length > 1 ? 'Eier sind' : 'Ein Ei ist'} bereit zum Schlüpfen!</span>`;
  const waiting = eggs.filter(e => !isEggReady(e));
  if (!waiting.length) return '';
  const left = Math.min(...waiting.map(e => Math.ceil(e.need - e.warmth)));
  return ` <span class="egg-earn" title="Eier im Garten werden warm, während du Fragen beantwortest">🥚 noch ${left} ${left === 1 ? 'Antwort' : 'Antworten'}</span>`;
}
function updateGardenBadge() {
  const tab = document.querySelector('.tab[data-mode="garden"]');
  if (!tab) return;
  const n = readyEggCount();
  tab.classList.toggle('has-news', n > 0);
  tab.title = n ? (n > 1 ? `${n} Eier sind bereit zum Schlüpfen` : 'Ein Ei ist bereit zum Schlüpfen') : '';
}
function eggReadyToast(n) {
  const tab = document.querySelector('.tab[data-mode="garden"]');
  if (!tab) return;
  const toast = document.createElement('span');
  toast.className = 'egg-toast';
  toast.textContent = n > 1 ? '🐣 Eier bereit!' : '🐣 Ein Ei ist bereit!';
  tab.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}
onGardenChange((type, data) => {
  if (type === 'eggs') updateGardenBadge();
  if (type === 'bird-sold') updateCoinDisplay(data?.coins || 0);   // coins for a sold bird
});

/* ---------- events ---------- */
view.addEventListener('click', e => {
  const t = e.target;
  if (t.id === 'actionBtn') { state.answered ? next() : submit(); return; }
  if (t.id === 'skipBtn') { next(); return; }
  if (t.id === 'againBtn') { buildSession(); render(); return; }
  if (t.id === 'weakBtn') { state.scope = 'weak'; syncControls(); restart(); return; }
  if (t.id === 'resetFiltersBtn') {
    Object.assign(state, { chapterSel: 'mixed', topicSel: '', format: 'all', scope: 'all', examOnly: false });
    syncControls(); restart(); return;
  }
  if (t.id === 'resetBtn') {
    if (confirm('Gesamten Lernfortschritt zurücksetzen? (Münzen und Vögel bleiben.) Das lässt sich nicht rückgängig machen.')) { engine.resetProgress(); render(); }
    return;
  }
  if (t.id === 'toggleAllBtn') {
    const cards = [...document.querySelectorAll('.chap-card')];
    const collapse = cards.some(c => c.classList.contains('open'));
    cards.forEach(c => c.classList.toggle('open', !collapse));
    t.textContent = collapse ? 'Alle aufklappen' : 'Alle zuklappen';
    return;
  }
  const pr = t.closest('[data-practice]');
  if (pr) { startPractice(pr.dataset); return; }
  const head = t.closest('.chap-head');
  if (head) { head.parentElement.classList.toggle('open'); return; }
  if (t.closest('.stem-img, .sol-img')) { t.closest('img').classList.toggle('zoom'); return; }

  if (state.mode === 'quiz' && state.current && !state.answered) {
    const r = qt.onClick(state.current, state.st, t);
    if (r === 'rerender') rerenderInteract();
    else if (r) { qt.sync(state.current, state.st, view); updateActionBtn(); }
  }
});
view.addEventListener('input', e => {
  if (state.mode !== 'quiz' || !state.current || state.answered) return;
  qt.onInput(state.current, state.st, e.target);
  updateActionBtn();
});

function startPractice(ds) {
  if (ds.practice === 'exam') Object.assign(state, { chapterSel: 'mixed', topicSel: '', examOnly: true, format: 'all', scope: 'all' });
  if (ds.practice === 'chapter') Object.assign(state, { chapterSel: ds.cid, topicSel: '', examOnly: false, format: 'all', scope: 'all' });
  if (ds.practice === 'topic') Object.assign(state, { chapterSel: ds.cid, topicSel: decodeURIComponent(ds.topic), examOnly: false, format: 'all', scope: 'all' });
  switchMode('quiz');
  syncControls(); restart();
}

document.addEventListener('keydown', e => {
  if (state.mode !== 'quiz' || !state.current) return;
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'textarea' || tag === 'input' || tag === 'select';
  if (!typing && !state.answered && /^[1-9]$/.test(e.key)) {
    if (qt.onDigit(state.current, state.st, +e.key)) { qt.sync(state.current, state.st, view); updateActionBtn(); }
    return;
  }
  if (e.key !== 'Enter') return;
  if (tag === 'textarea' && !(e.metaKey || e.ctrlKey)) return;
  if (tag === 'input' && e.target.classList.contains('linput') && !state.answered) {
    e.preventDefault();
    const inputs = [...document.querySelectorAll('.linput')];
    const k = inputs.indexOf(e.target);
    if (k < inputs.length - 1) { inputs[k + 1].focus(); return; }
  } else if (tag === 'select' || (tag === 'input' && !e.target.classList.contains('linput'))) return;
  e.preventDefault();
  const b = $('#actionBtn');
  if (b && !b.disabled) b.click();
});

/* ---------- controls ---------- */
function topicOptions() {
  const ch = state.chapters.find(c => c.id === state.chapterSel);
  const sel = $('#topicSel');
  if (!ch) { sel.innerHTML = '<option value="">Alle Themen</option>'; sel.disabled = true; state.topicSel = ''; return; }
  sel.disabled = false;
  sel.innerHTML = '<option value="">Alle Themen</option>' + ch.topics.map(t => `<option>${t}</option>`).join('');
  if (!ch.topics.includes(state.topicSel)) state.topicSel = '';
  sel.value = state.topicSel;
}
function syncControls() {
  $('#chapSel').value = state.chapters.some(c => c.id === state.chapterSel) ? state.chapterSel : (state.chapterSel = 'mixed');
  topicOptions();
  $('#formatSel').value = state.format;
  $('#sizeSel').value = String(state.size);
  $('#examOnly').checked = state.examOnly;
  document.querySelectorAll('#scopePill button').forEach(b => b.classList.toggle('on', b.dataset.s === state.scope));
}
function restart() { savePrefs(); buildSession(); render(); }

function switchMode(mode) {
  const prev = state.mode;
  if (mode === prev && mode === 'quiz') return;   // re-rendering would re-open an answered question
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.mode === mode));
  state.mode = mode;
  if (prev === 'garden' && mode !== 'garden') closeGarden();
  $('#controls').style.display = mode === 'quiz' ? 'flex' : 'none';
  if (mode === 'garden') { $('#statbar').innerHTML = ''; openGarden(); return; }
  // Coming back after answering: move on, otherwise render() would show the same
  // question unanswered again and it could be graded (coins, eggs, SRS) twice.
  if (mode === 'quiz' && state.answered) { state.idx++; state.answered = false; }
  if (mode === 'quiz' && state.idx >= state.queue.length) buildSession();
  render();
}

/* ---------- garden tab ----------
 * The 2.5D garden (js/garden3d/, Three.js) is loaded only when the tab is
 * opened, so a missing WebGL2 or a failed download never affects the quiz;
 * then the old 2D garden (js/garden.js) takes over. */
let garden3d = null;          // Promise of the 2.5D garden module (resolves to null if it can't load)
let gardenNow = null;         // the garden that is mounted: { unmount }
let gardenTicket = 0;         // guards against switching tabs while the module loads
// Probed once: every probe would cost one of the few WebGL contexts a page may hold.
let hasWebgl2 = null;
function webgl2() {
  if (hasWebgl2 === null) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      hasWebgl2 = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (e) { hasWebgl2 = false; }
  }
  return hasWebgl2;
}
const GARDEN_LOAD_TIMEOUT = 20000;   // ms — a stalled download falls back to the 2D garden (for this visit)
async function openGarden() {
  const ticket = ++gardenTicket;
  document.body.classList.add('is-garden');
  let mod = null;
  if (webgl2()) {
    if (!gardenNow) view.innerHTML = '<div class="garden-loading">🌱 Garten wird gepflanzt …</div>';
    garden3d = garden3d || import('./garden3d/scene.js').catch(e => { console.error('[garden] 3D garden failed to load', e); garden3d = null; return null; });
    mod = await Promise.race([garden3d, new Promise(r => setTimeout(() => r(null), GARDEN_LOAD_TIMEOUT))]);
  }
  if (ticket !== gardenTicket || state.mode !== 'garden') return;   // left the tab meanwhile
  if (mod) {
    try { mod.mountGarden(view); gardenNow = { unmount: mod.unmountGarden }; return; }
    catch (e) { console.error('[garden] 3D garden could not start', e); garden3d = Promise.resolve(null); }
  }
  mount2D(view);
  gardenNow = { unmount: unmount2D };
}
function closeGarden() {
  gardenTicket++;
  document.body.classList.remove('is-garden');
  if (gardenNow) { try { gardenNow.unmount(); } catch (e) { console.error(e); } }
  gardenNow = null;
}

function wireControls() {
  const sel = $('#chapSel');
  sel.innerHTML = `<option value="mixed">Alle Vorlesungen gemischt</option>` +
    state.chapters.map(c => `<option value="${c.id}">${c.title} (${c.questions.length})</option>`).join('');
  sel.onchange = () => { state.chapterSel = sel.value; state.topicSel = ''; topicOptions(); restart(); };
  $('#topicSel').onchange = e => { state.topicSel = e.target.value; restart(); };
  $('#formatSel').innerHTML = `<option value="all">Alle Formate</option>` +
    Object.entries(qt.FORMAT_GROUPS).map(([k, g]) => `<option value="${k}">${g.label}</option>`).join('');
  $('#formatSel').onchange = e => { state.format = e.target.value; restart(); };
  $('#sizeSel').onchange = e => { state.size = +e.target.value; restart(); };
  $('#examOnly').onchange = e => { state.examOnly = e.target.checked; restart(); };
  $('#scopePill').onclick = e => { if (e.target.dataset.s) { state.scope = e.target.dataset.s; syncControls(); restart(); } };
  $('#restartBtn').onclick = restart;
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchMode(t.dataset.mode));
}

/* ---------- boot ---------- */
(async function init() {
  try {
    state.chapters = await loadChapters();
  } catch (err) {
    view.innerHTML = `<div class="empty">⚠ ${err.message}<br><br>Die App lädt JSON-Dateien und muss deshalb über HTTP laufen.<br>Im Projektordner <kbd>python3 -m http.server 8799</kbd> starten und <kbd>http://localhost:8799</kbd> öffnen.</div>`;
    return;
  }
  wireControls(); syncControls(); updateCoinDisplay(); updateGardenBadge(); buildSession(); render();
})();
