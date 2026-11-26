// Birds of the 2.5D garden: sprite sheets → packed texture atlases, upright
// billboards that animate at the packs' native frame rate, and a calm little
// behaviour model in three dimensions — strolling over the lawn, hopping up
// the stairs, flying in arcs to trees, the feeder, the bird bath or another
// corner of the garden, wading in the pond, coming for seeds, and roosting
// for the night (the kiwi sleeps by day instead).

import * as THREE from 'three';
import { birdById, speciesInfo } from '../garden-data.js';
import { variantFor } from '../garden-variants.js';
import { recolor } from '../garden-art.js';
import { VSTRETCH, BIRD_UNIT, PITCH } from './config.js';
import { makeQuad, setQuadSize, setQuadUV, setQuadColor, spriteMaterials, pixelTexture } from './sprites.js';
import { rnd, pick, clamp, ease } from './util.js';
import { paintBlob, paintSeed } from './pixelart.js';
import { KIND } from './world.js';

const WALK = 0.42, RUN = 1.2, FLY = 2.2, GRAV = 9.5;
const ACT_SPEED = { idle: 0.4, sleep: 0.45 };

/* ================================================================ assets */

const jsonCache = new Map(), imgCache = new Map(), clipCache = new Map(), kitCache = new Map();
function cached(map, key, make) {
  if (!map.has(key)) {
    const p = make();
    map.set(key, p);
    p.catch(() => { if (map.get(key) === p) map.delete(key); });
  }
  return map.get(key);
}
const fetchJson = url => cached(jsonCache, url, () => fetch(encodeURI(url)).then(r => {
  if (!r.ok) throw new Error('JSON ' + r.status + ' ' + url);
  return r.json();
}));
const loadImage = url => cached(imgCache, url, () => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => rej(new Error('IMG ' + url));
  img.src = encodeURI(url);
}));
const pngFor = u => u.replace(/\.json$/i, '.png');

// Extra clips some packs have (played now and then / at night).
const EXTRA = {
  pigeon: { special: ['Coo'] },
  sparrow: { special: ['Idle2', 'Idle3'] },
  crow: { special: ['caw'] },
  dove: { special: ['Cooo coooo coo'], sleep: 'Sleep' },
  peacock: { special: ['Tailopen'] },
  shoebill: { special: ['Click'] },
  toucan: { special: ['Chew'] },
  macaw: { special: ['Chew'] },
  kiwi: { run: 'Run' },
};

function specsFor(def, ownSheet) {
  const out = {}, ex = EXTRA[def.id] || {};
  if (def.tags) {
    const sheet = ownSheet || def.sheet;
    for (const [a, tag] of Object.entries(def.tags)) out[a] = { json: sheet, tag };
    if (!ownSheet) {
      (ex.special || []).forEach((tag, i) => { out['special' + i] = { json: sheet, tag, strict: true }; });
      if (ex.sleep) out.sleep = { json: sheet, tag: ex.sleep, strict: true };
      if (ex.run) out.run = { json: sheet, tag: ex.run, strict: true };
    }
  } else {
    const f = name => ({ json: `${def.dir}/${def.prefix}-${name}.json`, tag: null });
    for (const [a, name] of Object.entries(def.files)) out[a] = f(name);
    (ex.special || []).forEach((n, i) => { out['special' + i] = f(n); });
    if (ex.run) out.run = f(ex.run);
  }
  return out;
}

const alphaCache = new WeakMap();
function alphaOf(img) {
  if (alphaCache.has(img)) return alphaCache.get(img);
  let a = null;
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    a = new Uint8Array(img.width * img.height);
    for (let i = 0, j = 3; i < a.length; i++, j += 4) a[i] = d[j];
  } catch (e) { a = null; }
  alphaCache.set(img, a);
  return a;
}
// Union content box of all frames of a clip (frame-local), so every frame is
// cropped the same way and stays registered (see garden.js).
function contentBox(img, frames) {
  const full = { lx: 0, ty: 0, w: frames[0].w, h: frames[0].h };
  const alpha = alphaOf(img);
  if (!alpha) return full;
  const IW = img.width, IH = img.height;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const f of frames) {
    for (let y = f.y; y < Math.min(f.y + f.h, IH); y++) for (let x = f.x; x < Math.min(f.x + f.w, IW); x++) {
      if (alpha[y * IW + x] > 8) {
        const lx = x - f.x, ty = y - f.y;
        if (lx < l) l = lx; if (lx + 1 > r) r = lx + 1;
        if (ty < t) t = ty; if (ty + 1 > b) b = ty + 1;
      }
    }
  }
  return r < l ? full : { lx: l, ty: t, w: r - l, h: b - t };
}

function loadClip(spec) {
  return cached(clipCache, spec.json + '#' + (spec.tag || ''), async () => {
    const [data, img] = await Promise.all([fetchJson(spec.json), loadImage(pngFor(spec.json))]);
    const fr = data.frames;
    let seq;
    if (Array.isArray(fr)) seq = fr;
    else {
      const vals = Object.values(fr);
      let from = 0, to = vals.length - 1;
      if (spec.tag) {
        const t = (data.meta.frameTags || []).find(x => x.name === spec.tag);
        if (t) { from = t.from; to = t.to; } else if (spec.strict) throw new Error('no tag ' + spec.tag);
      }
      seq = vals.slice(from, to + 1);
    }
    const frames = seq.map(f => ({ x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h, d: f.duration || 100 }));
    if (!frames.length) throw new Error('empty clip');
    return { img, frames, u: contentBox(img, frames) };
  });
}

