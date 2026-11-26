// The garden as a small 3D diorama: a plateau with a lawn, a raised terrace
// behind a stone wall (with stairs), a sunken pond, paths, trees, bushes and
// the shop decor — everything pixel art. Also the walking / perching data the
// birds use (heights, obstacles, perches) and the far land below the plateau.
//
// The terrain is a stepped height field on a grid of SUB cells per unit. Top
// faces share one big painted ground texture (TEX texels per unit); every
// height step becomes a vertical face textured by kind (wall, stairs, pond
// bank, outer cliff).

import * as THREE from 'three';
import {
  TEX, SUB, X0, X1, Z0, Z1, LAWN, TERRACE, SHELF, DEEP, WATER, LOW, DECOR_TEXEL,
} from './config.js';
import { clamp, lerp, smoothstep, fbm, vnoise, hash2, bayer, Pix, mulberry32 } from './util.js';
import {
  PAL, paintWall, paintStep, paintBank, paintEarth, paintMeadow, paintTree, paintPine, paintBush,
  paintFarTree, paintTuft, paintReeds, paintLily, spriteFromData, stack,
} from './pixelart.js';
import { pixelTexture, patchLit, makeProp, makeQuad, spriteMaterials } from './sprites.js';
import { SPRITE_DATA } from '../garden-art.js';

export const K = { VOID: 0, LAWN: 1, TERRACE: 2, STAIR: 3, SHELF: 4, DEEP: 5 };

/* ================================================================ shape */

function terraceZRaw(x) { return -5.0 + 0.65 * Math.sin(x * 0.31 + 0.5) + 0.35 * Math.sin(x * 0.83 + 2.0); }
export const STAIRS = { x0: 2.6, x1: 4.6, cx: 3.6, steps: 4, depth: 0.45, z0: 0 };
STAIRS.z0 = Math.round(terraceZRaw(STAIRS.cx) * SUB) / SUB;
STAIRS.z1 = STAIRS.z0 + STAIRS.steps * STAIRS.depth;
export function terraceZ(x) {
  const k = smoothstep(1.2, 2.3, x) * (1 - smoothstep(4.9, 6.0, x));
  return lerp(terraceZRaw(x), STAIRS.z0, k);
}
export function frontZ(x) { return 9.0 + 0.6 * Math.sin(x * 0.37 + 1.2) + 0.35 * Math.sin(x * 0.95 + 0.3); }
function halfW(z) { return 15.0 + 0.5 * Math.sin(z * 0.45 + 0.7) + 0.3 * Math.sin(z * 1.1); }
const BACK_Z = Z0 + 0.6;
export function inPlateau(x, z) { return z < frontZ(x) && z > BACK_Z && Math.abs(x) < halfW(z); }

export const POND = { x: 8.6, z: 3.0, rx: 4.3, rz: 2.8 };
// The pond is a landscape feature the player buys in the shop ('pond' decor);
// without it that corner is plain lawn. setPondOn() + rebuilding the terrain switches it.
let pondOn = false;
// Signed distance to the pond's shore (negative = in the water); far away when there is no pond.
export function pondDist(x, z) { return pondOn ? pondSDF(x, z) : 99; }
export function pondSDF(x, z) {
  const dx = (x - POND.x) / POND.rx, dz = (z - POND.z) / POND.rz;
  return (Math.sqrt(dx * dx + dz * dz) - 1) * Math.min(POND.rx, POND.rz) + (fbm(x * 0.45, z * 0.45, 3, 5) - 0.5) * 1.3;
}

function rawCell(x, z) {
  if (!inPlateau(x, z)) return [K.VOID, LOW];
  if (x > STAIRS.x0 && x < STAIRS.x1 && z >= STAIRS.z0 && z < STAIRS.z1) {
    const i = Math.floor((z - STAIRS.z0) / STAIRS.depth);
    return [K.STAIR, TERRACE * (STAIRS.steps - i) / (STAIRS.steps + 1)];
  }
  if (z < terraceZ(x)) return [K.TERRACE, TERRACE];
  const p = pondDist(x, z);
  if (p < -0.95) return [K.DEEP, DEEP];
  if (p < 0) return [K.SHELF, SHELF];
  return [K.LAWN, LAWN];
}

/* ---------- the cell grid ---------- */
export const NX = Math.round((X1 - X0) * SUB), NZ = Math.round((Z1 - Z0) * SUB);
const hgrid = new Float32Array(NX * NZ), kgrid = new Uint8Array(NX * NZ);
function computeGrid() {
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const [k, h] = rawCell(X0 + (i + 0.5) / SUB, Z0 + (j + 0.5) / SUB);
    kgrid[j * NX + i] = k; hgrid[j * NX + i] = h;
  }
}
computeGrid();
const cellH = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NZ ? LOW : hgrid[j * NX + i]);
const cellK = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NZ ? K.VOID : kgrid[j * NX + i]);
const ci = x => Math.floor((x - X0) * SUB), cj = z => Math.floor((z - Z0) * SUB);
export const heightAt = (x, z) => cellH(ci(x), cj(z));
export const kindAt = (x, z) => cellK(ci(x), cj(z));

