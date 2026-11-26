// Garden overlays: the bird inspector card, the egg card and the hatch banner.
//
// Plain DOM on top of the garden canvas, inside the `.garden` wrapper. The
// scene owns all garden state and every store call; this module only renders
// what it is handed and reports back through the callbacks it was given
// (`onRename`, `onClose`). User-provided text (bird names) only ever goes in
// through `value` / `textContent`.
//
// Interaction rules:
//   • Pointer and keyboard events never leave the overlay layer, so a click on
//     a card can't reach the canvas and typing a name can't trigger the quiz's
//     global digit/Enter shortcuts (app.js listens on `document`).
//   • `onClose` fires only when the player closes a card herself (✕ or Escape
//     inside the card). `hideCard()` and replacing a card are the scene's own
//     doing, so they stay silent — that keeps scene ↔ UI calls free of loops.
//   • A name being edited is committed before its card goes away, however it
//     goes away.

import {
  RARITY_LABEL, birdById, speciesInfo, eggTierById, speciesForTier,
} from './garden-data.js';
import { variantFor } from './garden-variants.js';
import { BIRD_NAME_MAX } from './garden-store.js';
import { drawEggIcon } from './garden-art.js';

/* ---------- tunables ---------- */
const PORTRAIT_W = 64, PORTRAIT_H = 56;   // bird portrait box (CSS px)
const PORTRAIT_PAD = 6;                   // breathing room around the sprite (CSS px)
const EGG_ICON = 40;                      // egg preview box (CSS px)
const BANNER_HOLD = 3500;                 // ms a banner stays before it fades out
const BANNER_FADE = 450;                  // ms — matches gsBannerOut in garden-scene.css
const CARD_FADE = 140;                    // ms — matches gsCardOut in garden-scene.css
const SAVED_TICK = 1400;                  // ms the ✓ shows after a rename
// On a narrow garden a card and a banner can't sit side by side. A card asked
// for right after a banner (the hatch sequence) waits until the banner has had
// BANNER_MIN_SHOW ms; a card asked for later (a fresh tap) shows at once and
// the banner makes way.
const NARROW = 600;                       // px garden width
const BANNER_GROUP = 1500;                // ms
const BANNER_MIN_SHOW = 2600;             // ms
const LONG_NAME = 14;                     // chars — longer names use the smaller pixel size

// Events that must not bubble out of the overlay layer (keydown has its own handler).
const STOP_EVENTS = [
  'click', 'dblclick', 'pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove',
  'touchstart', 'touchmove', 'touchend', 'keyup', 'keypress',
];
const PASSIVE = { passive: true };

const PENCIL_SVG = '<svg class="pen" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.2 2.3l2.5 2.5-7.9 7.9-3.2.7.7-3.2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const CHECK_SVG = '<svg class="ok" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.6l3.2 3.1L13 4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ---------- module state ---------- */
let root = null;      // .gs-ui layer inside the garden wrapper
let live = null;      // polite live region (screen readers)
let card = null;      // the current card — shown, or waiting for a banner: { type, uid, el?, … }
let banner = null;    // { el, at, timer }
const timers = new Set();

/* ---------- small helpers ---------- */
function later(fn, ms) {
  const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
  timers.add(id);
  return id;
}
function cancel(id) { if (id) { clearTimeout(id); timers.delete(id); } }
const now = () => performance.now();
const mq = q => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
const reducedMotion = () => mq('(prefers-reduced-motion: reduce)');
const finePointer = () => mq('(hover: hover) and (pointer: fine)');
const pixelRatio = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));
const stopEvent = e => e.stopPropagation();
// Same normalisation the store applies, so "unchanged" is judged the same way.
const normName = v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, BIRD_NAME_MAX);

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function setRarity(el, rarity) {
  for (const r of ['normal', 'rare', 'epic']) el.classList.toggle('rarity-' + r, r === rarity);
}
function announce(text) { if (live) live.textContent = text; }

