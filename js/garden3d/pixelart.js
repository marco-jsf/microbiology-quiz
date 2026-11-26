// Procedural pixel art for the 2.5D garden: cliff/wall textures, trees, bushes,
// grass tufts, reeds, lily pads and small effect sprites. Everything is painted
// texel by texel into a canvas (seeded, so it looks the same on every load).
// Style: light from the top-left, a dark blue-green outline on the shadow side,
// ordered dithering between shades (like the reference screenshot).

import { Pix, hex, hash2, fbm, vnoise, bayer, clamp, mulberry32, makeCanvas } from './util.js';

const P = (...cs) => cs.map(hex);
export const PAL = {
  lawn: P('#1f3629', '#294c32', '#356238', '#477a40', '#5e9149', '#7aa855', '#9bc068', '#bcd687', '#dce9a8'),
  terrace: P('#233a29', '#2f4e2f', '#3e6335', '#527b3b', '#6a9343', '#86ab51', '#a5c367', '#c3d986', '#e0eaa6'),
  dirt: P('#4a372b', '#634a36', '#7d6145', '#977b57', '#b0946c', '#c9af86', '#ddc9a4'),
  stone: P('#36323b', '#4d4852', '#67616b', '#827b84', '#9f979c', '#bbb3b2', '#d4cdc6', '#e8e2d8'),
  sand: P('#6f5f47', '#8a7858', '#a49069', '#bba77d', '#cfbd94', '#e0d1ad'),
  bed: P('#14201f', '#1b2a28', '#223430', '#2b3f38', '#374b40', '#4a5b48', '#5f6c52'),
  earth: P('#241a17', '#33241e', '#453026', '#5a3e2e', '#704e38', '#896142', '#a1774f', '#b98f62'),
  bark: P('#21171a', '#352620', '#4b3427', '#634431', '#7c573d', '#97704e', '#b08a64'),
  leaf: P('#14222b', '#1b3634', '#224a39', '#2c5f3d', '#3a7742', '#4f9049', '#6caa52', '#90c263', '#b8db82'),
  blossom: P('#33202e', '#5e3149', '#874560', '#ad5f79', '#cb7e95', '#e1a1b3', '#f0c4cf', '#fbe2e7', '#fff5f6'),
  pine: P('#0f1c22', '#152c2c', '#1b3b33', '#244c3a', '#2f5f42', '#3f744b', '#568a56', '#73a466'),
  far: P('#18262c', '#1e3333', '#26423a', '#305440', '#3d6647', '#50794f', '#6a8f5c'),
};

/* ---------------------------------------------------------------- cliffs */

// Retaining wall of the terrace: rows of rounded stones (like the reference),
// a grass fringe hanging over the top, darker towards the ground. 64×32,
// v = 0 is the TOP of the wall. Tiles horizontally.
export function paintWall(seed = 3) {
  const W = 64, H = 32, pix = new Pix(W, H), S = PAL.stone, rng = mulberry32(seed);
  const owner = new Int16Array(W * H).fill(-1);
  const stones = [];
  const rows = [5, 6, 6, 7, 8];
  let y = 0;
  rows.forEach((rh, r) => {
    let x = Math.floor(rng() * 10);
    const start = x;
    while (x < start + W) {
      const sw = 8 + Math.floor(rng() * 7);
      stones.push({ x0: x, x1: x + sw - 1, y0: y, y1: y + rh - 1, tone: rng(), r });
      x += sw;
    }
    y += rh;
  });
  stones.forEach((s, k) => {
    for (let yy = s.y0; yy <= s.y1 && yy < H; yy++) {
      for (let xx = s.x0; xx <= s.x1; xx++) {
        const px = ((xx % W) + W) % W;
        // rounded corners: skip the corner pixels
        const cx = xx === s.x0 || xx === s.x1, cy = yy === s.y0 || yy === s.y1;
        if (cx && cy) continue;
        owner[yy * W + px] = k;
      }
    }
  });
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      const k = owner[yy * W + xx];
      if (k < 0) { pix.set(xx, yy, yy > 26 ? S[0] : S[1]); continue; }      // mortar
      const s = stones[k];
      const lx = ((xx - s.x0) % W + W) % W, ly = yy - s.y0;
      const sw = s.x1 - s.x0, sh = s.y1 - s.y0;
      let v = 4.2 + (s.tone - 0.5) * 1.4;
      if (ly === 0 || lx === 0) v += 1.3;                     // lit top/left edge
      if (ly === sh || lx === sw) v -= 1.6;                   // shadow bottom/right edge
      if (ly === 1 && lx > 0 && lx < sw) v += 0.5;
      v += (hash2(xx, yy, seed) - 0.5) * 0.9 + (bayer(xx, yy) - 0.5) * 0.6;
      v -= Math.max(0, yy - 17) * 0.17;                       // darker towards the ground
      pix.set(xx, yy, S[clamp(Math.round(v), 1, 7)]);
      // moss specks low on the wall
      if (yy > 20 && hash2(xx, yy, seed + 9) < 0.06) pix.set(xx, yy, PAL.lawn[2 + (hash2(xx, yy, 4) * 2 | 0)]);
    }
  }
  // grass fringe hanging over the top edge
  const G = PAL.lawn;
  for (let xx = 0; xx < W; xx++) {
    const len = 1 + Math.floor(vnoise(xx * 0.45, 0, seed) * 2.4 + (hash2(xx, 0, seed + 2) < 0.18 ? 2 : 0));
    for (let yy = 0; yy < len; yy++) pix.set(xx, yy, G[yy === len - 1 ? 1 : 3 + ((xx + yy) & 1)]);
    pix.set(xx, len, S[1]);                                   // little shadow under the fringe
  }
  return pix.canvas();
}