/* ---------- paths (painted only) ---------- */
function catmull(pts, n = 14) {
  const out = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(a => 0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const PATHS = [
  { w: 0.78, pts: catmull([[-3.8, 12.2], [-2.7, 8.6], [-1.1, 5.9], [0.8, 3.6], [2.3, 1.3], [3.2, -0.9], [3.6, -2.3], [3.6, STAIRS.z1 + 0.3]]) },
  { w: 0.6, pts: catmull([[3.6, STAIRS.z0 + 0.1], [3.4, -6.9], [1.4, -8.9], [-2.4, -10.3], [-7.0, -11.0], [-11.8, -10.4], [-14.4, -9.4]]) },
];
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz || 1), 0, 1);
  const dx = wx - vx * t, dz = wz - vz * t;
  return Math.sqrt(dx * dx + dz * dz);
}
// Signed distance to the nearest path edge (negative = on the path), on the cell grid.
const pathGrid = new Float32Array((NX + 1) * (NZ + 1));
for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
  const x = X0 + i / SUB, z = Z0 + j / SUB;
  let best = 99;
  for (const p of PATHS) {
    const hw = p.w * (1 + 0.18 * Math.sin(x * 1.3 + z * 0.7));
    for (let s = 0; s < p.pts.length - 1; s++) {
      const a = p.pts[s], b = p.pts[s + 1];
      if (Math.abs(a[0] - x) > 3 && Math.abs(b[0] - x) > 3) continue;
      if (Math.abs(a[1] - z) > 3 && Math.abs(b[1] - z) > 3) continue;
      best = Math.min(best, segDist(x, z, a[0], a[1], b[0], b[1]) - hw);
    }
  }
  pathGrid[j * (NX + 1) + i] = best;
}
export function pathField(x, z) {
  const fx = clamp((x - X0) * SUB, 0, NX - 0.001), fz = clamp((z - Z0) * SUB, 0, NZ - 0.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, R = NX + 1;
  const a = pathGrid[j * R + i], b = pathGrid[j * R + i + 1], c = pathGrid[(j + 1) * R + i], d = pathGrid[(j + 1) * R + i + 1];
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/* ================================================================ ground painting */

// Distance from (x, z) to the nearest cell (within 2 cells) that is higher /
// lower than the cell under (x, z). Used for ambient occlusion at wall bases
// and the highlight lip at cliff tops.
function edgeDists(x, z) {
  const i = ci(x), j = cj(z), h = cellH(i, j);
  let up = 9, down = 9, downK = K.VOID;
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    if (!di && !dj) continue;
    const hh = cellH(i + di, j + dj);
    if (hh === h) continue;
    const rx0 = X0 + (i + di) / SUB, rz0 = Z0 + (j + dj) / SUB;
    const dx = Math.max(rx0 - x, 0, x - (rx0 + 1 / SUB)), dz = Math.max(rz0 - z, 0, z - (rz0 + 1 / SUB));
    const d = Math.sqrt(dx * dx + dz * dz);
    if (hh > h) { if (d < up) up = d; }
    else if (d < down) { down = d; downK = cellK(i + di, j + dj); }
  }
  return { up, down, downK };
}

// Worley-ish stones: nearest jittered point on a grid of size `cell`.
function stones(x, z, cell, seed) {
  const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
  let best = 9, bx = 0, bz = 0, id = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const cx = gx + dx, cz = gz + dz;
    const px = (cx + 0.2 + hash2(cx, cz, seed) * 0.6) * cell, pz = (cz + 0.2 + hash2(cx, cz, seed + 1) * 0.6) * cell;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bx = x - px; bz = z - pz; id = hash2(cx, cz, seed + 2); }
  }
  return { d: best, ox: bx, oz: bz, id };
}