/* ---------- lifecycle ---------- */
// Create the overlay layer for this garden wrapper (idempotent per wrapper).
export function initGardenUI(wrap) {
  if (!wrap) return;
  if (root && root.parentNode === wrap) return;
  destroyGardenUI();
  root = h('div', 'gs-ui');
  live = h('div', 'gs-sr');
  live.setAttribute('aria-live', 'polite');
  root.appendChild(live);
  for (const t of STOP_EVENTS) root.addEventListener(t, stopEvent, t.startsWith('touch') ? PASSIVE : false);
  root.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);
  wrap.appendChild(root);
}

// Tear everything down: commit a pending name, clear timers, remove the layer.
export function destroyGardenUI() {
  if (card) { flushName(card); card.dead = true; }
  card = null;
  for (const id of timers) clearTimeout(id);
  timers.clear();
  window.removeEventListener('resize', onResize);
  if (root) {
    for (const t of STOP_EVENTS) root.removeEventListener(t, stopEvent, t.startsWith('touch') ? PASSIVE : false);
    root.removeEventListener('keydown', onKeyDown);
    root.remove();
  }
  root = live = banner = null;
}

// Keys pressed anywhere in the overlay (the name input stops its own first).
function onKeyDown(e) {
  e.stopPropagation();
  if (e.key === 'Escape' && card?.el?.contains(e.target)) { e.preventDefault(); closeByUser(); }
}
function onResize() { placeBanner(); }

/* ---------- cards: shared plumbing ---------- */
export function currentCard() { return card ? { type: card.type, uid: card.uid } : null; }

export function hideCard() {
  if (!card) return;
  flushName(card);                 // may re-enter showBirdCard for the same bird — handled in place
  const c = card;
  if (!c) return;
  card = null;
  c.dead = true;
  cancel(c.wait); cancel(c.savedT);
  if (c.el) dismissEl(c.el);
  placeBanner();
}

function closeByUser() {
  const c = card;
  if (!c) return;
  hideCard();
  if (typeof c.onClose === 'function') {
    try { c.onClose(); } catch (e) { console.error(e); }
  }
}

function openCard(next) {
  const prev = card;
  if (prev) { flushName(prev); prev.dead = true; cancel(prev.wait); cancel(prev.savedT); }
  card = next;
  const prevEl = prev?.el && prev.el.parentNode === root && !prev.el.classList.contains('is-leaving') ? prev.el : null;
  const wait = bannerWait();
  if (wait > 0) {
    if (prevEl) dismissEl(prevEl);
    next.wait = later(() => {
      next.wait = 0;
      if (card !== next) return;
      endBanner();
      mountCard(next, null);
    }, wait);
    return;
  }
  mountCard(next, prevEl);
}

function mountCard(c, replaceEl) {
  if (!root) return;
  const el = c.type === 'bird' ? buildBirdCard(c) : buildEggCard(c);
  c.el = el;
  if (c.type === 'bird') fillBird(c); else fillEgg(c);
  if (replaceEl && replaceEl.parentNode === root) {
    el.classList.add('is-swap');           // a quick cross-fade instead of the entrance
    root.replaceChild(el, replaceEl);
  } else {
    root.appendChild(el);
  }
  if (c.type === 'bird') paintBirdPortrait(c); else paintEggIcon(c);
  if (c.focusName) inviteName(c);
  placeBanner();
}

function dismissEl(el) {
  if (!el.isConnected) return;
  if (reducedMotion()) { el.remove(); return; }
  el.classList.add('is-leaving');
  later(() => el.remove(), CARD_FADE);
}

function cardShell(kind) {
  const el = h('section', `gs-card gs-card--${kind}`);
  el.setAttribute('role', 'dialog');
  const body = h('div', 'gs-body');
  const x = h('button', 'gs-x', '✕');
  x.type = 'button';
  x.title = 'Schließen';
  x.setAttribute('aria-label', 'Schließen');
  x.addEventListener('click', closeByUser);
  el.append(body, x);                     // ✕ last in tab order, pinned top-right by CSS
  return { el, body };
}

function frame(kind, fallback) {
  const f = h('div', `gs-frame gs-frame--${kind}`);
  const fb = h('span', 'gs-fallback', fallback);
  fb.setAttribute('aria-hidden', 'true');
  f.appendChild(fb);
  return f;
}

