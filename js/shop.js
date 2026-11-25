// Garden shop — a modal dialog with three tabs:
//   Vögel — buy birds (black silhouette until you own one), grouped by rarity.
//   Eier  — buy eggs for the nest, plus the collection of rare colour variants
//           (variants only ever hatch from eggs; they can't be bought).
//   Deko  — buy garden objects / ambient effects once, then switch them on/off.
//
// Built to stay snappy: a tab's DOM is created the first time it is shown,
// tile canvases are only painted for the visible tab, and each canvas is
// repainted only when what it shows changes (silhouette → owned, unseen →
// discovered) or the screen's pixel ratio does.
//
// The shop never calls into the garden scene: it changes the store, and the
// scene (like this dialog) listens via onGardenChange.

import {
  BIRDS, birdById, RARITY_LABEL, speciesInfo, EGG_TIERS, speciesForTier, VARIANTS, DECOR,
} from './garden-data.js';
import {
  ownedCount, buy, listEggs, nestCapacity, nestFull, isEggReady, readyEggCount, buyEgg,
  hasSeenVariant, ownsDecor, isDecorOn, buyDecor, setDecorOn, onGardenChange,
} from './garden-store.js';
import { getCoins } from './engine.js';
import { getIdleClip } from './garden.js';
import { drawEggIcon, drawDecorIcon } from './garden-art.js';

const RARITY_ORDER = { normal: 0, rare: 1, epic: 2 };
// Birds grouped by rarity (Normal → Selten → Episch), cheapest first within a tier.
const SORTED = [...BIRDS].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.cost - b.cost);

const TABS = [
  { id: 'birds', icon: '🐦', label: 'Vögel' },
  { id: 'eggs', icon: '🥚', label: 'Eier' },
  { id: 'decor', icon: '🌷', label: 'Deko' },
];

const TILE_W = 76, TILE_H = 62;        // CSS px of a tile's picture
const SWATCH_W = 34, SWATCH_H = 30;    // CSS px of a variant swatch's picture
const SILHOUETTE = '#000';             // locked bird in the Vögel tab
const SWATCH_SILHOUETTE = '#06090d';   // undiscovered variant
const accentOf = v => v.stops[3];      // a variant's signature colour (gold → #f2cb4c)

let dialog, body, coinEl, io;
let activeTab = 'birds';               // remembered while the page lives
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
function purchase(btn, tile, attempt) {
  if (btn.disabled || recentlyBought(tile)) return;
  if (!attempt()) { restartAnim(btn, 'shake'); return; }   // can't afford — nudge the button
  tile.dataset.boughtAt = String(performance.now());
  refresh();
  restartAnim(tile, 'just-bought');
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

/* ---------- tab: Vögel ---------- */
function buildBirdPanel(el) {
  const note = h('p', 'shop-note');
  note.append('✨ Seltene Farbvarianten gibt es nur aus ', linkToTab('eggs', 'Eiern'), '.');
  const grid = h('div', 'shop-grid');
  const tiles = SORTED.map(def => {
    const { tile, info, p } = tileShell(`rarity-${def.rarity}`);
    const sub = h('div', 'shop-sub');
    const owned = h('span', 'shop-owned');
    sub.append(h('span', 'shop-rarity', RARITY_LABEL[def.rarity] || def.rarity), owned);
    const btn = buyButton();
    btn.onclick = () => purchase(btn, tile, () => buy(def.id));
    info.append(h('div', 'shop-name', speciesInfo(def.id).de), sub, btn);
    grid.append(tile);
    return { def, tile, p, owned, btn, prev: undefined };
  });
  el.append(note, grid);

  return {
    pics: tiles.map(t => t.p),
    refresh(coins) {
      for (const t of tiles) {
        const n = ownedCount(t.def.id), has = n > 0;
        if (t.prev === false && has) t.p.flash = true;
        t.prev = has;
        t.tile.classList.toggle('is-owned', has);
        t.owned.textContent = has ? `Im Garten: ${n}` : '';
        setBuy(t.btn, has ? 'Noch einen kaufen' : 'Kaufen', t.def.cost, coins);
        want(t.p, has ? 'bird' : 'silhouette', () => idleClip(t.def.id),
          (c, clip, dpr) => drawClip(c, clip, dpr, { pad: 6, fill: has ? null : SILHOUETTE }));
      }
    },
  };
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
    const chance = h('div', 'shop-line shop-chance',
      `✨ Chance auf seltene Variante: ${Math.round(tier.variantChance * 100)}\u00a0%`);
    const btn = buyButton();
    btn.onclick = () => purchase(btn, tile, () => buyEgg(tier.id));
    info.append(h('div', 'shop-name', tier.name), hatch, inside, chance, btn);
    grid.append(tile);
    return { tier, p, btn };
  });

  const coll = buildCollection();
  el.append(status, ready, grid, coll.el);

  return {
    pics: [...tiles.map(t => t.p), ...coll.pics],
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
        if (full) {
          setPlainLabel(t.btn, 'Nest voll');
          t.btn.disabled = true;
          t.btn.classList.remove('is-short');
          t.btn.removeAttribute('aria-disabled');
          t.btn.title = `Im Nest ist Platz für ${cap} Eier – lass erst eins schlüpfen.`;
        } else {
          setBuy(t.btn, 'Kaufen', t.tier.cost, coins);
        }
      }
      coll.refresh();
    },
  };
}

