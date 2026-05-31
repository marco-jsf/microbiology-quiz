import { loadChapters } from './data.js';
import * as engine from './engine.js';
import { generateItems } from './quizgen.js';
import { quizCardHTML, feedback, dashboardHTML, entityProfileHTML } from './render.js';
import { mountGarden, unmountGarden } from './garden.js';

const $ = s => document.querySelector(s);
const view = $('#view');

const state = {
  chapters: [], chapterSel: 'mixed', scope: 'all', mode: 'quiz',
  pool: [], queue: [], idx: 0, current: null, answered: false,
  selected: new Set(), session: { seen: 0, scoreSum: 0 }
};

/* ---------- pool / session ---------- */
function selectedChapters() {
  return state.chapterSel === 'mixed' ? state.chapters : state.chapters.filter(c => c.id === state.chapterSel);
}
function buildPool() {
  const chaps = selectedChapters();
  const distract = chaps.flatMap(c => c.entities);
  const items = [];
  for (const c of chaps) {
    for (const q of c.questions) items.push({ ...q, chapter: c.id, chapterTitle: c.title, chapterColor: c.color });
    if (c.entities.length) items.push(...generateItems(c.entities, distract, c));
  }
  return items;
}
function buildSession() {
  state.pool = buildPool();
  state.queue = engine.buildQueue(state.pool, { scope: state.scope });
  state.idx = 0; state.answered = false; state.selected = new Set();
  state.session = { seen: 0, scoreSum: 0 };
}

/* ---------- statbar ---------- */
function renderStatbar() {
  const weak = state.pool.filter(it => !engine.isNew(it.id) && engine.isWeak(it.id)).length;
  const acc = state.session.seen ? Math.round(100 * state.session.scoreSum / state.session.seen) : 0;
  $('#statbar').innerHTML = `
    <div class="stat"><div class="n">${state.queue.length}</div><div class="l">This round</div></div>
    <div class="stat"><div class="n">${state.session.seen}</div><div class="l">Answered</div></div>
    <div class="stat"><div class="n" style="color:${acc >= 70 ? 'var(--good)' : acc >= 40 ? 'var(--warn)' : 'var(--bad)'}">${acc}%</div><div class="l">Avg score</div></div>
    <div class="stat"><div class="n" style="color:var(--warn)">${weak}</div><div class="l">Weak in scope</div></div>`;
}

/* ---------- render ---------- */
function render() {
  if (state.mode === 'garden') return;   // garden owns #view; don't clobber it
  if (state.mode === 'dash') { view.innerHTML = dashboardHTML(state.chapters); renderStatbar(); return; }
  if (state.idx >= state.queue.length) return renderDone();
  const item = state.queue[state.idx];
  state.current = item; state.answered = false; state.selected = new Set();
  view.innerHTML = quizCardHTML(item, state.idx, state.queue.length);
  renderStatbar();
}
function renderDone() {
  const acc = state.session.seen ? Math.round(100 * state.session.scoreSum / state.session.seen) : 0;
  view.innerHTML = `<div class="card"><div class="card-body" style="align-items:center;justify-content:center;text-align:center">
      <div style="font-size:46px">🎉</div><h2 style="margin:8px 0">Round complete!</h2>
      <p style="color:var(--mut)">Answered <b style="color:var(--txt)">${state.session.seen}</b> questions · average score
      <b style="color:${acc >= 70 ? 'var(--good)' : 'var(--warn)'}">${acc}%</b>.</p>
      <div class="actions" style="max-width:430px">
        <button class="btn primary" id="againBtn">New round</button>
        <button class="btn" id="weakBtn">Focus weak spots</button>
      </div></div></div>`;
  renderStatbar();
}

function updateOptionsUI() {
  document.querySelectorAll('.opt').forEach((el, i) => {
    const sel = state.selected.has(i);
    el.classList.toggle('sel', sel);
    el.querySelector('.box').textContent = sel ? '✓' : '';
  });
}

