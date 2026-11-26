// Garden minigame: a calm strip of ground where the player's birds idle, peck,
// hop, walk, visit the garden decor and occasionally fly. Eggs warm in a nest
// and hatch when tapped; tapping a bird opens its little profile card. Pure
// <canvas>, no engine, no build step.
//
// Design goals (from the brief): cozy, NOT distracting. So behaviour is
// heavily weighted toward standing still / pecking; walking is slow; flight is
// rare; and we play each clip at its native Aseprite frame durations (the
// packs use ~10fps with deliberate long hold-frames, which reads as gentle).
//
// The scene mirrors garden-store.js: one scene bird per stored bird record
// (`b.rec`), the eggs in the nest, and the active decor. It listens to store
// events instead of being called by the shop.

import { birdById, speciesInfo, DECOR, decorById, NEST_X, NEST_CAPACITY } from './garden-data.js';
import { variantFor } from './garden-variants.js';
import {
  listBirds, getBird, listEggs, isEggReady, hatchEgg, renameBird, activeDecor, onGardenChange,
  sellBird, sellValue, canSell, getDecorItem, placeDecor,
} from './garden-store.js';
import { openShop, openBook } from './shop.js';
import {
  decorSize, drawDecor, createEffect, drawNest, drawNestFront, nestSize, nestEggSlots,
  eggSize, drawEgg, recolor, drawSparkle, drawSelectMarker, createBurst,
} from './garden-art.js';
import * as art from './garden-art.js';   // optional extras (looked up, never required)
import {
  initGardenUI, destroyGardenUI, showBirdCard, showEggCard, hideCard, currentCard, showBanner,
} from './garden-ui.js';

/* ---------- tunables ---------- */
const TARGET_H = 64;     // a size-1.0 bird is scaled to ~this many px of actual content
const GROUND_BAND = 30;  // px of "ground" drawn at the bottom
const MARGIN = 44;       // keep birds this far from the canvas edges
const WALK_SPEED = 22;   // px/s — an unhurried stroll
const FLY_SPEED = 78;    // px/s
const JUMP_V = 118;      // initial hop velocity (px/s, up)
const GRAVITY = 460;     // px/s²
const MAX_DT = 100;      // ms — clamp big gaps (background tab, etc.)
const CLICK_PAD = 8;     // px of slop around a bird's box to make clicks forgiving
const EGG_PAD_NEAR = 4;  // eggs win over birds when the tap is (almost) on the egg…
const EGG_PAD = 14;      // …and still count when it's near it and no bird is there
const MAX_VISITORS = 3;  // birds at one decor object at a time
const VISIT_FLY_DIST = 220; // farther than this, a bird that can fly flies to the decor
const HATCH_CRACK_S = 1.5;  // egg cracks 1 → 3 over this long
const HATCH_REVEAL_S = 0.9; // hatchling hops; then it gets selected + its card opens
const HATCH_WAIT_MAX_S = 8; // give up waiting for the hatchling's sprites after this
const SPARKLE_SMALL = 7;    // drawSparkle size = full span in px (1-px pixel unit: subtle)
const SPARKLE_BIG = 14;     // hatch sparkles (2-px pixel unit)
const LABEL_FONT = '8px "PressStart2P", monospace';
const LABEL_FONT_FALLBACK = 'bold 9px ui-monospace, Menlo, Consolas, monospace';

// Per-action playback speed (1 = the asset's native frame rate). <1 is slower.
// Idle reads better calm and gentle, so we play it at half speed.
const ACTION_SPEED = { idle: 0.4 };

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);   // frame-rate independent smoothing factor
const easeOutBack = k => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
// Something just bought is shown off in the shop first; it only arrives in the
// garden (egg falls into the nest, decor pops up) once the shop has closed.
const shopOpen = () => !!document.querySelector('dialog.shop-dialog[open]');
const EGG_FALL_G = 1400;     // px/s² — a bought egg dropping into the nest
const DECOR_POP_S = 0.55;    // s — a bought decor object popping up
function pickWeighted(opts) {
  let r = Math.random() * opts.reduce((s, o) => s + o.w, 0);
  for (const o of opts) { r -= o.w; if (r < 0) return o; }
  return opts[opts.length - 1];
}

/* ---------- asset loading (cached, deduped by URL / clip) ---------- */
const jsonCache = new Map();
const imgCache = new Map();
const clipCache = new Map();          // `${json}#${tag}` → Promise<clip>
const variantClipCache = new Map();   // `${json}#${tag}|${variant}` → Promise<clip>

// Memoise a promise; forget it again if it rejects so a later mount can retry.
function cached(map, key, make) {
  if (!map.has(key)) {
    const p = make();
    map.set(key, p);
    p.catch(() => { if (map.get(key) === p) map.delete(key); });
  }
  return map.get(key);
}
function fetchJson(url) {
  return cached(jsonCache, url, () => fetch(encodeURI(url)).then(r => {
    if (!r.ok) throw new Error('JSON ' + r.status + ' ' + url);
    return r.json();
  }));
}
function loadImage(url) {
  return cached(imgCache, url, () => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('IMG ' + url));
    img.src = encodeURI(url);
  }));
}
const pngFor = jsonUrl => jsonUrl.replace(/\.json$/i, '.png');

// Resolve a bird def into { action: {json, tag} } specs for both layouts —
// from the variant's own sheet when it has one (see garden-variants.js).
function clipSpecs(def, variant = null) {
  const out = {};
  const sheet = ownVariantSheet(def, variant) || def.sheet;
  if (def.tags) for (const [act, tag] of Object.entries(def.tags)) out[act] = { json: sheet, tag };
  else for (const [act, name] of Object.entries(def.files)) out[act] = { json: `${def.dir}/${def.prefix}-${name}.json`, tag: null };
  return out;
}
const clipKey = spec => `${spec.json}#${spec.tag || ''}`;
const ownVariantSheet = (def, variant) => (def.tags && variantFor(def.id, variant)?.sheet) || null;
// The variant (object) still to palette-swap onto clipSpecs(def, variant): none
// for no / an unknown variant or one with its own sheet.
const mappedVariant = (def, variant) => {
  const v = variantFor(def.id, variant);
  return v && v.map && !ownVariantSheet(def, variant) ? v : null;
};

// Load one clip → { img, frames:[{x,y,w,h,d}], u }. Shared and cached — never mutate.
function loadClip(spec) {
  return cached(clipCache, clipKey(spec), async () => {
    const [data, img] = await Promise.all([fetchJson(spec.json), loadImage(pngFor(spec.json))]);
    const fr = data.frames;
    let seq;
    if (Array.isArray(fr)) {              // multi-file: whole array is the clip
      seq = fr;
    } else {                              // single-file: slice by frameTag
      const vals = Object.values(fr);
      let from = 0, to = vals.length - 1;
      if (spec.tag) {
        const t = (data.meta.frameTags || []).find(x => x.name === spec.tag);
        if (t) { from = t.from; to = t.to; }
      }
      seq = vals.slice(from, to + 1);
    }
    const frames = seq.map(f => ({ x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h, d: f.duration || 120 }));
    if (!frames.length) throw new Error('empty clip ' + clipKey(spec));
    const u = clipContentBox(img, frames);   // ONE content box for the whole clip
    return { img, frames, u };
  });
}

// The same clip with its sheet palette-swapped to a rare colour variant (the
// variant object, see garden-variants.js). A NEW clip object (frames/u shared
// read-only); recolor() caches per (image, variant), so every clip cut from one
// sheet shares a single recoloured canvas. Sheet paths are per species, so the
// variant id is enough to key the cache.
function loadClipVariant(spec, variant) {
  if (!variant) return loadClip(spec);
  return cached(variantClipCache, clipKey(spec) + '|' + variant.id, () => loadClip(spec).then(c => {
    let img = c.img;
    try { img = recolor(c.img, variant) || c.img; } catch (e) { /* keep normal colours */ }
    return { img, frames: c.frames, u: c.u };
  }));
}

