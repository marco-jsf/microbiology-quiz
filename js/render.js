// View builders: quiz card frame, feedback, dashboard.
import { getSRS, masteryLevel } from './engine.js';
import { TYPE_INFO, bodyHTML, hintFor } from './qtypes.js';

export function quizCardHTML(item, st, idx, total) {
  const src = item.source === 'exam' ? `<span class="exam-tag" title="Frage aus Gedankenprotokoll">📜 Altklausur ${item.exam || ''}</span>` : '';
  return `
    <div class="card">
      <div class="card-top" style="background:${item.chapterColor}">
        <span>${item.chapterTitle} · ${item.topic}</span>
        <span class="badge">${TYPE_INFO[item.type].label} · ${idx + 1}/${total}</span>
      </div>
      <div class="card-body type-${item.type}" id="qbody">
        ${src}
        <div class="q-stem">${item.stem}</div>
        ${item.stemImage ? `<img class="stem-img" src="${item.stemImage}" alt="Abbildung zur Frage">` : ''}
        <div class="q-hint" id="qhint">${hintFor(item, st)}</div>
        <div id="qinteract">${bodyHTML(item, st)}</div>
        <div class="fb" id="fb"></div>
        <div class="actions" id="act">
          <button class="btn primary" id="actionBtn">Antwort prüfen</button>
          <button class="btn ghost" id="skipBtn" title="Frage überspringen (zählt nicht)">Überspringen</button>
        </div>
      </div>
    </div>
    <div class="hint">${item.type === 'single' || item.type === 'multi' ? '<kbd>1</kbd>–<kbd>9</kbd> auswählen · ' : ''}<kbd>Enter</kbd> prüfen / weiter</div>`;
}

export function feedbackHTML(item, score, reward) {
  const cls = score >= 0.999 ? 'ok' : score > 0 ? 'part' : 'no';
  const label = score >= 0.999 ? '✓ Richtig' : score > 0 ? '◐ Teilweise richtig' : '✗ Leider falsch';
  const pts = `${(Math.round(score * 100) / 100).toLocaleString('de-DE')} / 1`;
  const html = `<div class="score">${label} — ${pts}${coinLine(reward)}</div>
    ${item.explanation ? `<div class="more">${item.explanation}</div>` : ''}
    ${item.note ? `<div class="more note">ℹ︎ ${item.note}</div>` : ''}
    <div class="tags"><span class="topic">${item.chapterShort} · ${item.topic}</span>
      ${item.ref ? `<span class="topic">📖 ${item.ref}</span>` : ''}
      ${item.source === 'exam' ? `<span class="topic exam">📜 Altklausur ${item.exam || ''}</span>` : ''}</div>`;
  return { cls, html };
}

function coinLine(reward) {
  if (!reward || reward.total <= 0) return '';
  const extras = [];
  if (reward.streakBonus > 0) extras.push(`🔥×${reward.streak} +${reward.streakBonus}`);
  if (reward.milestone > 0) extras.push(`★ erstmals gelöst +${reward.milestone}`);
  const note = extras.length ? ` <span class="coin-extra">(${extras.join(' · ')})</span>` : '';
  return ` <span class="coin-earn">+${reward.total} <i class="coin-ico"></i></span>${note}`;
}

/* ---------------- dashboard ---------------- */
function distOf(qs) {
  const d = { new: 0, weak: 0, learning: 0, mastered: 0 };
  for (const q of qs) d[masteryLevel(q.id)]++;
  return d;
}
function accOf(qs) {
  const srs = getSRS(); let s = 0, n = 0;
  for (const q of qs) { const c = srs[q.id]; if (c && c.seen) { s += c.scoreSum; n += c.seen; } }
  return { acc: n ? Math.round(100 * s / n) : 0, answered: n, scoreSum: s };
}
function masteryBar(d) {
  const t = d.new + d.weak + d.learning + d.mastered || 1;
  const seg = (n, c) => n ? `<span style="width:${(100 * n / t).toFixed(2)}%;background:${c}"></span>` : '';
  return `<div class="mbar">${seg(d.mastered, 'var(--good)')}${seg(d.learning, 'var(--warn)')}${seg(d.weak, 'var(--bad)')}</div>`;
}
function accColor(acc) { return acc >= 70 ? 'var(--good)' : acc >= 40 ? 'var(--warn)' : 'var(--bad)'; }

