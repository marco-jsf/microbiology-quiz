// Garden shop — a modal dialog with three tabs:
//   Eier      — buy eggs for the nest: the only way to discover a species or
//               one of its rare colour variants.
//   Deko      — garden objects are bought piece by piece (up to their max) and
//               put down in the garden by the player; the pond (landscape)
//               and the ambient effects are bought once, then switched on/off.
//   Vogelbuch — every species, grouped by rarity: a black silhouette until it
//               first hatches (birds only come from eggs, nothing is sold
//               here); each with its three colour variants (silhouette and
//               „?“ until one has hatched).
//
// Built to stay snappy: a tab's DOM is created the first time it is shown,
// tile canvases are only painted for the visible tab, and each canvas is
// repainted only when what it shows changes (silhouette → owned, unseen →
// discovered) or the screen's pixel ratio does.
//
// The shop never calls into the garden scene: it changes the store, and the
// scene (like this dialog) listens via onGardenChange.

import {
  BIRDS, birdById, RARITY_LABEL, speciesInfo, EGG_TIERS, speciesForTier, DECOR, NEW_SPECIES_WEIGHT, isPlaceable,
} from './garden-data.js';
import { variantsOf, variantCount } from './garden-variants.js';
import {
  ownedCount, isDiscovered, listEggs, nestCapacity, nestFull, isEggReady, readyEggCount, buyEgg,
  hasSeenVariant, ownsDecor, isDecorOn, buyDecor, setDecorOn, onGardenChange, resetGarden,
  decorCount, placedCount, storedCount, canBuyDecor, listDecorItems, requestPlacement,
} from './garden-store.js';
import { getCoins } from './engine.js';
import { getIdleClip } from './garden.js';
import { drawEggIcon, drawDecorIcon } from './garden-art.js';

const RARITY_ORDER = { normal: 0, rare: 1, epic: 2 };
// "Schlüpft aus seltenen Eiern" — an egg tier's adjective, declined for that hint.
const EGG_ADJ = { normal: 'einfachen', rare: 'seltenen', epic: 'epischen' };
// Birds grouped by rarity (Normal → Selten → Episch), cheapest first within a tier.
const SORTED = [...BIRDS].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.cost - b.cost);

const TABS = [
  { id: 'eggs', icon: '🥚', label: 'Eier' },
  { id: 'decor', icon: '🌷', label: 'Deko' },
  { id: 'birds', icon: '📖', label: 'Vogelbuch' },
];

const TILE_W = 76, TILE_H = 62;        // CSS px of a tile's picture
const SWATCH_W = 34, SWATCH_H = 30;    // CSS px of a variant swatch's picture
const SILHOUETTE = '#000';             // locked bird in the Vögel tab
const SWATCH_SILHOUETTE = '#06090d';   // undiscovered variant

let dialog, headEl, body, coinEl, io;
let activeTab = 'eggs';               // remembered while the page lives
const tabBtns = {}, panelEls = {}, panels = {};

/* ---------- tiny DOM helpers ---------- */
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(cls, text) {
  const b = h('button', cls, text);
  b.type = 'button';
  return b;
}
// "Kaufen <coin> 120" — rebuilt only when the text or price changes.
function setPriceLabel(btn, text, cost) {
  const sig = `${text}|${cost}`;
  if (btn.dataset.sig === sig) return;
  btn.dataset.sig = sig;
  btn.replaceChildren(text, h('i', 'coin-ico'), String(cost));
}
function setPlainLabel(btn, text) {
  if (btn.dataset.sig === text) return;
  btn.dataset.sig = text;
  btn.textContent = text;
}
// Buy buttons stay clickable when the wallet is short, so a tap can answer
// with the gentle shake instead of silently doing nothing.
function setBuy(btn, text, cost, coins) {
  setPriceLabel(btn, text, cost);
  const short = coins < cost;
  btn.disabled = false;
  btn.classList.toggle('is-short', short);
  btn.setAttribute('aria-disabled', String(short));
  const miss = cost - coins;
  btn.title = short ? `Dir fehlen noch ${miss} ${miss === 1 ? 'Münze' : 'Münzen'}.` : '';
}
// A buy button that can't be used for a reason other than coins (nest full,
// maximum reached): really disabled, with the reason as its tooltip.
function setBlocked(btn, text, why) {
  setPlainLabel(btn, text);
  btn.disabled = true;
  btn.classList.remove('is-short');
  btn.removeAttribute('aria-disabled');
  btn.title = why;
}
function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;                 // reflow so the animation plays again
  el.classList.add(cls);
}
function onAnimEnd(e) {
  const el = e.currentTarget;
  if (e.target !== el) return;
  el.classList.remove('shake', 'just-bought', 'shop-reveal');
}

