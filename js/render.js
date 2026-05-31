// View builders for the quiz and dashboard.
import { getSRS, masteryLevel, entityMastery } from './engine.js';

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
  const units = [];
  for (const q of chap.questions) units.push(masteryLevel(q.id));
  for (const e of chap.entities) units.push(entityMastery(e.id));
  const total = units.length;
  const seen = units.filter(m => m !== 'new').length;
  const mastered = units.filter(m => m === 'mastered').length;
  // accuracy across all srs keys belonging to this chapter
  const authored = new Set(chap.questions.map(q => q.id));
  const entPref = chap.entities.map(e => e.id);
  let s = 0, n = 0;
  for (const k of Object.keys(srs)) {
    const belongs = authored.has(k) || k.startsWith(chap.id + ':') || entPref.some(p => k === p || k.startsWith(p + ':'));
    if (belongs && srs[k].seen) { s += srs[k].scoreSum; n += srs[k].seen; }
  }
  return { total, seen, mastered, acc: n ? Math.round(100 * s / n) : 0 };
}

export function dashboardHTML(chapters) {
  let html = `
    <div class="legend2">
      <span><span class="dot" style="background:#566"></span>New / unseen</span>
      <span><span class="dot" style="background:var(--bad)"></span>Weak</span>
      <span><span class="dot" style="background:var(--warn)"></span>Learning</span>
      <span><span class="dot" style="background:var(--good)"></span>Mastered</span>
      <span style="margin-left:auto"><button class="muted-btn" id="resetBtn">⚠ Reset all progress</button></span>
    </div>
    <div class="peek" id="peek"></div>`;

  for (const chap of chapters) {
    const st = chapterStats(chap);
    html += `<div class="secttl" style="color:${chap.color}">${chap.title}</div>`;
    html += `<div class="statbar">
      <div class="stat"><div class="n">${st.seen}/${st.total}</div><div class="l">Items practised</div></div>
      <div class="stat"><div class="n" style="color:var(--good)">${st.mastered}</div><div class="l">Mastered</div></div>
      <div class="stat"><div class="n" style="color:${st.acc >= 70 ? 'var(--good)' : st.acc >= 40 ? 'var(--warn)' : 'var(--bad)'}">${st.acc}%</div><div class="l">Avg score</div></div>
      <div class="stat"><div class="n">${chap.questions.length}</div><div class="l">Exam questions</div></div>
    </div>`;

    if (chap.entities.length) {
      const groups = [...new Set(chap.entities.map(e => e.group))];
      for (const g of groups) {
        const orgs = chap.entities.filter(e => e.group === g);
        html += `<div style="margin:8px 0 3px;font-size:12px;color:${orgs[0].color};font-weight:700">${g}</div><div class="grid">`;
        for (const e of orgs) {
          const m = entityMastery(e.id);
          html += `<div class="gchip" data-eid="${e.id}" title="${e.name} — ${m}"><span class="dot" style="background:${MCOLOR[m]}"></span>${e.name.split('(')[0].trim()}</div>`;
        }
        html += `</div>`;
      }
    }
  }
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
export function entityProfileHTML(e) {
  const a = e.attrs;
  const pm = v => (v || '').replace('+', '<span class="plus">+</span>').replace('−', '<span class="minus">−</span>');
  const chips = TRAIT_KEYS.filter(([k]) => a[k]).map(([k, lbl]) => `<span class="chip"><b>${lbl}</b> ${pm(a[k])}</span>`).join('');
  const fields = PROSE_KEYS.filter(([k]) => a[k]).map(([k, lbl]) => `<div class="field"><div class="k">${lbl}</div><div>${bullets(a[k])}</div></div>`).join('');
  const gram = e.gram === 'pos' ? ' · GRAM +' : e.gram === 'neg' ? ' · GRAM −' : '';
  return `<div class="card"><div class="card-top" style="background:${e.color}">
      <span>${e.name}${gram}</span><span class="badge">${e.group}</span></div>
    <div class="card-body" style="padding:16px 20px">
      ${chips ? `<div class="chips">${chips}</div>` : ''}${fields}
    </div></div>`;
}