// Stair riser (one step, 0.25 units = 5 texels; 64×8 to be safe).
export function paintStep(seed = 5) {
  const W = 64, H = 8, pix = new Pix(W, H), S = PAL.stone;
  let jx = 0;
  const joints = new Set();
  const rng = mulberry32(seed);
  while (jx < W) { joints.add(jx); jx += 10 + Math.floor(rng() * 9); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = y === 0 ? 6 : y === 1 ? 5 : 3.6 - y * 0.25;
    v += (hash2(x, y, seed) - 0.5) * 0.8 + (bayer(x, y) - 0.5) * 0.5;
    if (joints.has(x) && y > 0) v = 1;
    pix.set(x, y, S[clamp(Math.round(v), 0, 7)]);
  }
  return pix.canvas();
}

// Pond bank: grass fringe, wet earth, darker towards the water. 32×16.
export function paintBank(seed = 7) {
  const W = 32, H = 16, pix = new Pix(W, H), E = PAL.earth, G = PAL.lawn;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 4.3 - y * 0.2 + (vnoise(x * 0.4, y * 0.8, seed) - 0.5) * 2 + (bayer(x, y) - 0.5) * 0.6;
    if (hash2(x, y, seed) < 0.05) v += 2;                     // pebbles
    pix.set(x, y, E[clamp(Math.round(v), 0, 7)]);
  }
  for (let x = 0; x < W; x++) {
    const len = 1 + Math.floor(hash2(x, 1, seed) * 2.6);
    for (let y = 0; y < len; y++) pix.set(x, y, G[y === len - 1 ? 2 : 4]);
  }
  return pix.canvas();
}

// Outer cliff of the garden plateau: grass lip with hanging roots, then layered
// earth / rock, darkening towards the bottom. 64×128, tiles horizontally.
export function paintEarth(seed = 11) {
  const W = 64, H = 128, pix = new Pix(W, H), E = PAL.earth, G = PAL.lawn, S = PAL.stone;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // strata: horizontal bands displaced by periodic noise
    const xn = (x / W) * Math.PI * 2;
    const disp = Math.sin(xn * 2 + seed) * 1.6 + Math.sin(xn * 5 + 1.3) * 0.9;
    const band = (y + disp) / 9;
    const bi = Math.floor(band), bf = band - bi;
    let v = 4.4 + (hash2(bi, 0, seed) - 0.5) * 2.2;
    if (bf < 0.14) v += 1.1;                                   // lit top of each layer
    if (bf > 0.86) v -= 1.4;                                   // shadow under each layer
    v += (hash2(x, y, seed) - 0.5) * 0.9 + (bayer(x, y) - 0.5) * 0.7;
    v -= Math.max(0, y - 30) * 0.03;                           // darker towards the bottom
    let c = E[clamp(Math.round(v), 0, 7)];
    // a few embedded rocks
    const rx = Math.floor(x / 11), ry = Math.floor(y / 13);
    const h = hash2(rx, ry, seed + 5);
    if (h < 0.22) {
      const cx = rx * 11 + 5.5, cy = ry * 13 + 6.5, dx = (x - cx) / 4.2, dy = (y - cy) / 3.2;
      const d = dx * dx + dy * dy;
      if (d < 1) {
        let sv = 4 - dy * 1.6 - dx * 0.8 + (bayer(x, y) - 0.5);
        if (d > 0.7) sv -= 1.3;
        c = S[clamp(Math.round(sv), 1, 6)];
      }
    }
    pix.set(x, y, c);
  }
  // grass lip and hanging roots
  for (let x = 0; x < W; x++) {
    const len = 2 + Math.floor(vnoise(x * 0.5, 3, seed) * 3 + (hash2(x, 2, seed) < 0.15 ? 2 : 0));
    for (let y = 0; y < len; y++) pix.set(x, y, G[y === len - 1 ? 2 : y === 0 ? 6 : 4]);
    pix.set(x, len, E[0]);
    if (hash2(x, 5, seed) < 0.12) {                            // root
      const rl = 4 + Math.floor(hash2(x, 6, seed) * 9);
      for (let y = len; y < len + rl; y++) pix.set(x + ((y >> 2) & 1) * (hash2(x, 7, seed) < 0.5 ? 1 : -1), y, E[(y & 1) ? 1 : 2]);
    }
  }
  return pix.canvas();
}

// Seamless meadow for the low land around the plateau (64×64, periodic noise).
export function paintMeadow(seed = 21) {
  const W = 64, H = 64, pix = new Pix(W, H), G = PAL.lawn;
  const pn = (x, y, f, s) => {
    // periodic value noise with period W
    const fx = x * f / W, fy = y * f / H;
    const xi = Math.floor(fx), yi = Math.floor(fy), xf = fx - xi, yf = fy - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const H2 = (a, b) => hash2(((a % f) + f) % f, ((b % f) + f) % f, s);
    const a = H2(xi, yi), b = H2(xi + 1, yi), c = H2(xi, yi + 1), d = H2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 3.4 + (pn(x, y, 4, seed) - 0.5) * 2.4 + (pn(x, y, 16, seed + 1) - 0.5) * 1.2 + (bayer(x, y) - 0.5) * 0.8;
    if (hash2(x, y, seed) < 0.07) v += 1;
    pix.set(x, y, G[clamp(Math.round(v), 1, 6)]);
  }
  return pix.canvas();
}

/* ---------------------------------------------------------------- foliage */

// Light direction for clumps: from the top-left, slightly towards the viewer.
const LX = -0.5, LY = -0.78, LZ = 0.55;

