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
  if (a.genomeClass === 'DNA' || a.genomeClass === 'RNA') types.push('genomeClass');
  if (a.envelope === 'Enveloped' || a.envelope === 'Naked') types.push('envelope');
  if (a.replication === 'Nucleus' || a.replication === 'Cytoplasm') types.push('repl');
  if (a.morphology === 'Yeast' || a.morphology === 'Mold' || a.morphology === 'Dimorphic') types.push('morph');
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
    case 'genomeClass':
      return base(e, chap, type, { stem: `Is <b>${e.name}</b> a DNA or an RNA virus?`, multi: false,
        options: shuffle([opt('DNA virus', a.genomeClass === 'DNA'), opt('RNA virus', a.genomeClass === 'RNA')]),
        explanation: `${e.name}: ${a.genome || a.genomeClass + ' virus'}.` });
    case 'envelope':
      return base(e, chap, type, { stem: `Is <b>${e.name}</b> enveloped or naked (non-enveloped)?`, multi: false,
        options: shuffle([opt('Enveloped', a.envelope === 'Enveloped'), opt('Naked (non-enveloped)', a.envelope === 'Naked')]),
        explanation: `${e.name} is ${a.envelope.toLowerCase()}.` });
    case 'repl':
      return base(e, chap, type, { stem: `Where does <b>${e.name}</b> replicate its genome?`, multi: false,
        options: shuffle([opt('In the nucleus', a.replication === 'Nucleus'), opt('In the cytoplasm', a.replication === 'Cytoplasm')]),
        explanation: `${e.name} replicates in the ${a.replication.toLowerCase()}.${a.special ? ' ' + a.special : ''}` });
    case 'morph':
      return base(e, chap, type, { stem: `What is the morphology of <b>${e.name}</b>?`, multi: false,
        options: shuffle([opt('Yeast', a.morphology === 'Yeast'), opt('Mold', a.morphology === 'Mold'), opt('Dimorphic', a.morphology === 'Dimorphic')]),
        explanation: `${e.name}: ${a.morphology.toLowerCase()}.${a.special ? ' ' + a.special : ''}` });
    case 'whichOrg':
      return base(e, chap, type, { stem: `Which of the following causes:<br><i>"${a.disease}"</i>`, multi: false,
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
  // virology traits (gated on presence)
  make('dna', 'DNA viruses', e => e.attrs.genomeClass === 'DNA', entities.filter(e => e.attrs.genomeClass));
  make('env', 'enveloped', e => e.attrs.envelope === 'Enveloped', entities.filter(e => e.attrs.envelope));
  make('naked', 'naked (non-enveloped)', e => e.attrs.envelope === 'Naked', entities.filter(e => e.attrs.envelope));
  make('nucl', 'replicating in the nucleus', e => e.attrs.replication === 'Nucleus', entities.filter(e => e.attrs.replication));
  make('seg', 'having a segmented genome', e => /segment/i.test(e.attrs.genome || ''), entities.filter(e => e.attrs.genome));
  make('onco', 'oncogenic (associated with human tumours)', e => e.attrs.oncogenic === 'yes', entities.filter(e => e.attrs.oncogenic));
  // mycology traits (gated on morphology presence → fungi only)
  const fungi = entities.filter(e => e.attrs.morphology);
  make('dimorphic', 'dimorphic fungi', e => e.attrs.morphology === 'Dimorphic', fungi);
  make('fsys', 'systemic (deep) fungi', e => /systemic/i.test(e.group), fungi);
  make('fopp', 'opportunistic fungi', e => /opportunistic/i.test(e.group), fungi);
  return items;
}

// entities: of one chapter; distract: candidate entities for distractors (selected chapters).
export function generateItems(entities, distract, chap) {
  const items = entities.map(e => genOne(e, distract, chap)).filter(Boolean);
  items.push(...genMulti(entities, chap));
  return items;
}