function paintGround() {
  const W = Math.round((X1 - X0) * TEX), H = Math.round((Z1 - Z0) * TEX);
  const pix = new Pix(W, H);
  const lvl = new Int8Array(W * H).fill(-1);       // grass shade index (for blade strokes)
  const pal = new Array(W * H);
  for (let ty = 0; ty < H; ty++) {
    const z = Z0 + (ty + 0.5) / TEX;
    for (let tx = 0; tx < W; tx++) {
      const x = X0 + (tx + 0.5) / TEX;
      const k = kindAt(x, z);
      let c;
      if (k === K.VOID) { c = PAL.earth[1]; }
      else if (k === K.STAIR) {
        const local = ((z - STAIRS.z0) % STAIRS.depth) / STAIRS.depth;       // 0 = back of the step
        const ex = Math.min(x - STAIRS.x0, STAIRS.x1 - x);
        let v = 4.4 + (hash2(tx, ty, 41) - 0.5) * 1.0 + (bayer(tx, ty) - 0.5) * 0.6;
        if (local > 0.86) v += 1.6;                                          // front edge catches light
        if (local < 0.1) v -= 1.4;                                           // shadow of the riser above
        if (ex < 0.1) v -= 1.2;
        c = PAL.stone[clamp(Math.round(v), 1, 7)];
      } else if (k === K.SHELF || k === K.DEEP) {
        const p = pondDist(x, z);
        const deep = clamp(-p / 1.8, 0, 1);
        let v = 5.2 - deep * 5 + (vnoise(x * 2, z * 2, 61) - 0.5) * 1.6 + (bayer(tx, ty) - 0.5) * 0.8;
        const e = edgeDists(x, z);
        if (e.up < 0.3) v -= (0.3 - e.up) * 6;
        c = PAL.bed[clamp(Math.round(v), 0, 6)];
        if (hash2(tx, ty, 62) < 0.02) c = PAL.sand[3];                       // pebbles
        if (deep > 0.3 && vnoise(x * 1.4, z * 1.4, 63) > 0.68 && hash2(tx, ty, 64) < 0.4) c = PAL.lawn[1 + ((tx + ty) & 1)];
      } else {
        const terr = k === K.TERRACE;
        const G = terr ? PAL.terrace : PAL.lawn;
        const pf = pathField(x, z);
        const ps = pondDist(x, z);
        const e = edgeDists(x, z);
        const jag = (hash2(tx, ty, 71) - 0.5) * 0.12 + (vnoise(x * 5, z * 5, 72) - 0.5) * 0.12;
        if (terr && e.down < 0.24 && (e.downK === K.LAWN || e.downK === K.STAIR)) {
          // cap stones along the top of the terrace wall
          const s = stones(x, z, 0.32, 81);
          let v = 5 - s.oz * 9 - s.ox * 5 + (s.id - 0.5) * 1.5 + (bayer(tx, ty) - 0.5) * 0.6;
          if (s.d > 0.13) v = 1.2;
          if (e.down < 0.04) v -= 1.5;
          c = PAL.stone[clamp(Math.round(v), 1, 7)];
        } else if (pf + jag < 0) {
          // path: dirt with flat stepping stones and pebbles
          const s = stones(x, z, terr ? 0.5 : 0.58, terr ? 91 : 93);
          const r = (terr ? 0.17 : 0.21) + (s.id - 0.5) * 0.06;
          if (s.d < r && pf < -0.12) {
            let v = 5.0 - s.oz * 6 - s.ox * 3 + (s.id - 0.5) * 1.6 + (bayer(tx, ty) - 0.5) * 0.7;
            if (s.d > r - 0.05) v -= 1.8;
            c = PAL.stone[clamp(Math.round(v), 1, 7)];
          } else {
            let v = 3.2 + (fbm(x * 1.6, z * 1.6, 2, 95) - 0.5) * 2.4 + (bayer(tx, ty) - 0.5) * 0.9;
            if (s.d < r + 0.05 && pf < -0.12) v -= 1.2;                      // dark ring around stones
            if (hash2(tx, ty, 96) < 0.035) v += 2;
            if (pf > -0.09) v -= 0.8;                                         // darker rim at the grass
            c = PAL.dirt[clamp(Math.round(v), 0, 6)];
          }
        } else if (!terr && ps < 0.32 + jag * 2) {
          // sandy, pebbly shore
          let v = 3 + (vnoise(x * 3, z * 3, 101) - 0.5) * 2 + (bayer(tx, ty) - 0.5) * 0.8 - (0.32 - ps) * 2.2;
          if (hash2(tx, ty, 102) < 0.05) v += 1.5;
          if (e.down < 0.05) v += 1.4;                                        // lip at the bank
          c = PAL.sand[clamp(Math.round(v), 0, 5)];
        } else {
          // grass
          let v = 4.1;
          v += (fbm(x * 0.2, z * 0.2, 3, terr ? 12 : 11) - 0.5) * 2.8;
          v += (fbm(x * 0.95, z * 0.95, 2, 13) - 0.5) * 1.5;
          v += (hash2(tx, ty, 14) - 0.5) * 0.7 + (bayer(tx, ty) - 0.5) * 0.85;
          if (pf < 0.25) v -= (0.25 - pf) * 3;                                // trodden edge along the path
          if (e.up < 0.7) v -= (0.7 - e.up) * 3.6;                            // shade at the foot of a wall
          if (e.down < 0.055) v += 1.8;                                        // bright lip over a drop
          else if (e.down < 0.11) v += 0.7;
          const li = clamp(Math.round(v), 1, 7);
          lvl[ty * W + tx] = li;
          c = G[li];
        }
      }
      pal[ty * W + tx] = c;
    }
  }
  // grass blades (light tip over a darker base) and little flowers
  const FLOW = ['#f4f0e0', '#f3d35b', '#eb9cb6', '#b8a2e6', '#ffffff'].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  for (let ty = 1; ty < H - 1; ty++) for (let tx = 0; tx < W; tx++) {
    const i = ty * W + tx, l = lvl[i];
    if (l < 0 || lvl[i + W] < 0) continue;
    const z = Z0 + (ty + 0.5) / TEX, x = X0 + (tx + 0.5) / TEX;
    const G = kindAt(x, z) === K.TERRACE ? PAL.terrace : PAL.lawn;
    const h = hash2(tx, ty, 21);
    if (h < 0.11) { pal[i] = G[Math.min(8, l + 1 + (h < 0.03 ? 1 : 0))]; pal[i + W] = G[Math.max(0, l - 1)]; }
    const fd = 0.0015 + 0.03 * smoothstep(0.64, 0.78, fbm(x * 0.32, z * 0.32, 2, 40));
    if (hash2(tx, ty, 31) < fd && pathField(x, z) > 0.2) {
      pal[i] = FLOW[Math.floor(hash2(tx, ty, 32) * (fd > 0.01 ? 3 : 5))];
      pal[i + W] = G[Math.max(0, l - 2)];
    }
  }
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) pix.set(tx, ty, pal[ty * W + tx]);
  return pix.canvas();
}