// „Sammlung: seltene Varianten“ — one row per species, one swatch per variant.
function buildCollection() {
  const el = h('section', 'shop-coll');
  const head = h('div', 'shop-coll-head');
  const count = h('span', 'shop-coll-count');
  head.append(h('h3', 'shop-sec', 'Sammlung: seltene Varianten'), count);
  const total = SORTED.length * VARIANTS.length;
  const bar = h('div', 'shop-coll-bar');
  const fill = h('i');
  bar.append(fill);
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Entdeckte Varianten');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(total));
  const legend = h('div', 'shop-legend');
  for (const v of VARIANTS) {
    const s = h('span');
    s.style.setProperty('--vc', accentOf(v));
    s.append(h('i'), v.name);
    legend.append(s);
  }
  const empty = h('p', 'shop-coll-empty',
    'Noch keine entdeckt – mit etwas Glück schlüpft aus einem Ei eine seltene Farbe.');
  const rowsEl = h('div', 'shop-crows');

  const cells = [];
  const rows = SORTED.map(def => {
    const de = speciesInfo(def.id).de;
    const row = h('div', `shop-crow rarity-${def.rarity}`);
    const name = h('div', 'shop-crow-name', de);
    const star = h('span', 'shop-crow-star', '★');
    star.title = 'Alle Varianten entdeckt';
    name.append(star);
    const sw = h('div', 'shop-swatches');
    const mine = VARIANTS.map(v => {
      const box = h('span', 'shop-swatch is-unseen');
      box.style.setProperty('--vc', accentOf(v));
      box.setAttribute('role', 'img');
      const p = pic(SWATCH_W, SWATCH_H, 'shop-swatch-cv');
      box.append(p.el);
      sw.append(box);
      return { def, de, v, box, p, prev: undefined };
    });
    cells.push(...mine);
    row.append(name, sw);
    rowsEl.append(row);
    return { star, mine };
  });
  el.append(head, bar, legend, empty, rowsEl);

  return {
    el,
    pics: cells.map(c => c.p),
    refresh() {
      let seenN = 0;
      for (const c of cells) {
        const seen = hasSeenVariant(c.def.id, c.v.id);
        if (seen) seenN++;
        if (c.prev === seen) continue;               // nothing changed for this swatch
        if (c.prev === false && seen) c.p.flash = true;
        c.prev = seen;
        c.box.classList.toggle('is-seen', seen);
        c.box.classList.toggle('is-unseen', !seen);
        c.box.title = seen ? `${c.de} · ${c.v.name}` : 'Noch nicht entdeckt';
        c.box.setAttribute('aria-label', seen ? `${c.de} · ${c.v.name}` : `${c.de}: noch nicht entdeckt`);
        if (seen) {
          want(c.p, 'seen', () => idleClip(c.def.id, c.v.id), (cx, clip, dpr) => drawClip(cx, clip, dpr, { pad: 2 }));
        } else {
          want(c.p, 'unseen', () => idleClip(c.def.id),
            (cx, clip, dpr) => drawClip(cx, clip, dpr, { pad: 2, fill: SWATCH_SILHOUETTE }));
        }
      }
      for (const r of rows) r.star.hidden = !r.mine.every(c => c.prev);
      count.replaceChildren(h('b', null, String(seenN)), ` / ${total} entdeckt`);
      fill.style.width = `${(seenN / total) * 100}%`;
      bar.setAttribute('aria-valuenow', String(seenN));
      empty.hidden = seenN > 0;
    },
  };
}

