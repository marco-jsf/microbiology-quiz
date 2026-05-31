// Garden minigame: a calm strip of ground where purchased birds idle, peck,
// hop, walk and occasionally fly. Pure <canvas>, no engine, no build step.
//
// Design goals (from the brief): cozy, NOT distracting. So behaviour is
// heavily weighted toward standing still / pecking; walking is slow; flight is
// rare; and we play each clip at its native Aseprite frame durations (the
// packs use ~10fps with deliberate long hold-frames, which reads as gentle).

import { birdById } from './garden-data.js';
import { ownedFlock } from './garden-store.js';
import { openShop } from './shop.js';

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

// Per-action playback speed (1 = the asset's native frame rate). <1 is slower.
// Idle reads better calm and gentle, so we play it at half speed.
const ACTION_SPEED = { idle: 0.4 };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];

/* ---------- asset loading (cached, deduped by URL) ---------- */
const jsonCache = new Map();
const imgCache = new Map();

function fetchJson(url) {
  if (!jsonCache.has(url)) {
    jsonCache.set(url, fetch(encodeURI(url)).then(r => {
      if (!r.ok) throw new Error('JSON ' + r.status + ' ' + url);
      return r.json();
    }));
  }
  return jsonCache.get(url);
}
function loadImage(url) {
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('IMG ' + url));
      img.src = encodeURI(url);
    }));
  }
  return imgCache.get(url);
}
const pngFor = jsonUrl => jsonUrl.replace(/\.json$/i, '.png');

// Resolve a bird def into { action: {json, tag} } specs for both layouts.
function clipSpecs(def) {
  const out = {};
  if (def.tags) for (const [act, tag] of Object.entries(def.tags)) out[act] = { json: def.sheet, tag };
  else for (const [act, name] of Object.entries(def.files)) out[act] = { json: `${def.dir}/${def.prefix}-${name}.json`, tag: null };
  return out;
}

// Load one clip → { img, frames:[{x,y,w,h,d}] }.
async function loadClip(spec) {
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
  const u = clipContentBox(img, frames);   // ONE content box for the whole clip
  return { img, frames, u };
}