/* ================================================================ terrain mesh */

class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.idx = []; }
  // quad from 4 corners (any winding) facing normal n; uvs per corner
  quad(a, b, c, d, n, ua, ub, uc, ud) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
    const base = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) this.n.push(n[0], n[1], n[2]);
    for (const u of [ua, ub, uc, ud]) this.uv.push(u[0], u[1]);
    if (flip) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const SIDE_TEX = { wall: [64, 32], step: [64, 8], bank: [32, 16], earth: [64, 128] };
function faceKind(kHi, kLo, alongX) {
  if (kLo === K.VOID) return 'earth';
  if (kHi === K.STAIR || kLo === K.STAIR) return alongX ? 'step' : 'wall';
  if (kLo === K.SHELF || kLo === K.DEEP) return 'bank';
  if (kHi === K.TERRACE) return 'wall';
  return 'earth';
}

function buildTerrain() {
  const top = new GeoBuilder();
  const sides = { wall: new GeoBuilder(), step: new GeoBuilder(), bank: new GeoBuilder(), earth: new GeoBuilder() };
  const U = x => (x - X0) / (X1 - X0), V = z => 1 - (z - Z0) / (Z1 - Z0);
  // top faces: runs of equal height per row
  for (let j = 0; j < NZ; j++) {
    let i = 0;
    while (i < NX) {
      const h = cellH(i, j), k = cellK(i, j);
      let e = i + 1;
      while (e < NX && cellH(e, j) === h && cellK(e, j) !== K.VOID) e++;
      if (k !== K.VOID) {
        const xa = X0 + i / SUB, xb = X0 + e / SUB, za = Z0 + j / SUB, zb = Z0 + (j + 1) / SUB;
        top.quad([xa, h, zb], [xb, h, zb], [xb, h, za], [xa, h, za], [0, 1, 0],
          [U(xa), V(zb)], [U(xb), V(zb)], [U(xb), V(za)], [U(xa), V(za)]);
      }
      i = e;
    }
  }
  // vertical faces, merged along each grid line
  const emit = (kind, alongX, line, a0, a1, hi, lo, sign) => {
    const [tw, th] = SIDE_TEX[kind];
    const g = sides[kind];
    const vt = 1, vb = 1 - (hi - lo) * TEX / th;
    const ua = a0 * TEX / tw, ub = a1 * TEX / tw;
    if (alongX) {           // face on plane z = line, spanning x a0..a1, normal ±z
      g.quad([a0, lo, line], [a1, lo, line], [a1, hi, line], [a0, hi, line], [0, 0, sign],
        [ua, vb], [ub, vb], [ub, vt], [ua, vt]);
    } else {                // plane x = line, spanning z a0..a1, normal ±x
      g.quad([line, lo, a0], [line, lo, a1], [line, hi, a1], [line, hi, a0], [sign, 0, 0],
        [ua, vb], [ub, vb], [ub, vt], [ua, vt]);
    }
  };
  // edges between (i, j) and (i+1, j): planes x = const
  for (let i = -1; i < NX; i++) {
    let run = null;
    for (let j = 0; j <= NZ; j++) {
      let key = null, info = null;
      if (j < NZ) {
        const hA = cellH(i, j), hB = cellH(i + 1, j);
        if (hA !== hB) {
          const aHi = hA > hB;
          const kHi = aHi ? cellK(i, j) : cellK(i + 1, j), kLo = aHi ? cellK(i + 1, j) : cellK(i, j);
          const kind = faceKind(kHi, kLo, false);
          info = { hi: Math.max(hA, hB), lo: Math.min(hA, hB), sign: aHi ? 1 : -1, kind };
          key = `${info.hi}|${info.lo}|${info.sign}|${kind}`;
        }
      }
      if (run && run.key !== key) { emit(run.kind, false, X0 + (i + 1) / SUB, Z0 + run.j0 / SUB, Z0 + j / SUB, run.hi, run.lo, run.sign); run = null; }
      if (key && !run) run = { key, j0: j, ...info };
    }
  }
  // edges between (i, j) and (i, j+1): planes z = const
  for (let j = -1; j < NZ; j++) {
    let run = null;
    for (let i = 0; i <= NX; i++) {
      let key = null, info = null;
      if (i < NX) {
        const hA = cellH(i, j), hB = cellH(i, j + 1);
        if (hA !== hB) {
          const aHi = hA > hB;
          const kHi = aHi ? cellK(i, j) : cellK(i, j + 1), kLo = aHi ? cellK(i, j + 1) : cellK(i, j);
          const kind = faceKind(kHi, kLo, true);
          info = { hi: Math.max(hA, hB), lo: Math.min(hA, hB), sign: aHi ? 1 : -1, kind };
          key = `${info.hi}|${info.lo}|${info.sign}|${kind}`;
        }
      }
      if (run && run.key !== key) { emit(run.kind, true, Z0 + (j + 1) / SUB, X0 + run.i0 / SUB, X0 + i / SUB, run.hi, run.lo, run.sign); run = null; }
      if (key && !run) run = { key, i0: i, ...info };
    }
  }
  return { top: top.build(), sides: Object.fromEntries(Object.entries(sides).map(([k, g]) => [k, g.build()])) };
}

