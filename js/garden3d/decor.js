// Player decor in the 2.5D garden: every placed shop object (bird bath,
// feeder, lantern, flowers, mushrooms, stones) as an upright sprite at its
// saved position, with the perches, footprints and pecking spots it gives the
// birds, real light for lanterns at night, and the edit-mode helpers (rings
// on the ground, picking, a ghost object while placing).
//
// The store owns the positions; this module only shows them. The scene calls
// sync() with the store's items and, while the player drags something,
// preview() with the unsaved position.

import * as THREE from 'three';
import { decorById } from '../garden-data.js';
import { SPRITE_DATA } from '../garden-art.js';
import { spriteFromData, paintGlow } from './pixelart.js';
import { makeProp, pixelTexture, setQuadColor } from './sprites.js';
import { texFor } from './world.js';
import { DECOR_TEXEL } from './config.js';
import { clamp } from './util.js';

// Real point lights (more lanterns only glow). They exist only while at least one
// lantern stands: each light costs every lit pixel, and changing how many are
// visible recompiles the shaders — so it is all of them or none.
export const MAX_LANTERN_LIGHTS = 4;

// Perches in sprite pixels: [x, feet row, extra]. visit: what a bird does there.
const PERCHES = {
  birdbath: [[3.2, 1, { visit: 'drink' }], [18.6, 1, { visit: 'drink' }], [11, 2.4, { visit: 'bathe' }]],
  feeder: [[9.6, 1, { roost: true }], [1.6, 8.6, { roost: true }], [18.4, 8.6, { roost: true }],
    [2.4, 15, { visit: 'feed' }], [17.4, 15, { visit: 'feed' }]],
  lantern: [[4.5, 1, {}]],
  stones: [[6, 3, {}]],
};
// Fallback footprints (the catalog's `r` wins).
const RADIUS = { flowers: 0.7, mushrooms: 0.35, birdbath: 0.55, lantern: 0.25, feeder: 0.35, stones: 0.6 };
// Where birds like to peck on the ground near an object (radius around it).
const PECK = { feeder: 1.3, birdbath: 1.1, flowers: 0.9 };
export const radiusOf = id => decorById(id)?.r ?? RADIUS[id] ?? 0.5;

/* ---------- art (painted once) ---------- */
const art = {};
function artFor(id) {
  if (art[id]) return art[id];
  const spr = SPRITE_DATA[id];
  if (!spr) return null;
  const frames = spr.frames.map((_, f) => spriteFromData(spr, f));
  const a = { frames, tex: pixelTexture(frames[0]) };
  if (frames.length > 1) a.dur = id === 'birdbath' ? 0.7 : 0.55;
  if (id === 'lantern') {                    // the lamp pixels glow at night
    const c = document.createElement('canvas');
    c.width = frames[0].width; c.height = frames[0].height;
    const g = c.getContext('2d');
    g.drawImage(frames[0], 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const lamp = d.data[i] > 200 && d.data[i + 1] > 120 && d.data[i + 2] < 190;
      if (!lamp) d.data[i] = d.data[i + 1] = d.data[i + 2] = 0;
      d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    a.emissive = pixelTexture(c);
    a.lamp = [4.5, 6.5];
  }
  return (art[id] = a);
}

// A soft ring lying on the ground (edit mode: where things stand).
let ringTex = null;
function ringTexture() {
  if (ringTex) return ringTex;
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 4;
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2); g.fill();
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
}
const RING_COL = { idle: new THREE.Color(0.9, 0.95, 1.0), sel: new THREE.Color(1.6, 1.25, 0.35), bad: new THREE.Color(1.5, 0.3, 0.25) };