/* ---------- bird card ---------- */
// bird: store record. portrait: clip {img, frames, u} (img may be recoloured) or null.
// side: 'left' (default) or 'right' — the scene puts the card on the side away
// from the selected bird so it doesn't hide it (ignored on narrow gardens).
// onSell: lets the player sell the bird (after a confirm step) for sellCoins
// coins, shown on the button; the button only shows when canSell.
export function showBirdCard(bird, {
  portrait = null, onRename = null, onClose = null, focusName = false, side = 'left',
  onSell = null, sellCoins = 0, canSell = false,
} = {}) {
  if (!root || !bird || !bird.uid) return;
  if (card && card.type === 'bird' && card.uid === bird.uid) {   // same bird → update in place
    const c = card;
    c.side = side;
    c.bird = { ...bird };
    c.name = bird.name || '';
    c.onRename = onRename;
    c.onClose = onClose;
    Object.assign(c, { onSell, sellCoins, canSell });
    if (focusName) c.focusName = true;
    if (portrait !== c.portrait) { c.portrait = portrait; if (c.el) paintBirdPortrait(c); }
    if (c.el) { fillBird(c); if (c.focusName) inviteName(c); }
    return;
  }
  openCard({
    type: 'bird', uid: bird.uid, bird: { ...bird }, name: bird.name || '', portrait, onRename, onClose, focusName, side,
    onSell, sellCoins, canSell, confirming: false,
  });
}

function buildBirdCard(c) {
  const { el, body } = cardShell('bird');
  const head = h('div', 'gs-head');
  const fr = frame('bird', '🐦');
  const cv = h('canvas', 'gs-portrait');
  const twinkle = h('span', 'gs-twinkle');
  twinkle.setAttribute('aria-hidden', 'true');
  fr.append(cv, twinkle);

  const txt = h('div', 'gs-headtext');
  const nameWrap = h('label', 'gs-name');
  const input = h('input', 'gs-name-input');
  input.type = 'text';
  input.maxLength = BIRD_NAME_MAX;
  input.placeholder = 'Name geben …';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'words');
  input.setAttribute('enterkeyhint', 'done');
  input.setAttribute('aria-label', 'Name des Vogels');
  input.setAttribute('data-1p-ignore', '');
  input.setAttribute('data-lpignore', 'true');
  const ico = h('span', 'gs-name-ico');
  ico.setAttribute('aria-hidden', 'true');
  ico.innerHTML = PENCIL_SVG + CHECK_SVG;  // static markup only
  nameWrap.append(input, ico);
  const species = h('div', 'gs-species');
  const latin = h('div', 'gs-latin');
  txt.append(nameWrap, species, latin);
  head.append(fr, txt);

  const chips = h('div', 'gs-chips');
  const rar = h('span', 'gs-chip gs-chip--rar');
  const vchip = h('span', 'gs-chip gs-chip--var');
  const vtext = h('span');
  const swatch = h('span', 'gs-swatch');
  swatch.setAttribute('aria-hidden', 'true');
  vchip.append(vtext, swatch);
  chips.append(rar, vchip);

  const originRow = h('div', 'gs-origin-row');
  const origin = h('div', 'gs-origin');
  const sell = h('button', 'gs-sell');            // „Verkaufen ⦿ 30“, filled in fillBird
  sell.type = 'button';
  originRow.append(origin, sell);
  // Sell confirm: shown in place of the fact, so the card keeps its size.
  const confirm = h('div', 'gs-confirm');
  confirm.setAttribute('role', 'group');
  confirm.setAttribute('aria-label', 'Verkaufen bestätigen');
  const confirmQ = h('p', 'gs-confirm-q');
  const yes = h('button', 'gs-confirm-yes');
  yes.type = 'button';
  const no = h('button', 'gs-confirm-no', 'Behalten');
  no.type = 'button';
  const actions = h('div', 'gs-confirm-actions');
  actions.append(yes, no);
  confirm.append(confirmQ, actions);
  const fact = h('p', 'gs-fact');
  body.append(head, chips, originRow, confirm, fact);

  sell.addEventListener('click', () => {
    c.confirming = true; fillBird(c);
    no.focus({ preventScroll: true });            // the safe choice has focus
  });
  no.addEventListener('click', () => {
    c.confirming = false; fillBird(c);
    sell.focus({ preventScroll: true });
  });
  yes.addEventListener('click', () => {
    c.confirming = false;
    if (typeof c.onSell === 'function') {
      try { c.onSell(); } catch (e) { console.error(e); }
    }
  });

  Object.assign(c, {
    frame: fr, canvas: cv, input, nameWrap, species, latin, rar, vchip, vtext, swatch, origin, fact,
    sell, confirm, confirmQ, yes,
  });
  wireName(c);
  return el;
}

