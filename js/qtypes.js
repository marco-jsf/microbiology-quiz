// Question types: render, interaction, scoring and reveal for each `type`.
//   single · multi · combo  — option buttons (combo = single over statement combinations)
//   open                    — model answer + self-assessment checklist
//   label                   — label a figure (word bank or free text)
//   order                   — put items into the right sequence
import { shuffle } from './engine.js';

const LETTERS = 'ABCDEFGH';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const TYPE_INFO = {
  single: { label: 'Single Choice', hint: 'Genau eine Antwort ist richtig.' },
  multi: { label: 'Mehrfachauswahl', hint: 'Mehrere Antworten können richtig sein – Teilpunkte pro Option.' },
  combo: { label: 'Aussagenkombination', hint: 'Prüfe jede Aussage und wähle die richtige Kombination.' },
  open: { label: 'Offene Frage', hint: 'Formuliere deine Antwort (schriftlich oder im Kopf), dann Lösung aufdecken und selbst bewerten.' },
  label: { label: 'Schaubild beschriften', hint: '' },
  order: { label: 'Reihenfolge', hint: 'Tippe die Elemente in der richtigen Reihenfolge an. Antippen in deiner Liste entfernt ein Element wieder.' }
};

// Format groups for the "Format" filter.
export const FORMAT_GROUPS = {
  mc: { label: 'Ankreuzen (Single/Multi/Kombi)', types: ['single', 'multi', 'combo'] },
  open: { label: 'Offene Fragen', types: ['open'] },
  label: { label: 'Schaubilder beschriften', types: ['label'] },
  order: { label: 'Reihenfolgen', types: ['order'] }
};

/* ---------------- free-text matching ---------------- */
function base(s, ae) {
  s = String(s || '').toLowerCase();
  if (ae) s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  return s.replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[α]/g, 'alpha').replace(/[β]/g, 'beta').replace(/[γ]/g, 'gamma').replace(/[δ]/g, 'delta')
    .replace(/[^a-z0-9+]/g, '');
}
function variants(lab) {
  const raw = [lab.answer, ...(lab.accept || [])];
  const out = new Set();
  for (const r of raw) {
    const noPar = r.replace(/\([^)]*\)/g, ' ');
    const pars = [...r.matchAll(/\(([^)]*)\)/g)].map(m => m[1]);
    for (const s of [r, noPar, ...pars]) {
      for (const ae of [false, true]) { const b = base(s, ae); if (b.length >= 2) out.add(b); }
    }
  }
  return [...out];
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const digits = s => s.replace(/[^0-9]/g, '');
// Fuzzy only for longer words, never across different numbers (D1 ≠ D2) or first letters.
export function matchesLabel(lab, input) {
  const u = base(input, false);
  if (!u) return false;
  return variants(lab).some(v => {
    if (v === u) return true;
    // "Ranvierscher Schnürring" ⊃ "Schnürring": long variant contained in a slightly longer input
    if (v.length >= 8 && u.includes(v) && u.length <= v.length + 8 && digits(v) === digits(u)) return true;
    const tol = v.length >= 10 ? 2 : v.length >= 6 ? 1 : 0;
    return tol > 0 && v[0] === u[0] && digits(v) === digits(u) && lev(u, v) <= tol;
  });
}