// Everything one species (in one colour variant) needs: its clips packed into
// a single small atlas (some packs are far wider than a GPU texture may be),
// the texture and the shared materials.
export function loadKit(species, variantId = null) {
  const def = birdById(species);
  if (!def) return Promise.reject(new Error('unknown bird ' + species));
  const v = variantFor(species, variantId) || null;
  const own = def.tags && v && v.sheet ? v.sheet : null;
  const mapV = v && v.map && !own ? v : null;
  return cached(kitCache, species + '|' + (v ? v.id : ''), async () => {
    const clips = {};
    await Promise.all(Object.entries(specsFor(def, own)).map(async ([a, s]) => {
      try { clips[a] = await loadClip(s); } catch (e) { /* the pack lacks this clip */ }
    }));
    if (!clips.idle) clips.idle = Object.values(clips)[0];
    if (!clips.idle) throw new Error('no clips for ' + species);
    const src = new Map();
    const srcOf = img => {
      if (!src.has(img)) { let s = img; try { s = mapV ? recolor(img, mapV) || img : img; } catch (e) { s = img; } src.set(img, s); }
      return src.get(img);
    };
    const items = [];
    for (const [a, c] of Object.entries(clips)) {
      c.frames.forEach((f, i) => items.push({ a, i, img: srcOf(c.img), sx: f.x + c.u.lx, sy: f.y + c.u.ty, w: c.u.w, h: c.u.h }));
    }
    const AW = 1024;
    let x = 1, y = 1, rowH = 0;
    for (const it of items) {
      if (x + it.w + 1 > AW) { x = 1; y += rowH + 1; rowH = 0; }
      it.ax = x; it.ay = y; x += it.w + 1; rowH = Math.max(rowH, it.h);
    }
    const AH = y + rowH + 1;
    const cv = document.createElement('canvas');
    cv.width = AW; cv.height = AH;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (const it of items) g.drawImage(it.img, it.sx, it.sy, it.w, it.h, it.ax, it.ay, it.w, it.h);
    const kc = {};
    for (const [a, c] of Object.entries(clips)) kc[a] = { u: c.u, frames: c.frames.map(f => ({ d: f.d, uv: null })) };
    for (const it of items) kc[it.a].frames[it.i].uv = [it.ax / AW, 1 - (it.ay + it.h) / AH, (it.ax + it.w) / AW, 1 - it.ay / AH];
    const tex = pixelTexture(cv);
    const info = speciesInfo(species);
    const p0 = items.find(it => it.a === 'idle' && it.i === 0);
    return {
      def, info, variant: v, clips: kc, tex, mats: spriteMaterials(tex),
      texel: BIRD_UNIT * (def.size || 1) / clips.idle.u.h,
      specials: Object.keys(kc).filter(k => k.startsWith('special')),
      canFly: !!kc.fly, canWalk: !!kc.walk,
      wader: (info.likes || []).includes('pond'),
      big: (def.size || 1) >= 1.2,
      portrait: { canvas: cv, x: p0.ax, y: p0.ay, w: p0.w, h: p0.h },
    };
  });
}

/* ================================================================ one bird */

const _v = new THREE.Vector3(), _c = new THREE.Vector3();
function pickW(opts) {
  let r = Math.random() * opts.reduce((s, o) => s + o.w, 0);
  for (const o of opts) { r -= o.w; if (r < 0) return o; }
  return opts[opts.length - 1];
}

class Bird {
  constructor(flock, kit, rec) {
    this.flock = flock; this.kit = kit; this.rec = rec;
    this.geo = makeQuad(1, 1);
    this.mesh = new THREE.Mesh(this.geo, kit.mats.mat);
    this.mesh.customDepthMaterial = kit.mats.depth;
    this.mesh.castShadow = true;
    this.mesh.userData.bird = this;
    // Logical position (feet). The mesh sits a hair closer to the camera, by
    // an amount from the bird's rank in the flock by id (Flock.rank): sprites
    // are parallel planes, so two birds at the same depth (neighbouring perches
    // on the feeder, a landing bird) would z-fight — a fixed order by id makes
    // one always draw in front of the other.
    this.pos = new THREE.Vector3();
    this.bias = 0.003;
    this.facing = Math.random() < 0.5 ? -1 : 1;           // sprites are drawn facing left (-1)
    this.act = ''; this.fi = 0; this.ft = 0; this.once = false; this.clipDone = false; this.freeze = false;
    this.task = null; this.perch = null;
    this.shade = 1; this.shadeGoal = 1; this.shadeT = Math.random() * 0.4;
    this.zT = rnd(0.5, 2.5);
    this.pace = rnd(0.88, 1.12);
    this.sleepBias = rnd(-0.18, 0.18);
    this.claim = null;                                   // the seed this bird is heading for
    this.w = 1; this.h = 1;
    this.setAct('idle');
  }
  get world() { return this.flock.world; }
  get name() { return this.rec.name || this.kit.info.de; }