// These packs pad sprites inside large frames (e.g. a small bird in a 64×64
// cell). We scan alpha to find the UNION content box across all of a clip's
// frames, in frame-local coords. Cropping every frame to this same box (a) trims
// the dead padding so we can scale by the real bird and stand it on the ground,
// and (b) keeps frames registered to each other exactly as authored — so a
// flapping bird's body stays put while only its wings move (no per-frame bounce).
const alphaCache = new WeakMap();      // img → Uint8Array alpha (read once per sheet)
function alphaOf(img) {
  if (alphaCache.has(img)) return alphaCache.get(img);
  let alpha = null;
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, img.width, img.height).data;
    alpha = new Uint8Array(img.width * img.height);
    for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = d[j];
    c.width = c.height = 0;            // release the backing store right away
  } catch (e) { alpha = null; }        // tainted canvas — skip trimming
  alphaCache.set(img, alpha);
  return alpha;
}
function clipContentBox(img, frames) {
  const full = { lx: 0, ty: 0, w: frames[0].w, h: frames[0].h };
  const alpha = alphaOf(img);
  if (!alpha) return full;
  const IW = img.width, IH = img.height;
  let uL = Infinity, uT = Infinity, uR = -Infinity, uB = -Infinity;
  for (const f of frames) {
    for (let y = f.y; y < Math.min(f.y + f.h, IH); y++) {
      for (let x = f.x; x < Math.min(f.x + f.w, IW); x++) {
        if (alpha[y * IW + x] > 8) {
          const lx = x - f.x, ty = y - f.y;        // frame-local
          if (lx < uL) uL = lx; if (lx + 1 > uR) uR = lx + 1;
          if (ty < uT) uT = ty; if (ty + 1 > uB) uB = ty + 1;
        }
      }
    }
  }
  if (uR < uL) return full;                         // every frame empty
  return { lx: uL, ty: uT, w: uR - uL, h: uB - uT };
}

// Build a scene bird for a stored bird record (null if its species is unknown
// or none of its clips load).
async function makeBird(rec) {
  const def = rec && birdById(rec.species);
  if (!def) return null;
  const clips = {};
  await Promise.all(Object.entries(clipSpecs(def, rec.variant)).map(async ([act, spec]) => {
    try { clips[act] = await loadClipVariant(spec, mappedVariant(def, rec.variant)); } catch (e) { /* drop missing action */ }
  }));
  if (!clips.idle) clips.idle = Object.values(clips)[0];
  if (!clips.idle) return null;                       // nothing loaded — skip bird
  // Scale by the idle clip's content height, normalized to a per-bird size.
  const scale = (TARGET_H * (def.size || 1)) / clips.idle.u.h;
  return {
    def, rec, clips, scale,
    x: 0, yOff: 0, vy: 0, air: false, facing: Math.random() < 0.5 ? 1 : -1,
    action: 'idle', fi: 0, ft: clips.idle.frames[0].d,
    st: rnd(0.5, 4),                                  // seconds until next decision
    tx: 0, flyP: 0, flyLen: 1, flyArc: 0, flyY0: 0,
    visit: null,                                      // { id, x, arrived } while visiting decor
    entering: false,                                  // walking/flying in from off-screen
    sparkT: rnd(1, 4),                                // variant birds: next ambient twinkle
    boxH: 0,                                          // smoothed sprite height (marker anchor)
  };
}

/* ---------- scene state ---------- */
const BG_URL = 'assets/garden-background.png';
let canvas = null, ctx = null, wrap = null, ro = null;
let W = 0, H = 0, groundY = 0;
let birds = [];
let bgImg = null;
let running = false, raf = 0, last = 0, mounted = false;
let gen = 0;                 // bumps on every mount/unmount — stale async work checks it
let clock = 0;               // scene time in seconds (drives decor/effect animation)
let unsubStore = null;
let selected = null;         // scene bird whose card is open
let selEgg = null;           // uid of the egg whose card is open
let hoverBird = null;
let lastPtr = null;           // last mouse position over the canvas (mouse only, not touch)
let prevW = 0;
let eggViews = [];           // [{ egg, dx, dy, … }] — eggs in the nest, store order
let hatch = null;            // the running hatch animation (see startHatch)
let nestA = 0;               // nest opacity (fades in/out with its eggs)
let decorObjs = [];          // active decor objects, pond first
const effects = new Map();   // active ambient effects: id → instance
let bursts = [];             // hatch puffs
let fx = [];                 // sparkles: { anchor: bird|'nest'|{x, yOff, fixed}, ox, oy, t, dur, size }
let knownDecor = null;       // active decor ids after the last rebuild (null right after mounting)
let effectReveal = null;     // { t } — a just-bought ambient effect: a sparkle shower once the shop closes
const pending = new Set();   // bird uids whose scene bird is being built (no double spawns)
let fontReady = false, fontLoading = false;
const loggedErrors = new Set();
let nestSizeCache = null;

/* ---------- small geometry helpers ---------- */
function clampX(x) { return Math.max(MARGIN, Math.min(W - MARGIN, x)); }
function idleHalfW(b) { return (b.clips.idle.u.w * b.scale) / 2; }
// Decor layout. Objects keep their catalogue x fraction where possible, but the
// nest and the "solid" objects are pushed apart so the nest never sits in the
// pond or on the bird bath. On narrow gardens decor is drawn at 2/3 size
// (2 css px per sprite pixel) so everything still fits side by side.
const NARROW_DECOR_W = 640;
const SOLID_DECOR = new Set(['birdbath', 'pond', 'lantern', 'feeder']);
const DECOR_GAP = 6;
let layoutKey = '';
let nestCx = 0;
function layoutScene() {
  const key = W + '|' + decorObjs.map(d => d.id).join(',');
  if (key === layoutKey) return;
  layoutKey = key; flowerKey = '';
  if (!nestSizeCache) { try { nestSizeCache = nestSize(); } catch (e) { nestSizeCache = { w: 93, h: 24 }; } }
  const s = W < NARROW_DECOR_W ? 2 / 3 : 1;
  const fit = (x, w) => (w + 4 >= W ? W / 2 : clamp(x, w / 2 + 2, W - w / 2 - 2));
  for (const d of decorObjs) { d.s = s; d.w = d.size.w * s; d.h = d.size.h * s; d.cx = fit(d.def.x * W, d.w); }
  const items = [{ nest: true, want: NEST_X * W, w: nestSizeCache.w },
    ...decorObjs.filter(d => SOLID_DECOR.has(d.id)).map(d => ({ d, want: d.def.x * W, w: d.w }))]
    .sort((a, b) => a.want - b.want);
  let edge = -Infinity;                                    // push right…
  for (const it of items) { it.x = Math.max(it.want, it.w / 2 + 2, edge + DECOR_GAP + it.w / 2); edge = it.x + it.w / 2; }
  edge = Infinity;                                         // …then back inside the right edge
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.x = Math.min(it.x, W - it.w / 2 - 2, edge - DECOR_GAP - it.w / 2); edge = it.x - it.w / 2;
  }
  for (const it of items) {
    const x = fit(it.x, it.w);
    if (it.nest) nestCx = x; else it.d.cx = x;
  }
}
function decorX(d) { layoutScene(); return d.cx; }
function nestX() { layoutScene(); return nestCx; }
// Draw one decor object, scaled about its ground anchor on narrow gardens.
function drawDecorObj(d) {
  const cx = Math.round(decorX(d));
  if (d.pop) {                                 // just bought: hidden until the shop closes, then pops up
    if (d.pop.t < 0) return;
    const k = Math.max(0.01, easeOutBack(Math.min(1, d.pop.t / DECOR_POP_S)));
    ctx.translate(cx, groundY); ctx.scale(d.s * k, d.s * k);
    drawDecor(ctx, d.id, 0, 0, clock);
    return;
  }
  if (d.s === 1) { drawDecor(ctx, d.id, cx, groundY, clock); return; }
  ctx.translate(cx, groundY); ctx.scale(d.s, d.s);
  drawDecor(ctx, d.id, 0, 0, clock);
}
function eggDims() {
  try { const s = eggSize(); if (s && s.w > 0 && s.h > 0) return s; } catch (e) { /* fall through */ }
  return { w: 21, h: 27 };               // nominal 7×9 egg at 3×
}

