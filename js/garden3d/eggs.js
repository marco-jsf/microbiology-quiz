// The nest and its eggs in the 2.5D garden (port of the 2D garden's nest):
// eggs sit in the nest bowl (back rim → eggs → front lip), wobble now and
// then (more as they warm up), glow and twinkle when ready, drop in from above
// when bought (once the shop has closed), and crack open when a ready egg is
// tapped. The scene does the store calls (hatchEgg) and spawns the bird.

import * as THREE from 'three';
import { SPRITE_DATA } from '../garden-art.js';
import { isEggReady } from '../garden-store.js';
import { spriteFromData, paintGlow } from './pixelart.js';
import { makeProp, makeQuad, spriteMaterials, pixelTexture } from './sprites.js';
import { DECOR_TEXEL, VSTRETCH } from './config.js';
import { rnd, clamp, ease } from './util.js';

const T = DECOR_TEXEL;
const NEST_W = 31;
// Eggs in the nest: [left column, rows above the ground] (as in garden-art.js nestEggSlots).
const LAYOUT = { 1: [[12, 4]], 2: [[7, 3], [17, 3]], 3: [[2, 3], [12, 4], [22, 3]] };
const EGG_W = 7, EGG_H = 9;
const GLOW = { normal: [1.25, 1.1, 0.75], rare: [0.8, 1.05, 1.35], epic: [1.1, 0.9, 1.4] };
const TIERS = ['normal', 'rare', 'epic'];
export const NEST_R = 0.75;
export const HATCH_CRACK_S = 1.5;
const FALL_G = 30;

let mats = null;                 // tier → [4 crack frames] → { mat, depth }
function eggMats() {
  if (mats) return mats;
  mats = {};
  for (const t of TIERS) {
    const spr = SPRITE_DATA['egg_' + t];
    mats[t] = spr.frames.map((_, f) => spriteMaterials(pixelTexture(spriteFromData(spr, f, false))));
  }
  return mats;
}