  /* ---------- animation ---------- */
  setAct(a, { once = false, restart = false } = {}) {
    if (!this.kit.clips[a]) a = 'idle';
    if (this.act === a && !restart) { this.once = once; return; }
    this.act = a; this.fi = 0; this.once = once; this.clipDone = false; this.freeze = false;
    const c = this.kit.clips[a];
    this.ft = c.frames[0].d;
    this.w = c.u.w * this.kit.texel;
    this.h = c.u.h * this.kit.texel * VSTRETCH;
    setQuadSize(this.geo, this.w, this.h);
    this.applyFrame();
  }
  applyFrame() {
    const f = this.kit.clips[this.act].frames[this.fi];
    setQuadUV(this.geo, f.uv[0], f.uv[1], f.uv[2], f.uv[3], this.facing > 0);
  }
  animate(dtMs) {
    if (this.freeze) return;
    const fr = this.kit.clips[this.act].frames;
    this.ft -= dtMs * (ACT_SPEED[this.act] || 1);
    let changed = false, guard = 0;
    while (this.ft <= 0 && guard++ < 8) {
      if (this.once && this.fi === fr.length - 1) { this.clipDone = true; this.ft = 1e9; break; }
      this.fi = (this.fi + 1) % fr.length; this.ft += fr[this.fi].d || 100; changed = true;
    }
    if (changed) this.applyFrame();
  }
  face(dx) {
    if (Math.abs(dx) < 0.003) return;
    const f = dx > 0 ? 1 : -1;
    if (f !== this.facing) { this.facing = f; this.applyFrame(); }
  }

  /* ---------- tasks ---------- */
  finish() {
    const then = this.task && this.task.then;
    this.task = null;
    if (then) then();
  }
  doIdle(dur, then) { this.task = { type: 'idle', dur, t: 0, then }; this.setAct('idle'); }
  doPeck(dur, then, seed = null) { this.task = { type: 'peck', dur, t: 0, then, seed }; this.setAct(this.kit.clips.eat ? 'eat' : 'idle'); }
  doSpecial(then) {
    if (!this.kit.specials.length) return this.doIdle(rnd(2, 4), then);
    this.task = { type: 'special', t: 0, then };
    this.setAct(pick(this.kit.specials), { once: true, restart: true });
  }
  leavePerch() { if (this.perch) { if (this.perch.taken === this) this.perch.taken = null; this.perch = null; } }
  // Drop the current task; a perch it had reserved (flying there) is free again.
  dropTask() {
    const p = this.task && this.task.perch;
    if (p && p.taken === this) p.taken = null;
    this.task = null;
  }

  walkTo(x, z, { run = false, then = null } = {}) {
    this.leavePerch();
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    const speed = (run ? RUN : WALK) * this.pace * (this.kit.big ? 1.25 : 1);
    this.task = { type: 'walk', tx: x, tz: z, speed, t: 0, max: d / speed + 3, then };
    this.setAct(run && this.kit.clips.run ? 'run' : 'walk');
  }
  hop(forward = 0, then = null) {
    this.leavePerch();
    let vx = this.facing * forward / 0.5, vz = rnd(-0.3, 0.3) * forward;
    const lx = this.pos.x + vx * 0.5, lz = this.pos.z + vz * 0.5;
    if (!this.world.walkable(lx, lz, this.kit.wader) || Math.abs(this.world.heightAt(lx, lz) - this.pos.y) > 0.3) { vx = 0; vz = 0; }
    this.task = { type: 'hop', vx, vz, vy: 2.5, y0: this.world.heightAt(this.pos.x, this.pos.z), t: 0, then };
    this.setAct('jump', { once: true, restart: true });
  }
  flyTo(dest, { perch = null, then = null, high = false, loop = null } = {}) {
    if (!this.kit.canFly) {                                      // flightless: walk if possible
      if (this.world.segmentOk(this.pos.x, this.pos.z, dest.x, dest.z, this.kit.wader)) return this.walkTo(dest.x, dest.z, { then });
      return this.doIdle(rnd(2, 4), then);
    }
    this.leavePerch();
    const old = this.task && this.task.perch;            // a perch this bird was flying to
    if (old && old !== perch && old.taken === this) old.taken = null;
    if (perch) perch.taken = this;
    const p0 = this.pos.clone(), p3 = new THREE.Vector3(dest.x, dest.y, dest.z);
    const d = Math.hypot(p3.x - p0.x, p3.z - p0.z);
    const peak = Math.max(p0.y, p3.y) + clamp(0.9 + d * 0.22, 1.0, 4.2) * (high ? 1.7 : 1);
    const mid = p0.clone().lerp(p3, 0.5);
    mid.y = peak;
    const side = new THREE.Vector3(-(p3.z - p0.z), 0, p3.x - p0.x);
    if (side.lengthSq() > 1e-6) mid.addScaledVector(side.normalize(), rnd(-0.22, 0.22) * d);
    const pts = [p0];
    const a = p0.clone().lerp(mid, 0.3); a.y = p0.y + (peak - p0.y) * 0.6; pts.push(a);
    if (loop) for (const q of loop) pts.push(q);
    else pts.push(mid);
    const b = p3.clone().lerp(loop ? pts[pts.length - 1] : mid, 0.28); b.y = p3.y + Math.max(0.35, (peak - p3.y) * 0.35);
    pts.push(b, p3);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    this.task = { type: 'fly', curve, len, s: 0, t: 0, speed: FLY * this.pace * clamp(0.85 + d / 16, 0.85, 1.6), perch, then, dest: p3 };
    this.setAct('fly');
  }

  /* ---------- decisions ---------- */
  decide() {
    const f = this.flock;
    if (this.leaving) return;
    this.claim = null;
    if (this === f.selected) return Math.random() < 0.3 && !this.perch ? this.doPeck(rnd(1.5, 3)) : this.doIdle(rnd(2, 4));
    if (f.isSleepTime(this)) return this.goSleep();
    const seed = f.nearestSeed(this, 10);
    if (seed && Math.random() < 0.9) return this.goSeed(seed);
    const opts = [];
    const add = (w, fn) => opts.push({ w, fn });
    const morning = f.env.hour > 5 && f.env.hour < 9 ? 1.6 : 1;   // dawn chorus
    if (this.perch) {
      add(5, () => this.doIdle(rnd(2.5, 7)));
      if (this.perch.visit) add(5, () => this.doPeck(rnd(2, 4)));
      if (this.kit.specials.length) add(1.2 * morning, () => this.doSpecial());
      add(3.2, () => this.flyAnywhere());
    } else {
      add(6, () => this.doIdle(rnd(2, 6)));
      add(3, () => this.doPeck(rnd(1.2, 3)));
      if (this.kit.canWalk) add(4, () => this.wander());
      if (this.kit.clips.jump) add(1.2, () => this.hop(rnd(0, 0.5)));
      if (this.kit.specials.length) add(1.2 * morning, () => this.doSpecial());
      if (this.kit.canFly) add(2 * morning, () => this.flyAnywhere());
      add(2.4, () => this.visitSomething());
    }
    pickW(opts).fn();
  }