/* ---------------- combo helpers ---------------- */
export function comboLabel(c, n) {
  if (!c) return 'keine der Aussagen';
  if (c.length === n && n > 1) return 'alle Aussagen';
  const l = c.split('');
  if (l.length === 1) return 'nur ' + l[0];
  return 'nur ' + l.slice(0, -1).join(', ') + ' und ' + l[l.length - 1];
}
function genCombos(right, n) {
  const all = [];
  for (let m = 1; m < (1 << n); m++) {
    let s = ''; for (let k = 0; k < n; k++) if (m & (1 << k)) s += LETTERS[k];
    all.push(s);
  }
  const dist = c => LETTERS.slice(0, n).split('').filter(L => c.includes(L) !== right.includes(L)).length;
  const others = shuffle(all.filter(c => c !== right)).sort((a, b) => dist(a) - dist(b));
  const pick = [right, ...others.slice(0, 2), ...shuffle(others.slice(2)).slice(0, 1)];
  return pick.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/* ---------------- prepare (once per session) ---------------- */
export function prepare(q) {
  const it = { ...q };
  if (q.type === 'combo') {
    const n = q.statements.length;
    const right = q.statements.map((s, i) => s.correct ? LETTERS[i] : '').join('');
    const combos = q.combos && q.combos.length ? q.combos : genCombos(right, n);
    it.options = combos.map(c => ({ t: comboLabel(c, n), correct: c === right }));
  }
  if (q.type === 'label') {
    it.bankItems = shuffle([...new Set([...q.labels.map(l => l.answer), ...(q.bank || [])])]);
    it.answerCount = {};
    for (const l of q.labels) it.answerCount[l.answer] = (it.answerCount[l.answer] || 0) + 1;
  }
  if (q.type === 'order') {
    let s = shuffle(q.items.map((t, i) => i));
    if (s.every((v, i) => v === i)) s = s.reverse();
    it.shuffled = s;
  }
  return it;
}

export function createState(item) {
  switch (item.type) {
    case 'open': return { phase: 'write', checked: new Set(), text: '' };
    case 'label': return { fills: item.labels.map(() => ''), active: 0, mode: labelMode() };
    case 'order': return { seq: [] };
    default: return { selected: new Set() };
  }
}

/* ---------------- label mode (persisted) ---------------- */
const MODE_KEY = 'neuroLabelMode';
export function labelMode() { try { return localStorage.getItem(MODE_KEY) || 'bank'; } catch (e) { return 'bank'; } }
function setLabelMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (e) { } }

/* ---------------- render ---------------- */
export function hintFor(item, st) {
  if (item.type === 'label') return st.mode === 'bank'
    ? 'Feld antippen (oder es ist schon aktiv), dann den passenden Begriff aus der Wortbank wählen. Teilpunkte pro Feld.'
    : 'Begriffe frei eintippen – kleine Tippfehler, Groß-/Kleinschreibung und Deutsch/Englisch werden toleriert. Teilpunkte pro Feld.';
  if (item.type === 'open' && pointGroups(item))
    return `Gefragt ist je ein Punkt aus: ${pointGroups(item).join(' · ')}.`;
  if (item.type === 'open' && item.need && item.need < item.points.length)
    return `Gefragt sind ${item.need} Punkte – ${item.need} richtige Kernpunkte reichen für volle Punktzahl.`;
  return TYPE_INFO[item.type].hint;
}

export function bodyHTML(item, st) {
  switch (item.type) {
    case 'single': case 'multi': case 'combo': return optionsHTML(item);
    case 'open': return openHTML(item, st);
    case 'label': return labelHTML(item, st);
    case 'order': return orderHTML(item, st);
  }
  return '';
}

function optionsHTML(item) {
  const multi = item.type === 'multi';
  let pre = '';
  if (item.type === 'combo') {
    pre = `<ol class="stmts">${item.statements.map((s, i) =>
      `<li data-si="${i}"><span class="sl">${LETTERS[i]}</span><span class="st">${s.t}</span><span class="sv"></span></li>`).join('')}</ol>`;
  }
  return pre + `<div class="opts" id="opts">${item.options.map((o, i) => `
    <button class="opt ${multi ? 'checkbox' : 'radio'}" data-i="${i}">
      <span class="box"></span><span>${o.t}</span>
    </button>`).join('')}</div>`;
}

function openHTML(item, st) {
  return `<textarea class="open-ta" id="openTa" rows="5" placeholder="Deine Antwort (optional – nur für dich, wird nicht ausgewertet)">${esc(st.text)}</textarea>
    <div class="open-sol" id="openSol"></div>`;
}

// Open-question points are strings, or {t, g} objects when the question asks for
// "je ein …" from several categories (g = category name).
const ptText = p => typeof p === 'string' ? p : p.t;
const ptGroup = p => typeof p === 'string' ? null : (p.g || null);
export function pointGroups(item) {
  const gs = [...new Set(item.points.map(ptGroup).filter(Boolean))];
  return gs.length ? gs : null;
}

function openSolutionHTML(item) {
  const btn = (p, i) => `
    <button class="pt" data-p="${i}"><span class="box"></span><span>${ptText(p)}</span></button>`;
  const groups = pointGroups(item);
  const pts = groups
    ? groups.map(g => `<div class="pt-group">${g}</div>` +
      item.points.map((p, i) => ptGroup(p) === g ? btn(p, i) : '').join('')).join('')
    : item.points.map(btn).join('');
  const head = groups ? ' (je einer pro Kategorie genügt)' : item.need && item.need < item.points.length ? ` (${item.need} genügen)` : '';
  return `<div class="sol-head">Musterlösung – hake ab, was du hattest${head}:</div>
    <div class="pts">${pts}</div>
    ${item.answer ? `<div class="sol-text">${item.answer}</div>` : ''}
    ${item.answerImage ? `<img class="sol-img" src="${item.answerImage}" alt="Lösungsbild">` : ''}`;
}