/* ================================================================ water */

function pondTexture() {
  const W = 96, H = 64, x0 = POND.x - POND.rx - 1.5, z0 = POND.z - POND.rz - 1.5, w = 2 * POND.rx + 3, d = 2 * POND.rz + 3;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sdf = pondSDF(x0 + (x + 0.5) / W * w, z0 + (y + 0.5) / H * d);
    const v = clamp((sdf + 2) / 4, 0, 1) * 255;
    const i = (y * W + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return { tex: t, box: new THREE.Vector4(x0, z0, w, d) };
}

function buildWater() {
  const { tex, box } = pondTexture();
  const uniforms = {
    uTime: { value: 0 },
    uPond: { value: tex }, uBox: { value: box },
    uShallow: { value: new THREE.Color('#4f8f87') }, uDeep: { value: new THREE.Color('#1c4552') },
    uSky: { value: new THREE.Color('#9cc6d6') }, uSun: { value: new THREE.Color('#fff3dc') },
    uFoam: { value: new THREE.Color('#d9efe9') },
    uNight: { value: 0 }, uGlint: { value: 1 },
    uFogColor: { value: new THREE.Color() }, uFogNear: { value: 30 }, uFogFar: { value: 80 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      varying vec3 vW; varying float vFogD;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vFogD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime, uNight, uGlint, uFogNear, uFogFar;
      uniform sampler2D uPond; uniform vec4 uBox;
      uniform vec3 uShallow, uDeep, uSky, uSun, uFoam, uFogColor;
      varying vec3 vW; varying float vFogD;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
      void main() {
        vec2 p = floor(vW.xz * 20.0) / 20.0 + 0.025;               // snap to the ground's texel grid
        vec2 uv = (p - uBox.xy) / uBox.zw;
        float sdf = texture2D(uPond, uv).r * 4.0 - 2.0;
        if (sdf > 0.02) discard;
        float depth = clamp(-sdf / 1.5, 0.0, 1.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 0.85, depth));
        col = mix(col, uSky, 0.28);
        // pixel ripples: short thin bright dashes that drift with the wind
        float w = sin(p.x * 7.0 + p.y * 2.3 + uTime * 1.3) * sin(p.y * 11.0 - p.x * 1.7 - uTime * 0.8)
                + 0.5 * sin((p.x - p.y) * 5.1 + uTime * 1.7);
        float band = step(1.18, w + h21(floor(p * 20.0)) * 0.25) * step(0.12, depth);
        col += band * (uSky * 0.18 + uSun * 0.16 * uGlint);
        // a few sparkles of sunlight
        float sp = step(0.9988, h21(floor(p * 20.0) + floor(uTime * 2.0))) * uGlint;
        col += sp * uSun * 1.4;
        // foam line along the shore
        float fl = step(-0.1 - 0.05 * sin(uTime * 1.7 + p.x * 5.0 + p.y * 3.0), sdf);
        col = mix(col, uFoam, fl * 0.55);
        // stars mirrored at night
        vec2 sc = floor(p * 20.0);
        float star = step(0.993, h21(sc * 0.37 + 3.1)) * (0.5 + 0.5 * sin(uTime * 2.0 + h21(sc) * 40.0));
        col += star * uNight * vec3(0.85, 0.9, 1.0) * 1.4;
        float alpha = mix(0.62, 0.9, smoothstep(0.0, 0.7, depth));
        alpha = max(alpha, fl * 0.75);
        float fog = smoothstep(uFogNear, uFogFar, vFogD);
        col = mix(col, uFogColor, fog);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const geo = new THREE.PlaneGeometry(box.z, box.w);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(box.x + box.z / 2, WATER, box.y + box.w / 2);
  mesh.renderOrder = 2;
  return { mesh, uniforms };
}

/* ================================================================ props */

const texCache = new WeakMap();
export function texFor(canvas, opts) {
  if (!texCache.has(canvas)) texCache.set(canvas, pixelTexture(canvas, opts));
  return texCache.get(canvas);
}
// Art that never changes is painted once per page.
const once = fn => { let v; return () => (v ||= fn()); };
const sideArt = once(() => ({ wall: paintWall(), step: paintStep(), bank: paintBank(), earth: paintEarth() }));
const reedArt = once(() => [1, 2, 3].map(s => paintReeds(s)));
const lilyArt = once(() => Array.from({ length: 9 }, (_, i) => paintLily(i + 3)));
const tuftArt = once(() => [1, 2, 3, 4].map(s => paintTuft(s)).concat([5, 6].map(s => paintTuft(s, { flower: true }))));

const TREES = [
  { kind: 'oak', x: -11.4, z: -2.3, seed: 11, w: 92, h: 110 },
  { kind: 'oak', x: -14.0, z: 7.0, seed: 23, w: 80, h: 96 },
  { kind: 'blossom', x: 12.9, z: -1.6, seed: 5, w: 80, h: 94 },
  { kind: 'oak', x: -13.2, z: -8.4, seed: 31, w: 88, h: 106 },
  { kind: 'oak', x: -8.0, z: -10.9, seed: 37, w: 84, h: 100 },
  { kind: 'blossom', x: -4.4, z: -8.2, seed: 7, w: 74, h: 88 },
  { kind: 'oak', x: 7.8, z: -10.2, seed: 41, w: 90, h: 108 },
  { kind: 'oak', x: 13.4, z: -7.9, seed: 43, w: 84, h: 100 },
  { kind: 'pine', x: 10.7, z: -12.3, seed: 2 },
  { kind: 'pine', x: -0.9, z: -12.4, seed: 3 },
  { kind: 'pine', x: 4.4, z: -12.5, seed: 4 },
  { kind: 'pine', x: -11.2, z: -12.5, seed: 6 },
  { kind: 'blossom', x: 13.3, z: 7.3, seed: 19, w: 66, h: 78 },
];
function bushList() {
  const out = [];
  for (const x of [-12.6, -9.2, -6.3, -1.4, 6.6, 9.7, 12.6]) out.push({ x, z: terraceZ(x) + 0.75, seed: 100 + Math.round(x * 10) });
  out.push({ x: 8.6, z: frontZ(8.6) - 0.9, seed: 151 }, { x: -8.2, z: frontZ(-8.2) - 0.9, seed: 152, kind: 'flower' },
    { x: 1.9, z: frontZ(1.9) - 0.85, seed: 153 }, { x: -11.0, z: -6.5, seed: 154, kind: 'flower' }, { x: 0.6, z: -7.4, seed: 155 },
    { x: 6.9, z: -7.3, seed: 156 }, { x: 11.0, z: -6.4, seed: 157, kind: 'flower' }, { x: 14.0, z: 1.2, seed: 158 });
  return out;
}

function disposeTree(root) {
  root.traverse(o => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) m.dispose();
    if (o.customDepthMaterial) o.customDepthMaterial.dispose();
  });
}

// Everything that depends on the shape of the ground (and so on whether there
// is a pond): terrain meshes, water, reeds, lily pads and the grass tufts.
function buildTerrainGroup(world) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const rng = mulberry32(777);
  const lit = (map, opts = {}) => patchLit(new THREE.MeshLambertMaterial({ map, ...opts }));
  const groundTex = pixelTexture(paintGround(), { mips: true });
  groundTex.anisotropy = 4;
  const terr = buildTerrain();
  const top = new THREE.Mesh(terr.top, lit(groundTex));
  top.receiveShadow = true; top.castShadow = true;
  top.name = 'ground';
  group.add(top);
  const art = sideArt();
  for (const [kind, g] of Object.entries(terr.sides)) {
    const t = texFor(art[kind]);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const m = new THREE.Mesh(g, lit(t));
    m.receiveShadow = true; m.castShadow = true;
    group.add(m);
  }
  let water = null;
  const animated = [];
  if (pondOn) {
    water = buildWater();
    group.add(water.mesh);
    const reeds = reedArt();
    for (let n = 0, made = 0; n < 900 && made < 26; n++) {
      const a = rng() * Math.PI * 2;
      const x = POND.x + Math.cos(a) * POND.rx * (0.8 + rng() * 0.35), z = POND.z + Math.sin(a) * POND.rz * (0.8 + rng() * 0.35);
      const p = pondSDF(x, z);
      if (p < -0.3 || p > 0.18 || (Math.sin(a) < -0.2 && rng() < 0.6)) continue;   // fewer at the front edge
      const pr = makeProp(reeds[made % 3], { x, y: heightAt(x, z), z, texel: 0.05, sway: 0.06, tex: texFor(reeds[made % 3]) });
      group.add(pr.mesh);
      made++;
    }
    const lilies = lilyArt();
    for (let n = 0, made = 0; n < 400 && made < lilies.length; n++) {
      const x = POND.x + (rng() - 0.5) * POND.rx * 1.6, z = POND.z + (rng() - 0.5) * POND.rz * 1.6;
      if (pondSDF(x, z) > -0.6) continue;
      const c = lilies[made];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(c.width * 0.05, c.height * 0.05).rotateX(-Math.PI / 2),
        new THREE.MeshLambertMaterial({ map: texFor(c), alphaTest: 0.5 }));
      m.position.set(x, WATER + 0.01, z);
      m.rotation.y = rng() * Math.PI * 2;
      m.receiveShadow = true;
      group.add(m);
      animated.push({ lily: m, phase: rng() * 6 });
      made++;
    }
  }
  // grass tufts and small flowers (instanced, swaying)
  const tufts = tuftArt();
  const spots = tufts.map(() => []);
  const m4 = new THREE.Matrix4();
  for (let n = 0, total = 0; n < 6000 && total < 520; n++) {
    const x = X0 + rng() * (X1 - X0), z = Z0 + rng() * (Z1 - Z0);
    const k = kindAt(x, z);
    if (k !== K.LAWN && k !== K.TERRACE) continue;
    if (pathField(x, z) < 0.15 || pondDist(x, z) < 0.35) continue;
    if (world.staticObstacles.some(o => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + 0.25) ** 2)) continue;
    const dens = fbm(x * 0.35, z * 0.35, 2, 501);
    if (rng() > dens * dens * 1.6) continue;
    const v = rng() < 0.14 ? 4 + (rng() < 0.5 ? 0 : 1) : Math.floor(rng() * 4);
    spots[v].push([x, heightAt(x, z), z]);
    total++;
  }
  tufts.forEach((c, v) => {
    if (!spots[v].length) return;
    const w = c.width * 0.05, h = c.height * 0.05 * 1.35;
    const { mat } = spriteMaterials(texFor(c), { sway: 0.05, swayH: h });
    const im = new THREE.InstancedMesh(makeQuad(w, h), mat, spots[v].length);
    spots[v].forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere();
    group.add(im);
  });
  return { group, ground: top, groundTex, water, animated };
}