  spotOk(x, z, minGap = 0.6) {
    for (const o of this.flock.birds) {
      if (o === this) continue;
      const ox = o.task && o.task.type === 'walk' ? o.task.tx : o.pos.x, oz = o.task && o.task.type === 'walk' ? o.task.tz : o.pos.z;
      if ((ox - x) ** 2 + (oz - z) ** 2 < minGap * minGap) return false;
    }
    return true;
  }
  wander() {
    const w = this.world;
    for (let k = 0; k < 10; k++) {
      const s = w.randomSpot({ near: this.pos, r: 4.5, wader: this.kit.wader && Math.random() < 0.6 });
      if (!s || !this.spotOk(s.x, s.z)) continue;
      if (Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < 0.8) continue;
      if (!w.segmentOk(this.pos.x, this.pos.z, s.x, s.z, this.kit.wader)) continue;
      return this.walkTo(s.x, s.z);
    }
    this.doIdle(rnd(2, 4));
  }
  flyAnywhere() {
    const f = this.flock;
    if (!this.kit.big || this.kit.def.id === 'peacock') {
      if (Math.random() < 0.5) {
        const p = f.freePerch(this, pr => !this.kit.big || pr.kind === 'tree');
        if (p) return this.flyTo(p, { perch: p });
      }
    }
    for (let k = 0; k < 12; k++) {
      const s = this.world.randomSpot({ wader: this.kit.wader && Math.random() < 0.3 });
      if (!s || !this.spotOk(s.x, s.z)) continue;
      if (Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < 3) continue;
      return this.flyTo(s);
    }
    this.doIdle(rnd(2, 4));
  }
  // A spot to reach `target` (walking if possible, else flying), then `then`.
  goNear(target, r, then, { run = false } = {}) {
    const w = this.world;
    for (let k = 0; k < 10; k++) {
      const s = w.randomSpot({ near: target, r, wader: this.kit.wader });
      if (!s || !this.spotOk(s.x, s.z, 0.45)) continue;
      const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
      if (!this.perch && d < 7 && w.segmentOk(this.pos.x, this.pos.z, s.x, s.z, this.kit.wader)) return this.walkTo(s.x, s.z, { run, then });
      if (this.kit.canFly) return this.flyTo(s, { then });
    }
    return this.doIdle(rnd(2, 4));
  }
  visitSomething() {
    const f = this.flock, w = this.world;
    if (this.kit.wader && w.pond && Math.random() < 0.75) {
      const s = w.randomSpot({ kinds: [KIND.SHELF], wader: true });
      if (s) {
        const after = () => (Math.random() < 0.5 ? this.doIdle(rnd(6, 14)) : this.doPeck(rnd(3, 6)));
        if (w.segmentOk(this.pos.x, this.pos.z, s.x, s.z, true) && !this.perch) return this.walkTo(s.x, s.z, { then: after });
        if (this.kit.canFly) return this.flyTo(s, { then: after });
      }
    }
    // Species with `likes` (garden-data.js) go to that kind of decor first.
    const likes = this.kit.info.likes || [];
    const small = !this.kit.big && this.kit.canFly;
    if (small && Math.random() < 0.6) {
      const liked = likes.length && Math.random() < 0.75 ? f.freePerch(this, pr => pr.visit && likes.includes(pr.kind)) : null;
      const p = liked || f.freePerch(this, pr => pr.visit);
      if (p) return this.flyTo(p, { perch: p, then: () => (p.visit === 'bathe' && this.kit.specials.length ? this.doSpecial() : this.doPeck(rnd(3, 6))) });
    }
    if (!w.visits.length) return this.wander();
    const fav = w.visits.filter(v => likes.includes(v.kind));
    const goal = fav.length && Math.random() < 0.7 ? pick(fav) : pick(w.visits);
    return this.goNear(goal, goal.r || 1.4, () => this.doPeck(rnd(2.5, 5)));
  }
  goSeed(seed) {
    const w = this.world;
    // a spot right next to the seed — on the same ground as the seed itself
    let tx = seed.x + rnd(-0.25, 0.25), tz = seed.z + rnd(-0.25, 0.25);
    if (!w.walkable(tx, tz, this.kit.wader) || Math.abs(w.heightAt(tx, tz) - seed.gy) > 0.05) { tx = seed.x; tz = seed.z; }
    const after = () => this.doPeck(rnd(1.8, 3.2), null, seed);
    const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    const walk = !this.perch && d < 7 && w.segmentOk(this.pos.x, this.pos.z, tx, tz, this.kit.wader);
    if (!(d < 0.35 && !this.perch) && !walk && !this.kit.canFly) return this.doIdle(rnd(2, 4));
    this.claim = seed;                                   // counted by Flock.nearestSeed
    if (d < 0.35 && !this.perch) return after();
    if (walk) return this.walkTo(tx, tz, { run: d > 2, then: after });
    return this.flyTo({ x: tx, y: w.heightAt(tx, tz), z: tz }, { then: after });
  }