/* ---------- pictures: canvases that repaint only when needed ---------- */
// want(p, key, load, draw): `key` names what the canvas should show; `load()`
// (optional, may be async) fetches what `draw(ctx, data, dpr)` needs. Painting
// is skipped while the drawn key (+ DPR) is current, and a slow load that was
// overtaken by a newer request is dropped.
function pic(w, ht, cls = 'shop-sprite') {
  const el = h('canvas', cls);
  el.width = Math.round(w * (window.devicePixelRatio || 1));
  el.height = Math.round(ht * (window.devicePixelRatio || 1));
  el.style.width = w + 'px';
  el.style.height = ht + 'px';
  el.setAttribute('aria-hidden', 'true');
  el.addEventListener('animationend', onAnimEnd);
  return { el, w, h: ht, key: null, load: null, draw: null, drawn: null, job: null, flash: false };
}
function want(p, key, load, draw) { p.key = key; p.load = load; p.draw = draw; }

async function paint(p) {
  if (!p.draw) return;
  const dpr = window.devicePixelRatio || 1;
  const tag = `${p.key}@${dpr}`;
  if (tag === p.drawn || tag === p.job) return;
  p.job = tag;
  const draw = p.draw;
  let data = null;
  try { data = p.load ? await p.load() : null; }
  catch (e) { if (p.job === tag) p.job = null; return; }   // asset missing — retry on a later refresh
  if (p.job !== tag) return;                                // superseded while loading
  p.job = null;
  const cw = Math.round(p.w * dpr), ch = Math.round(p.h * dpr);
  if (p.el.width !== cw || p.el.height !== ch) { p.el.width = cw; p.el.height = ch; }
  const c = p.el.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, cw, ch);
  c.imageSmoothingEnabled = false;
  try { draw(c, data, dpr); } catch (e) { console.error(e); return; }
  p.drawn = tag;
  if (p.flash) { p.flash = false; revealWhenVisible(p.el); }
}
function paintAll(panel) { for (const p of panel.pics) paint(p); }

// A freshly unlocked picture (bird bought, variant discovered) gets a short
// reveal — but only once it's actually scrolled into view.
function revealWhenVisible(el) {
  if (!io) { restartAnim(el, 'shop-reveal'); return; }
  el.dataset.reveal = '1';
  io.observe(el);
}
function onIntersect(entries) {
  for (const e of entries) {
    if (!e.isIntersecting || !e.target.dataset.reveal) continue;
    delete e.target.dataset.reveal;
    io.unobserve(e.target);
    restartAnim(e.target, 'shop-reveal');
  }
}

/* ---------- bird sprites ---------- */
// Idle clip of a species (optionally recoloured to a variant), cached for the
// page's lifetime so reopening the shop never re-scans a sprite sheet.
const clipCache = new Map();
function idleClip(species, variant = null) {
  const k = `${species}:${variant || ''}`;
  let p = clipCache.get(k);
  if (!p) {
    p = Promise.resolve()
      .then(() => getIdleClip(birdById(species), variant))
      .then(clip => {
        if (!clip || !clip.img || !clip.frames || !clip.frames.length) throw new Error('no idle clip: ' + k);
        return clip;
      });
    p.catch(() => clipCache.delete(k));
    clipCache.set(k, p);
  }
  return p;
}

// Idle frame 0, standing on the bottom edge. Prefers the largest WHOLE
// device-pixel scale (crisp, even pixels) unless that would shrink the bird by
// more than a quarter; smooths only when it has to scale down.
// `fill` turns it into a flat silhouette of that colour.
function drawClip(c, clip, dpr, { pad = 4, fill = null } = {}) {
  const f = clip.frames[0];
  const u = clip.u || { lx: 0, ty: 0, w: f.w, h: f.h };
  const cw = c.canvas.width, ch = c.canvas.height, pd = Math.round(pad * dpr);
  const fit = Math.min((cw - 2 * pd) / u.w, (ch - 2 * pd) / u.h);
  const whole = Math.floor(fit);
  const s = fit >= 1 && whole / fit >= 0.75 ? whole : fit;
  c.imageSmoothingEnabled = fit < 1;
  if (fit < 1) c.imageSmoothingQuality = 'high';
  const dw = Math.round(u.w * s), dh = Math.round(u.h * s);
  const dx = Math.round((cw - dw) / 2), dy = ch - pd - dh;
  c.drawImage(clip.img, f.x + u.lx, f.y + u.ty, u.w, u.h, dx, dy, dw, dh);
  if (fill) {
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = fill;
    c.fillRect(0, 0, cw, ch);
    c.globalCompositeOperation = 'source-over';
  }
}
// Art-module icons work in CSS px with the DPR already applied.
function drawIcon(c, dpr, p, pad, fn) {
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.imageSmoothingEnabled = false;
  c.translate(pad, pad);
  fn(c, p.w - 2 * pad, p.h - 2 * pad);
}