function fillBird(c) {
  c.el.classList.toggle('is-right', c.side === 'right');
  const b = c.bird;
  const def = birdById(b.species);
  const info = speciesInfo(b.species);
  const rarity = def?.rarity || 'normal';
  const variant = b.variant ? variantFor(b.species, b.variant) : null;

  setRarity(c.el, rarity);
  c.el.classList.toggle('is-variant', !!b.variant);
  c.species.textContent = info.de;
  c.latin.textContent = info.latin || '';
  c.latin.hidden = !info.latin;
  c.rar.textContent = RARITY_LABEL[rarity] || rarity;
  c.vchip.hidden = !b.variant;
  c.vtext.textContent = b.variant ? `✨ Seltene Variante: ${variant?.name || b.variant}` : '';
  if (variant?.accent) {
    c.swatch.style.background = variant.accent;
    c.swatch.hidden = false;
  } else c.swatch.hidden = true;
  c.origin.textContent = originText(b);
  // A bird in a rare variant explains its colour form instead of the species.
  const fact = variant?.fact || info.fact || '';
  c.fact.textContent = fact;
  // Sell: button (with the bird's value) only when allowed; while confirming,
  // the question takes the fact's place.
  const canSell = typeof c.onSell === 'function' && !!c.canSell;
  if (!canSell) c.confirming = false;
  const coins = Math.max(0, Math.round(c.sellCoins || 0));
  const word = coins === 1 ? 'Münze' : 'Münzen';
  c.sell.hidden = !canSell || c.confirming;
  if (canSell && c.sell.dataset.coins !== String(coins)) {
    c.sell.dataset.coins = String(coins);
    c.sell.replaceChildren('Verkaufen ', h('i', 'coin-ico'), String(coins));
    c.sell.setAttribute('aria-label', `Verkaufen für ${coins} ${word}`);
  }
  c.confirm.hidden = !c.confirming;
  if (c.confirming) {
    c.confirmQ.replaceChildren(h('b', null, 'Wirklich verkaufen?'),
      ` Du bekommst ${coins} ${word}. Die Art bleibt in deinem Vogelbuch.`);
    c.yes.textContent = `Ja, verkaufen · +${coins}`;
  }
  c.fact.hidden = !fact || c.confirming;

  const editable = typeof c.onRename === 'function';
  c.input.readOnly = !editable;
  c.nameWrap.classList.toggle('is-readonly', !editable);
  if (!isEditing(c)) setNameValue(c, c.name);
  updateBirdLabel(c);
}

function originText(b) {
  const d = b.at ? new Date(b.at) : null;
  const date = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('de-DE') : '';
  if (b.from === 'starter') return 'Dein allererster Gartenvogel';
  if (b.from === 'egg' && date) return `Aus einem Ei geschlüpft am ${date}`;
  if (b.from === 'shop' && date) return `Im Shop gekauft am ${date}`;
  return 'Schon lange in deinem Garten';
}

function updateBirdLabel(c) {
  const de = speciesInfo(c.bird.species).de;
  c.el.setAttribute('aria-label', c.name ? `${c.name} (${de})` : de);
}

/* ---------- name editing ---------- */
const isEditing = c => !!c.input && document.activeElement === c.input;