  /* ---------- night ---------- */
  goSleep() {
    const f = this.flock, w = this.world;
    if (this.perch && (this.perch.roost || this.kit.big)) return this.sleep();
    if (this.kit.wader && w.kindAt(this.pos.x, this.pos.z) === KIND.SHELF) return this.sleep();
    if (this.kit.canFly && (!this.kit.big || this.kit.def.id === 'peacock')) {
      const p = f.freePerch(this, pr => pr.roost && (!this.kit.big || pr.kind === 'tree'), true);
      if (p) return this.flyTo(p, { perch: p, then: () => this.sleep() });
    }
    if (this.kit.wader && w.pond) {
      const s = w.randomSpot({ kinds: [KIND.SHELF], wader: true });
      if (s) return this.goNear(s, 0.3, () => this.sleep());
    }
    if (!this.perch && f.nearCover(this.pos)) return this.sleep();
    const c = f.coverSpot(this);
    if (c) return this.goNear(c, 0.4, () => this.sleep());
    return this.sleep();
  }
  sleep() {
    this.task = { type: 'sleep', t: 0, check: 1 };
    if (this.kit.clips.sleep) this.setAct('sleep');
    else { this.setAct('idle', { restart: true }); this.freeze = true; }
  }

  /* ---------- per-frame ---------- */
  update(dt, dtMs) {
    const t = this.task, w = this.world;
    if (!t) this.decide();
    else {
      t.t += dt;
      switch (t.type) {
        case 'idle': if (t.t >= t.dur) this.finish(); break;
        case 'peck':
          if (t.t >= t.dur) {
            // eats only if it really got there (a walk can end early when blocked)
            if (t.seed && Math.hypot(t.seed.x - this.pos.x, t.seed.z - this.pos.z) < 0.7) this.flock.eatSeed(t.seed);
            this.claim = null;
            this.finish();
          }
          break;
        case 'special': if (this.clipDone || t.t > 8) this.finish(); break;
        case 'sleep':
          if (t.t > t.check) {
            t.check = t.t + 1.2;
            if (!this.flock.isSleepTime(this)) {
              this.freeze = false; this.task = null;
              if (this.kit.specials.length && Math.random() < 0.6) this.doSpecial();
            }
          }
          if ((this.zT -= dt) <= 0) {
            this.zT = rnd(2.2, 3.6);
            this.flock.fx?.zzz(this.pos.x - this.facing * this.w * 0.2, this.pos.y + this.h * 0.75, this.pos.z + 0.05);
          }
          break;
        case 'walk': {
          const dx = t.tx - this.pos.x, dz = t.tz - this.pos.z, d = Math.hypot(dx, dz);
          const step = t.speed * dt;
          if (d <= step || t.t > t.max) { this.pos.x = t.tx; this.pos.z = t.tz; this.pos.y = w.heightAt(this.pos.x, this.pos.z); this.setAct('idle'); this.finish(); break; }
          const nx = this.pos.x + dx / d * step, nz = this.pos.z + dz / d * step;
          if (!w.walkable(nx, nz, this.kit.wader, this.pos.x, this.pos.z)) { this.setAct('idle'); this.finish(); break; }
          this.face(dx);
          this.pos.x = nx; this.pos.z = nz;
          const gy = w.heightAt(nx, nz);
          this.pos.y += (gy - this.pos.y) * ease(dt, 16);
          break;
        }
        case 'hop': {
          t.vy -= GRAV * dt;
          // every step of the jump must stay on walkable ground of about the same height
          const nx = this.pos.x + t.vx * dt, nz = this.pos.z + t.vz * dt;
          if (w.walkable(nx, nz, this.kit.wader, this.pos.x, this.pos.z) && Math.abs(w.heightAt(nx, nz) - t.y0) <= 0.3) { this.pos.x = nx; this.pos.z = nz; }
          else { t.vx = 0; t.vz = 0; }
          this.pos.y += t.vy * dt;
          const gy = w.heightAt(this.pos.x, this.pos.z);
          if (t.vy < 0 && this.pos.y <= gy) { this.pos.y = gy; this.setAct('idle'); this.finish(); }
          break;
        }
        case 'leave': {                                     // sold: off the plateau, then gone
          const dx = t.tx - this.pos.x, dz = t.tz - this.pos.z, d = Math.hypot(dx, dz);
          const step = t.speed * dt;
          this.face(dx);
          if (d <= step) { this.gone = true; break; }
          this.pos.x += dx / d * step; this.pos.z += dz / d * step;
          if (t.fly) this.pos.y += t.climb * dt;
          else {
            const gy = w.heightAt(this.pos.x, this.pos.z);
            if (gy < -1) { this.gone = true; break; }        // off the edge of the garden: out of sight
            this.pos.y += (gy - this.pos.y) * ease(dt, 16);
          }
          break;
        }
        case 'fly': {
          t.s = Math.min(t.len, t.s + t.speed * dt);
          const p = t.curve.getPointAt(t.s / t.len, _v);
          this.face(p.x - this.pos.x);
          this.pos.copy(p);
          if (t.s >= t.len) {
            // the ground changed under the landing spot (pond dug, decor put there): land nearby instead
            if (!t.perch && !w.walkable(t.dest.x, t.dest.z, this.kit.wader)) {
              const s2 = w.randomSpot({ near: t.dest, r: 3, wader: this.kit.wader }) || w.randomSpot();
              if (s2) { this.flyTo(s2, { then: t.then }); break; }
            }
            this.pos.copy(t.dest);
            if (t.perch) this.perch = t.perch;
            else this.pos.y = w.heightAt(this.pos.x, this.pos.z);
            this.setAct('idle');
            this.finish();
          }
          break;
        }
      }
    }
    this.animate(dtMs);
    this.mesh.position.set(this.pos.x, this.pos.y + this.bias * Math.sin(PITCH), this.pos.z + this.bias * Math.cos(PITCH));
    // light & shade (tree canopies, terrain), smoothed
    if ((this.shadeT -= dt) <= 0) { this.shadeT = 0.3; this.shadeGoal = this.computeShade(); }
    this.shade += (this.shadeGoal - this.shade) * ease(dt, 5);
    const sel = this === this.flock.selected ? 1.18 : 1;
    setQuadColor(this.geo, this.shade * sel, this.shade * sel, this.shade * sel);
  }
  computeShade() {
    const env = this.flock.env;
    if (!env.isSun || env.day < 0.05) return 1;
    const L = env.dir, w = this.world;
    const px = this.pos.x, py = this.pos.y + this.h * 0.35, pz = this.pos.z;
    for (const tr of w.trees) {
      _c.set(tr.x - px, tr.y + tr.h * 0.62 - py, tr.z - pz);
      const tt = _c.dot(L);
      if (tt <= 0) continue;
      if (_c.lengthSq() - tt * tt < tr.r * tr.r * 0.8) return 0.58;
    }
    for (let s = 0.35; s < 8; s += 0.35) {
      if (w.heightAt(px + L.x * s, pz + L.z * s) > py + L.y * s) return 0.58;
    }
    return 1;
  }
}