const TYPE_ICON = { single: '◉', multi: '☑', open: '✎', label: '🖼', order: '⇅' };

export function dashboardHTML(chapters) {
  const all = chapters.flatMap(c => c.questions);
  const d = distOf(all), total = all.length, seen = total - d.new;
  const { acc } = accOf(all);
  const exams = all.filter(q => q.source === 'exam');
  const ed = distOf(exams);
  const pct = total ? Math.round(100 * seen / total) : 0;

  let html = `
    <div class="hero">
      <div class="hero-head">
        <div>
          <div class="hero-ttl">Dein Lernstand</div>
          <div class="hero-sub">${seen} von ${total} Fragen geübt · ${pct}% abgedeckt · davon ${exams.length} Altklausur-Fragen (${exams.length - ed.new} geübt)</div>
        </div>
        <div class="hero-actions">
          <button class="muted-btn" data-practice="exam">📜 Nur Altklausur üben</button>
          <button class="muted-btn" id="toggleAllBtn">Alle zuklappen</button>
          <button class="muted-btn" id="resetBtn">⚠ Fortschritt zurücksetzen</button>
        </div>
      </div>
      ${masteryBar(d)}
      <div class="hero-figs">
        <div class="fig"><b style="color:var(--good)">${d.mastered}</b><span>Sitzt</span></div>
        <div class="fig"><b style="color:var(--warn)">${d.learning}</b><span>Im Lernen</span></div>
        <div class="fig"><b style="color:var(--bad)">${d.weak}</b><span>Schwach</span></div>
        <div class="fig"><b style="color:var(--mut)">${d.new}</b><span>Neu</span></div>
        <div class="fig"><b style="color:${accColor(acc)}">${acc}%</b><span>Ø Punkte</span></div>
      </div>
      <div class="legend2">
        <span><span class="dot" style="background:var(--good)"></span>Sitzt (Level ≥ 4)</span>
        <span><span class="dot" style="background:var(--warn)"></span>Im Lernen</span>
        <span><span class="dot" style="background:var(--bad)"></span>Schwach</span>
        <span><span class="dot" style="background:#3a4654"></span>Neu</span>
      </div>
    </div>`;

  for (const chap of chapters) {
    const cd = distOf(chap.questions);
    const ca = accOf(chap.questions);
    const types = {};
    for (const q of chap.questions) { const t = q.type === 'combo' ? 'multi' : q.type; types[t] = (types[t] || 0) + 1; }
    const typeChips = Object.entries(types).map(([t, n]) =>
      `<span class="tchip" title="${TYPE_INFO[t].label}">${TYPE_ICON[t]} ${n}</span>`).join('');
    const rows = chap.topics.map(tp => {
      const qs = chap.questions.filter(q => q.topic === tp);
      if (!qs.length) return '';
      const td = distOf(qs), ta = accOf(qs);
      return `<button class="trow" data-practice="topic" data-cid="${chap.id}" data-topic="${encodeURIComponent(tp)}" title="Dieses Thema üben">
          <span class="tname">${tp}</span>
          <span class="tbar">${masteryBar(td)}</span>
          <span class="tfig">${td.mastered}/${qs.length}${ta.answered ? ` · <b style="color:${accColor(ta.acc)}">${ta.acc}%</b>` : ''}</span>
          <span class="tgo">▶</span></button>`;
    }).join('');
    html += `
      <div class="chap-card open" data-cid="${chap.id}">
        <button class="chap-head">
          <span class="chap-dot" style="background:${chap.color}"></span>
          <span class="chap-name">${chap.title}</span>
          <span class="chap-bar">${masteryBar(cd)}</span>
          <span class="chap-figs"><b style="color:var(--good)">${cd.mastered}</b>/${chap.questions.length} sitzen${ca.answered ? ` · <b style="color:${accColor(ca.acc)}">${ca.acc}%</b>` : ''}</span>
          <span class="chev">▾</span>
        </button>
        <div class="chap-body">
          <div class="chap-tools"><span class="tchips">${typeChips}</span>
            <button class="muted-btn small" data-practice="chapter" data-cid="${chap.id}">▶ Ganze Vorlesung üben</button></div>
          ${rows}
        </div>
      </div>`;
  }
  return html;
}