// Paint a canopy made of overlapping round clumps. Clumps are painted top to
// bottom, so each lower clump overlaps the shaded underside of the one above;
// a dark line separates clumps and a dark outline wraps the whole canopy.
function paintClumps(pix, blobs, pal, seed, { top, bottom, outline = true, speckle = 0.05 } = {}) {
  const W = pix.w, H = pix.h, owner = new Int16Array(W * H).fill(-1);
  const L = pal.length;
  blobs.sort((a, b) => a.y - b.y);
  blobs.forEach((b, k) => {
    const r = b.r;
    for (let py = Math.floor(b.y - r - 1); py <= Math.ceil(b.y + r + 1); py++) {
      for (let px = Math.floor(b.x - r - 1); px <= Math.ceil(b.x + r + 1); px++) {
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const nx = (px + 0.5 - b.x) / r, ny = (py + 0.5 - b.y) / (r * (b.sq || 1));
        const d2 = nx * nx + ny * ny;
        const edge = 1 + (hash2(px, py, seed + k) - 0.5) * 0.16;
        if (d2 > edge) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
        const lam = LX * nx + LY * ny + LZ * nz;
        const gv = clamp((py - top) / Math.max(1, bottom - top), 0, 1);
        let s = 0.5 + lam * 0.42 + (0.5 - gv) * 0.42 + (b.lift || 0);
        s += (hash2(px, py, seed) - 0.5) * 0.16;
        const lv = Math.floor(s * (L - 2) + bayer(px, py) * 0.9 + 0.55);
        pix.set(px, py, pal[clamp(lv, 1, L - 1)]);
        owner[py * W + px] = k;
      }
    }
  });
  // clump separation lines (on the shaded underside of the clump above)
  for (let py = 1; py < H; py++) for (let px = 0; px < W; px++) {
    const k = owner[py * W + px], up = owner[(py - 1) * W + px];
    if (k >= 0 && up >= 0 && up !== k && up < k && hash2(px, py, seed + 77) < 0.85) pix.set(px, py - 1, pal[1]);
  }
  // highlight speckles (leaf glints) on the lit side
  for (let py = 0; py < H; py++) for (let px = 0; px < W - 1; px++) {
    if (owner[py * W + px] < 0) continue;
    const c = pix.get(px, py);
    if (c[1] >= pal[L - 3][1] && hash2(px, py, seed + 31) < speckle) { pix.set(px, py, pal[L - 1]); }
  }
  if (outline) outlineMask(pix, owner, pal[0], pal[1]);
  return owner;
}

// Dark outline around every opaque region (bottom/right darker than top/left).
function outlineMask(pix, owner, dark, soft) {
  const W = pix.w, H = pix.h, out = [];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    if (owner[py * W + px] < 0) continue;
    const empty = (x, y) => x < 0 || y < 0 || x >= W || y >= H || owner[y * W + x] < 0;
    if (empty(px, py + 1) || empty(px + 1, py)) out.push([px, py, dark]);
    else if (empty(px, py - 1) || empty(px - 1, py)) out.push([px, py, soft]);
  }
  for (const [x, y, c] of out) pix.set(x, y, c);
}

function paintTrunk(pix, cx, yTop, yBot, wTop, wBot, seed) {
  const B = PAL.bark;
  for (let y = yTop; y <= yBot; y++) {
    const t = (y - yTop) / Math.max(1, yBot - yTop);
    let hw = (wTop + (wBot - wTop) * t * t) / 2;
    if (y > yBot - 3) hw += (y - (yBot - 3)) * 1.1;           // root flare
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0);
      let v = 4.6 - u * 3.2 + (hash2(x, 0, seed) < 0.25 ? -1 : 0) + (bayer(x, y) - 0.5) * 0.7;
      if (hash2(x, y >> 2, seed + 3) < 0.08) v -= 1.2;          // bark streaks
      if (x === x0) v = 1.6; if (x === x1) v = 0;
      pix.set(x, y, B[clamp(Math.round(v), 0, 6)]);
    }
  }
}

function paintBranch(pix, x0, y0, dx, dy, len, seed) {
  const B = PAL.bark;
  for (let i = 0; i <= len; i++) {
    const x = Math.round(x0 + dx * i), y = Math.round(y0 + dy * i);
    pix.set(x, y, B[4]); pix.set(x, y + 1, B[1]);
    if (i < len * 0.5) pix.set(x, y - 1, B[3]);
  }
}

// Columns along the top silhouette → perch points (sprite px, feet row).
function topPerches(pix, cols) {
  const out = [];
  for (const cx of cols) {
    const x = Math.round(cx);
    for (let y = 0; y < pix.h; y++) if (pix.alpha(x, y) > 0) { out.push({ x: x + 0.5, y: y + 2 }); break; }
  }
  return out;
}

// Deciduous tree (oak-ish) or a blossoming tree. Returns { canvas, w, h, perches }.
export function paintTree({ kind = 'oak', seed = 1, w = 86, h = 104 } = {}) {
  const rng = mulberry32(seed);
  const pix = new Pix(w, h);
  const pal = kind === 'blossom' ? PAL.blossom : PAL.leaf;
  const cx = w / 2, base = h - 1;
  const cy = h * 0.37, rx = w * 0.43, ry = h * 0.29;
  paintTrunk(pix, cx + (rng() - 0.5) * 3, Math.round(cy), base, 6, 10, seed);
  paintBranch(pix, cx - 2, cy + ry * 0.55, -0.9, -0.55, 9, seed);
  paintBranch(pix, cx + 2, cy + ry * 0.45, 0.85, -0.6, 8, seed);
  const blobs = [{ x: cx, y: cy, r: w * 0.25, lift: 0.04 }];
  const n = 13;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.35;
    const rr = 0.62 + rng() * 0.22;
    blobs.push({ x: cx + Math.cos(a) * (rx - w * 0.13) * rr / 0.75, y: cy + Math.sin(a) * (ry - w * 0.1) * rr / 0.75,
      r: w * (0.13 + rng() * 0.06), sq: 0.92 });
  }
  for (let k = 0; k < 4; k++) blobs.push({ x: cx + (rng() - 0.5) * w * 0.42, y: cy - ry * 0.6 - rng() * 3, r: w * (0.1 + rng() * 0.05), lift: 0.06 });
  for (let k = 0; k < 3; k++) blobs.push({ x: cx + (rng() - 0.5) * w * 0.55, y: cy + ry * 0.35 + rng() * 4, r: w * (0.11 + rng() * 0.04), lift: -0.05 });
  paintClumps(pix, blobs, pal, seed, { top: cy - ry, bottom: cy + ry, speckle: kind === 'blossom' ? 0.12 : 0.05 });
  if (kind === 'blossom') {                                     // a few green leaves between the blossoms
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (pix.alpha(x, y) && hash2(x, y, seed + 13) < 0.035 && y < cy + ry) pix.set(x, y, PAL.leaf[4 + ((x + y) & 1)]);
    }
  }
  // two side branches sticking out of the canopy (perches)
  const side = [];
  for (const dir of [-1, 1]) {
    const by = Math.round(cy + ry * (dir < 0 ? 0.15 : 0.32));
    let bx = Math.round(cx + dir * 4);
    while (bx > 0 && bx < w - 1 && pix.alpha(bx, by)) bx += dir;
    if (bx <= 2 || bx >= w - 3) continue;
    const len = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < len; i++) {
      const x = bx + dir * i, y = by - (i > len - 3 ? 1 : 0);
      if (x < 1 || x >= w - 1) break;
      pix.set(x, y, PAL.bark[4]); pix.set(x, y + 1, PAL.bark[1]);
    }
    const tx = bx + dir * (len - 1);
    pix.set(tx, by - 2, pal[5]); pix.set(tx + dir, by - 2, pal[6]); pix.set(tx, by - 3, pal[4]);
    side.push({ x: tx - dir * 1.5 + 0.5, y: by });
  }
  const perches = [...topPerches(pix, [w * 0.28, w * 0.42, w * 0.56, w * 0.7]), ...side];
  return { canvas: pix.canvas(), w, h, perches };
}