function setNameValue(c, v) {
  c.input.value = v;
  c.input.title = v;
  syncNameSize(c);
}
function syncNameSize(c) { c.input.classList.toggle('is-long', [...c.input.value].length > LONG_NAME); }

function wireName(c) {
  const inp = c.input;
  inp.addEventListener('keydown', e => {
    e.stopPropagation();                         // never reaches the quiz's document handler
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); commitName(c); inp.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); setNameValue(c, c.name); inp.blur(); }
  });
  inp.addEventListener('keyup', stopEvent);
  inp.addEventListener('keypress', stopEvent);
  inp.addEventListener('input', () => { syncNameSize(c); c.nameWrap.classList.remove('is-invite'); });
  inp.addEventListener('focus', () => {
    c.nameWrap.classList.remove('is-invite', 'is-saved');
    cancel(c.savedT);
  });
  inp.addEventListener('blur', () => { if (!c.dead) commitName(c); });
}

function commitName(c) {
  if (!c.input) return;
  const raw = c.input.value, before = c.name;
  if (normName(raw) === before || typeof c.onRename !== 'function') { setNameValue(c, before); return; }
  let stored;
  try { stored = c.onRename(raw); } catch (e) { console.error(e); stored = null; }
  if (stored && typeof stored.then === 'function') {          // tolerate an async callback
    stored.then(s => applyStoredName(c, s, before), () => applyStoredName(c, null, before));
    return;
  }
  applyStoredName(c, stored, before);
}

// `before` is the name prior to this commit (the scene may already have pushed
// the new one back in through showBirdCard while onRename was running).
function applyStoredName(c, stored, before) {
  if (typeof stored === 'string' && stored !== before) {
    c.name = stored;
    c.bird = { ...c.bird, name: stored };
    if (!c.dead) {
      c.nameWrap.classList.add('is-saved');
      cancel(c.savedT);
      c.savedT = later(() => c.nameWrap.classList.remove('is-saved'), SAVED_TICK);
    }
    announce(stored ? `Name gespeichert: ${stored}` : 'Name entfernt');
  }
  if (c.dead || !c.el) return;
  setNameValue(c, c.name);                       // show what was actually stored
  updateBirdLabel(c);
}

function flushName(c) {
  if (!c || c.dead || c.type !== 'bird' || !c.input) return;
  try { commitName(c); } catch (e) { console.error(e); }
}

// After a hatch: put the cursor in the name field. On touch screens that would
// throw up the keyboard over the garden, so the field just glows invitingly.
function inviteName(c) {
  c.focusName = false;
  if (!c.input || c.input.readOnly) return;
  if (finePointer()) {
    try { c.input.focus({ preventScroll: true }); } catch (e) { c.input.focus(); }
  } else {
    c.nameWrap.classList.add('is-invite');
  }
}

/* ---------- bird portrait ---------- */
function paintBirdPortrait(c) {
  const p = c.portrait;
  if (p && typeof p.then === 'function') {        // tolerate a clip promise
    drawPortrait(c, null, true);
    p.then(clip => { if (!c.dead && c.portrait === p && c.el) drawPortrait(c, clip); }, () => {
      if (!c.dead && c.portrait === p && c.el) drawPortrait(c, null);
    });
    return;
  }
  drawPortrait(c, p);
}