function labelHTML(item, st) {
  const blanks = item.labels.map((l, i) => `
    <button class="blank" data-b="${i}" style="left:${l.x}%;top:${l.y}%;width:${l.w}%;height:${l.h}%">
      <span class="bn">${i + 1}</span><span class="bt"></span></button>`).join('');
  const rows = item.labels.map((l, i) => st.mode === 'bank'
    ? `<div class="lrow" data-b="${i}"><span class="bn">${i + 1}</span><span class="lval"></span></div>`
    : `<div class="lrow" data-b="${i}"><span class="bn">${i + 1}</span><input class="linput" data-b="${i}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Begriff …"></div>`).join('');
  const bank = st.mode === 'bank'
    ? `<div class="bank" id="bank">${item.bankItems.map((t, k) => `<button class="chipb" data-k="${k}">${t}</button>`).join('')}</div>` : '';
  return `<div class="mode-toggle"><span>Modus:</span>
      <button class="mt ${st.mode === 'bank' ? 'on' : ''}" data-mode="bank">Wortbank</button>
      <button class="mt ${st.mode === 'text' ? 'on' : ''}" data-mode="text">Freitext (wie in der Klausur)</button></div>
    <div class="fig-scroll"><div class="fig" style="aspect-ratio:${item.iw}/${item.ih};--r:${(item.iw / item.ih).toFixed(3)}">
      <img src="${item.image}" alt="Schaubild" draggable="false">${blanks}
    </div></div>
    ${item.iw / item.ih > 1.3 ? '<div class="fig-swipe">↔ Bild seitlich verschieben</div>' : ''}
    <div class="lrows">${rows}</div>${bank}`;
}

function orderHTML(item, st) {
  return `<div class="ord-wrap">
    <div class="ord-col"><div class="ord-h">Elemente</div><div class="ord-pool" id="ordPool">
      ${item.shuffled.map(i => `<button class="ord-it" data-o="${i}">${item.items[i]}</button>`).join('')}</div></div>
    <div class="ord-col"><div class="ord-h">Deine Reihenfolge</div><ol class="ord-seq" id="ordSeq"></ol></div>
  </div>`;
}

/* ---------------- sync UI with state ---------------- */
export function sync(item, st, root) {
  if (['single', 'multi', 'combo'].includes(item.type)) {
    root.querySelectorAll('.opt').forEach((el, i) => {
      const sel = st.selected.has(i);
      el.classList.toggle('sel', sel);
      el.querySelector('.box').textContent = sel ? '✓' : '';
    });
  } else if (item.type === 'label') {
    root.querySelectorAll('.blank').forEach((el, i) => {
      el.querySelector('.bt').textContent = st.fills[i];
      el.classList.toggle('filled', !!st.fills[i]);
      el.classList.toggle('active', st.mode === 'bank' && st.active === i);
    });
    root.querySelectorAll('.lrow').forEach((el, i) => {
      el.classList.toggle('active', st.mode === 'bank' && st.active === i);
      const v = el.querySelector('.lval'); if (v) v.textContent = st.fills[i] || '—';
    });
    root.querySelectorAll('.chipb').forEach(el => {
      const t = item.bankItems[+el.dataset.k];
      const usedN = st.fills.filter(f => f === t).length;
      el.classList.toggle('used', usedN > 0 && usedN >= (item.answerCount[t] || 1));
    });
    root.querySelectorAll('.linput').forEach((el, i) => {
      if (document.activeElement !== el && el.value !== st.fills[i]) el.value = st.fills[i] || '';
    });
  } else if (item.type === 'order') {
    const seq = root.querySelector('#ordSeq');
    seq.innerHTML = st.seq.map(i => `<li><button class="ord-it in" data-r="${i}">${item.items[i]}</button></li>`).join('');
    root.querySelectorAll('#ordPool .ord-it').forEach(el => el.classList.toggle('used', st.seq.includes(+el.dataset.o)));
  } else if (item.type === 'open' && st.phase === 'grade') {
    root.querySelectorAll('.pt').forEach((el, i) => {
      const on = st.checked.has(i);
      el.classList.toggle('sel', on);
      el.querySelector('.box').textContent = on ? '✓' : '';
    });
  }
}