/* ---------- tab: Deko ---------- */
function buildDecorPanel(el) {
  el.append(h('p', 'shop-note', '🌿 Gekaufte Deko bleibt dir – du kannst sie jederzeit aus- und wieder einblenden.'));
  const tiles = [];
  const sections = [
    { kind: 'object', title: 'Gartenobjekte' },
    { kind: 'effect', title: 'Effekte' },
  ];
  for (const sec of sections) {
    const items = DECOR.filter(d => d.kind === sec.kind);
    if (!items.length) continue;
    const grid = h('div', 'shop-grid');
    for (const d of items) {
      const { tile, info, p } = tileShell(`shop-decor deco-${d.kind}`);
      want(p, 'icon', null, (c, _, dpr) => drawIcon(c, dpr, p, 1, (cx, w, ht) => drawDecorIcon(cx, d.id, w, ht)));
      const btn = buyButton();
      const toggle = button('shop-toggle');
      btn.onclick = () => {
        const hadFocus = document.activeElement === btn;
        purchase(btn, tile, () => buyDecor(d.id));
        if (hadFocus && btn.hidden) toggle.focus({ preventScroll: true });   // keep keyboard focus on the tile
      };
      toggle.onclick = () => { if (recentlyBought(tile)) return; setDecorOn(d.id, !isDecorOn(d.id)); refresh(); };
      info.append(h('div', 'shop-name', d.name), h('div', 'shop-desc', d.desc), btn, toggle);
      grid.append(tile);
      tiles.push({ d, tile, p, btn, toggle });
    }
    el.append(h('h3', 'shop-sec', sec.title), grid);
  }

  return {
    pics: tiles.map(t => t.p),
    refresh(coins) {
      for (const t of tiles) {
        const owned = ownsDecor(t.d.id), on = owned && isDecorOn(t.d.id);
        t.tile.classList.toggle('is-owned', owned);
        t.tile.classList.toggle('is-off', owned && !on);
        t.btn.hidden = owned;
        t.toggle.hidden = !owned;
        if (owned) {
          t.toggle.textContent = on ? 'Im Garten ✓' : 'Ausgeblendet';
          t.toggle.classList.toggle('on', on);
          t.toggle.setAttribute('aria-pressed', String(on));
          t.toggle.title = on ? 'Antippen zum Ausblenden' : 'Antippen zum Einblenden';
        } else {
          setBuy(t.btn, 'Kaufen', t.d.cost, coins);
        }
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

  const head = h('div', 'shop-head');
  const title = h('div', 'shop-title', 'Shop');
  title.id = 'shopTitle';
  const wallet = h('div', 'shop-wallet');
  wallet.title = 'Deine Münzen';
  coinEl = h('b', null, '0');
  coinEl.id = 'shopCoins';
  wallet.append(h('i', 'coin-ico'), coinEl);
  const close = button('shop-close', '✕');
  close.setAttribute('aria-label', 'Schließen');
  close.onclick = () => dialog.close();
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
    if (downOutside && e.target === dialog && outside(e)) dialog.close();
    downOutside = false;
  });

  if ('IntersectionObserver' in window) io = new IntersectionObserver(onIntersect, { root: body, threshold: 0.6 });
  onGardenChange(scheduleRefresh);
}

// Open the shop, on `tab` ('birds' | 'eggs' | 'decor') or the last one used.
export function openShop(tab) {
  if (!dialog) build();
  if (typeof tab === 'string' && BUILDERS[tab]) activeTab = tab;
  for (const p of Object.values(panels)) p.scroll = 0;   // every visit starts at the top
  syncWallet();
  showTab(activeTab);
  if (!dialog.open) dialog.showModal();
  body.scrollTop = 0;
  tabBtns[activeTab].focus({ preventScroll: true });
}