// Run one drawing/update step of the art module; a bug there must never stop the
// whole scene, so errors are contained (and logged once per kind).
function safe(tag, fn) {
  try { fn(); }
  catch (e) {
    if (!loggedErrors.has(tag)) { loggedErrors.add(tag); console.error('[garden] ' + tag, e); }
  }
}
function safeDraw(tag, fn) {
  ctx.save();
  try { fn(); }
  catch (e) {
    if (!loggedErrors.has(tag)) { loggedErrors.add(tag); console.error('[garden] ' + tag, e); }
  }
  ctx.restore();
}

/* ---------- per-bird behaviour ---------- */
function setAction(b, act) {
  if (!b.clips[act]) act = 'idle';
  if (b.action === act) return;
  b.action = act; b.fi = 0; b.ft = b.clips[act].frames[0].d;
}

// Little vertical hop (physics in updateBird). Plays the jump clip if the
// species has one; otherwise the bird keeps its current pose in the air.
function hop(b, v) {
  b.air = true; b.vy = v; b.yOff = Math.max(b.yOff, 0.001);
  if (b.clips.jump) setAction(b, 'jump');
}

function startFly(b, tx, arc, y0 = 0) {
  b.tx = tx; b.flyLen = Math.max(1, Math.abs(tx - b.x)); b.flyP = 0;
  b.flyArc = arc; b.flyY0 = y0; b.air = false; b.vy = 0;
  setAction(b, 'fly');
}

function visitorsAt(id, except) {
  let n = 0;
  for (const o of birds) if (o !== except && o.visit && o.visit.id === id) n++;
  return n;
}

// Where a bird should stand to use decor `d`: under the feeder, beside the bird
// bath (facing it), anywhere inside the pond. Picks the candidate spot farthest
// from the other visitors so they don't stack up.
function visitSpot(b, d) {
  const cx = decorX(d), w = d.w, half = idleHalfW(b);
  const taken = birds.filter(o => o !== b && o.visit && o.visit.id === d.id).map(o => o.visit.x);
  const nearSide = b.x < cx ? -1 : 1;
  let best = clampX(cx), bestGap = -1;
  for (let i = 0; i < 6; i++) {
    let x;
    if (d.def.interact === 'feed') x = cx + rnd(-0.5, 0.5) * (w + 16);
    else if (d.def.interact === 'drink') x = cx + (i < 3 ? nearSide : -nearSide) * (w / 2 + half * 0.45 + rnd(0, 6));
    else x = cx + rnd(-0.38, 0.38) * w;
    x = clampX(x);
    const gap = taken.length ? Math.min(...taken.map(t => Math.abs(t - x))) : Infinity;
    if (gap > bestGap) { bestGap = gap; best = x; }
    if (gap === Infinity) break;
  }
  return best;
}

function startVisit(b, d) {
  const x = visitSpot(b, d);
  b.visit = { id: d.id, x, arrived: false };
  const dist = Math.abs(x - b.x);
  if (dist < 4) { b.x = x; if (!arriveAtVisit(b)) { b.st = rnd(3, 7); setAction(b, 'idle'); } return; }
  if (b.clips.fly && (dist > VISIT_FLY_DIST || !b.clips.walk)) startFly(b, x, rnd(35, 70));
  else { b.tx = x; b.st = dist / WALK_SPEED + 3; setAction(b, 'walk'); }
}

// Called when a walk/flight ends. If the bird was heading to decor, it now
// drinks / feeds / wades there for a while; returns false if there's no visit.
function arriveAtVisit(b) {
  const v = b.visit;
  if (!v) return false;
  const d = b !== selected && !v.arrived && decorObjs.find(o => o.id === v.id);
  if (!d) { b.visit = null; return false; }
  v.arrived = true;
  const cx = decorX(d);
  if (d.def.interact !== 'wade' && Math.abs(cx - b.x) > 2) b.facing = cx > b.x ? 1 : -1;
  setAction(b, d.def.interact === 'wade' && Math.random() < 0.5 ? 'idle' : 'eat');
  b.st = rnd(2.5, 5);
  return true;
}

function decide(b) {
  b.visit = null;
  const opts = [];
  const add = (a, w, d = null) => { if (a === 'visit' || b.clips[a]) opts.push({ a, w, d }); };
  add('idle', 6); add('eat', 2);
  if (b !== selected) {                     // a selected bird stays put: idle / eat only
    add('walk', 3); add('jump', 1); add('fly', 1);
    if (b.clips.walk || b.clips.fly) {
      const likes = speciesInfo(b.def.id).likes || [];
      for (const d of decorObjs) {
        if (!d.def.interact || visitorsAt(d.id, b) >= MAX_VISITORS) continue;
        add('visit', likes.includes(d.id) ? 6 : 2, d);
      }
    }
  }
  const o = pickWeighted(opts);
  switch (o.a) {
    case 'walk': b.tx = clampX(b.x + rnd(-150, 150)); b.st = rnd(2, 5); setAction(b, 'walk'); break;
    case 'fly': {
      let tx = clampX(MARGIN + Math.random() * (W - 2 * MARGIN));
      if (Math.abs(tx - b.x) < 60) tx = clampX(b.x + (Math.random() < 0.5 ? -1 : 1) * rnd(140, 240));
      startFly(b, tx, rnd(55, 105));
      break;
    }
    case 'jump': hop(b, JUMP_V); b.st = 2; break;
    case 'eat': b.st = rnd(1.5, 3); setAction(b, 'eat'); break;
    case 'visit': startVisit(b, o.d); break;
    default: b.st = rnd(3, 7); setAction(b, 'idle');
  }
}

// A sold bird heads for the nearest edge: flying up and away, or (if it
// can't fly) hurrying off on foot. It is dropped once it is out of sight.
function sendAway(b) {
  b.leaving = true; b.visit = null; b.entering = false; b.air = false; b.vy = 0;
  b.facing = b.x < W / 2 ? -1 : 1;
  if (b.clips.fly) setAction(b, 'fly');
  else if (b.clips.walk) setAction(b, 'walk');
  else b.gone = true;
}
function leaveStep(b, dt) {
  if (b.action === 'fly') { b.x += FLY_SPEED * 1.2 * dt * b.facing; b.yOff += FLY_SPEED * 0.5 * dt; }
  else b.x += WALK_SPEED * 2.5 * dt * b.facing;
  const off = idleHalfW(b) + 24;
  if (b.x < -off || b.x > W + off || b.yOff > groundY + 40) b.gone = true;
}