export function createDecor(scene, world, sky) {
  const items = new Map();                  // uid → view
  const lights = Array.from({ length: MAX_LANTERN_LIGHTS }, () => sky.addLantern(new THREE.Vector3(0, -40, 0)));
  for (const l of lights) l.visible = false;
  const glowTex = new THREE.CanvasTexture(paintGlow());
  let editing = false, selected = null, ghostUid = null, hovered = null, draggingUid = null;
  let animT = 0;

  function makeView(uid, id) {
    const a = artFor(id);
    if (!a) return null;
    const pr = makeProp(a.frames[0], { x: 0, y: 0, z: 0, texel: DECOR_TEXEL, tex: a.tex, emissiveMap: a.emissive || null,
      sway: id === 'flowers' ? 0.03 : 0 });
    pr.mesh.userData.decor = uid;
    scene.add(pr.mesh);
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, fog: false });
    const r = radiusOf(id);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.4, r * 2.4).rotateX(-Math.PI / 2), ringMat);
    ring.renderOrder = 3;
    ring.visible = false;
    scene.add(ring);
    // NaN: the first sync() always positions it (perches, lamp), even at exactly (0, 0)
    const v = { uid, id, r, prop: pr, ring, ringMat, x: NaN, z: NaN, y: NaN, valid: true, glow: null, perches: [] };
    if (a.lamp) {
      const gm = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      gm.color.setRGB(1.2, 0.95, 0.42);
      v.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.35), gm);
      v.glow.renderOrder = 5;
      scene.add(v.glow);
    }
    return v;
  }
  function dropView(v) {
    for (const o of [v.prop.mesh, v.ring, v.glow]) if (o) { scene.remove(o); o.geometry.dispose(); }
    v.prop.mat.dispose();
    v.prop.mesh.customDepthMaterial?.dispose();
    v.ringMat.dispose();
    v.glow?.material.dispose();
  }
  // world position of a sprite pixel of a view (makeProp's toWorld is fixed at creation)
  const at = (v, px, py, dz = 0.06) => {
    const a = artFor(v.id).frames[0];
    return new THREE.Vector3(v.x + (px - a.width / 2) * DECOR_TEXEL, v.y + (a.height - py) * (v.prop.h / a.height), v.z + dz);
  };
  // Perch objects are recreated only when the object moves, so birds sitting
  // on it keep their perch through unrelated decor changes.
  function moveView(v, x, z) {
    v.x = x; v.z = z; v.y = world.heightAt(x, z);
    v.prop.mesh.position.set(x, v.y, z);
    v.ring.position.set(x, v.y + 0.02, z);
    if (v.glow) { const l = at(v, ...artFor(v.id).lamp, 0.12); v.lamp = l; v.glow.position.copy(l); }
    v.perches = (PERCHES[v.id] || []).map(([px, py, extra]) => {
      const p = at(v, px, py);
      return { x: p.x, y: p.y, z: p.z, kind: v.id, owner: v.uid, taken: null, ...extra };
    });
  }

  // What the birds get from the placed decor (the nest adds its own).
  function contributions() {
    const perches = [], obstacles = [], flowers = [], visits = [];
    for (const v of items.values()) {
      if (v.uid === ghostUid || v.uid === draggingUid) continue;     // not placed yet / being moved
      obstacles.push({ x: v.x, z: v.z, r: v.r, owner: v.uid });
      perches.push(...(v.perches || []));
      if (v.id === 'flowers') flowers.push({ x: v.x, y: v.y, z: v.z });
      if (PECK[v.id]) visits.push({ x: v.x, z: v.z, r: PECK[v.id], kind: v.id });
    }
    return { perches, obstacles, flowers, visits };
  }

  function assignLights() {
    const lamps = [...items.values()].filter(v => v.glow && v.uid !== ghostUid).sort((a, b) => (a.uid < b.uid ? -1 : 1));
    lights.forEach((l, i) => {
      const v = lamps[i];
      l.userData.active = !!v;
      l.visible = lamps.length > 0;
      if (v) l.position.copy(v.lamp);
    });
  }

  function paintRing(v) {
    v.ring.visible = editing || v.uid === ghostUid;
    const col = !v.valid ? RING_COL.bad : v.uid === selected || v.uid === ghostUid ? RING_COL.sel : RING_COL.idle;
    v.ringMat.color.copy(col);
    v.ringMat.opacity = v.uid === selected || v.uid === ghostUid || !v.valid ? 0.95 : 0.5;
    const k = v.uid === selected || v.uid === ghostUid ? 1.18 : v.uid === hovered ? 1.1 : 1;
    setQuadColor(v.prop.mesh.geometry, k, k, k);
  }

  return {
    // list: the store's items that should be visible: [{uid, id, pos:{x,z}}]
    // (+ the ghost being placed). Returns true if anything the birds use changed.
    sync(list) {
      const seen = new Set();
      let changed = false;
      for (const it of list) {
        if (!it.pos) continue;
        seen.add(it.uid);
        let v = items.get(it.uid);
        if (!v) { v = makeView(it.uid, it.id); if (!v) continue; items.set(it.uid, v); changed = true; }
        if (v.x !== it.pos.x || v.z !== it.pos.z || v.y !== world.heightAt(it.pos.x, it.pos.z)) { moveView(v, it.pos.x, it.pos.z); changed = true; }
        v.valid = true;
        paintRing(v);
      }
      for (const [uid, v] of items) if (!seen.has(uid)) { dropView(v); items.delete(uid); changed = true; }
      if (selected && !items.has(selected)) selected = null;
      if (changed) assignLights();
      return changed;
    },
    contributions,
    // Unsaved position while dragging / placing (valid → ring colour).
    preview(uid, x, z, valid) {
      const v = items.get(uid);
      if (!v) return;
      moveView(v, x, z);
      v.valid = valid;
      paintRing(v);
      if (v.glow) assignLights();
    },
    // While it is dragged, an object offers no perches (its birds fly off) and no footprint.
    setDragging(uid) { draggingUid = uid; },
    setGhost(uid) { ghostUid = uid; for (const v of items.values()) paintRing(v); assignLights(); },
    setEditing(on) { editing = on; for (const v of items.values()) paintRing(v); },
    select(uid) { selected = uid; for (const v of items.values()) paintRing(v); },
    hover(uid) { if (hovered === uid) return; hovered = uid; for (const v of items.values()) paintRing(v); },
    has: uid => items.has(uid),
    view: uid => items.get(uid),
    radius: uid => items.get(uid)?.r ?? 0.5,
    position(uid) { const v = items.get(uid); return v ? { x: v.x, y: v.y, z: v.z, h: v.prop.h } : null; },
    // Screen-space pick (sprite rectangle + its ring), nearest to the camera first.
    pick(sx, sy, camera, W, H, pad = 6) {
      let best = null, bestD = Infinity;
      const p = new THREE.Vector3();
      for (const v of items.values()) {
        p.set(v.x - v.prop.w / 2, v.y, v.z).project(camera);
        const x0 = (p.x + 1) / 2 * W, y0 = (1 - p.y) / 2 * H;
        p.set(v.x + v.prop.w / 2, v.y + v.prop.h, v.z).project(camera);
        const x1 = (p.x + 1) / 2 * W, y1 = (1 - p.y) / 2 * H;
        p.set(v.x, v.y, v.z + v.r).project(camera);
        const yb = (1 - p.y) / 2 * H;                       // the ring's front edge counts too
        if (sx < Math.min(x0, x1) - pad || sx > Math.max(x0, x1) + pad) continue;
        if (sy < Math.min(y1, y0) - pad || sy > Math.max(y0, yb) + pad) continue;
        const d = camera.position.distanceToSquared(new THREE.Vector3(v.x, v.y, v.z));
        if (d < bestD) { bestD = d; best = v.uid; }
      }
      return best;
    },
    update(dt, time, st, camera) {
      animT += dt;
      for (const a of Object.values(art)) {
        if (!a.dur) continue;
        const f = Math.floor(animT / a.dur) % a.frames.length;
        if (a.f !== f) { a.f = f; a.tex.image = a.frames[f]; a.tex.needsUpdate = true; }
      }
      const k = st.lantern * st.flicker;
      for (const v of items.values()) {
        if (!v.glow) continue;
        v.glow.visible = k > 0.01;
        v.glow.material.opacity = k * 0.8;
        v.glow.quaternion.copy(camera.quaternion);
        v.prop.mat.emissive.setRGB(2.2 * k, 1.5 * k, 0.7 * k);
      }
      if (editing) {                                         // rings breathe a little
        const s = 1 + Math.sin(time * 3) * 0.04;
        for (const v of items.values()) if (v.ring.visible) v.ring.scale.set(s, 1, s);
      }
    },
    clear() { for (const v of items.values()) dropView(v); items.clear(); assignLights(); },
  };
}

export { clamp };
