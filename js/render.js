// View builders for the quiz and dashboard.
import { getSRS, masteryLevel, entityMastery } from './engine.js';
import { entityItemIds, generatedItemIds, TYPE_LABEL } from './quizgen.js';

export function bullets(text) {
  if (!text || text === '—') return '<span style="color:var(--mut)">—</span>';
  return text.split(/; (?=[A-Z0-9(])|\. (?=[A-Z])/).map(s => s.trim()).filter(Boolean).map(s => '• ' + s).join('<br>');
}

export function quizCardHTML(item, idx, total) {
  const optHTML = item.options.map((o, i) => `
    <button class="opt ${item.multi ? 'checkbox' : 'radio'}" data-i="${i}">
      <span class="box"></span><span>${o.t}</span>
    </button>`).join('');
  const tag = item.group && item.source === 'auto' ? ' · ' + item.group : '';
  return `
    <div class="card">
      <div class="card-top" style="background:${item.chapterColor || '#3da9fc'}">
        <span>${item.chapterTitle}${tag}</span>
        <span class="badge">${item.multi ? 'select all that apply' : 'one answer'} · ${idx + 1}/${total}</span>
      </div>
      <div class="card-body">
        <div class="q-stem">${item.stem}</div>
        <div class="q-hint">${item.multi ? 'Multiple answers may be correct — partial credit applies (¼ per option).' : 'Choose the single best answer.'}</div>
        <div class="opts" id="opts">${optHTML}</div>
        <div class="fb" id="fb"></div>
        <div class="actions" id="act"><button class="btn primary" id="actionBtn">Submit</button></div>
      </div>
    </div>
    <div class="hint"><kbd>1</kbd>–<kbd>4</kbd> toggle · <kbd>Enter</kbd> submit / next</div>`;
}

export function feedback(item, score, reward) {
  const cls = score >= 0.999 ? 'ok' : score > 0 ? 'part' : 'no';
  const label = score >= 0.999 ? '✓ Correct' : score > 0 ? '◐ Partial' : '✗ Incorrect';
  const html = `<div class="score">${label} — ${score.toFixed(2)} / 1.00${coinLine(reward)}</div>
    <div class="more">${item.explanation || ''}</div>
    <span class="topic">${item.chapterTitle}${item.topic ? ' · ' + item.topic : ''}${item.source === 'exam' ? ' · past exam' : ''}</span>`;
  return { cls, html };
}

// Inline "+N 🪙" with a breakdown of any bonuses earned.
function coinLine(reward) {
  if (!reward || reward.total <= 0) return '';
  const extras = [];
  if (reward.streakBonus > 0) extras.push(`🔥×${reward.streak} +${reward.streakBonus}`);
  if (reward.milestone > 0) extras.push(`★ first ace +${reward.milestone}`);
  const note = extras.length ? ` <span class="coin-extra">(${extras.join(' · ')})</span>` : '';
  return ` <span class="coin-earn">+${reward.total} <i class="coin-ico"></i></span>${note}`;
}

const MCOLOR = { new: '#566', weak: 'var(--bad)', learning: 'var(--warn)', mastered: 'var(--good)' };

function chapterStats(chap) {
  const srs = getSRS();
  const dist = { new: 0, weak: 0, learning: 0, mastered: 0 };
  // Count every individual question — authored items plus each auto-generated
  // attribute/multi question — so the bar reflects the full ~1079-question pool.
  for (const q of chap.questions) dist[masteryLevel(q.id)]++;
  for (const id of generatedItemIds(chap)) dist[masteryLevel(id)]++;
  const total = dist.new + dist.weak + dist.learning + dist.mastered;
  const seen = total - dist.new;
  // accuracy across all srs keys belonging to this chapter
  const authored = new Set(chap.questions.map(q => q.id));
  const entPref = chap.entities.map(e => e.id);
  let s = 0, n = 0;
  for (const k of Object.keys(srs)) {
    const belongs = authored.has(k) || k.startsWith(chap.id + ':') || entPref.some(p => k === p || k.startsWith(p + ':'));
    if (belongs && srs[k].seen) { s += srs[k].scoreSum; n += srs[k].seen; }
  }
  return { total, seen, dist, mastered: dist.mastered, scoreSum: s, answered: n, acc: n ? Math.round(100 * s / n) : 0 };
}

// Segmented mastery distribution bar (mastered → learning → weak → new).
function masteryBar(dist, total) {
  const t = total || 1;
  const seg = (n, c) => n ? `<span style="width:${(100 * n / t).toFixed(2)}%;background:${c}"></span>` : '';
  return `<div class="mbar">${seg(dist.mastered, 'var(--good)')}${seg(dist.learning, 'var(--warn)')}${seg(dist.weak, 'var(--bad)')}</div>`;
}

function accColor(acc) { return acc >= 70 ? 'var(--good)' : acc >= 40 ? 'var(--warn)' : 'var(--bad)'; }

export function dashboardHTML(chapters) {
  const stats = chapters.map(chapterStats);
  // ----- global rollup for the overview hero -----
  const tot = stats.reduce((a, st) => ({
    total: a.total + st.total, seen: a.seen + st.seen, mastered: a.mastered + st.mastered,
    weak: a.weak + st.dist.weak, scoreSum: a.scoreSum + st.scoreSum, answered: a.answered + st.answered,
    dist: {
      new: a.dist.new + st.dist.new, weak: a.dist.weak + st.dist.weak,
      learning: a.dist.learning + st.dist.learning, mastered: a.dist.mastered + st.dist.mastered
    }
  }), { total: 0, seen: 0, mastered: 0, weak: 0, scoreSum: 0, answered: 0, dist: { new: 0, weak: 0, learning: 0, mastered: 0 } });
  const gAcc = tot.answered ? Math.round(100 * tot.scoreSum / tot.answered) : 0;
  const pct = tot.total ? Math.round(100 * tot.seen / tot.total) : 0;

  let html = `
    <div class="hero">
      <div class="hero-head">
        <div>
          <div class="hero-ttl">Your progress</div>
          <div class="hero-sub">${tot.seen} of ${tot.total} questions practised · ${pct}% covered</div>
        </div>
        <div class="hero-actions">
          <button class="muted-btn" id="toggleAllBtn">Collapse all</button>
          <button class="muted-btn" id="resetBtn">⚠ Reset progress</button>
        </div>
      </div>
      ${masteryBar(tot.dist, tot.total)}
      <div class="hero-figs">
        <div class="fig"><b style="color:var(--good)">${tot.dist.mastered}</b><span>Mastered</span></div>
        <div class="fig"><b style="color:var(--warn)">${tot.dist.learning}</b><span>Learning</span></div>
        <div class="fig"><b style="color:var(--bad)">${tot.dist.weak}</b><span>Weak</span></div>
        <div class="fig"><b style="color:var(--mut)">${tot.dist.new}</b><span>Untouched</span></div>
        <div class="fig"><b style="color:${accColor(gAcc)}">${gAcc}%</b><span>Avg score</span></div>
      </div>
      <div class="legend2">
        <span><span class="dot" style="background:var(--good)"></span>Mastered</span>
        <span><span class="dot" style="background:var(--warn)"></span>Learning</span>
        <span><span class="dot" style="background:var(--bad)"></span>Weak</span>
        <span><span class="dot" style="background:#3a4654"></span>New / unseen</span>
      </div>
    </div>`;

  chapters.forEach((chap, i) => {
    const st = stats[i];
    const groups = chap.entities.length ? [...new Set(chap.entities.map(e => e.group))] : [];
    let body = '';
    for (const g of groups) {
      const orgs = chap.entities.filter(e => e.group === g);
      body += `<div class="gtl" style="color:${orgs[0].color}">${g}</div><div class="grid">`;
      for (const e of orgs) {
        const m = entityMastery(e.id, entityItemIds(e));
        body += `<div class="gchip" data-eid="${e.id}" title="${e.name} — ${m}"><span class="dot" style="background:${MCOLOR[m]}"></span>${e.name.split('(')[0].trim()}</div>`;
      }
      body += `</div>`;
    }
    if (!groups.length) body = `<div class="chap-note">No organism profiles in this chapter — ${chap.questions.length} exam questions only.</div>`;

    html += `
      <div class="chap-card open" data-cid="${chap.id}">
        <button class="chap-head">
          <span class="chap-dot" style="background:${chap.color}"></span>
          <span class="chap-name">${chap.title}</span>
          <span class="chap-bar">${masteryBar(st.dist, st.total)}</span>
          <span class="chap-figs"><b style="color:var(--good)">${st.mastered}</b>/${st.total} mastered</span>
          <span class="chev">▾</span>
        </button>
        <div class="chap-body">${body}</div>
      </div>`;
  });
  return html;
}

// Schema-agnostic: renders whichever discrete "trait" chips and prose fields exist.
const TRAIT_KEYS = [
  ['cat', 'Cat'], ['ox', 'Ox'], ['ure', 'Ure'], ['mot', 'Mot'], ['bio', 'Biofilm'], ['micro', 'Microbiota'],
  ['genome', 'Genome'], ['envelope', 'Envelope'], ['replication', 'Replication'], ['oncogenic', 'Oncogenic'], ['latency', 'Latency'],
  ['morphology', 'Morphology'], ['ptype', 'Type'], ['infectiveStage', 'Infective stage']
];
const PROSE_KEYS = [
  ['transmission', 'Transmission'], ['pathogenesis', 'Pathogenesis'], ['disease', 'Disease(s)'],
  ['virulence', 'Virulence / key factors'], ['diagnosis', 'Diagnosis'], ['vaccine', 'Vaccine'], ['treatment', 'Treatment'], ['special', 'Special']
];
const MLABEL = { new: 'New', weak: 'Weak', learning: 'Learning', mastered: 'Mastered' };

// Level + progress-to-mastery block shown at the top of the entity dialog.
function entityProgressHTML(p) {
  const color = MCOLOR[p.mastery];
  const note = p.mastery === 'mastered' ? '✓ Fully mastered'
    : p.seen === 0 ? 'Not practised yet'
      : `${p.toMaster} level${p.toMaster === 1 ? '' : 's'} to mastery`;
  return `<div class="ent-prog">
      <div class="ent-prog-top">
        <span class="ent-badge" style="color:${color};border-color:${color}">${MLABEL[p.mastery]}</span>
        <span class="ent-lvl">Level <b>${p.level}</b> <span class="mut">/ 5</span></span>
        <span class="ent-prog-note">${note}</span>
      </div>
      <div class="mbar lvl"><span style="width:${Math.round(p.pct * 100)}%;background:${color}"></span></div>
      <div class="ent-scale"><span>Lvl 0</span><span>Mastered · Lvl 4</span></div>
    </div>`;
}

// Per-attribute mastery — one row per quiz question the entity generates,
// so it's clear at a glance which individual facts still need work.
function attrMasteryHTML(e) {
  const rows = entityItemIds(e).map(id => {
    const m = masteryLevel(id);
    const label = TYPE_LABEL[id.slice(id.indexOf(':') + 1)] || id;
    return `<span class="attr-pill" title="${label} — ${MLABEL[m]}"><span class="dot" style="background:${MCOLOR[m]}"></span>${label}</span>`;
  }).join('');
  if (!rows) return '';
  return `<div class="attr-mastery"><div class="k">Question mastery</div><div class="attr-pills">${rows}</div></div>`;
}

export function entityProfileHTML(e, prog) {
  const a = e.attrs;
  const pm = v => (v || '').replace('+', '<span class="plus">+</span>').replace('−', '<span class="minus">−</span>');
  const chips = TRAIT_KEYS.filter(([k]) => a[k]).map(([k, lbl]) => `<span class="chip"><b>${lbl}</b> ${pm(a[k])}</span>`).join('');
  const fields = PROSE_KEYS.filter(([k]) => a[k]).map(([k, lbl]) => `<div class="field"><div class="k">${lbl}</div><div>${bullets(a[k])}</div></div>`).join('');
  const gram = e.gram === 'pos' ? ' · GRAM +' : e.gram === 'neg' ? ' · GRAM −' : '';
  return `<div class="card"><div class="card-top" style="background:${e.color}">
      <span>${e.name}${gram}</span>
      <span class="ct-right"><span class="badge">${e.group}</span>${prog ? '<button class="dlg-x" data-close aria-label="Close profile">✕</button>' : ''}</span></div>
    <div class="card-body" style="padding:16px 20px">
      ${prog ? entityProgressHTML(prog) : ''}
      ${prog ? attrMasteryHTML(e) : ''}
      ${chips ? `<div class="chips">${chips}</div>` : ''}${fields}
    </div></div>`;
}
