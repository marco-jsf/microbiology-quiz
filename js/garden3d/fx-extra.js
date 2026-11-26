// Extra effects of the 2.5D garden: falling blossom petals and soft sun shafts
// (the shop effects 'petals' and 'sunbeams'), the puff of an egg hatching and
// the little 4-point pixel twinkles (ready eggs, rare birds, fresh decor).
//
// Everything is pooled: meshes and materials are made once, the per-frame
// update only moves, retextures and fades them. All particles are unlit
// camera-facing quads; the ones that belong to the garden (petals, shell bits,
// feathers, dust) are tinted every frame with the light the sky reports, so
// they dim at night just like the lit sprites around them. Twinkles and beams
// are light themselves (no fog, colours > 1 glow through the bloom).

import * as THREE from 'three';
import { pixelTexture } from './sprites.js';
import { spriteFromData } from './pixelart.js';
import { SPRITE_DATA } from '../garden-art.js';
import { rnd, clamp, smoothstep, pick } from './util.js';
import { WATER, LOW } from './config.js';

const TAU = Math.PI * 2;
const FX_TEXEL = 0.05;                // world units per pixel of petals / feathers / shell bits
const SPARK_TEXEL = 0.22 / 7;         // a size-1 twinkle is 7 px = 0.22 units across
const PETAL_POOL = 50;
const DEBRIS_POOL = 80;
const SPARK_POOL = 48;
const BEAMS = 6;
const SHELL = {
  normal: ['#f6efdc', '#ece1c5', '#cdbd98'],
  rare: ['#e6f2f6', '#cde2ea', '#a5c3d2'],
  epic: ['#e6d8f4', '#cfb9e6', '#a88dcc'],
};
// Sprites are lit with this normal (see sprites.js); the tint imitates it.
const SPRITE_N = new THREE.Vector3(0, 0.78, 0.62).normalize();
const DEFAULT_BOUNDS = { x0: -15, x1: 15, z0: -12.6, z1: 9.4 };
const COL_WHITE = new THREE.Color().setRGB(1.55, 1.5, 1.35);
const COL_GOLD = new THREE.Color().setRGB(2.1, 1.5, 0.55);

/* ---------------------------------------------------------------- painting */

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// rows of chars → canvas; pal: char → '#rrggbb'
function paintRows(rows, pal) {
  const c = canvasOf(rows[0].length, rows.length), g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (!pal[ch]) return;
    g.fillStyle = pal[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return c;
}

// Curved eggshell bits: light outside, darker rim (L / M / D = the tier's three shell colours).
const SHELL_SHAPES = [
  ['LM', 'MD'],
  ['LLM', '.MD'],
  ['L.', 'MM', '.D'],
  ['LM'],
  ['.LL', 'LMD'],
];
function shellTextures(cols) {
  const pal = { L: cols[0], M: cols[1], D: cols[2] };
  return SHELL_SHAPES.map(rows => ({ tex: pixelTexture(paintRows(rows, pal)), w: rows[0].length, h: rows.length }));
}

// Little pixel cloud of the hatching "poof" (bright, darker underside).
function paintPuff() {
  return paintRows([
    '..WWWW..',
    '.WWWWWW.',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWWW',
    '.wwwwww.',
    '..wwww..',
  ], { W: '#fbf8ee', w: '#ddd8c6' });
}

// One frame of the 4-point twinkle (port of drawSparkle in garden-art.js):
// arms of `arm` pixels, the outermost one half transparent, faint diagonal
// glints around the peak, a white core.
function paintSparkle(arm, diag) {
  const c = canvasOf(7, 7), g = c.getContext('2d');
  const put = (x, y, col, a) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let i = 1; i <= arm; i++) {
    const a = i === arm && arm > 1 ? 0.55 : 1;
    put(3 + i, 3, '#fff3b8', a); put(3 - i, 3, '#fff3b8', a);
    put(3, 3 + i, '#fff3b8', a); put(3, 3 - i, '#fff3b8', a);
  }
  if (diag) for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) put(3 + dx, 3 + dy, '#fff3b8', 0.45);
  put(3, 3, '#ffffff', 1);
  return c;
}
// Frame for a twinkle phase 0..1 (same growth curve as drawSparkle).
function sparkleFrame(p) {
  const grow = Math.sin(clamp(p, 0, 1) * Math.PI);
  const arm = Math.round(grow * 3);
  if (arm >= 3) return 4;
  if (arm === 2) return grow > 0.75 ? 3 : 2;
  return arm;
}

