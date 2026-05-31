// Auto-generate MCQs from entity records. Re-run each session for variety.
import { shuffle } from './engine.js';

const opt = (t, c) => ({ t, correct: !!c });
const pick = (arr, n) => shuffle(arr).slice(0, n);
const has = v => v && v !== '' && v !== '—';

function base(entity, chap, type, extra) {
  return Object.assign({
    id: `${entity.id}:${type}`,
    chapter: chap.id, chapterTitle: chap.title, chapterColor: chap.color,
    group: entity.group, topic: type, source: 'auto', entityId: entity.id
  }, extra);
}

// One single-answer question per entity, of a randomly chosen eligible type.
function genOne(e, distract, chap) {
  const a = e.attrs;
  const others = distract.filter(x => x.id !== e.id);
  const types = ['family', 'vaccine'];
  if (a.cat === '+' || a.cat === '−') types.push('cat');
  if (a.ox === '+' || a.ox === '−') types.push('ox');
  if (has(a.disease)) types.push('whichOrg');
  if (has(a.keyVF)) types.push('keyvf');
  if (has(a.treatment)) types.push('treat');
  const type = types[Math.floor(Math.random() * types.length)];

  const optsFrom = (correct, distractors) => {
    const set = [opt(correct, true), ...pick([...new Set(distractors.filter(d => d && d !== correct))], 3).map(d => opt(d, false))];
    return shuffle(set);
  };

  switch (type) {
    case 'cat': {
      const c = a.cat === '+' ? 'Catalase positive' : 'Catalase negative';
      return base(e, chap, type, { stem: `What is the catalase reaction of <b>${e.name}</b>?`, multi: false,
        options: shuffle([opt('Catalase positive', a.cat === '+'), opt('Catalase negative', a.cat === '−'), opt('Variable', false)]),
        explanation: `${e.name}: catalase ${a.cat}.` });
    }
    case 'ox': {
      return base(e, chap, type, { stem: `What is the oxidase reaction of <b>${e.name}</b>?`, multi: false,
        options: shuffle([opt('Oxidase positive', a.ox === '+'), opt('Oxidase negative', a.ox === '−'), opt('Variable', false)]),
        explanation: `${e.name}: oxidase ${a.ox}.` });
    }
    case 'whichOrg':
      return base(e, chap, type, { stem: `Which organism causes:<br><i>"${a.disease}"</i>`, multi: false,
        options: optsFrom(e.name, others.map(x => x.name)),
        explanation: `${e.name}. Key clue: ${a.special || a.disease}` });
    case 'keyvf':
      return base(e, chap, type, { stem: `What is the key virulence factor of <b>${e.name}</b>?`, multi: false,
        options: optsFrom(a.keyVF, others.map(x => x.attrs.keyVF).filter(has)),
        explanation: `${e.name}: key VF = ${a.keyVF}. Full set: ${a.virulence}` });
    case 'treat':
      return base(e, chap, type, { stem: `Characteristic / first-line treatment of <b>${e.name}</b>?`, multi: false,
        options: optsFrom(a.treatment, others.map(x => x.attrs.treatment).filter(has)),
        explanation: `${e.name}: ${a.treatment}` });
    case 'vaccine': {
      const c = a.vYN === 'yes' ? 'Yes — vaccine available' : a.vYN === 'partial' ? 'Partial / limited vaccine' : 'No vaccine';
      return base(e, chap, type, { stem: `Is there a human vaccine relevant to <b>${e.name}</b>?`, multi: false,
        options: shuffle([opt('Yes — vaccine available', a.vYN === 'yes'), opt('No vaccine', a.vYN === 'no'), opt('Partial / limited vaccine', a.vYN === 'partial')]),
        explanation: `${e.name}: ${a.vaccine}` });
    }
    case 'family':
    default: {
      const groups = [...new Set(distract.map(x => x.group))];
      return base(e, chap, 'family', { stem: `To which family / group does <b>${e.name}</b> belong?`, multi: false,
        options: optsFrom(e.group, groups), explanation: `${e.name} → ${e.group}.` });
    }
  }
}

// Pooled multi-select trait questions ("Which of these are ...?").
function genMulti(entities, chap) {
  const items = [];
  const make = (type, label, test, eligible) => {
    const pos = eligible.filter(test), neg = eligible.filter(e => !test(e));
    if (pos.length < 1 || neg.length < 1) return;
    const nPos = Math.min(pos.length, 1 + Math.floor(Math.random() * 2)); // 1–2 correct
    const chosen = shuffle([...pick(pos, nPos), ...pick(neg, 4 - nPos)]);
    items.push(base({ id: `multi-${type}`, group: chap.title, attrs: {} }, chap, `multi-${type}`, {
      id: `${chap.id}:multi-${type}`, entityId: null,
      stem: `Which of these are <b>${label}</b>?`, multi: true,
      options: chosen.map(e => opt(e.name, test(e))),
      explanation: `${label}: ` + chosen.filter(test).map(e => e.name).join(', ') + '.'
    }));
  };
  make('cat', 'catalase-positive', e => e.attrs.cat === '+', entities.filter(e => e.attrs.cat === '+' || e.attrs.cat === '−'));
  make('ox', 'oxidase-positive', e => e.attrs.ox === '+', entities.filter(e => e.attrs.ox === '+' || e.attrs.ox === '−'));
  make('mot', 'motile', e => /^Motile/i.test(e.attrs.mot || ''), entities.filter(e => /motile/i.test(e.attrs.mot || '')));
  make('gram', 'Gram-positive', e => e.gram === 'pos', entities.filter(e => e.gram === 'pos' || e.gram === 'neg'));
  return items;
}

// entities: of one chapter; distract: candidate entities for distractors (selected chapters).
export function generateItems(entities, distract, chap) {
  const items = entities.map(e => genOne(e, distract, chap)).filter(Boolean);
  items.push(...genMulti(entities, chap));
  return items;
}