/* ---------------- interaction ---------------- */
// Returns 'rerender' when the whole body must be rebuilt, true when sync is enough.
export function onClick(item, st, target) {
  if (['single', 'multi', 'combo'].includes(item.type)) {
    const opt = target.closest('.opt'); if (!opt) return false;
    const i = +opt.dataset.i;
    if (item.type === 'multi') st.selected.has(i) ? st.selected.delete(i) : st.selected.add(i);
    else st.selected = new Set([i]);
    return true;
  }
  if (item.type === 'label') {
    const mt = target.closest('.mt');
    if (mt && mt.dataset.mode !== st.mode) { st.mode = mt.dataset.mode; setLabelMode(st.mode); return 'rerender'; }
    const b = target.closest('[data-b]');
    if (b && st.mode === 'bank') {
      const i = +b.dataset.b;
      if (st.active === i && st.fills[i]) st.fills[i] = '';      // second tap clears
      st.active = i; return true;
    }
    if (b && st.mode === 'text') {
      const inp = document.querySelector(`.linput[data-b="${b.dataset.b}"]`); if (inp) inp.focus();
      return false;
    }
    const chip = target.closest('.chipb');
    if (chip && st.mode === 'bank') {
      const t = item.bankItems[+chip.dataset.k];
      const usedN = st.fills.filter(f => f === t).length;
      if (usedN >= (item.answerCount[t] || 1)) {                       // move, don't duplicate
        const prev = st.fills.indexOf(t); if (prev >= 0) st.fills[prev] = '';
      }
      st.fills[st.active] = t;
      const nextEmpty = st.fills.findIndex((f, k) => !f && k > st.active);
      const anyEmpty = st.fills.findIndex(f => !f);
      st.active = nextEmpty >= 0 ? nextEmpty : anyEmpty >= 0 ? anyEmpty : st.active;
      return true;
    }
    return false;
  }
  if (item.type === 'order') {
    const it = target.closest('.ord-it'); if (!it) return false;
    if (it.dataset.r !== undefined) { st.seq = st.seq.filter(x => x !== +it.dataset.r); return true; }
    const o = +it.dataset.o; if (!st.seq.includes(o)) st.seq.push(o);
    return true;
  }
  if (item.type === 'open' && st.phase === 'grade') {
    const p = target.closest('.pt'); if (!p) return false;
    const i = +p.dataset.p; st.checked.has(i) ? st.checked.delete(i) : st.checked.add(i);
    return true;
  }
  return false;
}

export function onInput(item, st, target) {
  if (item.type === 'label' && target.classList.contains('linput')) st.fills[+target.dataset.b] = target.value;
  if (item.type === 'open' && target.id === 'openTa') st.text = target.value;
}

// Keyboard digit (1-based). Returns true if handled.
export function onDigit(item, st, n) {
  const i = n - 1;
  if (['single', 'multi', 'combo'].includes(item.type) && i < item.options.length) {
    if (item.type === 'multi') st.selected.has(i) ? st.selected.delete(i) : st.selected.add(i);
    else st.selected = new Set([i]);
    return true;
  }
  if (item.type === 'open' && st.phase === 'grade' && i < item.points.length) {
    st.checked.has(i) ? st.checked.delete(i) : st.checked.add(i); return true;
  }
  return false;
}

/* ---------------- phases / scoring ---------------- */
export function actionLabel(item, st) {
  if (item.type === 'open') return st.phase === 'write' ? 'Lösung zeigen' : 'Bewertung speichern';
  return 'Antwort prüfen';
}
export function canAct(item, st) {
  switch (item.type) {
    case 'open': return true;
    case 'label': return st.fills.some(f => f && f.trim());
    case 'order': return st.seq.length === item.items.length;
    default: return st.selected.size > 0;
  }
}
// For two-phase types: advance phase; return true if this click should NOT grade yet.
export function preSubmit(item, st, root) {
  if (item.type === 'open' && st.phase === 'write') {
    st.phase = 'grade';
    const sol = root.querySelector('#openSol');
    sol.innerHTML = openSolutionHTML(item); sol.classList.add('show');
    const ta = root.querySelector('#openTa'); if (ta) ta.readOnly = true;
    return true;
  }
  return false;
}