export function createNest(scene, world, xfx) {
  const backC = spriteFromData(SPRITE_DATA.nest), frontC = spriteFromData(SPRITE_DATA.nestFront);
  const back = makeProp(backC, { texel: T });
  const front = makeProp(frontC, { texel: T, shadow: false });
  scene.add(back.mesh, front.mesh);
  const glowTex = new THREE.CanvasTexture(paintGlow());
  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, opacity: 0.6 });
  {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
    ringMat.map = new THREE.CanvasTexture(c);
  }
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(NEST_R * 2.6, NEST_R * 2.6).rotateX(-Math.PI / 2), ringMat);
  ring.visible = false; ring.renderOrder = 3;
  scene.add(ring);
  const pos = new THREE.Vector3();
  let views = [];                // eggs in the nest: { egg, mesh, glow, dx, dy, … }
  let hatch = null;              // the egg cracking open
  let editing = false, selected = false;

  // Bottom-centre of slot i of n, relative to the nest's anchor (world units).
  const slot = (i, n) => {
    const l = LAYOUT[clamp(n, 1, 3)][Math.min(i, 2)];
    return { dx: (l[0] + EGG_W / 2 - NEST_W / 2) * T, dy: l[1] * T * VSTRETCH };
  };
  function newView(egg, settled) {
    const m = eggMats()[TIERS.includes(egg.tier) ? egg.tier : 'normal'];
    const mesh = new THREE.Mesh(makeQuad(EGG_W * T, EGG_H * T * VSTRETCH), m[0].mat);
    mesh.customDepthMaterial = m[0].depth;
    mesh.castShadow = true;
    const gm = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 });
    const g = GLOW[egg.tier] || GLOW.normal;
    gm.color.setRGB(g[0], g[1], g[2]);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), gm);
    glow.renderOrder = 5;
    scene.add(mesh, glow);
    return {
      egg, mesh, glow, m, frame: 0, dx: 0, dy: 0, placed: false,
      held: !settled, drop: 0, vy: 0, landed: settled,
      wobP: -1, wobAmp: 0.12, wobDur: 0.85, wobNext: rnd(2, 8), sparkT: rnd(0.4, 1.6), phase: rnd(0, 6.28),
    };
  }
  function dropView(v) {
    scene.remove(v.mesh, v.glow);
    v.mesh.geometry.dispose(); v.glow.geometry.dispose(); v.glow.material.dispose();
  }
  function setFrame(v, f) {
    f = clamp(f, 0, 3);
    if (v.frame === f) return;
    v.frame = f;
    v.mesh.material = v.m[f].mat;
    v.mesh.customDepthMaterial = v.m[f].depth;
  }
  const wobble = v => (v.wobP >= 0 ? v.wobAmp * Math.sin(v.wobP * Math.PI * 4) * (1 - v.wobP) : 0);
  function place(v, x, y, z, angle) {
    v.mesh.position.set(x, y, z);
    v.mesh.rotation.z = angle;
    v.glow.position.set(x, y + EGG_H * T * VSTRETCH * 0.45, z - 0.01);
  }
  const eggWorld = v => new THREE.Vector3(pos.x + v.dx, pos.y + v.dy + EGG_H * T * VSTRETCH * 0.5, pos.z + 0.025);

  return {
    position: () => pos.clone(),
    setPosition(x, z) {
      pos.set(x, world.heightAt(x, z), z);
      back.mesh.position.set(x, pos.y, z);
      front.mesh.position.set(x, pos.y, z + 0.05);
      ring.position.set(x, pos.y + 0.02, z);
    },
    // What the birds get: a footprint and a pecking spot next to it.
    contributions() {
      return { obstacles: [{ x: pos.x, z: pos.z, r: NEST_R, owner: 'nest' }], visits: [{ x: pos.x, z: pos.z, r: 1.3, kind: 'nest' }] };
    },
    // eggs: the store's list (store order). initial: shown settled (no drop).
    sync(eggs, initial = false) {
      const old = new Map(views.map(v => [v.egg.uid, v]));
      const next = [];
      for (const egg of eggs) {
        const v = old.get(egg.uid);
        if (v) { v.egg = egg; old.delete(egg.uid); next.push(v); }
        else next.push(newView(egg, initial));
      }
      for (const v of old.values()) dropView(v);
      views = next;
    },
    eggs: () => views,
    nudge(v, amp = 0.16) { if (v.wobP < 0) { v.wobP = 0; v.wobAmp = amp; v.wobDur = 0.6; } },
    // Screen-space pick of an egg (pad: extra px around it).
    pick(sx, sy, camera, W, H, pad = 6) {
      const p = new THREE.Vector3();
      for (let i = views.length - 1; i >= 0; i--) {
        const v = views[i];
        if (v.held) continue;
        p.set(pos.x + v.dx - EGG_W * T / 2, pos.y + v.dy - v.drop, pos.z).project(camera);
        const x0 = (p.x + 1) / 2 * W, y0 = (1 - p.y) / 2 * H;
        p.set(pos.x + v.dx + EGG_W * T / 2, pos.y + v.dy - v.drop + EGG_H * T * VSTRETCH, pos.z).project(camera);
        const x1 = (p.x + 1) / 2 * W, y1 = (1 - p.y) / 2 * H;
        if (sx >= Math.min(x0, x1) - pad && sx <= Math.max(x0, x1) + pad && sy >= Math.min(y0, y1) - pad && sy <= Math.max(y0, y1) + pad) return v;
      }
      return null;
    },
    // The nest itself (edit mode: it can be moved).
    pickNest(sx, sy, camera, W, H, pad = 8) {
      const p = new THREE.Vector3();
      p.set(pos.x - back.w / 2, pos.y, pos.z + NEST_R).project(camera);
      const x0 = (p.x + 1) / 2 * W, y0 = (1 - p.y) / 2 * H;
      p.set(pos.x + back.w / 2, pos.y + back.h + EGG_H * T, pos.z).project(camera);
      const x1 = (p.x + 1) / 2 * W, y1 = (1 - p.y) / 2 * H;
      return sx >= Math.min(x0, x1) - pad && sx <= Math.max(x0, x1) + pad && sy >= Math.min(y0, y1) - pad && sy <= Math.max(y0, y1) + pad;
    },
    setEditing(on) { editing = on; ring.visible = on; },
    select(on) { selected = on; },
    preview(valid) { ringMat.color.setRGB(valid ? (selected ? 1.6 : 0.9) : 1.5, valid ? (selected ? 1.25 : 0.95) : 0.3, valid ? (selected ? 0.35 : 1) : 0.25); },
    // A ready egg was tapped and the store has hatched it: crack it open here.
    // onBurst(worldPos) runs once the shell bursts (after ≥ HATCH_CRACK_S and
    // when ready() says the bird can appear, or after `maxWait` seconds).
    beginHatch(v, { onBurst, ready = () => true, maxWait = 8 } = {}) {
      const i = views.indexOf(v);
      if (i < 0) return false;
      views.splice(i, 1);
      v.wobP = -1;
      hatch = { v, t: 0, onBurst, ready, maxWait, index: i, n: views.length + 1 };
      return true;
    },
    abortHatch() { if (hatch) { dropView(hatch.v); hatch = null; } },
    get hatching() { return !!hatch; },
    eggWorld,
    update(dt, time, camera, shopOpen) {
      const n = views.length + (hatch ? 1 : 0);
      let k = 0;
      for (let i = 0; i < n; i++) {
        const isHatch = hatch && i === Math.min(hatch.index, n - 1);
        const v = isHatch ? hatch.v : views[k++];
        if (!v) continue;
        const s = slot(i, n);
        if (!v.placed) { v.dx = s.dx; v.dy = s.dy; v.placed = true; }
        else { const e = ease(dt, 6); v.dx += (s.dx - v.dx) * e; v.dy += (s.dy - v.dy) * e; }
      }
      for (const v of views) {
        if (v.held) {                                     // bought: on show in the shop first
          v.mesh.visible = false; v.glow.visible = false;
          if (shopOpen) continue;
          v.held = false; v.drop = 2.6; v.vy = 0; v.landed = false; v.mesh.visible = true;
        }
        if (v.drop > 0 || v.vy < 0) {
          v.vy += FALL_G * dt; v.drop -= v.vy * dt;
          if (v.drop <= 0) {
            v.drop = 0;
            if (!v.landed) {
              v.landed = true;
              this.nudge(v, 0.28);
              const c = eggWorld(v);
              for (let j = 0; j < 7; j++) {
                const a = (j / 7) * Math.PI * 2;
                xfx?.sparkle(new THREE.Vector3(c.x + Math.cos(a) * 0.35, c.y + Math.sin(a) * 0.3, c.z + 0.05), j % 2 ? 0.6 : 1, j * 0.05);
              }
            }
            v.vy = v.vy > 4 ? -v.vy * 0.3 : 0;
          }
        }
        const ready = isEggReady(v.egg);
        const r = clamp(v.egg.warmth / (v.egg.need || 1), 0, 1);
        if (v.wobP >= 0) { v.wobP += dt / v.wobDur; if (v.wobP >= 1) v.wobP = -1; }
        else if ((v.wobNext -= dt) <= 0) {
          v.wobP = 0;
          v.wobAmp = ready ? rnd(0.2, 0.28) : 0.05 + 0.15 * r;
          v.wobDur = ready ? 0.7 : 0.85;
          v.wobNext = ready ? rnd(1.6, 3.2) : rnd(7, 14) * (1 - 0.55 * r);
        }
        if (ready && (v.sparkT -= dt) <= 0) {
          v.sparkT = rnd(1.4, 3.2);
          const c = eggWorld(v);
          xfx?.sparkle(new THREE.Vector3(c.x + rnd(-0.25, 0.25), c.y + rnd(-0.1, 0.35), c.z + 0.05), 0.6);
        }
        setFrame(v, 0);
        place(v, pos.x + v.dx, pos.y + v.dy - v.drop, pos.z + 0.025, wobble(v));
        const glow = ready ? 0.55 + 0.35 * Math.sin(time * 2.4 + v.phase) : 0;
        v.glow.visible = glow > 0.01 && !v.held;
        v.glow.material.opacity = glow * 0.7;
        v.glow.quaternion.copy(camera.quaternion);
      }
      if (hatch) {
        const h = hatch, v = h.v;
        h.t += dt;
        const step = Math.min(2, Math.floor(h.t / (HATCH_CRACK_S / 3)));
        const local = (h.t % (HATCH_CRACK_S / 3)) / (HATCH_CRACK_S / 3);
        const amp = [0.14, 0.2, 0.26][step];
        const s = Math.min(1, local / 0.6);
        setFrame(v, 1 + step);
        place(v, pos.x + v.dx, pos.y + v.dy, pos.z + 0.025, s < 1 ? amp * Math.sin(s * Math.PI * 5) * (1 - s) : 0);
        v.glow.visible = true;
        v.glow.material.opacity = Math.min(1, 0.45 + 0.55 * h.t / HATCH_CRACK_S) * 0.8;
        v.glow.quaternion.copy(camera.quaternion);
        if (h.t >= HATCH_CRACK_S && (h.ready() || h.t >= h.maxWait)) {
          const at = eggWorld(v);
          hatch = null;
          dropView(v);
          try { h.onBurst?.(at); } catch (e) { console.error(e); }
        }
      }
      if (editing) { const sc = 1 + Math.sin(time * 3) * 0.04; ring.scale.set(sc, 1, sc); }
    },
    clear() { for (const v of views) dropView(v); views = []; if (hatch) dropView(hatch.v); hatch = null; },
  };
}