/* ================================================================ contact shadows & seeds */

function makeBlobs(scene, cap) {
  const tex = pixelTexture(paintBlob());
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
  aAlpha.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAlpha', aAlpha);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tBlob: { value: tex }, uStrength: { value: 1 } },
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute float aAlpha; varying float vA; varying vec2 vUv;
      void main() { vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tBlob; uniform float uStrength; varying float vA; varying vec2 vUv;
      void main() { float a = texture2D(tBlob, vUv).a * vA * uStrength; if (a < 0.01) discard; gl_FragColor = vec4(0.02, 0.03, 0.07, a); }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, aAlpha, mat };
}

function makeSeedMesh(scene, cap) {
  const c = paintSeed();
  const tex = pixelTexture(c);
  const geo = new THREE.PlaneGeometry(c.width * 0.05, c.height * 0.05).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/* ================================================================ the flock */

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Flock {
  constructor(scene, world, fx) {
    this.scene = scene; this.world = world; this.fx = fx;
    this.birds = [];
    this.seeds = [];
    this.selected = null;
    this.env = { night: 0, day: 1, hour: 12, dir: new THREE.Vector3(0, 1, 0), isSun: true };
    this.blobs = makeBlobs(scene, 400);
    this.seedMesh = makeSeedMesh(scene, 240);
    this.gen = 0;
  }
  get count() { return this.birds.length; }

  // arrive: fly in from outside the garden; at: {x, y, z} — appear right there
  // with a hop (a hatchling in the nest).
  async add(rec, { arrive = false, at = null } = {}) {
    const gen = this.gen;
    const kit = await loadKit(rec.species, rec.variant);
    if (gen !== this.gen || this.birds.some(o => o.rec.uid === rec.uid)) return null;   // cleared / added meanwhile
    const b = new Bird(this, kit, rec);
    const w = this.world;
    if (at) {
      b.pos.set(at.x, at.y, at.z);
      if (kit.clips.jump) b.hop(0.25, () => b.doIdle(rnd(2, 4)));
      else b.doIdle(rnd(2, 4));
    } else if (arrive && kit.canFly) {
      const a = Math.random() * Math.PI * 2;
      b.pos.set(Math.cos(a) * 22, 7 + Math.random() * 3, Math.sin(a) * 15 - 2);
      const s = w.randomSpot({ wader: kit.wader }) || { x: 0, y: 0, z: 0 };
      b.flyTo(s, { high: true });
    } else {
      const p = !kit.big && kit.canFly && Math.random() < 0.25 ? this.freePerch(b, () => true) : null;
      if (p) { b.pos.set(p.x, p.y, p.z); p.taken = b; b.perch = p; }
      else {
        let s = null;
        for (let k = 0; k < 20 && !s; k++) {
          const c = w.randomSpot({ wader: kit.wader && Math.random() < 0.5 });
          if (c && b.spotOk(c.x, c.z)) s = c;
        }
        s = s || w.randomSpot() || { x: 0, y: 0, z: 0 };
        b.pos.set(s.x, s.y, s.z);
      }
      b.doIdle(rnd(0.5, 3));
    }
    this.scene.add(b.mesh);
    this.birds.push(b);
    this.rank();
    return b;
  }
  // Unique depth offset per bird, ordered by id (see Bird constructor).
  rank() {
    const num = b => parseInt(String(b.rec.uid).replace(/\D+/g, ''), 10) || 0;
    const sorted = [...this.birds].sort((a, b) => num(a) - num(b) || (a.rec.uid < b.rec.uid ? -1 : 1));
    sorted.forEach((b, i) => { b.bias = 0.003 + i * 0.0035; });
  }
  get(uid) { return this.birds.find(b => b.rec.uid === uid) || null; }
  // The terrain was rebuilt (pond dug / filled): seeds in the water are gone, the rest lie on the new ground.
  groundChanged() {
    this.seeds = this.seeds.filter(s => this.world.walkable(s.x, s.z));
    for (const s of this.seeds) { s.gy = this.world.heightAt(s.x, s.z); s.y = Math.max(s.y, s.gy + 0.012); if (s.rest) s.y = s.gy + 0.012; }
  }
  updateRec(rec) { const b = this.get(rec.uid); if (b) b.rec = rec; }
  // A sold bird leaves: flying up and away, or (flightless) running off the
  // nearest edge of the plateau; it is removed once it is out of the garden.
  sendAway(uid) {
    const b = this.get(uid);
    if (!b || b.leaving) return null;
    b.leaving = true;
    b.leavePerch();
    if (b.task && b.task.perch && b.task.perch.taken === b) b.task.perch.taken = null;
    if (this.selected === b) this.selected = null;
    b.freeze = false;
    if (b.kit.canFly) {
      const d = new THREE.Vector3(b.pos.x, 0, b.pos.z + 2);
      if (d.lengthSq() < 1) d.set(1, 0, 0);
      d.normalize();
      b.task = { type: 'leave', tx: b.pos.x + d.x * 34, tz: b.pos.z + d.z * 26, speed: FLY * 1.35, fly: true, climb: 2.4, t: 0 };
      b.setAct('fly');
    } else {
      const exits = [[-3.8, 13], [-19, b.pos.z], [19, b.pos.z]];
      exits.sort((p, q) => Math.hypot(p[0] - b.pos.x, p[1] - b.pos.z) - Math.hypot(q[0] - b.pos.x, q[1] - b.pos.z));
      b.task = { type: 'leave', tx: exits[0][0], tz: exits[0][1], speed: RUN * 1.4, fly: false, t: 0 };
      b.setAct(b.kit.clips.run ? 'run' : 'walk');
    }
    return b;
  }
  // The decor changed: perches that are gone send their birds back to the ground.
  perchesChanged() {
    const live = new Set(this.world.perches);
    for (const b of this.birds) {
      if (b.leaving) continue;
      const lost = b.perch && !live.has(b.perch);
      const lostTarget = b.task && b.task.type === 'fly' && b.task.perch && !live.has(b.task.perch);
      if (!lost && !lostTarget) continue;
      if (lost) b.perch = null;
      b.dropTask(); b.freeze = false;
      const s = this.world.randomSpot({ near: b.pos, r: 3 }) || this.world.randomSpot() || { x: 0, y: 0, z: 0 };
      if (b.kit.canFly) b.flyTo(s);
      else { b.pos.y = this.world.heightAt(b.pos.x, b.pos.z); b.doIdle(rnd(1, 2)); }
    }
  }
  remove(b) {
    b.leavePerch();
    if (b.task && b.task.perch && b.task.perch.taken === b) b.task.perch.taken = null;
    this.scene.remove(b.mesh);
    b.geo.dispose();
    this.birds = this.birds.filter(o => o !== b);
    if (this.selected === b) this.selected = null;
    this.rank();
  }
  clear() {
    this.gen++;
    for (const b of [...this.birds]) this.remove(b);
    for (const p of this.world.perches) p.taken = null;
  }

  /* ---------- queries used by the birds ---------- */
  isSleepTime(b) {
    if (b.kit.def.id === 'kiwi') return this.env.day > 0.55 + b.sleepBias;   // nocturnal
    return this.env.night > 0.6 + b.sleepBias;
  }
  freePerch(b, filter, nearest = false) {
    // (a reservation counts only while its bird sits there or is flying there)
    const held = p => p.taken && !p.taken.gone && (p.taken.perch === p || (p.taken.task && p.taken.task.perch === p));
    const free = this.world.perches.filter(p => !held(p) && filter(p));
    if (!free.length) return null;
    if (!nearest) return pick(free);
    free.sort((p, q) => ((p.x - b.pos.x) ** 2 + (p.z - b.pos.z) ** 2) - ((q.x - b.pos.x) ** 2 + (q.z - b.pos.z) ** 2));
    return free[Math.floor(Math.random() * Math.min(4, free.length))];
  }
  nearCover(p) {
    return this.world.obstacles.some(o => o.r >= 0.4 && (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < (o.r + 0.8) ** 2);
  }
  coverSpot(b) {
    const cands = this.world.obstacles.filter(o => o.r >= 0.4);
    if (!cands.length) return null;
    cands.sort((o, q) => ((o.x - b.pos.x) ** 2 + (o.z - b.pos.z) ** 2) - ((q.x - b.pos.x) ** 2 + (q.z - b.pos.z) ** 2));
    const o = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
    const a = Math.random() * Math.PI * 2;
    return { x: o.x + Math.cos(a) * (o.r + 0.35), z: o.z + Math.abs(Math.sin(a)) * (o.r + 0.35) };
  }
  nearestSeed(b, r) {
    let best = null, bd = r * r;
    for (const s of this.seeds) {
      if (!s.rest || this.birds.reduce((n, o) => n + (o.claim === s && o !== b), 0) >= 3) continue;
      const d = (s.x - b.pos.x) ** 2 + (s.z - b.pos.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  addSeeds(x, z) {
    const w = this.world;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.7;
      const sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
      if (!w.walkable(sx, sz)) continue;
      const gy = w.heightAt(sx, sz);
      this.seeds.push({ x: sx, z: sz, gy, y: gy + 1.6 + Math.random() * 0.8, vy: 0, rot: Math.random() * 6.3, rest: false, age: 0 });
    }
    while (this.seeds.length > 220) this.seeds.shift();
  }
  eatSeed(s) {
    const i = this.seeds.indexOf(s);
    if (i >= 0) this.seeds.splice(i, 1);
    // a little more for the rest of the pile: eat a neighbour too
    const j = this.seeds.findIndex(o => (o.x - s.x) ** 2 + (o.z - s.z) ** 2 < 0.15);
    if (j >= 0 && Math.random() < 0.5) this.seeds.splice(j, 1);
  }

  /* ---------- interaction ---------- */
  // Startle every bird that can fly: up into a loop over the garden, then down elsewhere.
  startle(cx = 0, cz = -1) {
    for (const b of this.birds) {
      if (b === this.selected) continue;
      b.freeze = false;
      if (!b.kit.canFly) { b.dropTask(); b.goNear({ x: b.pos.x + rnd(-3, 3), z: b.pos.z + rnd(-3, 3) }, 1, null, { run: true }); continue; }
      const R = rnd(4.5, 8), alt = rnd(3.5, 6.5), a0 = Math.random() * Math.PI * 2, dir = Math.random() < 0.5 ? 1 : -1;
      const loop = [];
      for (let k = 0; k < 4; k++) {
        const a = a0 + dir * k * Math.PI * 0.55;
        loop.push(new THREE.Vector3(cx + Math.cos(a) * R, alt + Math.sin(k * 1.7) * 0.6, cz + Math.sin(a) * R * 0.7));
      }
      let dest = null, perch = null;
      if (!b.kit.big && Math.random() < 0.4) { perch = this.freePerch(b, () => true); dest = perch; }
      if (!dest) dest = this.world.randomSpot({ wader: b.kit.wader && Math.random() < 0.3 }) || { x: 0, y: 0, z: 0 };
      b.dropTask();
      b.flyTo(dest, { perch, loop, then: () => b.doIdle(rnd(1, 3)) });
    }
  }
  select(b) {
    this.selected = b;
    if (b && b.task && (b.task.type === 'walk')) { b.setAct('idle'); b.dropTask(); b.doIdle(rnd(2, 4)); }
    if (b && !b.task?.type?.match(/fly|sleep/) && b.kit.clips.jump && !b.perch) b.hop(0);
  }
  // Screen-space pick: the bird whose sprite rectangle contains (sx, sy), nearest first.
  pick(sx, sy, camera, W, H, pad = 8) {
    let best = null, bestD = Infinity;
    for (const b of this.birds) {
      if (b.leaving) continue;
      _p.set(b.pos.x - b.w / 2, b.pos.y, b.pos.z).project(camera);
      const x0 = (_p.x + 1) / 2 * W, y0 = (1 - _p.y) / 2 * H, z0 = _p.z;
      _p.set(b.pos.x + b.w / 2, b.pos.y + b.h, b.pos.z).project(camera);
      const x1 = (_p.x + 1) / 2 * W, y1 = (1 - _p.y) / 2 * H;
      if (z0 > 1) continue;
      if (sx >= Math.min(x0, x1) - pad && sx <= Math.max(x0, x1) + pad && sy >= Math.min(y0, y1) - pad && sy <= Math.max(y0, y1) + pad) {
        const d = camera.position.distanceToSquared(b.pos);
        if (d < bestD) { bestD = d; best = b; }
      }
    }
    return best;
  }

  /* ---------- per frame ---------- */
  update(dt, env) {
    Object.assign(this.env, env);
    const dtMs = dt * 1000;
    for (const b of this.birds) b.update(dt, dtMs);
    for (const b of this.birds.filter(o => o.gone)) this.remove(b);
    // contact shadows
    const bl = this.blobs;
    let n = 0;
    for (const b of this.birds) {
      if (b.perch || n >= bl.aAlpha.count) continue;
      const gy = this.world.heightAt(b.pos.x, b.pos.z);
      if (gy < -1 || this.world.inPond(b.pos.x, b.pos.z)) continue;
      const alt = Math.max(0, b.pos.y - gy);
      const a = 0.42 * (1 - clamp(alt / 6, 0, 0.85));
      const s = b.kit.texel * b.kit.clips.idle.u.w * (0.75 + Math.min(alt, 4) * 0.08);
      _q.identity(); _s.set(s, 1, s * 0.9); _p.set(b.pos.x, gy + 0.015, b.pos.z);
      _m.compose(_p, _q, _s);
      bl.mesh.setMatrixAt(n, _m);
      bl.aAlpha.array[n] = a;
      n++;
    }
    bl.mesh.count = n;
    bl.mesh.instanceMatrix.needsUpdate = true;
    bl.aAlpha.needsUpdate = true;
    bl.mat.uniforms.uStrength.value = 0.55 + 0.45 * (1 - env.day);
    // seeds: fall, bounce once, rest; old ones fade away
    const sm = this.seedMesh;
    let k = 0;
    this.seeds = this.seeds.filter(s => (s.age += dt) < 45);
    for (const s of this.seeds) {
      if (!s.rest) {
        s.vy -= GRAV * dt; s.y += s.vy * dt;
        if (s.y <= s.gy + 0.012) { s.y = s.gy + 0.012; if (s.vy < -2) s.vy *= -0.25; else { s.rest = true; s.vy = 0; } }
      }
      _q.setFromAxisAngle(_s.set(0, 1, 0), s.rot);
      _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(1, 1, 1));
      sm.setMatrixAt(k++, _m);
    }
    sm.count = k;
    sm.instanceMatrix.needsUpdate = true;
  }
}

// The bird's idle frame from its (recoloured) atlas, in the clip shape the
// bird card (garden-ui.js) draws its portrait from.
export function portraitClip(kit) {
  const p = kit.portrait;
  return { img: p.canvas, frames: [{ x: p.x, y: p.y, w: p.w, h: p.h, d: 100 }], u: { lx: 0, ty: 0, w: p.w, h: p.h } };
}