// Conifer: stacked jagged layers.
export function paintPine({ seed = 2, w = 50, h = 100 } = {}) {
  const rng = mulberry32(seed);
  const pix = new Pix(w, h), pal = PAL.pine, cx = w / 2;
  paintTrunk(pix, cx, h - 16, h - 1, 4, 6, seed);
  const owner = new Int16Array(w * h).fill(-1);
  const layers = 6;
  for (let k = 0; k < layers; k++) {
    const t = k / (layers - 1);                                // 0 = top
    const yTop = Math.round(2 + t * (h - 30));
    const lh = Math.round(16 + t * 10);
    const hw = 5 + t * (w / 2 - 6);
    for (let y = yTop; y < yTop + lh && y < h; y++) {
      const f = (y - yTop) / lh;
      const half = hw * Math.pow(f, 0.8) + (hash2(y, k, seed) - 0.5) * 2.2;
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        if (x < 0 || x >= w) continue;
        const u = (x - (cx - half)) / Math.max(1, 2 * half);
        let v = 5.2 - u * 2.6 - f * 2.4 + (1 - t) * 0.6 + (hash2(x, y, seed) - 0.5) * 1.1 + (bayer(x, y) - 0.5) * 0.8;
        if (f > 0.85 && hash2(x, y, seed + 1) < 0.5) v -= 1.5;
        pix.set(x, y, pal[clamp(Math.round(v), 1, 7)]);
        owner[y * w + x] = k;
      }
    }
  }
  outlineMask(pix, owner, pal[0], pal[1]);
  void rng;
  return { canvas: pix.canvas(), w, h, perches: [{ x: cx + 0.5, y: 4 }] };
}

/* ---------------------------------------------------------------- bushes */

// Bush greens: navy outline, deep teal undersides, lush yellow-green tops.
const BUSH = P('#101b25', '#142a2f', '#193934', '#1f4738', '#28583b', '#33693d', '#427c40', '#569044', '#72a648', '#95bd52', '#bcd66b', '#dbea92');
const LIGHT = (() => { const l = Math.hypot(LX, LY, LZ); return [LX / l, LY / l, LZ / l]; })();

// Outer shape of a round shrub: a lumpy dome, widest a bit above the middle,
// tucking in towards the ground (a squarer superellipse below the centre, so
// the base is broad enough to stand on but has rounded corners, not a cut).
function shrubShape(w, h, rng) {
  const base = h - 1, top = 2 + rng() * 2;
  const cx = w / 2 + (rng() - 0.5) * 2, rx = w / 2 - 4;
  const cy = top + (base + 1 - top) * 0.6, ryUp = cy - top, ryDn = base + 1.5 - cy;
  // low-frequency lumps vary the outline per seed (two- or three-lobed domes)
  const a2 = 0.03 + rng() * 0.05, a3 = 0.03 + rng() * 0.05, p2 = rng() * 6.3, p3 = rng() * 6.3;
  const lump = th => 1 + a2 * Math.sin(2 * th + p2) + a3 * Math.sin(3 * th + p3);
  return {
    top, base, cx, cy, rx, ry: ryUp, hedge: false, gw: 0.3, lw: 0.4, cast: 0.3,
    d(x, y) {
      const u = (x - cx) / rx, v = (y - cy) / (y < cy ? ryUp : ryDn), p = y < cy ? 2 : 2.5;
      return Math.pow(Math.abs(u) ** p + Math.abs(v) ** p, 1 / p) / lump(Math.atan2(v, u));
    },
    // dome normal (unit, z towards the viewer)
    normal(x, y) {
      const u = (x - cx) / rx, v = (y - cy) / (y < cy ? ryUp : ryDn) * 0.95;
      const z = Math.sqrt(Math.max(0.04, 1 - u * u - v * v));
      const l = Math.hypot(u, v, z);
      return [u / l, v / l, z / l];
    },
  };
}