function updateBird(b, dt, dtMs) {
  b.st -= dt;
  if (b.leaving) leaveStep(b, dt);
  else if (b.air) {                                   // hop physics (jump action or a pose-hop)
    b.vy -= GRAVITY * dt; b.yOff += b.vy * dt;
    if (b.yOff <= 0) {
      b.yOff = 0; b.vy = 0; b.air = false;
      if (b.action === 'jump') { setAction(b, 'idle'); b.st = rnd(2, 5); }
    }
  }
  if (!b.leaving) switch (b.action) {
    case 'walk': {
      const dir = Math.sign(b.tx - b.x) || 1; b.facing = dir;
      b.x += WALK_SPEED * dt * dir;
      if ((dir > 0 ? b.x >= b.tx : b.x <= b.tx) || b.st <= 0) {
        b.x = clampX(b.x); b.entering = false;
        if (!arriveAtVisit(b)) decide(b);
      }
      break;
    }
    case 'fly': {
      const dir = Math.sign(b.tx - b.x) || 1; b.facing = dir;
      b.x += FLY_SPEED * dt * dir;
      b.flyP = Math.min(1, b.flyP + (FLY_SPEED * dt) / b.flyLen);
      b.yOff = b.flyY0 * (1 - b.flyP) + Math.sin(b.flyP * Math.PI) * b.flyArc;
      if (b.flyP >= 1 || (dir > 0 ? b.x >= b.tx : b.x <= b.tx)) {
        b.x = b.tx; b.yOff = 0; b.entering = false;
        if (!arriveAtVisit(b)) { setAction(b, 'idle'); b.st = rnd(2, 4); }
      }
      break;
    }
    case 'jump': if (!b.air) { setAction(b, 'idle'); b.st = rnd(2, 5); } break;
    default: if (b.st <= 0 && !b.air) decide(b);   // idle / eat
  }
  // advance animation by native frame durations
  const clip = b.clips[b.action], frames = clip.frames;
  b.ft -= dtMs * (ACTION_SPEED[b.action] || 1);
  let guard = 0;
  while (b.ft <= 0 && guard++ < 8) {
    b.fi = (b.fi + 1) % frames.length;
    b.ft += frames[b.fi].d || 120;
  }
  if (b.fi >= frames.length) b.fi = 0;   // clip changed under us
  // smoothed sprite height, so the selection marker doesn't jump between clips
  const dh = clip.u.h * b.scale;
  b.boxH = b.boxH ? b.boxH + (dh - b.boxH) * ease(dt, 12) : dh;
  // rare colour variants twinkle every now and then
  if (b.rec.variant && (b.sparkT -= dt) <= 0) {
    b.sparkT = rnd(2, 5);
    const dw = clip.u.w * b.scale;
    addSparkle(b, rnd(-0.38, 0.38) * dw, -rnd(0.15, 0.85) * dh, SPARKLE_SMALL, 0.9);
  }
}

function drawBird(b) {
  const clip = b.clips[b.action];
  const f = clip.frames[b.fi], u = clip.u, s = b.scale;
  const dw = u.w * s, dh = u.h * s;
  const drawY = groundY - dh - b.yOff;          // union-box bottom sits on the ground
  ctx.save();
  ctx.translate(b.x, drawY);
  ctx.scale(b.facing > 0 ? -1 : 1, 1);          // sprites are authored facing LEFT
  ctx.drawImage(clip.img, f.x + u.lx, f.y + u.ty, u.w, u.h, -dw / 2, 0, dw, dh);
  ctx.restore();
}

/* ---------- birds joining / leaving the scene ---------- */
// Spread freshly mounted birds evenly across the ground.
function layoutBirds(list) {
  const n = list.length || 1, usable = W - 2 * MARGIN;
  list.forEach((b, i) => { b.x = MARGIN + usable * ((i + 0.5) / n); });
}

// A new bird arrives from just off the left or right edge: flying in and
// gliding down, or (if it can't fly) walking in.
function enterScene(b) {
  const fromLeft = Math.random() < 0.5;
  const half = idleHalfW(b);
  b.x = fromLeft ? -half - 12 : W + half + 12;
  b.facing = fromLeft ? 1 : -1;
  b.entering = true; b.visit = null; b.yOff = 0; b.air = false;
  if (b.clips.fly) {
    const tx = clampX(fromLeft ? rnd(MARGIN, W * 0.62) : rnd(W * 0.38, W - MARGIN));
    const maxY0 = Math.max(20, groundY - b.clips.idle.u.h * b.scale - 24);
    startFly(b, tx, rnd(12, 26), Math.min(rnd(70, 110), maxY0));
    b.yOff = b.flyY0;
  } else {
    b.tx = clampX(fromLeft ? rnd(MARGIN, W * 0.38) : rnd(W * 0.62, W - MARGIN));
    b.st = Math.abs(b.tx - b.x) / WALK_SPEED + 4;
    setAction(b, b.clips.walk ? 'walk' : 'idle');
    if (b.action !== 'walk') { b.x = b.tx; b.entering = false; }
  }
}

function spawnArrival(rec) {
  const myGen = gen;
  pending.add(rec.uid);
  makeBird(rec).catch(() => null).then(b => {
    if (myGen !== gen) return;
    pending.delete(rec.uid);
    if (!b || birds.some(o => o.rec.uid === rec.uid) || !getBird(rec.uid)) return;
    b.rec = getBird(rec.uid);
    enterScene(b);
    birds.push(b);
  });
}

// Make the scene match the store: drop birds that no longer exist, refresh
// records, and bring in any bird that isn't in the scene yet (e.g. just bought).
function reconcileBirds() {
  if (!mounted) return;
  const recs = listBirds();
  const byUid = new Map(recs.map(r => [r.uid, r]));
  const kept = birds.filter(b => b.leaving || byUid.has(b.rec.uid));   // sold ones finish leaving
  if (kept.length !== birds.length) {
    birds = kept;
    if (selected && !birds.includes(selected)) {
      selected = null;
      if (currentCard()?.type === 'bird') hideCard();
    }
    if (hoverBird && !birds.includes(hoverBird)) hoverBird = null;
    fx = fx.filter(s => s.anchor === 'nest' || s.anchor.fixed || birds.includes(s.anchor));
  }
  for (const b of birds) if (!b.leaving) b.rec = byUid.get(b.rec.uid);
  for (const rec of recs) {
    if (!pending.has(rec.uid) && !birds.some(b => b.rec.uid === rec.uid)) spawnArrival(rec);
  }
}

/* ---------- selection ---------- */
function selectBird(b, { focusName = false, bounce = true } = {}) {
  selEgg = null;
  const already = selected === b;
  selected = b;
  b.entering = false;
  if (b.action === 'walk') { b.x = clampX(b.x); b.visit = null; setAction(b, 'idle'); b.st = rnd(3, 6); }
  else if (b.visit && !b.visit.arrived) b.visit = null;      // mid-flight: just land, then stay
  if (bounce && b.clips.jump && !b.air && b.action !== 'fly') hop(b, JUMP_V * 0.55);
  const card = currentCard();
  if (already && card && card.type === 'bird' && card.uid === b.rec.uid) return;
  const uid = b.rec.uid;
  showBirdCard(b.rec, {
    portrait: b.clips.idle,
    focusName,
    side: b.x < W / 2 ? 'right' : 'left',
    onRename: name => renameBird(uid, name),
    onSell: () => sellBird(uid),                 // the 'bird-sold' event does the rest
    sellCoins: sellValue(b.rec),
    canSell: canSell(uid),
    onClose: () => { if (selected && selected.rec.uid === uid) selected = null; },
  });
  selected = b;     // (a replaced card's onClose may have run in between)
}

function openEggCard(v) {
  selected = null;
  nudgeEgg(v);
  const uid = v.egg.uid, card = currentCard();
  if (selEgg === uid && card && card.type === 'egg' && card.uid === uid) return;
  selEgg = uid;
  showEggCard(v.egg, { onClose: () => { if (selEgg === uid) selEgg = null; } });
  selEgg = uid;
}

function deselectAll() {
  const had = selected || selEgg || currentCard();
  selected = null; selEgg = null;
  if (had) hideCard();
}

/* ---------- nest & eggs ---------- */
function newEggView(egg, settled) {
  return {
    egg, dx: 0, dy: 0, placed: false,
    drop: settled ? 0 : 0, vy: 0, held: !settled,   // a bought egg falls in once the shop is closed (updateEggs)
    wobP: settled ? -1 : 0, wobAmp: 0.12, wobDur: 0.85, wobNext: rnd(2, 8),
    sparkT: rnd(0.4, 1.6), phase: rnd(0, Math.PI * 2),
  };
}