// Idle frame 0, cropped to the clip's content box, integer-scaled in device
// pixels where that doesn't waste much room, standing on the frame's grass
// strip. Sprites are authored facing left; mirrored here so the bird looks
// into the card, towards its name.
function drawPortrait(c, clip, pending = false) {
  const cv = c.canvas, dpr = pixelRatio();
  const W = Math.round(PORTRAIT_W * dpr), H = Math.round(PORTRAIT_H * dpr);
  cv.width = W; cv.height = H;
  cv.style.width = PORTRAIT_W + 'px'; cv.style.height = PORTRAIT_H + 'px';
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const f = clip?.frames?.[0];
  let ok = false;
  if (clip?.img && f) {
    const u = clip.u && clip.u.w > 0 && clip.u.h > 0 ? clip.u : { lx: 0, ty: 0, w: f.w, h: f.h };
    const pad = PORTRAIT_PAD * dpr;
    const fit = Math.min((W - 2 * pad) / u.w, (H - 2 * pad) / u.h);
    const whole = Math.floor(fit);
    const s = whole >= 1 && whole >= fit * 0.8 ? whole : fit;
    const dw = Math.round(u.w * s), dh = Math.round(u.h * s);
    const dx = Math.round((W - dw) / 2), dy = Math.round(H - pad - dh);
    try {
      g.fillStyle = 'rgba(10, 20, 14, 0.32)';      // soft contact shadow
      g.beginPath();
      g.ellipse(W / 2, dy + dh - dpr, Math.max(4 * dpr, dw * 0.34), 2 * dpr, 0, 0, Math.PI * 2);
      g.fill();
      g.imageSmoothingEnabled = s < 1;            // crisp when enlarging, smooth if it must shrink
      g.save();
      g.translate(W, 0); g.scale(-1, 1);
      g.drawImage(clip.img, f.x + u.lx, f.y + u.ty, u.w, u.h, W - dx - dw, dy, dw, dh);
      g.restore();
      ok = true;
    } catch (e) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
    }
  }
  c.frame.classList.toggle('is-empty', !ok && !pending);
}

/* ---------- egg card ---------- */
export function showEggCard(egg, { onClose = null } = {}) {
  if (!root || !egg || !egg.uid) return;
  if (card && card.type === 'egg' && card.uid === egg.uid) {     // same egg → update in place
    const tierChanged = card.egg.tier !== egg.tier;
    card.egg = { ...egg };
    card.onClose = onClose;
    if (card.el) { fillEgg(card); if (tierChanged) paintEggIcon(card); }
    return;
  }
  openCard({ type: 'egg', uid: egg.uid, egg: { ...egg }, onClose });
}

function buildEggCard(c) {
  const { el, body } = cardShell('egg');
  const head = h('div', 'gs-head');
  const fr = frame('egg', '🥚');
  const cv = h('canvas', 'gs-eggicon');
  fr.appendChild(cv);

  const txt = h('div', 'gs-headtext');
  const title = h('div', 'gs-title');
  const meterRow = h('div', 'gs-meter-row');
  const pct = h('span', 'gs-meter-pct');
  meterRow.append(h('span', null, 'Wärme'), pct);
  const meter = h('div', 'gs-meter');
  const fill = h('div', 'gs-meter-fill');
  meter.appendChild(fill);
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-label', 'Wärme');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  txt.append(title, meterRow, meter);
  head.append(fr, txt);

  const eta = h('div', 'gs-eta');
  const note = h('p', 'gs-note', 'Eier werden warm, während du im Quiz Fragen beantwortest.');
  const inside = h('div', 'gs-line');
  const insideV = h('span');
  inside.append(h('span', 'gs-k', 'Darin:'), ' ', insideV);
  const chance = h('div', 'gs-line');
  const chanceV = h('span', 'gs-num');
  chance.append(h('span', 'gs-k', 'Chance auf seltene Variante:'), ' ', chanceV);
  body.append(head, eta, note, inside, chance);

  Object.assign(c, { frame: fr, canvas: cv, title, pct, meter, fill, eta, insideV, chanceV });
  return el;
}

function fillEgg(c) {
  const egg = c.egg;
  const tier = eggTierById(egg.tier);
  const tierId = tier?.id || 'normal';
  const need = Math.max(0.01, Number(egg.need) || tier?.need || 1);
  const warmth = Math.max(0, Math.min(need, Number(egg.warmth) || 0));
  const ready = warmth >= need;
  const pct = ready ? 100 : Math.min(99, Math.floor((100 * warmth) / need));

  setRarity(c.el, tierId);
  c.el.classList.toggle('is-ready', ready);
  c.el.setAttribute('aria-label', tier?.name || 'Ei');
  c.title.textContent = tier?.name || 'Ei';
  c.pct.textContent = `${pct} %`;
  c.fill.style.width = pct + '%';
  c.meter.setAttribute('aria-valuenow', String(pct));
  if (ready) {
    c.eta.textContent = 'Bereit! Tippe auf das Ei, damit es schlüpft.';
  } else {
    const n = Math.max(1, Math.ceil(need - warmth - 1e-6));
    c.eta.textContent = `Noch ca. ${n} richtige ${n === 1 ? 'Antwort' : 'Antworten'}`;
  }
  c.insideV.textContent = speciesForTier(tierId).map(d => speciesInfo(d.id).de).join(', ');
  c.chanceV.textContent = `${Math.round((tier?.variantChance || 0) * 100)} %`;
}