// These packs pad sprites inside large frames (e.g. a small bird in a 64×64
// cell). We scan alpha to find the UNION content box across all of a clip's
// frames, in frame-local coords. Cropping every frame to this same box (a) trims
// the dead padding so we can scale by the real bird and stand it on the ground,
// and (b) keeps frames registered to each other exactly as authored — so a
// flapping bird's body stays put while only its wings move (no per-frame bounce).
let trimCanvas, trimCtx;
function clipContentBox(img, frames) {
  const full = { lx: 0, ty: 0, w: frames[0].w, h: frames[0].h };
  if (!trimCanvas) { trimCanvas = document.createElement('canvas'); trimCtx = trimCanvas.getContext('2d', { willReadFrequently: true }); }
  trimCanvas.width = img.width; trimCanvas.height = img.height;
  trimCtx.clearRect(0, 0, img.width, img.height);
  trimCtx.drawImage(img, 0, 0);
  let data;
  try { data = trimCtx.getImageData(0, 0, img.width, img.height).data; }
  catch (e) { return full; }                       // tainted canvas — skip trimming
  const W = img.width;
  let uL = Infinity, uT = Infinity, uR = -Infinity, uB = -Infinity;
  for (const f of frames) {
    for (let y = f.y; y < f.y + f.h; y++) {
      for (let x = f.x; x < f.x + f.w; x++) {
        if (data[(y * W + x) * 4 + 3] > 8) {
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

async function makeBird(def) {
  const specs = clipSpecs(def);
  const clips = {};
  await Promise.all(Object.entries(specs).map(async ([act, spec]) => {
    try { clips[act] = await loadClip(spec); } catch (e) { /* drop missing action */ }
  }));
  if (!clips.idle) clips.idle = Object.values(clips)[0];
  if (!clips.idle) return null;                       // nothing loaded — skip bird
  // Scale by the idle clip's content height, normalized to a per-bird size.
  const scale = (TARGET_H * (def.size || 1)) / clips.idle.u.h;
  const b = {
    def, clips, scale,
    x: 0, yOff: 0, facing: Math.random() < 0.5 ? 1 : -1,
    action: 'idle', fi: 0, ft: clips.idle.frames[0].d,
    st: rnd(0.5, 4),                                  // seconds until next decision
    tx: 0, vy: 0, flyP: 0, flyLen: 0, flyArc: 0,
  };
  return b;
}

/* ---------- per-bird behaviour ---------- */
function clampX(x) { return Math.max(MARGIN, Math.min(W - MARGIN, x)); }

function setAction(b, act) {
  if (!b.clips[act]) act = 'idle';
  if (b.action === act) return;
  b.action = act; b.fi = 0; b.ft = b.clips[act].frames[0].d;
}

function decide(b) {
  const has = a => !!b.clips[a];
  const opts = [];
  const add = (a, w) => { if (has(a)) for (let i = 0; i < w; i++) opts.push(a); };
  add('idle', 6); add('eat', 2); add('walk', 3); add('jump', 1); add('fly', 1);
  const a = opts.length ? pick(opts) : 'idle';
  switch (a) {
    case 'walk': b.tx = clampX(b.x + rnd(-150, 150)); b.st = rnd(2, 5); break;
    case 'fly': {
      const sx = b.x;
      b.tx = clampX(MARGIN + Math.random() * (W - 2 * MARGIN));
      if (Math.abs(b.tx - sx) < 60) b.tx = clampX(sx + (Math.random() < 0.5 ? -1 : 1) * rnd(140, 240));
      b.flyLen = Math.abs(b.tx - sx) || 1; b.flyP = 0; b.flyArc = rnd(55, 105); b.st = 12;
      break;
    }
    case 'jump': b.vy = JUMP_V; b.yOff = 0.001; b.st = 2; break;
    case 'eat': b.st = rnd(1.5, 3); break;
    default: b.st = rnd(3, 7);
  }
  setAction(b, a);
}

function updateBird(b, dtSec, dtMs) {
  b.st -= dtSec;
  switch (b.action) {
    case 'walk': {
      const dir = Math.sign(b.tx - b.x) || 1; b.facing = dir;
      b.x += WALK_SPEED * dtSec * dir;
      if ((dir > 0 ? b.x >= b.tx : b.x <= b.tx) || b.st <= 0) { b.x = clampX(b.x); decide(b); }
      break;
    }
    case 'fly': {
      const dir = Math.sign(b.tx - b.x) || 1; b.facing = dir;
      b.x += FLY_SPEED * dtSec * dir;
      b.flyP = Math.min(1, b.flyP + (FLY_SPEED * dtSec) / b.flyLen);
      b.yOff = Math.sin(b.flyP * Math.PI) * b.flyArc;
      if (b.flyP >= 1 || (dir > 0 ? b.x >= b.tx : b.x <= b.tx)) { b.x = b.tx; b.yOff = 0; setAction(b, 'idle'); b.st = rnd(2, 4); }
      break;
    }
    case 'jump': {
      b.vy -= GRAVITY * dtSec; b.yOff += b.vy * dtSec;
      if (b.yOff <= 0) { b.yOff = 0; setAction(b, 'idle'); b.st = rnd(2, 5); }
      break;
    }
    default: if (b.st <= 0) decide(b);   // idle / eat
  }
  // advance animation by native frame durations
  const frames = b.clips[b.action].frames;
  b.ft -= dtMs * (ACTION_SPEED[b.action] || 1);
  let guard = 0;
  while (b.ft <= 0 && guard++ < 8) {
    b.fi = (b.fi + 1) % frames.length;
    b.ft += frames[b.fi].d || 120;
  }
  if (b.fi >= frames.length) b.fi = 0;   // clip changed under us
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

/* ---------- interaction ---------- */
// Screen bounding box of a bird's currently-drawn sprite (matches drawBird).
function birdBox(b) {
  const u = b.clips[b.action].u, s = b.scale;
  const dw = u.w * s, dh = u.h * s;
  return { left: b.x - dw / 2, right: b.x + dw / 2, bottom: groundY - b.yOff, top: groundY - dh - b.yOff };
}
function birdAt(px, py) {
  for (let i = birds.length - 1; i >= 0; i--) {        // topmost (last drawn) first
    const x = birdBox(birds[i]);
    if (px >= x.left - CLICK_PAD && px <= x.right + CLICK_PAD && py >= x.top - CLICK_PAD && py <= x.bottom + CLICK_PAD) return birds[i];
  }
  return null;
}
// React to being tapped: fly off if able, else hop, else scurry away.
function startle(b) {
  if (b.clips.fly) {
    const sx = b.x;
    b.tx = clampX(MARGIN + Math.random() * (W - 2 * MARGIN));
    if (Math.abs(b.tx - sx) < 140) b.tx = clampX(sx + (sx < W / 2 ? 1 : -1) * rnd(200, 340));
    b.flyLen = Math.abs(b.tx - sx) || 1; b.flyP = 0; b.flyArc = rnd(85, 135); b.st = 12;
    setAction(b, 'fly');
  } else if (b.clips.jump) {
    b.vy = JUMP_V * 1.15; b.yOff = 0.001; b.st = 2; setAction(b, 'jump');
  } else {
    b.tx = clampX(b.x + (b.x < W / 2 ? 1 : -1) * rnd(90, 170)); b.st = rnd(1.5, 3); setAction(b, 'walk');
  }
}
function pointerXY(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
}
function onClick(e) { const b = birdAt(...pointerXY(e)); if (b) startle(b); }
function onMove(e) { canvas.style.cursor = birdAt(...pointerXY(e)) ? 'pointer' : 'default'; }

/* ---------- scene / loop ---------- */
const BG_URL = 'assets/garden-background.png';
let canvas, ctx, wrap, ro;
let W = 0, H = 0, groundY = 0;
let birds = [];
let bgImg = null;
let running = false, raf = 0, last = 0, mounted = false;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;           // crisp pixel art
  groundY = H - GROUND_BAND;
  for (const b of birds) b.x = clampX(b.x);
}

function layout() {
  const n = birds.length || 1, usable = W - 2 * MARGIN;
  birds.forEach((b, i) => { b.x = MARGIN + usable * ((i + 0.5) / n); });
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

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (!drawBackground()) {                                                // fallback until the image loads
    ctx.fillStyle = '#1e2832'; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = '#33414f'; ctx.fillRect(0, groundY, W, 1);
  }
  for (const b of birds) drawBird(b);
}

function frame(t) {
  if (!running) return;
  const dtMs = last ? Math.min(t - last, MAX_DT) : 16; last = t;
  const dtSec = dtMs / 1000;
  if (W > 0) { for (const b of birds) updateBird(b, dtSec, dtMs); draw(); }
  raf = requestAnimationFrame(frame);
}
function start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
function stop() { running = false; cancelAnimationFrame(raf); }

function onVisibility() { if (document.hidden) stop(); else if (mounted) start(); }

/* ---------- public API ---------- */
export async function mountGarden(container) {
  if (mounted && wrap && container.contains(wrap)) { start(); return; }
  wrap = document.createElement('div');
  wrap.className = 'garden';
  canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  const shopBtn = document.createElement('button');
  shopBtn.className = 'garden-shop-btn';
  shopBtn.innerHTML = '🛒 Shop';
  shopBtn.onclick = () => openShop();
  wrap.appendChild(shopBtn);
  const cap = document.createElement('div');
  cap.className = 'garden-cap';
  cap.textContent = '🐦 Your garden — buy birds in the shop and they’ll move in here.';
  container.innerHTML = '';
  container.appendChild(wrap);
  container.appendChild(cap);
  ctx = canvas.getContext('2d');
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousemove', onMove);
  mounted = true;

  resize();
  ro = new ResizeObserver(resize); ro.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);
  if (!bgImg) loadImage(BG_URL).then(img => { bgImg = img; }).catch(() => {});

  // Spawn one bird per owned copy.
  const flock = ownedFlock();
  const ids = Object.entries(flock).flatMap(([id, n]) => Array(n).fill(id));
  const made = await Promise.all(ids.map(id => makeBird(birdById(id)).catch(() => null)));
  birds = made.filter(Boolean);
  layout();
  start();
}

// Add a freshly-bought bird to the live scene at a random spot.
export async function addBirdToScene(id) {
  const b = await makeBird(birdById(id)).catch(() => null);
  if (!b || !mounted) return;
  b.x = clampX(MARGIN + Math.random() * (W - 2 * MARGIN));
  b.st = rnd(0.5, 2);
  birds.push(b);
}

// Load (cached) the idle clip of a bird so the shop can draw a still preview.
export function getIdleClip(def) {
  const specs = clipSpecs(def);
  const spec = specs.idle || Object.values(specs)[0];
  return loadClip(spec);
}

export function unmountGarden() {
  stop();
  mounted = false;
  if (ro) { ro.disconnect(); ro = null; }
  document.removeEventListener('visibilitychange', onVisibility);
  birds = [];
}