// Sync the nest with the store. The egg being hatched is no longer in the
// store, but it lives on in `hatch` until its shell bursts.
function refreshEggs(initial = false) {
  const list = listEggs();
  const old = new Map(eggViews.map(v => [v.egg.uid, v]));
  let selChanged = false;
  eggViews = list.map(egg => {
    const v = old.get(egg.uid);
    if (!v) return newEggView(egg, initial);
    if (egg.uid === selEgg && (egg.warmth !== v.egg.warmth || egg.need !== v.egg.need)) selChanged = true;
    v.egg = egg;
    return v;
  });
  if (!selEgg) return;
  const v = eggViews.find(x => x.egg.uid === selEgg);
  const card = currentCard();
  if (!v) {
    selEgg = null;
    if (card && card.type === 'egg') hideCard();
  } else if (selChanged && card && card.type === 'egg' && card.uid === selEgg) {
    const uid = selEgg;
    showEggCard(v.egg, { onClose: () => { if (selEgg === uid) selEgg = null; } });
    selEgg = uid;
  }
}

// A bought egg hit the nest: a wobble and a ring of sparkles.
function eggLanded(v) {
  const { w: ew, h: eh } = eggDims();
  nudgeEgg(v, 0.28);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    addSparkle('nest', v.dx + Math.cos(a) * ew * 0.9, v.dy - eh * 0.45 + Math.sin(a) * eh * 0.55,
      i % 2 ? SPARKLE_SMALL : SPARKLE_BIG, 0.8, i * 0.05);
  }
}

// Bought decor: start popping once the shop is closed (with sparkles around it);
// a bought effect gets a sparkle shower over the garden.
function updateReveals(dt) {
  const open = shopOpen();
  for (const d of decorObjs) {
    if (!d.pop) continue;
    if (d.pop.t < 0) {
      if (open) continue;
      d.pop.t = 0;
      const x = decorX(d), w = d.w || 30, hh = d.h || 20;
      for (let i = 0; i < 8; i++) {
        addSparkle({ x: x + rnd(-0.6, 0.6) * w, yOff: rnd(0.1, 1.1) * hh, fixed: true }, 0, 0,
          i % 3 ? SPARKLE_SMALL : SPARKLE_BIG, 0.9, 0.12 + i * 0.05);
      }
    } else if ((d.pop.t += dt) >= DECOR_POP_S) d.pop = null;
  }
  if (effectReveal && effectReveal.t < 0 && !open) {
    effectReveal = null;
    for (let i = 0; i < 16; i++) {
      addSparkle({ x: rnd(0.08, 0.92) * W, yOff: rnd(0.25, 0.85) * groundY, fixed: true }, 0, 0,
        i % 3 ? SPARKLE_SMALL : SPARKLE_BIG, 1.1, i * 0.07);
    }
  }
}

function nudgeEgg(v, amp = 0.16) {
  if (v.wobP >= 0) return;
  v.wobP = 0; v.wobAmp = amp; v.wobDur = 0.6;
}

function wobbleAngle(v) {
  return v.wobP >= 0 ? v.wobAmp * Math.sin(v.wobP * Math.PI * 4) * (1 - v.wobP) : 0;
}

// Ease every egg toward its slot. While an egg is cracking it keeps its slot,
// so its neighbours only shuffle together once it has hatched.
function layoutEggs(nx, dt) {
  const n = eggViews.length;
  const h = hatch && hatch.phase === 'crack' ? hatch : null;
  const total = n + (h ? 1 : 0);
  if (!total) return;
  const slotsFor = k => { try { return nestEggSlots(nx, groundY, k) || []; } catch (e) { return []; } };
  const place = (v, s) => {
    const tx = (s ? s.x : nx) - nx, ty = (s ? s.y : groundY) - groundY;
    if (!v.placed) { v.dx = tx; v.dy = ty; v.placed = true; return; }
    const k = ease(dt, 6);
    v.dx += (tx - v.dx) * k; v.dy += (ty - v.dy) * k;
  };
  if (h && total <= NEST_CAPACITY) {
    const slots = slotsFor(total);
    const hi = clamp(h.index, 0, total - 1);
    const hs = slots[hi];
    if (hs) { h.dx = hs.x - nx; h.dy = hs.y - groundY; }
    let k = 0;
    for (let i = 0; i < total && k < n; i++) if (i !== hi) place(eggViews[k++], slots[i] || slots[slots.length - 1]);
  } else if (n) {
    const slots = slotsFor(Math.min(n, NEST_CAPACITY));
    eggViews.forEach((v, i) => place(v, slots[Math.min(i, slots.length - 1)]));
  }
}

function updateEggs(dt) {
  layoutEggs(nestX(), dt);
  const { w: ew, h: eh } = eggDims();
  for (const v of eggViews) {
    if (v.held) {
      if (!shopOpen()) { v.held = false; v.drop = Math.max(60, groundY * 0.85); v.vy = 0; v.landed = false; }
    } else if (v.drop > 0 || v.vy < 0) {
      v.vy += EGG_FALL_G * dt; v.drop -= v.vy * dt;
      if (v.drop <= 0) {
        v.drop = 0;
        if (!v.landed) { v.landed = true; eggLanded(v); }
        v.vy = v.vy > 160 ? -v.vy * 0.3 : 0;          // one small bounce, then it rests
      }
    }
    const ready = isEggReady(v.egg);
    const r = clamp(v.egg.warmth / (v.egg.need || 1), 0, 1);
    if (v.wobP >= 0) {
      v.wobP += dt / v.wobDur;
      if (v.wobP >= 1) v.wobP = -1;
    } else if ((v.wobNext -= dt) <= 0) {
      // idle eggs wobble now and then (more as they warm up); ready eggs often
      v.wobP = 0;
      v.wobAmp = ready ? rnd(0.2, 0.28) : 0.05 + 0.15 * r;
      v.wobDur = ready ? 0.7 : 0.85;
      v.wobNext = ready ? rnd(1.6, 3.2) : rnd(7, 14) * (1 - 0.55 * r);
    }
    if (ready && (v.sparkT -= dt) <= 0) {
      v.sparkT = rnd(1.4, 3.2);
      addSparkle('nest', v.dx + rnd(-0.6, 0.6) * ew, v.dy - rnd(0.25, 1.15) * eh, SPARKLE_SMALL, 0.9);
    }
  }
  const target = eggViews.length || hatch ? 1 : 0;
  nestA += (target - nestA) * ease(dt, 5);
  if (Math.abs(target - nestA) < 0.003) nestA = target;
}

function eggAt(px, py, pad) {
  if (!eggViews.length || nestA < 0.5) return null;
  const nx = nestX(), { w, h } = eggDims();
  for (let i = eggViews.length - 1; i >= 0; i--) {
    const v = eggViews[i], x = nx + v.dx, y = groundY + v.dy - v.drop;
    if (v.held) continue;
    if (px >= x - w / 2 - pad && px <= x + w / 2 + pad && py >= y - h - pad && py <= y + pad) return v;
  }
  return null;
}

function drawNestLayer() {
  if (nestA <= 0.01) return;
  const nx = nestX();
  ctx.save();
  if (nestA < 0.999) ctx.globalAlpha = nestA;
  safeDraw('nest', () => drawNest(ctx, nx, groundY));
  for (const v of eggViews) {
    if (v.held) continue;                      // bought, still on show in the shop
    const ready = isEggReady(v.egg);
    const glow = ready ? 0.55 + 0.35 * Math.sin(clock * 2.4 + v.phase) : 0;
    safeDraw('egg', () => drawEgg(ctx, v.egg.tier, nx + v.dx, groundY + v.dy - v.drop, { wobble: wobbleAngle(v), crack: 0, glow }));
  }
  const h = hatch;
  if (h && h.phase === 'crack') {
    const step = Math.min(2, Math.floor(h.t / (HATCH_CRACK_S / 3)));
    const local = (h.t % (HATCH_CRACK_S / 3)) / (HATCH_CRACK_S / 3);
    const amp = [0.14, 0.2, 0.26][step];
    const s = Math.min(1, local / 0.6);                   // shake, then a short pause
    const wobble = s < 1 ? amp * Math.sin(s * Math.PI * 5) * (1 - s) : 0;
    const glow = Math.min(1, 0.45 + 0.55 * h.t / HATCH_CRACK_S);
    safeDraw('egg', () => drawEgg(ctx, h.tier, nx + h.dx, groundY + h.dy, { wobble, crack: 1 + step, glow }));
  }
  safeDraw('nest', () => drawNestFront(ctx, nx, groundY));
  ctx.restore();
}