// Hedge segment: a soft rounded box. Its top face is visible from the garden
// camera, so the normal points up in a band along the top; the sides round off
// so overlapping neighbours read as one continuous hedge.
function hedgeShape(w, h, rng) {
  const base = h - 1, top = 2 + rng() * 1.2;
  const x0 = 2.5, x1 = w - 2.5, cx = w / 2, hx = (x1 - x0) / 2;
  const cy = (top + base + 1) / 2, hy = (base + 1 - top) / 2;
  const p2 = rng() * 6.3;
  return {
    top, base, cx, cy, rx: hx, ry: hy, hedge: true, gw: 0.42, lw: 0.22, cast: 0.16,
    d(x, y) {
      const u = (x - cx) / hx, v = (y - cy) / hy, p = y < cy ? 4 : 6;
      return Math.pow(Math.abs(u) ** p + Math.abs(v) ** p, 1 / p) * (1 + 0.025 * Math.sin(u * 7 + p2));
    },
    normal(x, y) {
      const t = (y - top) / (base - top);
      const ny = t < 0.32 ? -0.95 + (t / 0.32) * 0.95 : (t - 0.32) * 0.45;
      const e = Math.min(x - x0, x1 - x);
      const nx = e < 7 ? (1 - e / 7) * 0.8 * Math.sign(x - cx) : 0;
      const z = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      const l = Math.hypot(nx, ny, z);
      return [nx / l, ny / l, z / l];
    },
  };
}

// Leaf clusters: small lobed spheres scattered inside the shape (dart
// throwing). Clusters near the outline poke out a little, which turns the
// silhouette into a chain of leafy bumps; the ones at the bottom are lifted so
// their round undersides hang over the dark base instead of being cut flat.
function leafClusters(shape, w, h, rng, rMin, rMax) {
  const cl = [];
  const fits = (x, y, r) => y + r * 0.7 <= shape.base                   // round bottoms stay above the ground
    && x - r * 1.2 >= 0 && x + r * 1.2 <= w && y - r * 1.2 >= 0;        // never clipped by the canvas
  const add = (x, y, r) => {
    const g = shape.normal(x, y);
    cl.push({ x, y, r, z: (shape.hedge ? 0 : g[2] * shape.ry * 1.1) + rng() * 2.2,
      lobe: 0.1 + rng() * 0.12, ph: rng() * 6.3, tone: (rng() - 0.5) * 0.08 });
  };
  // a cluster may poke out of the shape by ~2.5 px: leafy scallops on a round outline
  const inside = (x, y, r) => shape.d(x, y) <= 1 - (r * 1.1 - 2.5) / Math.min(shape.rx, shape.ry * 1.3);
  for (let i = 0; i < 900 && cl.length < 80; i++) {
    const r = rMin + rng() * (rMax - rMin);
    const x = 1 + rng() * (w - 2), y = rng() * h;
    if (!inside(x, y, r) || !fits(x, y, r)) continue;
    if (cl.some(c => (c.x - x) ** 2 + (c.y - y) ** 2 < ((c.r + r) * 0.58) ** 2)) continue;
    add(x, y, r);
  }
  // fill pass: smaller clusters wherever the shape is still bare, so the
  // outline is made of leaf bumps everywhere (no smooth envelope edge)
  for (let y = 1; y < h; y += 2) for (let x = 1; x < w; x += 2) {
    if (shape.d(x, y) > 0.97 || cl.some(c => (c.x - x) ** 2 + (c.y - y) ** 2 < (c.r * 0.8) ** 2)) continue;
    const r = 3 + rng() * 0.9;
    // pull the centre inwards until the little cluster fits the outline
    let cx = x + (rng() - 0.5), cy = Math.min(y, shape.base - r * 0.7);
    for (let k = 0; k < 6 && !inside(cx, cy, r); k++) { cx += (shape.cx - cx) * 0.15; cy += (shape.cy - cy) * 0.15; }
    if (fits(cx, cy, r) && inside(cx, cy, r)) add(cx, cy, r);
  }
  return cl;
}

// Visible surface of the overlapping clusters (+ the dark inner foliage of the
// shape behind them): owner per pixel (-1 empty, -2 inner shade, k cluster),
// depth and the cluster's local normal.
function foliageSurface(shape, clusters, w, h) {
  const n = w * h, own = new Int16Array(n).fill(-1), z = new Float32Array(n).fill(-1e9);
  const nl = new Float32Array(n * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // dark inner foliage: only peeks through gaps (and under the lifted bottom clusters)
    if (shape.d(x + 0.5, y + 0.5) < (y > shape.cy ? 1 : 0.85)) { own[y * w + x] = -2; z[y * w + x] = -1e6; }
  }
  clusters.forEach((c, k) => {
    for (let py = Math.floor(c.y - c.r - 2); py <= Math.ceil(c.y + c.r + 2); py++) {
      for (let px = Math.floor(c.x - c.r - 2); px <= Math.ceil(c.x + c.r + 2); px++) {
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const dx = px + 0.5 - c.x, dy = py + 0.5 - c.y;
        const rr = c.r * (1 + c.lobe * Math.sin(3 * Math.atan2(dy, dx) + c.ph));
        const d2 = (dx * dx + dy * dy) / (rr * rr);
        if (d2 >= 1) continue;
        const lz = Math.sqrt(1 - d2), zz = c.z + lz * c.r * 0.8, i = py * w + px;
        if (zz <= z[i]) continue;
        own[i] = k; z[i] = zz;
        nl[i * 3] = dx / rr; nl[i * 3 + 1] = dy / rr; nl[i * 3 + 2] = lz;
      }
    }
  });
  return { own, z, nl };
}