export function score(item, st) {
  switch (item.type) {
    case 'single': case 'combo': {
      const ci = item.options.findIndex(o => o.correct);
      return st.selected.size === 1 && st.selected.has(ci) ? 1 : 0;
    }
    case 'multi': {
      let ok = 0;
      item.options.forEach((o, i) => { if (st.selected.has(i) === !!o.correct) ok++; });
      return ok / item.options.length;
    }
    case 'open': {
      const groups = pointGroups(item);
      if (groups) return groups.reduce((s, g) =>
        s + (item.points.some((p, i) => ptGroup(p) === g && st.checked.has(i)) ? 1 : 0), 0) / groups.length;
      const need = item.need || item.points.length;
      return Math.min(st.checked.size, need) / need;
    }
    case 'label': {
      let ok = 0;
      item.labels.forEach((l, i) => { if (labelOk(item, st, i)) ok++; });
      return ok / item.labels.length;
    }
    case 'order': {
      const n = item.items.length;
      let ok = 0;
      for (let k = 0; k < n - 1; k++) if (st.seq[k + 1] === st.seq[k] + 1) ok++;
      if (st.seq[0] === 0) ok += 0.5;
      if (st.seq[n - 1] === n - 1) ok += 0.5;
      return Math.min(1, ok / n);
    }
  }
  return 0;
}
function labelOk(item, st, i) {
  const f = (st.fills[i] || '').trim();
  if (!f) return false;
  const lab = item.labels[i];
  if (f === lab.answer) return true;
  if (st.mode === 'bank') return false;
  // typing exactly another blank's term is wrong, even if it is "close"
  const u = base(f, false);
  if (!variants(lab).includes(u) && item.labels.some((l, k) => k !== i && variants(l).includes(u))) return false;
  return matchesLabel(lab, f);
}

// Lock the UI and paint correct / wrong.
export function reveal(item, st, root) {
  if (['single', 'multi', 'combo'].includes(item.type)) {
    root.querySelectorAll('.opt').forEach((el, i) => {
      el.classList.add('disabled');
      const c = !!item.options[i].correct, s = st.selected.has(i);
      if (c && s) el.classList.add('correct'); else if (c) el.classList.add('missed'); else if (s) el.classList.add('wrongpick');
    });
    if (item.type === 'combo') root.querySelectorAll('.stmts li').forEach((li, i) => {
      const ok = item.statements[i].correct;
      li.classList.add(ok ? 'st-true' : 'st-false');
      li.querySelector('.sv').textContent = ok ? '✓ richtig' : '✗ falsch';
    });
  } else if (item.type === 'label') {
    root.querySelector('.fig').classList.add('done');
    root.querySelectorAll('.mt, .chipb').forEach(el => el.disabled = true);
    item.labels.forEach((l, i) => {
      const ok = labelOk(item, st, i);
      const blank = root.querySelector(`.blank[data-b="${i}"]`);
      blank.classList.add(ok ? 'ok' : 'bad'); blank.classList.remove('active');
      blank.querySelector('.bt').textContent = l.answer;
      blank.title = ok ? l.answer : `Richtig: ${l.answer}${st.fills[i] ? ' · deine Antwort: ' + st.fills[i] : ''}`;
      const row = root.querySelector(`.lrow[data-b="${i}"]`);
      row.classList.add(ok ? 'ok' : 'bad'); row.classList.remove('active');
      const inp = row.querySelector('.linput'); if (inp) inp.readOnly = true;
      if (!ok) row.insertAdjacentHTML('beforeend', `<span class="lfix">→ ${l.answer}</span>`);
    });
  } else if (item.type === 'order') {
    root.querySelectorAll('.ord-it').forEach(el => el.disabled = true);
    const seq = root.querySelector('#ordSeq');
    seq.innerHTML = st.seq.map((v, k) => `<li class="${v === k ? 'ok' : 'bad'}"><span class="ord-it in">${item.items[v]}</span></li>`).join('');
    root.querySelector('.ord-col .ord-h').textContent = 'Richtige Reihenfolge';
    root.querySelector('#ordPool').innerHTML = `<ol class="ord-right">${item.items.map(t => `<li>${t}</li>`).join('')}</ol>`;
  } else if (item.type === 'open') {
    root.querySelectorAll('.pt').forEach(el => el.classList.add('disabled'));
  }
}