/* ---------- hatching ----------
 * 1. hatchEgg() FIRST — the bird is saved before any animation runs.
 * 2. 'crack': the egg (kept here, the store has already dropped it) shakes and
 *    cracks 1 → 3 while the hatchling's sprites load.
 * 3. burst → the bird pops out with a hop (+ sparkles if it's a rare colour),
 *    and a banner announces it.
 * 4. 'reveal' ends → the new bird is selected and its card asks for a name. */
function startHatch(v) {
  const index = eggViews.indexOf(v);
  const egg = v.egg, dx = v.dx, dy = v.dy;
  const res = hatchEgg(egg.uid);          // persists immediately (emits 'eggs')
  if (!res) { openEggCard(v); return; }
  deselectAll();
  eggViews = eggViews.filter(x => x.egg.uid !== egg.uid);
  pending.add(res.bird.uid);              // the scene spawns it itself, below
  const h = { uid: egg.uid, tier: egg.tier, index: Math.max(0, index), dx, dy, t: 0, phase: 'crack', res, bird: undefined };
  hatch = h;
  const myGen = gen;
  makeBird(res.bird).catch(() => null).then(b => {
    if (myGen === gen && hatch === h && h.phase === 'crack') h.bird = b;
  });
}

function updateHatch(dt) {
  const h = hatch;
  if (!h) return;
  h.t += dt;
  if (h.phase === 'crack') {
    if (h.t >= HATCH_CRACK_S && (h.bird !== undefined || h.t >= HATCH_WAIT_MAX_S)) revealHatch(h);
  } else if (h.t >= HATCH_REVEAL_S) {
    hatch = null;
    if (h.bird && birds.includes(h.bird)) selectBird(h.bird, { focusName: true, bounce: false });
  }
}

function revealHatch(h) {
  h.phase = 'reveal'; h.t = 0;            // first, so this can never run twice
  const nx = nestX(), x = nx + h.dx, y = groundY + h.dy;
  const { h: eh } = eggDims();
  const rare = !!h.res.isVariant;
  const rec = getBird(h.res.bird.uid);
  safe('burst', () => bursts.push(createBurst(x, y - eh / 2, { rare, tier: h.tier })));
  pending.delete(h.res.bird.uid);
  const b = h.bird || null;
  h.bird = null;
  if (b && rec && !birds.some(o => o.rec.uid === rec.uid)) {
    b.rec = rec;
    b.x = clampX(x); b.yOff = Math.max(0, groundY - y);
    setAction(b, 'idle'); b.st = rnd(3, 5);
    hop(b, JUMP_V * 0.8);
    birds.push(b);
    h.bird = b;
    if (rare) {
      const u = b.clips.idle.u, dw = u.w * b.scale, dh = u.h * b.scale;
      for (let i = 0; i < 5; i++) addSparkle(b, rnd(-0.7, 0.7) * dw, -rnd(0.1, 1.1) * dh, SPARKLE_BIG, 1, i * 0.22);
    }
  } else if (rec) {
    reconcileBirds();                     // sprites were slow/failed — bring it in the usual way
  }
  const info = speciesInfo(h.res.bird.species);
  safe('banner', () => {
    const vName = rare ? variantFor(h.res.bird.species, h.res.bird.variant)?.name || '' : '';
    if (h.res.isNewSpecies) {
      // First of its species: it is now in the Vogelbuch.
      showBanner({
        title: '🎉 Neue Art entdeckt!',
        sub: rare ? `${info.de} · seltene Variante ${vName}` : `${info.de} · neu in deinem Vogelbuch`,
        rare,
      });
    } else if (rare) {
      showBanner({
        title: '✨ Seltene Variante!',
        sub: `${info.de} · ${vName}` + (h.res.isNewVariant ? ' – neu in deinem Vogelbuch' : ''),
        rare: true,
      });
    } else {
      showBanner({ title: '🐣 Geschlüpft!', sub: info.de });
    }
  });
}

/* ---------- sparkles ---------- */
// anchor: a scene bird (offsets from its feet-centre, follows it) or 'nest'
// (offsets from the nest centre on the ground line).
function addSparkle(anchor, ox, oy, size, dur, delay = 0) {
  fx.push({ anchor, ox, oy, size, dur, t: -delay });
}
function updateSparkles(dt) {
  if (!fx.length) return;
  for (const s of fx) s.t += dt;
  fx = fx.filter(s => s.t < s.dur);
}
function drawSparkles() {
  const nx = nestX();
  for (const s of fx) {
    if (s.t < 0) continue;
    let x, y;
    if (s.anchor === 'nest') { if (nestA < 0.3) continue; x = nx + s.ox; y = groundY + s.oy; }
    else { x = s.anchor.x + s.ox; y = groundY - s.anchor.yOff + s.oy; }
    safeDraw('sparkle', () => drawSparkle(ctx, Math.round(x), Math.round(y), s.size, s.t / s.dur));
  }
}

/* ---------- decor & ambient effects ---------- */
function rebuildDecor() {
  const active = new Set(activeDecor());
  const objs = [];
  for (const def of DECOR) {
    if (def.kind !== 'object' || !active.has(def.id)) continue;
    let size = { w: 30, h: 20 };
    try { size = decorSize(def.id) || size; } catch (e) { /* keep a sane default */ }
    objs.push({ id: def.id, def, size });
  }
  objs.sort((a, b) => (b.id === 'pond') - (a.id === 'pond'));   // the flat pond is drawn first
  // Objects that are new since the last rebuild (bought or switched on) pop up;
  // one that is still popping keeps going.
  const prev = knownDecor;
  knownDecor = active;
  for (const o of objs) {
    const was = decorObjs.find(d => d.id === o.id);
    if (was && was.pop) o.pop = was.pop;
    else if (prev && !prev.has(o.id)) o.pop = { t: -1 };
  }
  for (const id of active) if (prev && !prev.has(id) && decorById(id)?.kind === 'effect') effectReveal = { t: -1 };
  decorObjs = objs;
  layoutKey = '';                     // fresh objects need positions
  // Effects: keep running instances (no visual reset), add new ones, drop removed ones.
  for (const id of [...effects.keys()]) if (!active.has(id)) effects.delete(id);
  for (const def of DECOR) {
    if (def.kind !== 'effect' || !active.has(def.id) || effects.has(def.id)) continue;
    safe('fx:' + def.id, () => { const e = createEffect(def.id); if (e) effects.set(def.id, e); });
  }
  // Birds heading to decor that was just put away simply carry on.
  for (const b of birds) if (b.visit && !objs.some(o => o.id === b.visit.id)) b.visit = null;
  flowerKey = '';
}