// Soft light shaft: white, alpha only. Across: a smooth bell with a brighter
// core; along (v = 0 at the ground): fades in just above the ground, even
// through the lower half, dissolving towards the top. Smooth filtering on purpose.
function paintBeam() {
  const W = 32, H = 128, c = canvasOf(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H;                          // canvas top = top of the beam
    const along = smoothstep(0, 0.12, v) * (1 - smoothstep(0.48, 1, v)) * (0.85 + 0.15 * Math.sin(v * 9.0));
    for (let x = 0; x < W; x++) {
      const u = Math.abs((x + 0.5) / W * 2 - 1);
      const across = Math.pow(1 - u * u, 2.2) * 0.75 + Math.pow(Math.max(0, 1 - u * 2.2), 2) * 0.25;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * clamp(along * across, 0, 1));
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------------------------------------------------------- module */

export function createExtraFx(scene) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const owned = { tex: [], mats: [], geos: [quad], meshes: [] };
  const own = (kind, x) => { owned[kind].push(x); return x; };

  const petalTex = [0, 1, 2].map(f => own('tex', pixelTexture(spriteFromData(SPRITE_DATA.petal, f, false))));
  const featherTex = [0, 1].map(f => own('tex', pixelTexture(spriteFromData(SPRITE_DATA.feather, f, false))));
  const shellTex = {};
  for (const k in SHELL) { shellTex[k] = shellTextures(SHELL[k]); shellTex[k].forEach(s => own('tex', s.tex)); }
  const puffTex = own('tex', pixelTexture(paintPuff()));
  const sparkTex = [[0, false], [1, false], [2, false], [2, true], [3, true]].map(([a, d]) => own('tex', pixelTexture(paintSparkle(a, d))));
  const beamTex = own('tex', paintBeam());

  function quadMesh(map, { order, fog = true, blending = THREE.NormalBlending } = {}) {
    const mat = own('mats', new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0, fog, blending }));
    const m = own('meshes', new THREE.Mesh(quad, mat));
    m.visible = false;
    m.renderOrder = order;
    scene.add(m);
    return { m, mat };
  }

  /* ---- shared per-frame state ---- */
  const lit = new THREE.Color(1, 1, 1);           // light on an upright sprite right now
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), side = new THREE.Vector3();
  const wind = new THREE.Vector3(1, 0, 0.25).normalize();
  let windBase = Math.atan2(wind.z, wind.x), windSet = false, windSpeed = 0.4;
  let info = null;
  const camPos = new THREE.Vector3(0, 20, 20);
  const heightAt = (x, z) => (info && info.heightAt ? info.heightAt(x, z) : 0);
  const bounds = () => (info && info.bounds) || DEFAULT_BOUNDS;

  // Lambert of an upright sprite (normal SPRITE_N) under the sky's hemisphere + sun.
  function updateLit(st) {
    if (!st || !st.skyC || !st.sunC) { lit.setRGB(1, 1, 1); return; }
    const w = 0.5 * SPRITE_N.y + 0.5, hi = st.hemiI ?? 0.7, si = st.sunI ?? 0.9;
    const sk = st.skyC, gn = st.gndC || st.skyC, su = st.sunC;
    const d = st.dir ? Math.max(0, SPRITE_N.dot(st.dir)) : 0.8;
    lit.setRGB((gn.r + (sk.r - gn.r) * w) * hi + su.r * si * d,
      (gn.g + (sk.g - gn.g) * w) * hi + su.g * si * d,
      (gn.b + (sk.b - gn.b) * w) * hi + su.b * si * d);
  }

  // Petals drift from the blossom trees towards the middle of the garden; the
  // direction meanders slowly around that, the strength comes in gusts.
  function updateWind(time) {
    if (!windSet && info) {
      const b = bounds(), bl = info.blossoms || [];
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      if (bl.length) {
        let mx = 0, mz = 0;
        for (const t of bl) { mx += t.x; mz += t.z; }
        mx /= bl.length; mz /= bl.length;
        if (Math.hypot(cx - mx, cz - mz) > 1) windBase = Math.atan2(cz - mz, cx - mx);
      }
      windSet = true;
    }
    const a = windBase + 0.4 * Math.sin(time * 0.043) + 0.15 * Math.sin(time * 0.11 + 1.3);
    wind.set(Math.cos(a), 0, Math.sin(a));
    windSpeed = 0.42 + 0.2 * Math.sin(time * 0.21) + 0.1 * Math.sin(time * 0.57 + 2.0);
  }

  /* ================================================================ petals */
  const petals = [];
  for (let i = 0; i < PETAL_POOL; i++) petals.push({ ...quadMesh(petalTex[0], { order: 6 }), on: false });
  let petalsOn = false, petalsWarm = false, spawnAcc = 0;
  const PETAL_SIZE = 3 * FX_TEXEL;
  const PETAL_LIFT = PETAL_SIZE * 0.5 * 0.75 + 0.006;   // centre height that keeps the facing quad above the ground

  // Where a petal comes to rest: the lawn, or floating on the pond (reused object, no garbage).
  const surf = { y: 0, water: false };
  function surfaceAt(x, z) {
    let g = heightAt(x, z);
    if (!Number.isFinite(g)) g = 0;
    surf.water = g < WATER - 0.03 && g > LOW + 0.5;
    surf.y = surf.water ? WATER : g;
    return surf;
  }

  function spawnPetal(p, prewarm) {
    const bl = (info && info.blossoms) || [];
    const b = bounds();
    let x, y, z;
    if (bl.length && Math.random() < 0.6) {           // out of a blossom canopy
      const t = pick(bl);
      x = t.x + rnd(-0.36, 0.36) * t.w;
      y = t.y + t.h * rnd(0.42, 0.9);
      z = t.z + rnd(-0.35, 0.55);
    } else {                                          // blown in from somewhere upwind
      x = rnd(b.x0, b.x1) - wind.x * 2.5;
      z = rnd(b.z0 + 1, b.z1) - wind.z * 2.5;
      y = heightAt(x, z) + rnd(2.2, 4.4);
    }
    p.fall = rnd(0.26, 0.42);
    p.wk = rnd(0.7, 1.25);
    p.sway = rnd(0.18, 0.4);
    p.freq = rnd(1.4, 2.6);
    p.ph = rnd(0, TAU);
    p.spin = rnd(0.32, 0.65);
    p.ft = rnd(0, p.spin);
    p.frame = (Math.random() * 3) | 0;
    p.flip = Math.random() < 0.5 ? -1 : 1;
    p.state = 0;                                      // 0 falling, 1 lying, 2 floating
    p.rest = 0;
    p.age = 0;
    p.fadeIn = 0;
    p.fade = 1;
    if (prewarm) {                                    // somewhere along its way already
      const k = Math.random();
      const g = heightAt(x, z);
      const drop = (y - g) * k;
      y -= drop;
      const t = drop / p.fall;
      x += wind.x * windSpeed * p.wk * t;
      z += wind.z * windSpeed * p.wk * t;
      p.fadeIn = 0.6;
    }
    p.x = x; p.y = y; p.z = z;
    p.on = true;
    p.m.visible = true;
    p.mat.map = petalTex[p.frame];
  }

  function updatePetals(dt, time, day, camera) {
    let alive = 0;
    for (const p of petals) if (p.on) alive++;
    if (petalsOn && info) {
      const target = Math.round(14 + 30 * clamp(day, 0, 1));
      if (!petalsWarm) {                              // fill the air at once when switched on
        petalsWarm = true;
        for (const p of petals) if (!p.on && alive < target * 0.85) { spawnPetal(p, true); alive++; }
      }
      spawnAcc = Math.min(spawnAcc + dt * 5, 3);
      for (const p of petals) {
        if (alive >= target || spawnAcc < 1) break;
        if (!p.on) { spawnPetal(p, false); alive++; spawnAcc -= 1; }
      }
    }
    const b = bounds();
    const px = -wind.z, pz = wind.x;                  // sideways to the wind
    const w = windSpeed;
    for (const p of petals) {
      if (!p.on) continue;
      if (p.state === 0) {
        const s = Math.sin(time * p.freq + p.ph), c = Math.cos(time * p.freq * 0.8 + p.ph);
        p.x += (wind.x * w * p.wk + px * c * p.sway) * dt;
        p.z += (wind.z * w * p.wk + pz * c * p.sway) * dt;
        p.y -= p.fall * (1 + 0.45 * s) * dt;          // flutters: sinks faster on the down-swing
        p.ft += dt;
        if (p.ft > p.spin) {                          // tumbling
          p.ft = 0;
          p.frame = (p.frame + 1) % 3;
          if (p.frame === 0 && Math.random() < 0.5) p.flip = -p.flip;
          p.mat.map = petalTex[p.frame];
        }
        const sf = surfaceAt(p.x, p.z);
        if (p.y <= sf.y + PETAL_LIFT) {
          p.y = sf.y + PETAL_LIFT;
          p.state = sf.water ? 2 : 1;
          p.rest = rnd(1.6, 3.6);
        }
      } else {
        if (p.state === 2) { p.x += wind.x * w * 0.12 * dt; p.z += wind.z * w * 0.12 * dt; }   // drifting on the pond
        p.rest -= dt;
        if (p.rest <= 0) p.fade -= dt / 1.2;
      }
      if (p.x < b.x0 - 2 || p.x > b.x1 + 2 || p.z < b.z0 - 2 || p.z > b.z1 + 2) p.fade -= dt / 0.6;
      if (!petalsOn) p.fade -= dt / 0.8;
      p.age += dt;
      if (p.age > 40) p.fade -= dt;                     // safety net: never linger forever
      p.fadeIn = Math.min(1, p.fadeIn + dt / 0.6);
      if (p.fade <= 0) { p.on = false; p.m.visible = false; continue; }
      p.mat.opacity = p.fadeIn * clamp(p.fade, 0, 1) * 0.95;
      p.mat.color.copy(lit);
      p.m.position.set(p.x, p.y, p.z);
      p.m.quaternion.copy(camera.quaternion);
      p.m.scale.set(p.flip * PETAL_SIZE, PETAL_SIZE, 1);
    }
  }

  /* ================================================================ sunbeams */
  const beamGeoAttr = () => {
    const g = own('geos', new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  };
  const beams = [];
  for (let i = 0; i < BEAMS; i++) {
    const mat = own('mats', new THREE.MeshBasicMaterial({
      map: beamTex, transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0,
    }));
    const m = own('meshes', new THREE.Mesh(beamGeoAttr(), mat));
    m.frustumCulled = false;                          // vertices move every frame
    m.visible = false;
    m.renderOrder = 6;
    scene.add(m);
    beams.push({ m, mat, slot: i, placed: false, g: new THREE.Vector3() });
  }
  let beamsOn = false, beamAmt = 0;
  const beamCol = new THREE.Color(), warm = new THREE.Color('#fff0c8');

  // Each beam owns a slice of the garden's width, so they never bunch up.
  function placeBeam(bm, initial) {
    const b = bounds();
    const span = (b.x1 - b.x0 - 4) / BEAMS;
    const x = b.x0 + 2 + span * (bm.slot + rnd(0.15, 0.85));
    const z = rnd(b.z0 + 4, b.z1 - 1.5);
    bm.g.set(x, heightAt(x, z), z);
    bm.w = rnd(0.9, 2.2);
    bm.h = rnd(7.5, 10.5);
    bm.a = rnd(0.55, 1);
    bm.per = rnd(7, 13);
    bm.ph = rnd(0, TAU);
    bm.life = rnd(16, 28);
    bm.age = initial ? rnd(0, bm.life) : 0;
    bm.placed = true;
  }

  function updateBeams(dt, time, st, camera) {
    beamAmt = clamp(beamAmt + (beamsOn ? dt : -dt) / 1.2, 0, 1);
    const day = st ? clamp(st.day ?? 1, 0, 1) : 1;
    const show = beamAmt * day;
    if (show <= 0.002 || !info) { for (const bm of beams) bm.m.visible = false; return; }
    // lean with the sun: the top of a shaft points towards it (east = +x, south = +z)
    const dir = st && st.dir ? st.dir : tmp2.set(0.3, 0.8, 0.4);
    const dy = Math.max(dir.y, 0.25);
    const lx = clamp(dir.x / dy * 0.8, -1.1, 1.1), lz = clamp(dir.z / dy, -2, 2) * 0.15;
    // around noon the sun stands behind the viewer: the shafts are seen almost
    // end-on and look upright, so they are weaker than the slanted ones of the
    // morning and evening
    const slant = 0.55 + 0.45 * smoothstep(0.12, 0.6, Math.abs(lx));
    beamCol.copy(warm);
    if (st && st.sunC) beamCol.lerp(st.sunC, 0.45);
    for (const bm of beams) {
      if (!bm.placed) placeBeam(bm, true);
      bm.age += dt;
      if (bm.age > bm.life) placeBeam(bm, false);
      const life = smoothstep(0, 4, bm.age) * (1 - smoothstep(bm.life - 4, bm.life, bm.age));
      const breath = 0.62 + 0.38 * Math.sin(TAU * time / bm.per + bm.ph);
      const op = show * slant * bm.a * breath * life * 0.17;
      bm.m.visible = op > 0.001;
      if (!bm.m.visible) continue;
      bm.mat.opacity = op;
      bm.mat.color.copy(beamCol);
      // a ribbon from the ground point up towards the sun, turned to face the camera
      const g = bm.g, H = bm.h;
      tmp.set(lx * H, H, lz * H);                                    // ground → top
      side.copy(camPos).sub(g).cross(tmp).normalize();
      const w0 = bm.w * 0.5, w1 = bm.w * 0.75;                      // a little wider at the top
      const a = bm.m.geometry.attributes.position.array;
      a[0] = g.x - side.x * w0; a[1] = g.y - side.y * w0; a[2] = g.z - side.z * w0;
      a[3] = g.x + side.x * w0; a[4] = g.y + side.y * w0; a[5] = g.z + side.z * w0;
      a[6] = g.x + tmp.x + side.x * w1; a[7] = g.y + tmp.y + side.y * w1; a[8] = g.z + tmp.z + side.z * w1;
      a[9] = g.x + tmp.x - side.x * w1; a[10] = g.y + tmp.y - side.y * w1; a[11] = g.z + tmp.z - side.z * w1;
      bm.m.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* ================================================================ twinkles */
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) sparks.push({ ...quadMesh(sparkTex[0], { order: 8, fog: false }), on: false, pos: new THREE.Vector3(), col: new THREE.Color() });
  let sparkI = 0;

  function addSparkle(pos, size, delay, col) {
    let s = null;
    for (let k = 0; k < SPARK_POOL && !s; k++) { const c = sparks[(sparkI + k) % SPARK_POOL]; if (!c.on) s = c; }
    if (!s) s = sparks[sparkI];                        // all busy: reuse the oldest
    sparkI = (sparks.indexOf(s) + 1) % SPARK_POOL;
    s.on = true; s.t = 0; s.delay = Math.max(0, delay); s.dur = 0.9; s.size = size;
    s.pos.copy(pos); s.col.copy(col);
    s.m.visible = false;
  }

  function updateSparks(dt, camera) {
    for (const s of sparks) {
      if (!s.on) continue;
      s.t += dt;
      const p = (s.t - s.delay) / s.dur;
      if (p >= 1) { s.on = false; s.m.visible = false; continue; }
      if (p < 0) { s.m.visible = false; continue; }
      s.m.visible = true;
      s.mat.map = sparkTex[sparkleFrame(p)];
      s.mat.opacity = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
      s.mat.color.copy(s.col);
      // pulled a little towards the camera so it is never hidden by the sprite it decorates
      tmp.copy(camPos).sub(s.pos).normalize();
      s.m.position.copy(s.pos).addScaledVector(tmp, 0.25);
      s.m.quaternion.copy(camera.quaternion);
      const k = 7 * SPARK_TEXEL * s.size;
      s.m.scale.set(k, k, 1);
    }
  }

  /* ================================================================ hatching puff */
  const debris = [];
  for (let i = 0; i < DEBRIS_POOL; i++) debris.push({ ...quadMesh(puffTex, { order: 7 }), on: false, vel: new THREE.Vector3(), o: new THREE.Vector3() });
  let debrisI = 0;
  const take = () => { const d = debris[debrisI]; debrisI = (debrisI + 1) % DEBRIS_POOL; return d; };
  const DUR = 1.25;

  function launch(d, kind, pos) {
    d.on = true; d.kind = kind; d.age = 0; d.rest = false;
    d.o.copy(pos);
    d.m.visible = true;
    d.m.quaternion.identity();
  }

  function burst(pos, { rare = false, tier = 'normal' } = {}) {
    const shells = shellTex[tier] || shellTex.normal;
    const floorAt = (x, z) => Math.max(heightAt(x, z) + 0.02, pos.y - rnd(0.14, 0.3));
    // shell bits: thrown up and out, bounce-free landing around the nest
    for (let i = 0, n = rare ? 14 : 10; i < n; i++) {
      const d = take();
      launch(d, 'shell', pos);
      const s = pick(shells);
      d.mat.map = s.tex;
      d.w = s.w * FX_TEXEL; d.h = s.h * FX_TEXEL;
      d.x = pos.x + rnd(-0.06, 0.06); d.y = pos.y + rnd(-0.08, 0.03); d.z = pos.z + rnd(-0.04, 0.06);
      d.vel.set(rnd(-1.2, 1.2), rnd(0.95, 2.35), rnd(-0.55, 0.85));
      d.g = 6.6; d.maxFall = 0;
      d.floor = floorAt(d.x + d.vel.x * 0.35, d.z + d.vel.z * 0.35);
      d.flip = Math.random() < 0.5 ? -1 : 1; d.ft = 0;
    }
    // feathers: a light toss, then they sail down swaying
    for (let i = 0, n = rare ? 5 : 4; i < n; i++) {
      const d = take();
      launch(d, 'feather', pos);
      d.frame = i & 1;
      d.mat.map = featherTex[d.frame];
      d.w = 3 * FX_TEXEL; d.h = 2 * FX_TEXEL;
      d.x = pos.x + rnd(-0.09, 0.09); d.y = pos.y + rnd(0, 0.12); d.z = pos.z + rnd(-0.05, 0.05);
      d.vel.set(rnd(-0.65, 0.65), rnd(0.55, 1.1), rnd(-0.3, 0.4));
      d.g = 1.4; d.maxFall = 0.34;
      d.ph = rnd(0, TAU); d.ft = 0; d.flip = Math.random() < 0.5 ? -1 : 1;
      d.floor = floorAt(d.x, d.z);
    }
    // the "poof": little pixel clouds drifting outwards and shrinking away
    for (let i = 0; i < 6; i++) {
      const d = take();
      launch(d, 'puff', pos);
      d.mat.map = puffTex;
      d.a = (i / 6) * TAU + rnd(-0.3, 0.3);
      d.dist = rnd(0.13, 0.21);
      d.r = rnd(0.06, 0.1);
    }
    // twinkles: a few white ones, golden showers for rare birds
    const n = rare ? 8 : 3;
    for (let i = 0; i < n; i++) {
      tmp2.set(pos.x + rnd(-0.42, 0.42), pos.y + rnd(-0.08, 0.55), pos.z + rnd(-0.1, 0.15));
      addSparkle(tmp2, rare ? rnd(0.75, 1.25) : rnd(0.55, 0.8), rnd(0.03, rare ? 0.55 : 0.4),
        rare && i % 3 !== 2 ? COL_GOLD : COL_WHITE);
    }
  }

  function updateDebris(dt, time, camera) {
    for (const d of debris) {
      if (!d.on) continue;
      d.age += dt;
      if (d.age >= DUR) { d.on = false; d.m.visible = false; continue; }
      const fade = d.age < DUR - 0.4 ? 1 : (DUR - d.age) / 0.4;
      if (d.kind === 'puff') {
        const pk = d.age / 0.5;
        if (pk >= 1) { d.m.visible = false; continue; }
        const out = 1 - (1 - pk) * (1 - pk);           // ease-out travel
        const r = d.r * (1 - pk) + 0.012;
        d.m.position.set(d.o.x + Math.cos(d.a) * d.dist * (0.35 + out), d.o.y - 0.03 + out * 0.07 + Math.sin(d.a) * d.dist * 0.25 * (0.35 + out),
          d.o.z + Math.sin(d.a) * d.dist * 0.6 * (0.35 + out) + 0.05);
        d.m.scale.set(r * 2, r * 2, 1);
        d.mat.opacity = 0.9;
        d.mat.color.copy(lit).multiplyScalar(1.05);
      } else {
        if (!d.rest) {
          d.vel.y -= d.g * dt;
          if (d.maxFall) {                              // feathers: drag + sway
            d.vel.y = Math.max(d.vel.y, -d.maxFall);
            const drag = 1 - Math.min(1, dt * 1.8);
            d.vel.x *= drag; d.vel.z *= drag;
            d.x += Math.cos(d.age * 5 + d.ph) * 0.22 * dt;
            d.ft += dt;
            if (d.ft > 0.28) { d.ft = 0; d.frame ^= 1; d.mat.map = featherTex[d.frame]; }
          } else {
            d.ft += dt;
            if (d.ft > 0.11) { d.ft = 0; d.flip = -d.flip; }   // tumbling shell bit
          }
          d.x += d.vel.x * dt; d.y += d.vel.y * dt; d.z += d.vel.z * dt;
          if (d.vel.y < 0 && d.y <= d.floor) { d.y = d.floor; d.rest = true; }
        }
        d.m.position.set(d.x, d.y + d.h * 0.4, d.z);
        d.m.scale.set(d.flip * d.w, d.h, 1);
        d.mat.opacity = fade;
        d.mat.color.copy(lit);
      }
      d.m.quaternion.copy(camera.quaternion);
    }
  }

  /* ================================================================ API */
  const zero = new THREE.Vector3();
  return {
    setEnabled({ petals = false, sunbeams = false } = {}) {
      if (petals && !petalsOn) petalsWarm = false;
      petalsOn = !!petals;
      beamsOn = !!sunbeams;
    },
    burst,
    sparkle(pos, size = 1, delay = 0) { addSparkle(pos || zero, size, delay, COL_WHITE); },
    update(dt, time, st, camera, inf) {
      dt = Math.min(Math.max(dt, 0), 0.1);
      if (inf) info = inf;
      camPos.copy(camera.position);
      updateLit(st);
      updateWind(time);
      const day = st ? (st.day ?? 1) : 1;
      updatePetals(dt, time, day, camera);
      updateBeams(dt, time, st, camera);
      updateDebris(dt, time, camera);
      updateSparks(dt, camera);
    },
    dispose() {
      for (const m of owned.meshes) scene.remove(m);
      for (const m of owned.mats) m.dispose();
      for (const g of owned.geos) g.dispose();
      for (const t of owned.tex) t.dispose();
      owned.meshes.length = owned.mats.length = owned.geos.length = owned.tex.length = 0;
    },
  };
}