// Leaf-shaped dither threshold: jittered cells ~3 px across, each one a tiny
// leaf that is lighter at its top-left. Shade transitions then step leaf by
// leaf instead of in a checkerboard, which reads as foliage at 2-4× zoom.
// Returns { v: threshold in [0, 1], gap: true on a leaf's lower-right border }.
function leafCell(x, y, seed) {
  const S = 3, gx = Math.floor(x / S), gy = Math.floor(y / S);
  let d1 = 1e9, d2 = 1e9, bx = 0, by = 0, cell = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j;
    const px = (cx + hash2(cx, cy, seed) * 0.8 + 0.1) * S, py = (cy + hash2(cx, cy, seed + 1) * 0.8 + 0.1) * S;
    // stretched along the diagonal so the cells look like little leaves
    const dx = x + 0.5 - px, dy = y + 0.5 - py, a = (dx + dy) * 0.6, b = (dx - dy) * 1.0;
    const d = a * a + b * b;
    if (d < d1) { d2 = d1; d1 = d; bx = dx; by = dy; cell = hash2(cx, cy, seed + 2); } else if (d < d2) d2 = d;
  }
  return {
    v: clamp(cell * 0.45 + 0.3 - (bx + by) * 0.16, 0, 1),
    gap: Math.sqrt(d2) - Math.sqrt(d1) < 0.55 && bx + by > 0.3,
    tip: bx + by < -1.1 && cell < 0.35,
  };
}

// Shade the foliage: dome normal blended with each cluster's own normal,
// darker towards the ground, cast shadows of front clusters towards the
// bottom-right, a few leaf glints, and a selective outline (navy on the
// shadow side, a dark green on the lit side).
function shadeFoliage(pix, shape, clusters, surf, seed) {
  const { own, z, nl } = surf, W = pix.w, H = pix.h, L = BUSH.length;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : own[y * W + x]);
  const lv = new Int8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = own[i];
    if (k === -1) continue;
    const g = shape.normal(x + 0.5, y + 0.5);
    const t = clamp((y - shape.top) / (shape.base - shape.top), 0, 1);
    let s, ll = 0;
    if (k === -2) s = 0.1 - t * 0.08;                          // inner foliage in deep shade
    else {
      // whole-bush dome light + the cluster's own roundness + darker to the ground
      const gl = g[0] * LIGHT[0] + g[1] * LIGHT[1] + g[2] * LIGHT[2];
      ll = nl[i * 3] * LIGHT[0] + nl[i * 3 + 1] * LIGHT[1] + nl[i * 3 + 2] * LIGHT[2];
      s = 0.4 + gl * shape.gw + ll * shape.lw - t * 0.3 + clusters[k].tone;
      // cast shadow: a cluster sitting in front, towards the light
      for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [-2, -1], [-1, -2]]) {
        const j = (y + oy) * W + x + ox;
        if (x + ox >= 0 && y + oy >= 0 && own[j] >= 0 && own[j] !== k && z[j] > z[i] + 1.2) { s -= shape.cast; break; }
      }
      // crevices: darker where a neighbouring cluster stands higher on any side
      let zMax = z[i];
      for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const xx = x + ox, yy = y + oy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && own[yy * W + xx] >= 0) zMax = Math.max(zMax, z[yy * W + xx]);
      }
      s -= clamp((zMax - z[i]) / 10, 0, 0.12);
    }
    const lc = leafCell(x, y, seed);
    let c = Math.floor(s * (L - 3) + 1 + 0.1 + lc.v * 0.6);
    if (lc.gap && ll < 0.4 && s < 0.8) c -= 1;                  // dark gaps between leaves (shadow side)
    else if (lc.tip && k >= 0 && s > 0.42) c += 1;              // lit leaf tips
    lv[i] = clamp(c, 1, L - 2);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = own[i];
    if (k === -1) continue;
    let c = lv[i];
    // leaf glints where a cluster faces the light
    if (k >= 0 && c >= L - 2 && nl[i * 3] < -0.1 && nl[i * 3 + 1] < -0.3 && hash2(x, y, 51) < 0.5) c = L - 1;
    // rim light just inside the lit top outline
    if (k >= 0 && y < shape.cy && at(x, y - 2) === -1 && at(x, y - 1) !== -1 && x < shape.cx + shape.rx * 0.5) c = Math.min(c + 2, L - 1);
    const eB = at(x, y + 1) === -1, eR = at(x + 1, y) === -1, eL = at(x - 1, y) === -1, eT = at(x, y - 1) === -1;
    if (eB || (eR && !shape.hedge)) c = 0;
    else if (shape.hedge && (eR || eL)) c = clamp(c - 3, 1, 4);  // hedge sides overlap their neighbours: soft seam
    else if (eT || eL) c = clamp(c - 4, 1, 3);
    pix.set(x, y, BUSH[c]);
  }
}

// Single leaves poking out of the outline: bright on the lit top-left, dark
// on the shadow side. They break up the remaining smooth curves.
function strayLeaves(pix, rng, n) {
  const W = pix.w, H = pix.h;
  let placed = 0;
  for (let tries = 0; tries < 300 && placed < n; tries++) {
    const x = 1 + Math.floor(rng() * (W - 2)), y = 1 + Math.floor(rng() * (H - 5));
    if (!pix.alpha(x, y)) continue;
    const dirs = [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]].filter(([dx, dy]) => !pix.alpha(x + dx, y + dy) && !pix.alpha(x + 2 * dx, y + 2 * dy));
    if (!dirs.length) continue;
    const [dx, dy] = dirs[Math.floor(rng() * dirs.length)];
    const lit = dx + dy < 0 && y < H * 0.6;
    pix.set(x + dx, y + dy, lit ? BUSH[7] : BUSH[1]);
    // a 2-px leaf when it sticks straight out (stays connected to the bush)
    if ((dx === 0 || dy === 0) && rng() < 0.6) pix.set(x + 2 * dx, y + 2 * dy, lit ? BUSH[9] : BUSH[0]);
    placed++;
  }
}