// Shared env for the effects; flowerSpots = a few points on top of the flower bed.
const env = { W: 0, H: 0, groundY: 0, t: 0, flowerSpots: [] };
let flowerKey = '';
function effectEnv() {
  env.W = W; env.H = H; env.groundY = groundY; env.t = clock;
  const fl = decorObjs.find(d => d.id === 'flowers');
  const key = fl ? `${W}|${groundY}` : 'none';
  if (key !== flowerKey) {
    flowerKey = key;
    env.flowerSpots = [];
    if (fl) {
      const cx = decorX(fl), w = fl.w, h = fl.h, sc = fl.s;
      // the art module knows exactly where its flower heads are (at full size); else approximate
      if (typeof art.flowerSpots === 'function') safe('flowerSpots', () => {
        env.flowerSpots = (art.flowerSpots(cx, groundY) || [])
          .map(p => ({ x: Math.round(cx + (p.x - cx) * sc), y: Math.round(groundY + (p.y - groundY) * sc) }));
      });
      if (!env.flowerSpots.length) {
        env.flowerSpots = [-0.32, -0.08, 0.16, 0.36].map(f => ({ x: Math.round(cx + f * w), y: Math.round(groundY - h + 4) }));
      }
    }
  }
  return env;
}

/* ---------- labels & markers ---------- */
function loadLabelFont() {
  if (fontReady || fontLoading || !document.fonts || !document.fonts.load) return;
  fontLoading = true;
  document.fonts.load('8px PressStart2P')
    .then(list => { fontReady = (list && list.length > 0) || !!document.fonts.check?.('8px PressStart2P'); })
    .catch(() => {})
    .finally(() => { fontLoading = false; });
}

function pillPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Small name pill (canvas text — never HTML) centred on cx with its bottom at
// `bottom`; returns its top edge.
function drawLabel(text, cx, bottom) {
  const ph = 14, padX = 5;
  ctx.save();
  ctx.font = fontReady ? LABEL_FONT : LABEL_FONT_FALLBACK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';            // PressStart2P: 8px ascent, no descent → glyphs sit in y+3…y+11
  const tw = Math.ceil(ctx.measureText(text).width);
  const pw = tw + padX * 2;
  const x = Math.round(clamp(cx - pw / 2, 2, Math.max(2, W - pw - 2)));
  const y = Math.round(Math.max(2, bottom - ph));
  ctx.fillStyle = 'rgba(14, 22, 26, 0.74)';
  pillPath(x, y, pw, ph, 4);
  ctx.fill();
  ctx.fillStyle = '#f3f0df';
  ctx.fillText(text, x + padX, y + 11);
  ctx.restore();
  return y;
}

function birdTop(b) { return groundY - b.yOff - (b.boxH || b.clips[b.action].u.h * b.scale); }

function drawOverlays() {
  if (hoverBird && hoverBird !== selected && hoverBird.rec.name) {
    drawLabel(hoverBird.rec.name, hoverBird.x, birdTop(hoverBird) - 4);
  }
  if (selected) {
    let tip = birdTop(selected) - 4;
    if (selected.rec.name) tip = drawLabel(selected.rec.name, selected.x, Math.max(18, tip)) - 3;
    const mx = Math.round(clamp(selected.x, 8, W - 8)), my = Math.round(Math.max(14, tip));
    safeDraw('marker', () => drawSelectMarker(ctx, mx, my, clock));
  }
  if (selEgg) {
    const v = eggViews.find(e => e.egg.uid === selEgg);
    if (v && nestA > 0.5) {
      const { h } = eggDims();
      const mx = Math.round(nestX() + v.dx), my = Math.round(groundY + v.dy - v.drop - h - 3);
      safeDraw('marker', () => drawSelectMarker(ctx, mx, my, clock));
    }
  }
}

/* ---------- interaction ---------- */
// Screen bounding box of a bird's currently-drawn sprite (matches drawBird).
function birdBox(b) {
  const u = b.clips[b.action].u, s = b.scale;
  const dw = u.w * s, dh = u.h * s;
  return { left: b.x - dw / 2, right: b.x + dw / 2, bottom: groundY - b.yOff, top: groundY - dh - b.yOff };
}
function birdHit(b, px, py) {
  const x = birdBox(b);
  return px >= x.left - CLICK_PAD && px <= x.right + CLICK_PAD && py >= x.top - CLICK_PAD && py <= x.bottom + CLICK_PAD;
}
function birdAt(px, py) {
  if (selected && birdHit(selected, px, py)) return selected;   // drawn last = on top
  for (let i = birds.length - 1; i >= 0; i--) if (!birds[i].leaving && birdHit(birds[i], px, py)) return birds[i];
  return null;
}
// Eggs are tiny, so a tap right on one wins over a bird standing in front of it,
// and a near-miss still counts when there's no bird.
function hitTest(px, py) {
  let v = eggAt(px, py, EGG_PAD_NEAR);
  if (v) return { egg: v };
  const b = birdAt(px, py);
  if (b) return { bird: b };
  v = eggAt(px, py, EGG_PAD);
  return v ? { egg: v } : null;
}

function tapEgg(v) {
  if (isEggReady(v.egg)) {
    if (hatch) nudgeEgg(v, 0.22);        // one hatch at a time
    else startHatch(v);
    return;
  }
  openEggCard(v);
}

function pointerXY(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * (W / (r.width || 1)), (e.clientY - r.top) * (H / (r.height || 1))];
}
function onClick(e) {
  if (!mounted) return;
  const hit = hitTest(...pointerXY(e));
  if (!hit) deselectAll();
  else if (hit.egg) tapEgg(hit.egg);
  else selectBird(hit.bird);
}
function onMove(e) {
  if (!mounted) return;
  if (e.pointerType && e.pointerType !== 'mouse') { lastPtr = null; hoverBird = null; return; }
  lastPtr = pointerXY(e);
  updateHover();
}
function onLeave() {
  lastPtr = null; hoverBird = null;
  setCursor('default');
}
let cursorNow = '';
function setCursor(c) { if (canvas && c !== cursorNow) { cursorNow = c; canvas.style.cursor = c; } }
// Re-run each frame too: birds move under a still mouse.
function updateHover() {
  if (!lastPtr) return;
  const hit = hitTest(lastPtr[0], lastPtr[1]);
  hoverBird = (hit && hit.bird) || null;
  setCursor(hit ? 'pointer' : 'default');
}
function onKey(e) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (document.querySelector('dialog[open]')) return;     // Escape belongs to the open dialog
  if (!selected && !selEgg && !currentCard()) return;
  deselectAll();
}

function onStoreChange(type, data) {
  if (!mounted) return;
  switch (type) {
    case 'bird-added': reconcileBirds(); break;            // flies (or walks) in
    case 'bird-renamed': {
      const rec = data && data.bird;
      const b = rec && birds.find(o => o.rec.uid === rec.uid);
      if (b) b.rec = rec;
      break;
    }
    case 'eggs': refreshEggs(); break;
    case 'decor': rebuildDecor(); reconcileBirds(); break;
    case 'place-request': {
      // This fallback strip has no placement mode (that is the 3D garden's):
      // a bought or unpacked object simply goes to its default spot.
      const it = data && getDecorItem(data.uid);
      const spot = it && !it.pos && decorById(it.id)?.spot;
      if (spot) placeDecor(it.uid, spot[0], spot[1]);
      break;
    }
    case 'bird-sold': {                                   // fly (or walk) off, then gone
      const rec = data && data.bird;
      const b = rec && birds.find(o => o.rec.uid === rec.uid && !o.leaving);
      if (currentCard()?.type === 'bird' && currentCard().uid === rec?.uid) hideCard();
      if (b) {
        if (selected === b) selected = null;
        if (hoverBird === b) hoverBird = null;
        sendAway(b);
      }
      if (rec) {
        const who = rec.name || speciesInfo(rec.species).de;
        const how = b && !b.clips.fly ? 'läuft' : 'fliegt';
        safe('banner', () => showBanner({
          title: '💰 Verkauft',
          sub: `${who} ${how} davon · +${data.coins} ${data.coins === 1 ? 'Münze' : 'Münzen'}`,
        }));
      }
      break;
    }
    case 'reset':                                          // the 'decor'/'eggs' that follow rebuild the scene
      hatch = null; bursts = [];
      deselectAll();
      safe('banner', () => showBanner({ title: '🌱 Neuer Garten', sub: 'Neue Vögel schlüpfen aus Eiern – viel Glück!' }));
      break;
  }
}