// The garden's landscape. Player decor, the nest and the birds are added by
// the scene; they tell the world about their perches and footprints via
// world.setDecor().
export function buildWorld(scene, { pond = false } = {}) {
  const rng = mulberry32(1234);
  const lit = (map, opts = {}) => patchLit(new THREE.MeshLambertMaterial({ map, ...opts }));
  const world = {
    staticPerches: [], staticObstacles: [], perches: [], obstacles: [], dynObstacles: [],
    trees: [], blossoms: [], props: [], flowers: [], visits: [],
    ground: null, water: null, animated: [], pond: false,
  };

  /* ---- the land below ---- */
  const mt = pixelTexture(paintMeadow(), { mips: true });
  mt.wrapS = mt.wrapT = THREE.RepeatWrapping;
  mt.repeat.set(60, 60);
  const low = new THREE.Mesh(new THREE.PlaneGeometry(192, 192).rotateX(-Math.PI / 2), lit(mt));
  low.position.set(0, LOW, 0);
  low.receiveShadow = true;
  scene.add(low);
  const far = paintFarTree({ seed: 9 });
  const farMats = spriteMaterials(texFor(far.canvas), { sway: 0.05, swayH: far.h * DECOR_TEXEL * 1.6 });
  const farGeo = makeQuad(far.w * DECOR_TEXEL * 1.6, far.h * DECOR_TEXEL * 1.6 * 1.35);
  const farTrees = [];
  for (let n = 0; n < 600 && farTrees.length < 170; n++) {
    const a = rng() * Math.PI * 2, r = 20 + Math.pow(rng(), 0.7) * 50;
    const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r - 6;
    if (z > 9 && Math.abs(x) < 26) continue;                   // keep the view in front of the garden open
    if (Math.abs(x) < 19 && z > -17 && z < 13) continue;       // under the plateau
    farTrees.push([x, z, 0.8 + rng() * 0.5]);
  }
  const fi = new THREE.InstancedMesh(farGeo, farMats.mat, farTrees.length);
  const m4 = new THREE.Matrix4();
  farTrees.forEach(([x, z, s], i) => { m4.makeScale(s, s, s).setPosition(x, LOW, z); fi.setMatrixAt(i, m4); });
  fi.computeBoundingSphere();
  scene.add(fi);

  /* ---- trees, bushes, hedge ---- */
  const addPerch = (p, kind, extra = {}) => world.staticPerches.push({ x: p.x, y: p.y, z: p.z, kind, taken: null, ...extra });
  const place = (canvas, x, z, opts = {}) => {
    const pr = makeProp(canvas, { x, y: heightAt(x, z), z, texel: DECOR_TEXEL, tex: texFor(canvas), ...opts });
    scene.add(pr.mesh);
    world.props.push(pr);
    return pr;
  };
  for (const t of TREES) {
    const art = t.kind === 'pine' ? paintPine({ seed: t.seed }) : paintTree(t);
    const pr = place(art.canvas, t.x, t.z, { sway: t.kind === 'pine' ? 0.05 : 0.09 });
    for (const p of art.perches) addPerch(pr.toWorld(p.x, p.y), 'tree', { roost: true });
    world.staticObstacles.push({ x: t.x, z: t.z, r: 0.45 });
    world.trees.push({ x: t.x, z: t.z, y: pr.mesh.position.y, h: pr.h, r: art.w * DECOR_TEXEL * 0.42 });
    if (t.kind === 'blossom') world.blossoms.push({ x: t.x, y: pr.mesh.position.y, z: t.z, h: pr.h, w: pr.w });
  }
  for (const b of bushList()) {
    const art = paintBush({ seed: b.seed, kind: b.kind || 'leaf', w: 40 + (b.seed % 3) * 4 });
    const pr = place(art.canvas, b.x, b.z, { sway: 0.03 });
    for (const p of art.perches) addPerch(pr.toWorld(p.x, p.y), 'bush', { roost: true });
    world.staticObstacles.push({ x: b.x, z: b.z, r: 0.85, cover: true });
  }
  for (let x = -14.6; x <= 14.8; x += 1.85) {
    const art = paintBush({ seed: 300 + Math.round(x * 7), kind: 'hedge', w: 52, h: 30 });
    place(art.canvas, x + (rng() - 0.5) * 0.4, -12.75 + (rng() - 0.5) * 0.3, { sway: 0.025 });
  }
  world.perches = [...world.staticPerches];
  world.obstacles = [...world.staticObstacles];

  /* ---- terrain (rebuilt when the pond comes or goes) ---- */
  let terrain = null;
  world.setPond = on => {
    on = !!on;
    if (terrain && on === world.pond) return false;
    pondOn = on;
    world.pond = on;
    computeGrid();
    if (terrain) {
      scene.remove(terrain.group);
      disposeTree(terrain.group);
      terrain.groundTex.dispose();
      terrain.water?.uniforms.uPond.value.dispose();
    }
    terrain = buildTerrainGroup(world);
    scene.add(terrain.group);
    world.ground = terrain.ground;
    world.water = terrain.water;
    world.animated = terrain.animated;
    return true;
  };
  world.setPond(pond);

  /* ---- player decor & the nest report their perches / footprints here ---- */
  world.setDecor = ({ perches = [], obstacles = [], flowers = [], visits = [] } = {}) => {
    world.perches = [...world.staticPerches, ...perches];
    world.dynObstacles = obstacles;
    world.obstacles = [...world.staticObstacles, ...obstacles];
    world.flowers = flowers;
    world.visits = visits;
  };

  /* ---- walking helpers for the birds ---- */
  world.heightAt = heightAt;
  world.kindAt = kindAt;
  // (fromX, fromZ): where the step starts — a bird that stands inside a
  // footprint (decor was put down on top of it) may still walk out of it.
  world.walkable = (x, z, wader = false, fromX, fromZ) => {
    const k = kindAt(x, z);
    if (k === K.VOID || k === K.DEEP) return false;
    if (k === K.SHELF && !wader) return false;
    for (const o of world.obstacles) {
      if ((x - o.x) ** 2 + (z - o.z) ** 2 >= o.r * o.r) continue;
      if (fromX !== undefined && (fromX - o.x) ** 2 + (fromZ - o.z) ** 2 < o.r * o.r) continue;
      return false;
    }
    return true;
  };
  world.segmentOk = (x0, z0, x1, z1, wader = false) => {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 0.18));
    let ph = heightAt(x0, z0);
    for (let s = 1; s <= n; s++) {
      const x = x0 + (x1 - x0) * s / n, z = z0 + (z1 - z0) * s / n;
      if (!world.walkable(x, z, wader, x0, z0)) return false;
      const h = heightAt(x, z);
      if (Math.abs(h - ph) > 0.33) return false;          // stair steps (0.25) and the pond shelf (0.3) are fine
      ph = h;
    }
    return true;
  };
  world.randomSpot = (opts = {}) => {
    const { near = null, r = 6, wader = false, kinds = null } = opts;
    for (let n = 0; n < 60; n++) {
      let x, z;
      if (near) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r; x = near.x + Math.cos(a) * d; z = near.z + Math.sin(a) * d; }
      else { x = -14 + Math.random() * 28; z = -12 + Math.random() * 20; }
      if (!world.walkable(x, z, wader)) continue;
      const k = kindAt(x, z);
      if (kinds && !kinds.includes(k)) continue;
      return { x, y: heightAt(x, z), z };
    }
    return null;
  };
  world.inPond = (x, z) => { const k = kindAt(x, z); return k === K.SHELF || k === K.DEEP; };
  // Can a decor object with footprint radius r stand at (x, z)? On lawn or
  // terrace (not the stairs, the pond or over an edge), clear of trees,
  // bushes and the other decor (except `ignore`, the one being moved).
  world.canPlace = (x, z, r, ignore = null) => {
    const k = kindAt(x, z), h = heightAt(x, z);
    if (k !== K.LAWN && k !== K.TERRACE) return false;
    const rr = Math.max(0.3, r);
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * Math.PI / 4) * rr, pz = z + Math.sin(a * Math.PI / 4) * rr;
      const kk = kindAt(px, pz);
      if ((kk !== K.LAWN && kk !== K.TERRACE) || heightAt(px, pz) !== h) return false;
    }
    for (const o of world.staticObstacles) if (Math.hypot(o.x - x, o.z - z) < o.r + r * 0.6) return false;
    for (const o of world.dynObstacles) {
      if (ignore && o.owner === ignore) continue;
      if (Math.hypot(o.x - x, o.z - z) < (o.r + r) * 0.85) return false;
    }
    return true;
  };
  world.bounds = { x0: -15, x1: 15, z0: -12.6, z1: 9.4 };
  return world;
}

// Animated bits of the world (bobbing lily pads, the water).
export function updateWorld(world, t) {
  for (const a of world.animated) {
    if (a.lily) a.lily.position.y = WATER + 0.012 + Math.sin(t * 1.3 + a.phase) * 0.008;
  }
  if (world.water) world.water.uniforms.uTime.value = t;
}

export { K as KIND };