// Blossoms in small groups (white, yellow or pink; one main colour per bush),
// mostly on the upper part. Each blossom is a tiny plus of petals around a
// centre; the lower ones are dimmer.
function sprinkleBlossoms(pix, surf, rng, pink) {
  const W = pix.w, H = pix.h;
  const KINDS = [
    { petal: P('#fbf7ea', '#d9d5c2'), mid: hex('#f0c548') },  // white, yellow eye
    { petal: P('#f8e277', '#d7b84e'), mid: hex('#fff4c4') },  // yellow
    { petal: P('#f6b8cb', '#c97893'), mid: hex('#fde6ee') },  // pink
  ];
  const main = pink ? 2 : Math.floor(rng() * 3);
  const groups = 4 + Math.floor(rng() * 3), placed = [];
  const leafy = (x, y) => surf.own[y * W + x] >= 0 && pix.alpha(x, y);
  for (let gk = 0; gk < groups; gk++) {
    const gx = 4 + rng() * (W - 8), gy = 3 + rng() * (H * 0.62);
    if (surf.own[Math.floor(gy) * W + Math.floor(gx)] < 0) continue;
    const kind = KINDS[rng() < 0.75 ? main : Math.floor(rng() * 3)];
    const count = 2 + Math.floor(rng() * 3);
    for (let b = 0; b < count; b++) {
      // scattered around the group's centre (not in rows)
      const ang = rng() * 6.283, rr = b === 0 ? 0 : 2.6 + rng() * 2.2;
      const x = Math.round(gx + Math.cos(ang) * rr * 1.25), y = Math.round(gy + Math.sin(ang) * rr * 0.85);
      if (x < 2 || x >= W - 2 || y < 2 || y >= H - 4 || !leafy(x, y)) continue;
      if (!leafy(x, y - 1) || !leafy(x - 1, y) || !leafy(x + 1, y) || !leafy(x, y + 1)) continue;
      if (placed.some(([px, py]) => Math.abs(px - x) < 3 && Math.abs(py - y) < 3)) continue;
      placed.push([x, y]);
      const dim = y > H * 0.5 ? 1 : 0;
      // petals lit on the top-left, shaded on the bottom-right; some blossoms
      // turn away and show only three petals
      pix.set(x, y - 1, kind.petal[dim]); pix.set(x - 1, y, kind.petal[dim]);
      pix.set(x + 1, y, kind.petal[1]);
      if (rng() < 0.7) pix.set(x, y + 1, kind.petal[1]);
      pix.set(x, y, kind.mid);
    }
  }
}

// A few grass blades in front of the base so the bush sits in the lawn.
function grassFringe(pix, rng) {
  const W = pix.w, H = pix.h, G = PAL.lawn;
  // find the base: the bottom row's opaque span
  let x0 = -1, x1 = -1;
  for (let x = 0; x < W; x++) if (pix.alpha(x, H - 1)) { if (x0 < 0) x0 = x; x1 = x; }
  if (x0 < 0) return;
  // tufts at the base corners (half on the lawn) and maybe one in front
  const spots = [x0 + 1 + Math.floor(rng() * 2), x1 - 1 - Math.floor(rng() * 2)];
  if (rng() < 0.6) spots.push(x0 + 4 + Math.floor(rng() * Math.max(1, x1 - x0 - 8)));
  for (const tx of spots) {
    // a small "V" tuft: taller middle blade, two short ones leaning outwards
    const mid = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < mid; i++) pix.set(tx, H - 1 - i, G[clamp(3 + i, 3, 5)]);
    for (const side of [-1, 1]) {
      if (rng() < 0.25) continue;
      pix.set(tx + side, H - 1, G[3]);
      pix.set(tx + side * 2, H - 2, G[4 + (rng() < 0.5 ? 1 : 0)]);
    }
  }
}

// Bushes. kind: 'leaf' (round shrub), 'flower' (shrub with blossom groups),
// 'blossom' (pink-flowering shrub) or 'hedge' (soft box segment for a row; its
// rounded sides overlap the neighbours). The bottom row is the ground line.
// Returns { canvas, w, h, perches } (perches: sprite px, feet row).
export function paintBush({ seed = 4, w = 42, h = 28, kind = 'leaf' } = {}) {
  const rng = mulberry32(seed);
  const hedge = kind === 'hedge';
  const shape = hedge ? hedgeShape(w, h, rng) : shrubShape(w, h, rng);
  const clusters = leafClusters(shape, w, h, rng, hedge ? 3.2 : 4.6, hedge ? 4.6 : 7);
  const surf = foliageSurface(shape, clusters, w, h);
  const pix = new Pix(w, h);
  shadeFoliage(pix, shape, clusters, surf, seed);
  // perches from the body's outline (before stray leaves stick out of it)
  const cols = hedge ? [w * 0.25, w * 0.5, w * 0.75] : w >= 44 ? [w * 0.3, w * 0.5, w * 0.7] : [w * 0.36, w * 0.64];
  const perches = topPerches(pix, cols);
  strayLeaves(pix, rng, hedge ? 5 : 7);
  if (kind === 'flower' || kind === 'blossom') sprinkleBlossoms(pix, surf, rng, kind === 'blossom');
  grassFringe(pix, rng);
  return { canvas: pix.canvas(), w, h, perches };
}

// Small, simple tree for the low land (fog does the rest).
export function paintFarTree({ seed = 9, w = 30, h = 40 } = {}) {
  const rng = mulberry32(seed);
  const pix = new Pix(w, h), pal = PAL.far, cx = w / 2;
  paintTrunk(pix, cx, Math.round(h * 0.55), h - 1, 3, 4, seed);
  const blobs = [{ x: cx, y: h * 0.36, r: w * 0.32 }];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rng();
    blobs.push({ x: cx + Math.cos(a) * w * 0.22, y: h * 0.36 + Math.sin(a) * h * 0.16, r: w * (0.18 + rng() * 0.06) });
  }
  paintClumps(pix, blobs, pal, seed, { top: 2, bottom: h * 0.62, speckle: 0.03 });
  return { canvas: pix.canvas(), w, h };
}