/* ---------- scene / loop ---------- */
function resize() {
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;           // crisp pixel art
  groundY = H - GROUND_BAND;
  lastPtr = null;
  const widthChanged = W !== prevW; prevW = W;
  for (const b of birds) {
    if (b.leaving) continue;                   // on its way out — let it go
    if (b.action === 'walk' || b.action === 'fly') b.tx = clampX(b.tx);
    if (b.visit) b.visit.x = clampX(b.visit.x);
    const off = idleHalfW(b) + 12;
    if (b.action === 'fly') {
      if (!widthChanged) continue;
      // keep it just off-screen at most, and glide from where it is (no new lift)
      b.x = Math.max(-off, Math.min(W + off, b.x));
      b.flyLen = Math.max(1, Math.abs(b.tx - b.x)); b.flyP = 0; b.flyY0 = b.yOff; b.flyArc = 0;
    } else if (b.entering) {
      b.x = Math.max(-off, Math.min(W + off, b.x));
      b.st = Math.abs(b.tx - b.x) / WALK_SPEED + 4;
    } else b.x = clampX(b.x);
  }
}

// Cover the canvas with the background, anchored bottom-centre so the foreground
// grass (where birds stand) is always visible; smoothed because it's downscaled.
function drawBackground() {
  if (!bgImg) return false;
  const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight;
  const s = Math.max(W / iw, H / ih);
  const dw = iw * s, dh = ih * s;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bgImg, (W - dw) / 2, H - dh, dw, dh);
  ctx.imageSmoothingEnabled = false;
  return true;
}

function update(dt, dtMs) {
  clock += dt;
  for (const b of birds) updateBird(b, dt, dtMs);
  if (birds.some(b => b.gone)) {
    birds = birds.filter(b => !b.gone);
    fx = fx.filter(s => s.anchor === 'nest' || s.anchor.fixed || birds.includes(s.anchor));
  }
  updateEggs(dt);
  updateReveals(dt);
  updateHatch(dt);
  const e = effectEnv();
  for (const [id, inst] of effects) safe('fx:' + id, () => inst.update(dt, e));
  if (bursts.length) {
    bursts = bursts.filter(bu => {
      let alive = false;
      safe('burst', () => { alive = !!bu.update(dt); });
      return alive;
    });
  }
  updateSparkles(dt);
  updateHover();
}

// Draw order: background → sunbeams → pond → other decor → nest/eggs → birds
// (selected last) → front effects → bursts/sparkles → marker + name labels.
function draw() {
  ctx.clearRect(0, 0, W, H);
  if (!drawBackground()) {                                                // fallback until the image loads
    ctx.fillStyle = '#1e2832'; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = '#33414f'; ctx.fillRect(0, groundY, W, 1);
  }
  const e = effectEnv();
  const beams = effects.get('sunbeams');
  if (beams) safeDraw('fx:sunbeams', () => beams.draw(ctx, e));
  for (const d of decorObjs) safeDraw('decor:' + d.id, () => drawDecorObj(d));
  drawNestLayer();
  for (const b of birds) if (b !== selected) drawBird(b);
  if (selected) drawBird(selected);
  for (const [id, inst] of effects) if (id !== 'sunbeams') safeDraw('fx:' + id, () => inst.draw(ctx, e));
  for (const bu of bursts) safeDraw('burst', () => bu.draw(ctx));
  drawSparkles();
  drawOverlays();
}

function frame(t) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dtMs = last ? Math.min(t - last, MAX_DT) : 16; last = t;
  if (W <= 0 || H <= 0) return;
  safe('frame', () => { update(dtMs / 1000, dtMs); draw(); });
}
function start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
function stop() { running = false; cancelAnimationFrame(raf); }

function onVisibility() { if (document.hidden) stop(); else if (mounted) start(); }

/* ---------- public API ---------- */
export async function mountGarden(container) {
  if (mounted && wrap && container.contains(wrap)) { start(); return; }
  if (mounted) unmountGarden();
  const myGen = ++gen;

  wrap = document.createElement('div');
  wrap.className = 'garden';
  canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  const shopBtn = document.createElement('button');
  shopBtn.type = 'button';
  shopBtn.className = 'garden-shop-btn';
  shopBtn.textContent = '🛒 Shop';
  shopBtn.onclick = () => openShop();
  wrap.appendChild(shopBtn);
  const bookBtn = document.createElement('button');   // the Vogelbuch, left of the Shop button
  bookBtn.type = 'button';
  bookBtn.className = 'garden-shop-btn';
  bookBtn.textContent = '📖 Vogelbuch';
  bookBtn.onclick = () => openBook();
  wrap.appendChild(bookBtn);
  const cap = document.createElement('div');
  cap.className = 'garden-cap';
  cap.textContent = '🐦 Dein Garten – tippe einen Vogel an, um ihn anzusehen und zu benennen. Neue Vögel schlüpfen aus Eiern – die gibt es im Shop.';
  container.innerHTML = '';
  container.appendChild(wrap);
  bookBtn.style.right = `${shopBtn.offsetWidth + 16}px`;
  container.appendChild(cap);
  ctx = canvas.getContext('2d');
  initGardenUI(wrap);

  canvas.addEventListener('click', onClick);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  mounted = true;

  // fresh scene state
  clock = 0; birds = []; bursts = []; fx = []; hatch = null; knownDecor = null; effectReveal = null;
  selected = null; selEgg = null; hoverBird = null; pending.clear();
  eggViews = []; effects.clear(); nestSizeCache = null;
  layoutKey = ''; lastPtr = null; prevW = 0; cursorNow = '';

  resize();
  ro = new ResizeObserver(resize); ro.observe(canvas);
  if (!bgImg) loadImage(BG_URL).then(img => { bgImg = img; }).catch(() => {});
  loadLabelFont();

  rebuildDecor();
  refreshEggs(true);
  nestA = eggViews.length ? 1 : 0;
  unsubStore = onGardenChange(onStoreChange);
  start();                                    // background, decor and nest show right away

  // One scene bird per stored bird.
  const recs = listBirds();
  for (const r of recs) pending.add(r.uid);
  const made = await Promise.all(recs.map(r => makeBird(r).catch(() => null)));
  if (myGen !== gen) return;                  // unmounted (or remounted) while loading
  for (const r of recs) pending.delete(r.uid);
  const fresh = made.filter(b => b && !birds.some(o => o.rec.uid === b.rec.uid));
  layoutBirds(fresh);
  birds = [...fresh, ...birds];
  reconcileBirds();                           // catch anything that changed while loading
}

// Load (cached) the idle clip of a bird so the shop / bird card can draw a still
// preview — recoloured when a rare `variant` id is given. Resolves to
// { img, frames, u } (don't mutate it; it's shared with the scene).
export function getIdleClip(def, variant = null) {
  if (!def) return Promise.reject(new Error('unknown bird'));
  const specs = clipSpecs(def, variant);
  const spec = specs.idle || Object.values(specs)[0];
  if (!spec) return Promise.reject(new Error('no clips for ' + def.id));
  return loadClipVariant(spec, mappedVariant(def, variant));
}

export function unmountGarden() {
  stop();
  const wasMounted = mounted;
  mounted = false;
  gen++;
  if (ro) { ro.disconnect(); ro = null; }
  document.removeEventListener('visibilitychange', onVisibility);
  document.removeEventListener('keydown', onKey);
  if (canvas) {
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
  }
  if (unsubStore) { unsubStore(); unsubStore = null; }
  if (wasMounted) { try { destroyGardenUI(); } catch (e) { console.error(e); } }
  birds = []; eggViews = []; bursts = []; fx = []; decorObjs = [];
  effects.clear(); pending.clear();
  hatch = null; selected = null; selEgg = null; hoverBird = null;
  canvas = null; ctx = null; wrap = null;
}