function submit() {
  const item = state.current;
  const score = engine.scoreItem(item, state.selected);
  const grade = engine.gradeScore(item.id, score);
  const reward = engine.awardCoins(score, grade);
  state.session.seen++; state.session.scoreSum += score; state.answered = true;
  document.querySelectorAll('.opt').forEach((el, i) => {
    el.classList.add('disabled');
    const correct = !!item.options[i].correct, sel = state.selected.has(i);
    if (correct && sel) el.classList.add('correct');
    else if (correct && !sel) el.classList.add('missed');
    else if (!correct && sel) el.classList.add('wrongpick');
  });
  const fb = $('#fb'); const r = feedback(item, score, reward);
  fb.className = 'fb show ' + r.cls; fb.innerHTML = r.html;
  $('#actionBtn').textContent = state.idx + 1 >= state.queue.length ? 'Finish' : 'Next';
  updateCoinDisplay(reward.total);
  renderStatbar();
}

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

/* ---------- events ---------- */
view.addEventListener('click', e => {
  const opt = e.target.closest('.opt');
  if (opt && state.mode === 'quiz' && !state.answered) {
    const i = +opt.dataset.i;
    if (state.current.multi) { state.selected.has(i) ? state.selected.delete(i) : state.selected.add(i); }
    else { state.selected = new Set([i]); }
    updateOptionsUI();
    return;
  }
  if (e.target.id === 'actionBtn') { state.answered ? next() : submit(); return; }
  if (e.target.id === 'againBtn') { buildSession(); render(); return; }
  if (e.target.id === 'weakBtn') { state.scope = 'weak'; syncPills(); buildSession(); render(); return; }
  if (e.target.id === 'resetBtn') { if (confirm('Reset ALL progress (including coins)? This cannot be undone.')) { engine.resetProgress(); updateCoinDisplay(); render(); } return; }
  const chip = e.target.closest('.gchip');
  if (chip) {
    const ent = state.chapters.flatMap(c => c.entities).find(x => x.id === chip.dataset.eid);
    if (ent) { $('#peek').innerHTML = entityProfileHTML(ent); $('#peek').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }
});
function next() { state.idx++; render(); }

document.addEventListener('keydown', e => {
  if (state.mode !== 'quiz' || !state.current) return;
  if (!state.answered && /^[1-4]$/.test(e.key)) {
    const i = +e.key - 1;
    if (i < state.current.options.length) {
      if (state.current.multi) { state.selected.has(i) ? state.selected.delete(i) : state.selected.add(i); }
      else state.selected = new Set([i]);
      updateOptionsUI();
    }
  } else if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (state.answered) next();
    else if (state.selected.size) submit();
  }
});

/* ---------- controls ---------- */
function syncPills() {
  document.querySelectorAll('#scopePill button').forEach(b => b.classList.toggle('on', b.dataset.s === state.scope));
}
function restart() { buildSession(); render(); }

function wireControls() {
  const sel = $('#chapSel');
  sel.innerHTML = `<option value="mixed">Mixed — all chapters</option>` +
    state.chapters.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
  sel.onchange = () => { state.chapterSel = sel.value; restart(); };
  $('#scopePill').onclick = e => { if (e.target.dataset.s) { state.scope = e.target.dataset.s; syncPills(); restart(); } };
  $('#restartBtn').onclick = restart;
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    const prev = state.mode;
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active'); state.mode = t.dataset.mode;
    if (prev === 'garden' && state.mode !== 'garden') unmountGarden();
    const sidebars = state.mode === 'dash' || state.mode === 'garden';
    $('#controls').style.display = sidebars ? 'none' : 'flex';
    if (state.mode === 'garden') { $('#statbar').innerHTML = ''; mountGarden(view); return; }
    if (state.mode === 'quiz' && state.idx >= state.queue.length) buildSession();
    render();
  });
}

/* ---------- boot ---------- */
(async function init() {
  try {
    state.chapters = await loadChapters();
  } catch (err) {
    view.innerHTML = `<div class="empty">⚠ ${err.message}<br><br>This app loads JSON, so it must be served over HTTP.<br>Run <kbd>npx serve</kbd> or <kbd>python3 -m http.server</kbd> in the project folder and open the localhost URL.</div>`;
    return;
  }
  wireControls(); syncPills(); updateCoinDisplay(); buildSession(); render();
})();