/* ---------- buying ---------- */
// A double-click must not buy twice (or hit the toggle that replaces the buy
// button under the cursor), so each tile ignores clicks briefly after a purchase.
const CLICK_GUARD_MS = 600;
function recentlyBought(tile) { return performance.now() - (+tile.dataset.boughtAt || -1e9) < CLICK_GUARD_MS; }
function purchase(btn, tile, attempt, reveal = null) {
  if (btn.disabled || recentlyBought(tile) || cel) return;
  const before = getCoins();
  if (!attempt()) { restartAnim(btn, 'shake'); return; }   // can't afford — nudge the button
  tile.dataset.boughtAt = String(performance.now());
  refresh();
  restartAnim(tile, 'just-bought');
  if (reveal) celebrate({ ...reveal, from: before, to: getCoins() });
}

/* ---------- purchase celebration ----------
 * After buying an egg or a decor item the shop shows it off: the item drops in
 * big with light rays, a glow and flying sparkles, its name and the price, while
 * the wallet counts down. Then the whole shop closes (animated) and the garden
 * scene takes over (the egg falls into the nest, the decor pops up). A click or
 * a key skips ahead to the closing. */
const CEL_HOLD_MS = 1900;            // how long the item is on show before the shop closes
const CEL_ITEM = 128;                // CSS px of the item picture
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let cel = null;                      // the running celebration { el, timer }

function celebrate({ kind, id, rar, title, sub, from, to }) {
  endCelebration(false);
  const el = h('div', `shop-cel ${rar}`);
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  const rays = h('div', 'shop-cel-rays');
  const stage = h('div', 'shop-cel-stage');
  const glow = h('div', 'shop-cel-glow');
  const cv = h('canvas', 'shop-cel-item');
  const dpr = window.devicePixelRatio || 1;
  cv.width = cv.height = Math.round(CEL_ITEM * dpr);
  cv.style.width = cv.style.height = CEL_ITEM + 'px';
  try {
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = false;
    if (kind === 'egg') drawEggIcon(c, id, CEL_ITEM, CEL_ITEM);
    else drawDecorIcon(c, id, CEL_ITEM, CEL_ITEM);
  } catch (e) { /* the text still tells what was bought */ }
  stage.append(glow, cv);
  for (let i = 0; i < 14; i++) {                    // sparkles flying out in a ring
    const s = h('i', 'shop-cel-spark');
    s.style.setProperty('--a', `${Math.round(i * (360 / 14) + (i % 2) * 9)}deg`);
    s.style.setProperty('--d', `${70 + (i % 3) * 22}px`);
    s.style.setProperty('--t', `${(i % 4) * 0.06}s`);
    stage.append(s);
  }
  const t = h('div', 'shop-cel-title', title);
  const st = h('div', 'shop-cel-sub', sub);
  const cost = h('div', 'shop-cel-cost');
  cost.append(`−${Math.max(0, from - to)}`, h('i', 'coin-ico'));
  el.append(rays, stage, t, st, cost);
  el.style.top = `${headEl.offsetHeight}px`;        // the head (and its wallet counting down) stays visible
  dialog.append(el);
  dialog.classList.add('is-celebrating');
  countCoins(from, to);
  // A key skips ahead — and is swallowed, so Enter / Space can't also press the
  // buy button that still has focus (decor can be bought again and again).
  const skip = e => {
    if (e && e.type === 'keydown') { e.preventDefault(); e.stopPropagation(); }
    endCelebration(true);
  };
  el.addEventListener('click', skip);
  el.tabIndex = -1;
  cel = { el, skip, timer: setTimeout(() => endCelebration(true), reducedMotion() ? 1200 : CEL_HOLD_MS) };
  el.focus({ preventScroll: true });                 // take focus off the buy button
  document.addEventListener('keydown', skip, { once: true, capture: true });
}

// Finish the celebration; with `close`, close the shop afterwards (animated).
function endCelebration(close) {
  if (!cel) return;
  const { el, skip, timer } = cel;
  cel = null;
  clearTimeout(timer);
  document.removeEventListener('keydown', skip, { capture: true });
  if (close) closeShop(() => { el.remove(); dialog.classList.remove('is-celebrating'); });
  else { el.remove(); dialog.classList.remove('is-celebrating'); }
}