function paintEggIcon(c) {
  const cv = c.canvas, dpr = pixelRatio();
  cv.width = Math.round(EGG_ICON * dpr); cv.height = Math.round(EGG_ICON * dpr);
  cv.style.width = EGG_ICON + 'px'; cv.style.height = EGG_ICON + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, EGG_ICON, EGG_ICON);
  g.imageSmoothingEnabled = false;
  let ok = true;
  try { drawEggIcon(g, eggTierById(c.egg.tier)?.id || 'normal', EGG_ICON, EGG_ICON); }
  catch (e) { console.error(e); ok = false; }
  c.frame.classList.toggle('is-empty', !ok);
}

/* ---------- banner ---------- */
// Centred near the top; fades in, stays ~3.5 s, fades out. One at a time.
export function showBanner({ title = '', sub = '', rare = false } = {}) {
  if (!root) return;
  if (banner) { cancel(banner.timer); banner.el.remove(); banner = null; }
  const el = h('div', 'gs-banner' + (rare ? ' is-rare' : ''));
  el.setAttribute('aria-hidden', 'true');        // announced through the live region instead
  el.appendChild(h('div', 'gs-banner-title', title));
  if (sub) el.appendChild(h('div', 'gs-banner-sub', sub));
  root.appendChild(el);
  const b = banner = { el, at: now(), timer: 0 };
  placeBanner(true);
  b.timer = later(() => endBanner(b), BANNER_HOLD);
  announce(sub ? `${title} – ${sub}` : title);
}

function endBanner(b = banner) {
  if (!b || b !== banner) return;
  banner = null;
  cancel(b.timer);
  if (reducedMotion()) { b.el.remove(); return; }
  b.el.classList.add('is-leaving');
  later(() => b.el.remove(), BANNER_FADE);
}

// How long a card opened now should wait for the banner (narrow gardens only).
function bannerWait() {
  if (!banner || !root || root.clientWidth >= NARROW) return 0;
  const age = now() - banner.at;
  if (age >= BANNER_GROUP) { endBanner(); return 0; }
  return Math.max(0, BANNER_MIN_SHOW - age);
}

// Keep the banner clear of an open card: centred in the free strip to its
// right, or — when there's no room beside it — low over the grass.
function placeBanner(initial = false) {
  const b = banner;
  if (!b || !root) return;
  const el = b.el;
  if (initial) el.style.transition = 'none';
  const ce = card?.el && card.el.parentNode === root && !card.el.classList.contains('is-leaving') ? card.el : null;
  let low = false;
  if (ce) {
    // Free strip beside the card; on its right side the Shop button (top-right) is kept clear too.
    const W = root.clientWidth, gap = 12;
    const shop = root.parentNode?.querySelector('.garden-shop-btn');
    const shopSpace = shop ? shop.offsetWidth + 10 : 0;
    const onRight = ce.offsetLeft > W / 2;
    const from = onRight ? gap : ce.offsetLeft + ce.offsetWidth + gap;
    const to = onRight ? ce.offsetLeft - gap : W - gap - shopSpace;
    const room = to - from;
    if (room >= 200) {
      el.style.maxWidth = room + 'px';
      const bw = el.offsetWidth;
      el.style.left = Math.round(Math.min(Math.max(onRight ? from + bw / 2 : W / 2, from + bw / 2), to - bw / 2)) + 'px';
    } else low = true;
  }
  if (!ce || low) { el.style.maxWidth = ''; el.style.left = ''; }
  el.classList.toggle('is-low', low);
  if (initial) { void el.offsetWidth; el.style.transition = ''; }
}