// Grass tuft (blades lean a bit; some carry a flower). 9×9.
export function paintTuft(seed, { flower = false } = {}) {
  const W = 9, H = 9, pix = new Pix(W, H), G = PAL.lawn, rng = mulberry32(seed);
  const n = 4 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const bx = 1 + Math.floor(rng() * (W - 2));
    const bh = 3 + Math.floor(rng() * 5);
    const lean = rng() < 0.5 ? -1 : 1;
    for (let i = 0; i < bh; i++) {
      const x = bx + (i > bh * 0.6 ? lean : 0), y = H - 1 - i;
      pix.set(x, y, G[clamp(2 + Math.round((i / bh) * 5), 2, 7)]);
    }
  }
  if (flower) {
    const fl = P('#f6f2e2', '#f3d55e', '#ea9ab5', '#b9a1e6')[Math.floor(rng() * 4)];
    const x = 2 + Math.floor(rng() * 5), y = 1 + Math.floor(rng() * 2);
    for (let i = y + 1; i < H; i++) pix.set(x, i, G[3]);
    pix.set(x, y, fl); pix.set(x - 1, y, fl); pix.set(x + 1, y, fl); pix.set(x, y - 1, fl);
    pix.set(x, y, hex('#e8b94a'));
  }
  return pix.canvas();
}

// Reeds for the pond edge (with a cattail or two). 9×18.
export function paintReeds(seed) {
  const W = 9, H = 18, pix = new Pix(W, H), G = PAL.lawn, rng = mulberry32(seed);
  const n = 4 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const bx = 1 + Math.floor(rng() * (W - 2)), bh = 7 + Math.floor(rng() * 10);
    const lean = rng() < 0.5 ? -1 : 1;
    for (let i = 0; i < bh; i++) {
      const x = bx + (i > bh * 0.7 ? lean : 0);
      pix.set(x, H - 1 - i, G[clamp(2 + Math.round((i / bh) * 4), 1, 6)]);
    }
    if (rng() < 0.45 && bh > 11) {                              // cattail
      for (let i = bh - 5; i < bh - 1; i++) { pix.set(bx, H - 1 - i, hex('#6b4630')); pix.set(bx + 1, H - 1 - i, hex('#4c3022')); }
    }
  }
  return pix.canvas();
}

// Lily pad seen from above (lies flat on the water). 10×7.
export function paintLily(seed) {
  const W = 10, H = 7, pix = new Pix(W, H), rng = mulberry32(seed);
  const G = P('#1f4a34', '#2c6640', '#3f8249', '#5d9e54', '#86bb6a');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2), d = dx * dx + dy * dy;
    if (d > 1) continue;
    if (dx > 0.05 && Math.abs(dy) < 0.18 + dx * 0.25) continue; // notch
    let v = 2.6 - dy * 1.2 - dx * 0.4 + (bayer(x, y) - 0.5);
    if (d > 0.72) v -= 1.2;
    pix.set(x, y, G[clamp(Math.round(v), 0, 4)]);
  }
  if (rng() < 0.6) {
    const pk = rng() < 0.5 ? P('#f7d7e0', '#e28aa6', '#fff6f8') : P('#fbf6e8', '#e6dcc0', '#ffffff');
    const fx = 3 + Math.floor(rng() * 2), fy = 2;
    pix.set(fx, fy, pk[1]); pix.set(fx + 1, fy, pk[0]); pix.set(fx, fy + 1, pk[0]); pix.set(fx + 1, fy + 1, pk[2]);
    pix.set(fx + 1, fy - 1, pk[0]);
  }
  return pix.canvas();
}

/* ---------------------------------------------------------------- effect sprites */

// Soft radial glow (white, alpha falloff) — tinted and drawn additively.
export function paintGlow(size = 64) {
  const { c, g } = makeCanvas(size, size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  return c;
}

// Contact shadow: a pixelated ellipse with a darker core (alpha only).
export function paintBlob() {
  const W = 16, H = 8, pix = new Pix(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2), d = dx * dx + dy * dy;
    if (d > 1) continue;
    pix.set(x, y, [0, 0, 0], d < 0.45 ? 255 : 150);
  }
  return pix.canvas();
}

// "z" for sleeping birds (5×5, white).
export function paintZ() {
  const rows = ['#####', '...#.', '..#..', '.#...', '#####'];
  const pix = new Pix(7, 7);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') pix.set(x + 1, y + 1, [255, 255, 255]); }));
  // dark outline for readability
  const o = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (pix.alpha(x, y)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => pix.alpha(x + dx, y + dy) && pix.get(x + dx, y + dy)[0] === 255)) o.push([x, y]);
  }
  for (const [x, y] of o) pix.set(x, y, [40, 46, 70]);
  return pix.canvas();
}

// Seeds scattered on the ground (sunflower seeds, 4×3).
export function paintSeed() {
  const pix = new Pix(4, 3);
  pix.set(0, 1, hex('#4a3a2a')); pix.set(1, 1, hex('#d9c393')); pix.set(2, 1, hex('#b89a64')); pix.set(3, 1, hex('#4a3a2a'));
  pix.set(1, 0, hex('#efdcae')); pix.set(2, 2, hex('#7a6040'));
  return pix.canvas();
}

// Draw one frame of a garden-art sprite (SPRITE_DATA entry) at 1×. `cropGround`
// drops the rows below the ground line (contact shadows; we have real ones).
export function spriteFromData(spr, fi = 0, cropGround = true) {
  const rows = spr.frames[fi % spr.frames.length];
  const w = rows[0].length, hAll = rows.length, h = cropGround ? hAll - (spr.ground || 0) : hAll;
  const pix = new Pix(w, h);
  const pal = {};
  for (const k in spr.pal) {
    const s = spr.pal[k].replace('#', '');
    pal[k] = [hex('#' + s.slice(0, 6)), s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255];
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = pal[rows[y][x]];
    if (p) pix.set(x, y, p[0], p[1]);
  }
  return pix.canvas();
}

// Composite several canvases into one (same size or bottom-aligned).
export function stack(canvases, w, h) {
  const { c, g } = makeCanvas(w, h);
  for (const { canvas, x = 0, y = 0 } of canvases) g.drawImage(canvas, x, y);
  return c;
}

export { fbm };