// Wallet (shop + header) counts down from `from` to `to`.
function countCoins(from, to) {
  const hdr = document.getElementById('coinCount');
  const set = v => { coinEl.textContent = v; if (hdr) hdr.textContent = v; };
  if (reducedMotion() || from === to) { set(to); return; }
  const t0 = performance.now(), dur = 700;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    set(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Close the shop with its exit animation (every way of closing goes through here).
let closing = 0;
function closeShop(after = null) {
  if (!dialog || !dialog.open) { if (after) after(); return; }
  if (closing) return;
  const done = () => {
    closing = 0;
    dialog.classList.remove('is-closing');
    dialog.close();
    if (after) after();
  };
  if (reducedMotion()) { done(); return; }
  dialog.classList.add('is-closing');
  closing = setTimeout(done, 260);
}

function tileShell(cls) {
  const tile = h('div', `shop-tile ${cls}`);
  tile.addEventListener('animationend', onAnimEnd);
  const wrap = h('div', 'shop-sprite-wrap');
  const p = pic(TILE_W, TILE_H);
  wrap.append(p.el);
  const info = h('div', 'shop-info');
  tile.append(wrap, info);
  return { tile, info, p };
}
function buyButton() {
  const b = button('shop-buy');
  b.addEventListener('animationend', onAnimEnd);
  return b;
}
function linkToTab(id, text) {
  const b = button('shop-link', text);
  b.onclick = () => showTab(id, { focus: true });
  return b;
}

/* ---------- tab: Vogelbuch ---------- */
// Undiscovered species show as a silhouette with a link to the eggs they hatch
// from; once one has hatched, the tile shows the bird and how many live in the
// garden (0 after all of them were sold — it stays discovered).
// Every tile lists the species' three colour variants: a swatch per variant
// (silhouette until one has hatched) and their names below — a variant's name
// stays a „?“ until it has hatched, so what is still out there stays a surprise.
function buildBirdPanel(el) {
  const note = h('p', 'shop-note');
  const found = h('b'), foundV = h('b');
  note.append('Entdeckt: ', found, ' Arten und ', foundV, ' Farbvarianten. 🥚 Neue Vögel und seltene Farben schlüpfen nur aus ',
    linkToTab('eggs', 'Eiern'), '.');
  const grid = h('div', 'shop-grid');
  const tiles = SORTED.map(def => {
    const de = speciesInfo(def.id).de;
    const { tile, info, p } = tileShell(`shop-bird rarity-${def.rarity}`);
    const name = h('div', 'shop-name', de);
    const star = h('span', 'shop-star', '★');
    star.title = 'Alle Farbvarianten entdeckt';
    name.append(star);
    const sub = h('div', 'shop-sub');
    const owned = h('span', 'shop-owned');
    sub.append(h('span', 'shop-rarity', RARITY_LABEL[def.rarity] || def.rarity), owned);
    const sw = h('div', 'shop-swatches');
    const names = h('div', 'shop-vnames');
    const vars = variantsOf(def.id).map((v, i) => {
      const box = h('span', 'shop-swatch is-unseen');
      box.style.setProperty('--vc', v.accent);
      box.setAttribute('role', 'img');
      const vp = pic(SWATCH_W, SWATCH_H, 'shop-swatch-cv');
      box.append(vp.el);
      sw.append(box);
      const label = h('span', 'shop-vname', '?');
      label.style.setProperty('--vc', v.accent);
      if (i) names.append(' · ');
      names.append(label);
      return { v, box, p: vp, label, prev: undefined };
    });
    const egg = EGG_TIERS.some(t => t.id === def.rarity) && EGG_ADJ[def.rarity];
    const lock = h('div', 'shop-line shop-lock');
    if (egg) lock.append('🥚 Schlüpft aus ', linkToTab('eggs', `${egg} Eiern`));
    else lock.append('🥚 Schlüpft aus Eiern');
    info.append(name, sub);
    if (vars.length) info.append(sw, names);
    info.append(lock);
    grid.append(tile);
    return { def, de, tile, p, star, owned, lock, vars, prev: undefined };
  });
  el.append(note, grid, buildReset());

  return {
    pics: tiles.flatMap(t => [t.p, ...t.vars.map(c => c.p)]),
    refresh() {
      let n = 0, nv = 0;
      for (const t of tiles) {
        const has = isDiscovered(t.def.id);
        if (has) n++;
        if (t.prev === false && has) t.p.flash = true;
        t.prev = has;
        t.tile.classList.toggle('is-owned', has);
        t.tile.classList.toggle('is-locked', !has);
        t.owned.textContent = has ? `Im Garten: ${ownedCount(t.def.id)}` : 'Noch nicht entdeckt';
        t.lock.hidden = has;
        want(t.p, has ? 'bird' : 'silhouette', () => idleClip(t.def.id),
          (c, clip, dpr) => drawClip(c, clip, dpr, { pad: 6, fill: has ? null : SILHOUETTE }));
        for (const c of t.vars) {
          const seen = hasSeenVariant(t.def.id, c.v.id);
          if (seen) nv++;
          if (c.prev === seen) continue;               // nothing changed for this swatch
          if (c.prev === false && seen) c.p.flash = true;
          c.prev = seen;
          c.box.classList.toggle('is-seen', seen);
          c.box.classList.toggle('is-unseen', !seen);
          c.label.classList.toggle('is-seen', seen);
          c.label.textContent = seen ? c.v.name : '?';
          c.box.title = seen ? `${t.de} · ${c.v.name}` : 'Noch nicht entdeckt';
          c.box.setAttribute('aria-label', seen ? c.box.title : `${t.de}: Farbvariante noch nicht entdeckt`);
          if (seen) {
            want(c.p, 'seen', () => idleClip(t.def.id, c.v.id), (cx, clip, dpr) => drawClip(cx, clip, dpr, { pad: 2 }));
          } else {
            want(c.p, 'unseen', () => idleClip(t.def.id),
              (cx, clip, dpr) => drawClip(cx, clip, dpr, { pad: 2, fill: SWATCH_SILHOUETTE }));
          }
        }
        t.star.hidden = !t.vars.length || !t.vars.every(c => c.prev);
      }
      found.textContent = `${n} von ${tiles.length}`;
      foundV.textContent = `${nv} von ${variantCount()}`;
    },
  };
}

// „Neu anfangen“ at the end of the Vogelbuch: wipes the garden (store
// resetGarden) after an explicit second click, then closes the shop so the
// player sees the fresh garden. Coins and quiz progress are not touched.
function buildReset() {
  const sec = h('section', 'shop-reset');
  const text = h('p', 'shop-note',
    'Setzt deinen Garten zurück: alle Vögel, Eier, Deko und das Vogelbuch. Du startest wieder mit einer Stadttaube. '
    + 'Deine Münzen und dein Lernfortschritt bleiben erhalten.');
  const ask = button('shop-danger', 'Garten zurücksetzen …');
  const confirm = h('div', 'shop-confirm');
  confirm.hidden = true;
  confirm.setAttribute('role', 'group');
  confirm.setAttribute('aria-label', 'Garten zurücksetzen bestätigen');
  const q = h('p', 'shop-confirm-q');
  q.append(h('b', null, 'Wirklich neu anfangen?'), ' Alle Vögel, Eier, Deko und das Vogelbuch sind danach weg.');
  const yes = button('shop-danger is-solid', 'Ja, alles zurücksetzen');
  const no = button('shop-plain', 'Abbrechen');
  const actions = h('div', 'shop-confirm-actions');
  actions.append(yes, no);
  confirm.append(q, actions);
  const collapse = (focus = false) => {
    confirm.hidden = true; ask.hidden = false;
    if (focus) ask.focus({ preventScroll: true });
  };
  ask.onclick = () => {
    ask.hidden = true; confirm.hidden = false;
    no.focus({ preventScroll: true });          // the safe choice has focus
    confirm.scrollIntoView({ block: 'nearest' });
  };
  no.onclick = () => collapse(true);
  yes.onclick = () => {
    collapse();
    resetGarden();
    closeShop();
  };
  dialog.addEventListener('close', () => collapse());
  sec.append(h('h3', 'shop-sec', 'Neu anfangen'), text, ask, confirm);
  return sec;
}

/* ---------- tab: Eier ---------- */
function buildEggPanel(el) {
  const status = h('div', 'shop-note shop-nest');
  const dots = h('span', 'nest-dots');
  const nestCount = h('b');
  const statusText = h('span');
  statusText.append('Nest: ', nestCount, ' – Eier werden warm, während du Fragen beantwortest.');
  status.append(dots, statusText);
  const ready = h('p', 'shop-ready');

  const grid = h('div', 'shop-grid shop-grid-eggs');
  const tiles = EGG_TIERS.filter(t => speciesForTier(t.id).length).map(tier => {
    const { tile, info, p } = tileShell(`shop-egg rarity-${tier.id}`);
    want(p, 'egg', null, (c, _, dpr) => drawIcon(c, dpr, p, 7, (cx, w, ht) => drawEggIcon(cx, tier.id, w, ht)));
    const hatch = h('div', 'shop-line');
    hatch.append('Schlüpft nach ', h('b', null, String(tier.need)), ' richtigen Antworten');
    const inside = h('div', 'shop-line mut',
      'Darin: ' + speciesForTier(tier.id).map(d => speciesInfo(d.id).de).join(', '));
    const fresh = h('div', 'shop-line shop-new');
    const chance = h('div', 'shop-line shop-chance',
      `✨ Chance auf seltene Variante: ${Math.round(tier.variantChance * 100)}\u00a0%`);
    const btn = buyButton();
    btn.onclick = () => purchase(btn, tile, () => buyEgg(tier.id), {
      kind: 'egg', id: tier.id, rar: `rarity-${tier.id}`, title: `${tier.name} gekauft!`,
      sub: `Es liegt jetzt in deinem Nest – nach ${tier.need} richtigen Antworten schlüpft es.`,
    });
    info.append(h('div', 'shop-name', tier.name), hatch, inside, fresh, chance, btn);
    grid.append(tile);
    return { tier, p, btn, fresh };
  });

  el.append(status, ready, grid);

  return {
    pics: tiles.map(t => t.p),
    refresh(coins) {
      const eggs = listEggs(), cap = nestCapacity(), full = nestFull();
      nestCount.textContent = `${eggs.length}/${cap}`;
      dots.replaceChildren(...Array.from({ length: cap }, (_, i) => {
        const egg = eggs[i], d = h('i', 'nest-dot');
        if (egg) {
          const name = EGG_TIERS.find(t => t.id === egg.tier)?.name || 'Ei';
          d.classList.add('t-' + egg.tier);
          d.classList.toggle('is-ready', isEggReady(egg));
          d.title = isEggReady(egg) ? `${name} – bereit zum Schlüpfen`
            : `${name} – ${Math.floor((egg.warmth / egg.need) * 100)}\u00a0% warm`;
        } else d.title = 'Freier Platz';
        return d;
      }));
      const r = readyEggCount();
      ready.hidden = !r;
      ready.textContent = r === 1 ? '🐣 Ein Ei ist bereit – tippe es im Garten an, damit es schlüpft.'
        : `🐣 ${r} Eier sind bereit – tippe sie im Garten an, damit sie schlüpfen.`;
      for (const t of tiles) {
        // Same weighting as hatchEgg: each undiscovered species NEW_SPECIES_WEIGHT, each discovered one 1.
        const pool = speciesForTier(t.tier.id), k = pool.filter(d => !isDiscovered(d.id)).length;
        const pct = Math.round((100 * k * NEW_SPECIES_WEIGHT) / (k * NEW_SPECIES_WEIGHT + pool.length - k));
        t.fresh.textContent = k ? `✦ Chance auf neue Art: ${pct}\u00a0%` : '✓ Alle Arten entdeckt';
        t.fresh.classList.toggle('is-done', !k);
        if (full) {
          setBlocked(t.btn, 'Nest voll', `Im Nest ist Platz für ${cap} Eier – lass erst eins schlüpfen.`);
        } else {
          setBuy(t.btn, 'Kaufen', t.tier.cost, coins);
        }
      }
    },
  };
}

/* ---------- tab: Deko ----------
 * Gartenobjekte (isPlaceable) are owned piece by piece, up to d.max. A new
 * piece goes to storage („Lager“) and the store asks the garden scene to let
 * the player put it down — the scene waits until the shop has closed.
 * „Aufstellen“ does the same for a piece that is still in storage. Moving or
 * storing pieces that already stand happens in the garden (✏️ Gestalten).
 * Landschaft (the pond) and Effekte are bought once, then switched on/off. */
const DECOR_SECTIONS = [
  { title: 'Gartenobjekte', pick: d => isPlaceable(d.id), pieces: true },
  { title: 'Landschaft', pick: d => d.kind === 'object' && !!d.terrain },
  { title: 'Effekte', pick: d => d.kind === 'effect' },
];

function buildDecorPanel(el) {
  el.append(h('p', 'shop-note', '🌿 Kauf Deko und stell sie in deinem Garten auf, wo es dir gefällt. '
    + 'Mit ✏️ Gestalten im Garten kannst du alles jederzeit umstellen oder ins Lager räumen.'));
  const tiles = [];
  for (const sec of DECOR_SECTIONS) {
    const items = DECOR.filter(sec.pick);
    if (!items.length) continue;
    const grid = h('div', 'shop-grid');
    for (const d of items) {
      const t = sec.pieces ? pieceTile(d) : onceTile(d);
      grid.append(t.tile);
      tiles.push(t);
    }
    el.append(h('h3', 'shop-sec', sec.title), grid);
  }

  return {
    pics: tiles.map(t => t.p),
    refresh(coins) { for (const t of tiles) t.update(coins); },
  };
}

function decorShell(d) {
  const shell = tileShell(`shop-decor deco-${d.kind}`);
  const { p } = shell;
  want(p, 'icon', null, (c, _, dpr) => drawIcon(c, dpr, p, 1, (cx, w, ht) => drawDecorIcon(cx, d.id, w, ht)));
  return shell;
}
const decorReveal = (d, sub) => ({ kind: 'decor', id: d.id, rar: `deco-${d.kind}`, title: `${d.name} gekauft!`, sub });

// A garden object: buyable again and again up to d.max. Shows how many stand
// in the garden and wait in storage, and „Aufstellen“ while some are stored.
function pieceTile(d) {
  const { tile, info, p } = decorShell(d);
  const max = d.max || 1;
  const sub = h('div', 'shop-sub');
  const count = h('span', 'shop-owned');
  const cap = h('span', 'shop-max', `max. ${max}`);
  cap.title = `Bis zu ${max} Stück pro Garten`;
  sub.append(count, cap);
  const btn = buyButton();
  const place = button('shop-place', 'Aufstellen');
  const actions = h('div', 'shop-actions');
  actions.append(btn, place);

  // purchase() ignores clicks while the celebration runs and right after a
  // purchase, so a quick double click buys one piece, not two.
  btn.onclick = () => {
    const hadFocus = document.activeElement === btn;
    purchase(btn, tile, () => buyDecor(d.id),
      decorReveal(d, 'Gleich darfst du dir einen Platz dafür in deinem Garten aussuchen.'));
    if (hadFocus && btn.disabled && !place.hidden) place.focus({ preventScroll: true });   // max reached
  };
  // The piece that has waited longest goes first; the scene starts placing it
  // once the shop is closed.
  place.onclick = () => {
    if (cel || recentlyBought(tile)) return;
    const it = listDecorItems().find(i => i.id === d.id && !i.pos);
    if (it && requestPlacement(it.uid)) closeShop();
    else refresh();                                   // nothing stored any more (other tab) — just update
  };
  info.append(h('div', 'shop-name', d.name), sub, h('div', 'shop-desc', d.desc), actions);

  return {
    tile, p,
    update(coins) {
      const n = decorCount(d.id), placed = placedCount(d.id), stored = storedCount(d.id);
      tile.classList.toggle('is-owned', n > 0);
      tile.classList.toggle('is-off', n > 0 && !placed);        // all of them in storage
      tile.classList.toggle('is-max', !canBuyDecor(d.id));
      count.textContent = !n ? 'Noch nicht im Garten'
        : stored ? `Im Garten: ${placed} · Im Lager: ${stored}` : `Im Garten: ${placed}`;
      place.hidden = !stored;
      place.title = stored === 1 ? 'Das Stück aus dem Lager in deinen Garten stellen'
        : `Eins der ${stored} Stücke aus dem Lager in deinen Garten stellen`;
      if (canBuyDecor(d.id)) setBuy(btn, 'Kaufen', d.cost, coins);
      else setBlocked(btn, 'Maximum erreicht', `Du hast schon ${max}× ${d.name} – mehr passen nicht in deinen Garten.`);
    },
  };
}

// The pond and the effects: bought once, then an on/off switch replaces the buy button.
function onceTile(d) {
  const { tile, info, p } = decorShell(d);
  const btn = buyButton();
  const toggle = button('shop-toggle');
  btn.onclick = () => {
    const hadFocus = document.activeElement === btn;
    purchase(btn, tile, () => buyDecor(d.id), decorReveal(d,
      d.kind === 'effect' ? 'Ist ab jetzt in deinem Garten zu sehen.' : 'Liegt ab jetzt in deinem Garten.'));
    if (hadFocus && btn.hidden) toggle.focus({ preventScroll: true });   // keep keyboard focus on the tile
  };
  toggle.onclick = () => { if (recentlyBought(tile)) return; setDecorOn(d.id, !isDecorOn(d.id)); refresh(); };
  info.append(h('div', 'shop-name', d.name), h('div', 'shop-desc', d.desc), btn, toggle);

  return {
    tile, p,
    update(coins) {
      const owned = ownsDecor(d.id), on = owned && isDecorOn(d.id);
      tile.classList.toggle('is-owned', owned);
      tile.classList.toggle('is-off', owned && !on);
      btn.hidden = owned;
      toggle.hidden = !owned;
      if (owned) {
        toggle.textContent = on ? 'Im Garten ✓' : 'Ausgeblendet';
        toggle.classList.toggle('on', on);
        toggle.setAttribute('aria-pressed', String(on));
        toggle.title = on ? 'Antippen zum Ausblenden' : 'Antippen zum Einblenden';
      } else {
        setBuy(btn, 'Kaufen', d.cost, coins);
      }
    },
  };
}

const BUILDERS = { birds: buildBirdPanel, eggs: buildEggPanel, decor: buildDecorPanel };

/* ---------- dialog + tabs ---------- */
function ensurePanel(id) {
  if (!panels[id]) panels[id] = { scroll: 0, ...BUILDERS[id](panelEls[id]) };
  return panels[id];
}

function showTab(id, { focus = false } = {}) {
  if (!BUILDERS[id]) id = 'birds';
  const cur = panels[activeTab];
  if (cur && id !== activeTab && !panelEls[activeTab].hidden) cur.scroll = body.scrollTop;
  activeTab = id;
  const p = ensurePanel(id);
  for (const t of TABS) {
    const on = t.id === id;
    tabBtns[t.id].classList.toggle('on', on);
    tabBtns[t.id].setAttribute('aria-selected', String(on));
    tabBtns[t.id].tabIndex = on ? 0 : -1;
    panelEls[t.id].hidden = !on;
  }
  p.refresh(getCoins());
  body.scrollTop = p.scroll || 0;
  paintAll(p);
  if (focus) tabBtns[id].focus({ preventScroll: true });
}

function syncWallet() {
  const coins = getCoins();
  coinEl.textContent = coins;
  const hdr = document.getElementById('coinCount');   // keep the header wallet in sync
  if (hdr) hdr.textContent = coins;
  return coins;
}

function refresh() {
  if (!dialog) return;
  const coins = syncWallet();
  const p = panels[activeTab];
  if (p) { p.refresh(coins); paintAll(p); }
}

// Store changes while the shop is open (purchases, toggles) → one coalesced refresh.
let refreshQueued = false;
function scheduleRefresh() {
  if (refreshQueued || !dialog || !dialog.open) return;
  refreshQueued = true;
  queueMicrotask(() => { refreshQueued = false; refresh(); });
}

function build() {
  dialog = h('dialog', 'shop-dialog');
  dialog.setAttribute('aria-labelledby', 'shopTitle');

  const head = headEl = h('div', 'shop-head');
  const title = h('div', 'shop-title', 'Shop');
  title.id = 'shopTitle';
  const wallet = h('div', 'shop-wallet');
  wallet.title = 'Deine Münzen';
  coinEl = h('b', null, '0');
  coinEl.id = 'shopCoins';
  wallet.append(h('i', 'coin-ico'), coinEl);
  const close = button('shop-close', '✕');
  close.setAttribute('aria-label', 'Schließen');
  close.onclick = () => closeShop();
  head.append(title, wallet, close);

  const bar = h('div', 'shop-tabbar');
  const list = h('div', 'pill shop-tabs');
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', 'Shop-Bereiche');
  for (const t of TABS) {
    const b = button(null);
    b.id = `shopTab-${t.id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `shopPanel-${t.id}`);
    b.append(h('span', 'shop-tab-ico', t.icon), t.label);
    b.querySelector('.shop-tab-ico').setAttribute('aria-hidden', 'true');
    b.onclick = () => showTab(t.id);
    tabBtns[t.id] = b;
    list.append(b);
  }
  list.addEventListener('keydown', e => {   // arrow keys move between tabs
    const i = TABS.findIndex(t => t.id === activeTab);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    showTab(TABS[(to + TABS.length) % TABS.length].id, { focus: true });
  });
  bar.append(list);

  body = h('div', 'shop-body');
  for (const t of TABS) {
    const p = h('section', 'shop-panel');
    p.id = `shopPanel-${t.id}`;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', `shopTab-${t.id}`);
    p.hidden = true;
    panelEls[t.id] = p;
    body.append(p);
  }

  dialog.append(head, bar, body);
  document.body.appendChild(dialog);

  // Close on a click on the backdrop — only when the press also started there,
  // so a drag that ends outside the box doesn't close the shop.
  const outside = e => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let downOutside = false;
  dialog.addEventListener('pointerdown', e => { downOutside = e.target === dialog && outside(e); });
  dialog.addEventListener('click', e => {
    if (downOutside && e.target === dialog && outside(e) && !cel) closeShop();
    downOutside = false;
  });

  // Escape closes with the exit animation too (and just skips ahead while a purchase is on show).
  dialog.addEventListener('cancel', e => { e.preventDefault(); if (!cel) closeShop(); });
  if ('IntersectionObserver' in window) io = new IntersectionObserver(onIntersect, { root: body, threshold: 0.6 });
  onGardenChange(scheduleRefresh);
}

// Whether the shop dialog is showing (closing animation included) — the garden
// scene holds a bought or „Aufstellen“ piece back until this turns false.
export function isShopOpen() { return !!dialog && dialog.open; }

// Open the shop, on `tab` ('birds' | 'eggs' | 'decor') or the last one used.
export function openShop(tab) {
  if (!dialog) build();
  if (closing) { clearTimeout(closing); closing = 0; dialog.classList.remove('is-closing'); dialog.close(); }
  endCelebration(false);
  if (typeof tab === 'string' && BUILDERS[tab]) activeTab = tab;
  for (const p of Object.values(panels)) p.scroll = 0;   // every visit starts at the top
  syncWallet();
  showTab(activeTab);
  if (!dialog.open) dialog.showModal();
  body.scrollTop = 0;
  tabBtns[activeTab].focus({ preventScroll: true });
}
