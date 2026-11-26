// The garden tab: a 2.5D pixel-art garden (Three.js) that mirrors the garden
// store — the player's birds, the nest with its eggs, the decor at the spots
// the player chose, the pond and the shop effects — under a sky that follows
// the real time of day.
//
//   • Tap a bird → its card (name, sell). Tap an egg → its card, or hatch it.
//   • 🌾 Füttern: in this mode a tap on the lawn scatters a handful of seeds
//     (1 coin each); birds nearby come to peck. Outside it, taps only inspect.
//   • Drag to pan, wheel / two fingers to zoom.
//   • ✏️ Gestalten: drag decor and the nest to new spots, put decor into the
//     storage ("Lager") and place stored decor. Buying an object in the shop
//     ends here too: once the shop closes, the player places it.
//
// The scene never changes the save except through garden-store.js, and it
// listens to the store's events instead of being called by the shop.
//
// The WebGL scene is built on the first visit and kept while the page lives;
// leaving the tab only stops the render loop and detaches the canvas.

import * as THREE from 'three';
import { PITCH, FOV } from './config.js';
import { buildWorld, updateWorld } from './world.js';
import { createSky, formatHour } from './sky.js';
import { createPost } from './post.js';
import { Flock, portraitClip, loadKit } from './birds.js';
import { createFx } from './fx.js';
import { createExtraFx } from './fx-extra.js';
import { createDecor, radiusOf } from './decor.js';
import { createNest } from './eggs.js';
import { shared } from './sprites.js';
import { decorById, speciesInfo } from '../garden-data.js';
import { variantFor } from '../garden-variants.js';
import * as store from '../garden-store.js';
import { spendCoins, getCoins } from '../engine.js';
import { openShop } from '../shop.js';
import { drawDecorIcon } from '../garden-art.js';
import {
  initGardenUI, destroyGardenUI, showBirdCard, showEggCard, hideCard, currentCard, showBanner,
} from '../garden-ui.js';
import { clamp, ease, rnd } from './util.js';

const HATCH_REVEAL_S = 0.9;      // hatchling hops, then it is selected and its card asks for a name
const TAP_SLOP = 7;              // px a press may move and still count as a tap
const FEED_COST = 1;             // coins per handful of seeds
const FEED_GAP_MS = 350;         // a quick double tap scatters (and costs) only once
const BOUNDS = { x0: -14, x1: 14, z0: -11, z1: 7.5 };
const shopOpen = () => !!document.querySelector('dialog.shop-dialog[open]');
const $ = (root, sel) => root.querySelector(sel);

/* ================================================================ one-time setup */

let G = null;                    // the built scene (kept for the page's lifetime)

function build() {
  const canvas = document.createElement('canvas');
  canvas.className = 'g3d-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 260);
  const world = buildWorld(scene, { pond: store.isDecorOn('pond') });
  const sky = createSky(scene);
  const fx = createFx(scene, world);
  const xfx = createExtraFx(scene);
  const flock = new Flock(scene, world, fx);
  const decor = createDecor(scene, world, sky);
  const nest = createNest(scene, world, xfx);
  const post = createPost(renderer);
  return { canvas, renderer, scene, camera, world, sky, fx, xfx, flock, decor, nest, post };
}

/* ================================================================ state of a visit */

let mounted = false, running = false, raf = 0, last = 0, clock = 0;
let wrap = null, ui = null, ro = null, unsub = null;
let W = 1, H = 1;
const cam = { x: 0, z: -0.6, dist: 30, gx: 0, gz: -0.6, gdist: 30, zoomed: false, follow: false };
const focus = new THREE.Vector3();
let editing = false;
let feeding = false;             // 🌾 Füttern mode: taps on the lawn scatter seeds for FEED_COST
let lastFeed = 0;
let placing = null;              // { uid, id, x, z, valid } — a stored object being placed (not saved yet)
let selObj = null;               // edit mode: selected object uid, or 'nest'
let drag = null, pinch = null, hoverXY = null, objDrag = null;
const ptrs = new Map();
let hatchPending = new Set();    // bird uids the hatch animation spawns itself
let placeAsked = null;           // uid the shop asked us to place (waits for the shop to close)
let effectsOn = new Set(), effectReveal = false;
let relocating = false;
// A garden day lasts 10 minutes. The time of day comes from the real clock
// (position in the current 10-minute slot), so it runs on while the tab is
// away and is the same after a reload. ?gartenzeit=21.5 holds a fixed hour.
export const DAY_MS = 10 * 60 * 1000;
const gardenHour = () => ((Date.now() % DAY_MS) / DAY_MS) * 24;
const timeOverride = (() => {
  try {
    const h = parseFloat(new URLSearchParams(location.search).get('gartenzeit'));
    return { hour: Number.isFinite(h) ? ((h % 24) + 24) % 24 : null };
  } catch (e) { return { hour: null }; }
})();
let hour = 12;

/* ================================================================ camera */

function fitDist() {
  const aspect = W / H, want = aspect >= 1.45 ? 24 : aspect >= 1.1 ? 21 : 14;
  return clamp(want / (2 * Math.tan(FOV * Math.PI / 360) * aspect), 10, 46);
}
function clampCam() {
  cam.gx = clamp(cam.gx, BOUNDS.x0, BOUNDS.x1);
  cam.gz = clamp(cam.gz, BOUNDS.z0, BOUNDS.z1);
  cam.gdist = clamp(cam.gdist, 8, 52);
}
function placeCamera() {
  focus.set(cam.x, 0, cam.z);
  G.camera.position.set(cam.x, Math.sin(PITCH) * cam.dist, cam.z + Math.cos(PITCH) * cam.dist);
  G.camera.lookAt(focus);
}
function resize() {
  if (!wrap || !G) return;
  W = Math.max(1, wrap.clientWidth); H = Math.max(1, wrap.clientHeight);
  // phones: 1.5× is sharp enough for pixel art and saves a lot of fill rate
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  G.renderer.setSize(W, H, false);
  G.camera.aspect = W / H;
  G.camera.updateProjectionMatrix();
  const db = G.renderer.getDrawingBufferSize(new THREE.Vector2());
  G.post.setSize(db.x, db.y);
  G.fx.setPixelScale(db.y);
  if (!cam.zoomed) cam.dist = cam.gdist = fitDist();
}
const unitsPerPx = () => (2 * cam.dist * Math.tan(FOV * Math.PI / 360)) / H;
function panBy(dx, dy) {
  const u = unitsPerPx();
  cam.gx -= dx * u; cam.gz -= dy * u / Math.sin(PITCH);
  cam.follow = false;
  clampCam();
}
const raycaster = new THREE.Raycaster();
function groundAt(sx, sy) {
  raycaster.setFromCamera(new THREE.Vector2(sx / W * 2 - 1, -(sy / H) * 2 + 1), G.camera);
  const hit = raycaster.intersectObject(G.world.ground, false)[0];
  return hit ? hit.point : null;
}
function toScreen(v) {
  const p = v.clone().project(G.camera);
  return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, z: p.z };
}

/* ================================================================ syncing with the store */

function syncEffects() {
  const on = new Set(store.activeDecor().filter(id => decorById(id)?.kind === 'effect'));
  if (effectsOn && [...on].some(id => !effectsOn.has(id))) effectReveal = true;   // just bought / switched on
  effectsOn = on;
  G.fx.setEnabled({ fireflies: on.has('fireflies'), butterflies: on.has('butterflies') });
  G.xfx.setEnabled({ petals: on.has('petals'), sunbeams: on.has('sunbeams') });
}

// Nearest spot (spiral search) where something of radius r may stand.
function freeSpot(x, z, r, ignore) {
  if (G.world.canPlace(x, z, r, ignore)) return { x, z };
  for (let ring = 1; ring < 40; ring++) {
    const d = ring * 0.35, n = 6 + ring * 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (px < BOUNDS.x0 - 1 || px > BOUNDS.x1 + 1 || pz < -12.4 || pz > 9) continue;
      if (G.world.canPlace(px, pz, r, ignore)) return { x: +px.toFixed(2), z: +pz.toFixed(2) };
    }
  }
  return null;
}

// The pond was dug (or filled in): decor and the nest that now stand in the
// water move to the nearest dry spot; birds standing in the deep go ashore.
function relocateAfterTerrain() {
  relocating = true;
  try {
    for (const it of store.listDecorItems()) {
      if (!it.pos) continue;
      const r = radiusOf(it.id);
      if (G.world.canPlace(it.pos.x, it.pos.z, r, it.uid)) continue;
      const s = freeSpot(it.pos.x, it.pos.z, r, it.uid);
      if (s) store.placeDecor(it.uid, s.x, s.z); else store.storeDecor(it.uid);
    }
    const n = store.nestPosition();
    if (!G.world.canPlace(n.x, n.z, 0.75, 'nest')) {
      const s = freeSpot(n.x, n.z, 0.75, 'nest');
      if (s) store.setNestPosition(s.x, s.z);
    }
  } finally { relocating = false; }
  G.flock.groundChanged();
  for (const b of G.flock.birds) {
    if (b.perch || b.leaving) continue;
    if (b.task && (b.task.type === 'fly' || b.task.type === 'hop')) continue;   // airborne: lands safely by itself
    if (!G.world.walkable(b.pos.x, b.pos.z, b.kit.wader)) {
      const s = G.world.randomSpot({ near: b.pos, r: 4 }) || G.world.randomSpot();
      if (s) { b.pos.set(s.x, s.y, s.z); b.dropTask(); }
    } else b.pos.y = G.world.heightAt(b.pos.x, b.pos.z);
  }
}

function syncDecor() {
  if (G.world.setPond(store.isDecorOn('pond'))) {
    syncNest();
    if (!relocating) relocateAfterTerrain();
  }
  const list = store.listDecorItems().filter(i => i.pos && !(placing && i.uid === placing.uid));
  if (placing) list.push({ uid: placing.uid, id: placing.id, pos: { x: placing.x, z: placing.z } });
  if (objDrag && objDrag.kind === 'decor') {
    const it = list.find(i => i.uid === objDrag.uid);
    if (it) it.pos = { x: objDrag.x, z: objDrag.z };
  }
  G.decor.sync(list);
  if (selObj && selObj !== 'nest' && !G.decor.has(selObj)) selectObj(null);
  syncEffects();
  reportDecor();
  updateEditUI();
}
function syncNest() {
  const p = store.nestPosition();
  if (!(objDrag && objDrag.kind === 'nest')) G.nest.setPosition(p.x, p.z);
}
function reportDecor() {
  const d = G.decor.contributions(), n = G.nest.contributions();
  G.world.setDecor({
    perches: d.perches, flowers: d.flowers,
    obstacles: [...d.obstacles, ...n.obstacles], visits: [...d.visits, ...n.visits],
  });
  G.flock.perchesChanged();
}

function syncEggs(initial = false) {
  G.nest.sync(store.listEggs(), initial);
  const c = currentCard();
  if (c && c.type === 'egg') {
    const egg = store.listEggs().find(e => e.uid === c.uid);
    if (!egg) hideCard();
    else showEggCard(egg, { onClose: () => {} });
  }
}

function reconcileBirds(arrive) {
  const recs = store.listBirds();
  const byUid = new Map(recs.map(r => [r.uid, r]));
  for (const b of [...G.flock.birds]) {
    if (b.leaving) continue;
    const r = byUid.get(b.rec.uid);
    if (r) b.rec = r;
    else G.flock.remove(b);                                  // gone from the save (other tab, reset)
  }
  for (const r of recs) {
    if (hatchPending.has(r.uid) || G.flock.get(r.uid)) continue;
    G.flock.add(r, { arrive }).catch(e => console.warn('[garden] bird', r.species, e));
  }
}

function onStore(type, data) {
  if (!mounted) return;
  switch (type) {
    case 'bird-added': reconcileBirds(true); break;
    case 'bird-renamed': if (data?.bird) G.flock.updateRec(data.bird); break;
    case 'bird-sold': {
      const rec = data?.bird;
      if (!rec) break;
      const c = currentCard();
      if (c && c.type === 'bird' && c.uid === rec.uid) hideCard();
      const b = G.flock.sendAway(rec.uid);
      const who = rec.name || speciesInfo(rec.species).de;
      const how = b && !b.kit.canFly ? 'läuft' : 'fliegt';
      showBanner({ title: '💰 Verkauft', sub: `${who} ${how} davon · +${data.coins} ${data.coins === 1 ? 'Münze' : 'Münzen'}` });
      break;
    }
    case 'eggs': syncEggs(); reconcileBirds(true); break;          // (also after another tab changed the save)
    case 'decor':
      if (placing && !store.getDecorItem(placing.uid)) cancelPlacing();
      syncDecor(); reconcileBirds(true);
      break;
    case 'nest': syncNest(); reportDecor(); break;
    case 'place-request': placeAsked = data?.uid || null; break;
    case 'reset':
      cancelPlacing(); setEditing(false); hideCard();
      G.flock.clear(); G.nest.clear();
      syncNest(); syncEggs(true); syncDecor(); reconcileBirds(true);
      showBanner({ title: '🌱 Neuer Garten', sub: 'Neue Vögel schlüpfen aus Eiern – viel Glück!' });
      break;
  }
}

/* ================================================================ birds & eggs: tapping */

function selectBird(b, { focusName = false } = {}) {
  G.flock.select(b);
  const rec = store.getBird(b.rec.uid) || b.rec;
  const uid = rec.uid;
  const s = toScreen(b.pos);
  showBirdCard(rec, {
    portrait: portraitClip(b.kit),
    focusName,
    side: s.x < W / 2 ? 'right' : 'left',
    onRename: name => store.renameBird(uid, name),
    onSell: () => store.sellBird(uid),
    sellCoins: store.sellValue(rec),
    canSell: store.canSell(uid),
    onClose: () => { if (G.flock.selected && G.flock.selected.rec.uid === uid) G.flock.select(null); cam.follow = false; },
  });
}
function deselect() { G.flock.select(null); if (currentCard()) hideCard(); }

function tapEgg(v) {
  if (!store.isEggReady(v.egg)) {
    G.flock.select(null);
    G.nest.nudge(v);
    showEggCard(v.egg, { onClose: () => {} });
    return;
  }
  if (G.nest.hatching) { G.nest.nudge(v, 0.22); return; }
  deselect();
  // The nest takes the egg over first (hatchEgg's 'eggs' event must not drop
  // it); the callbacks are filled in once the store has hatched it.
  const cb = { ready: () => false, onBurst: null };
  if (!G.nest.beginHatch(v, { ready: () => cb.ready(), onBurst: at => cb.onBurst?.(at) })) return;
  const res = store.hatchEgg(v.egg.uid);            // saved before any animation runs
  if (!res) { G.nest.abortHatch(); syncEggs(); return; }
  hatchPending.add(res.bird.uid);
  let kitReady = false;
  loadKit(res.bird.species, res.bird.variant).then(() => { kitReady = true; }, () => { kitReady = true; });
  cb.ready = () => kitReady;
  cb.onBurst = at => revealHatch(res, at);
}

function revealHatch(res, at) {
  const rare = !!res.isVariant;
  G.xfx.burst(at, { rare, tier: res.egg.tier });
  const nestPos = G.nest.position();
  G.flock.add(res.bird, { at: { x: at.x, y: nestPos.y, z: at.z + 0.08 } }).then(b => {
    hatchPending.delete(res.bird.uid);
    if (!b) { reconcileBirds(false); return; }
    if (rare) for (let i = 0; i < 5; i++) G.xfx.sparkle(new THREE.Vector3(b.pos.x + rnd(-0.5, 0.5), b.pos.y + rnd(0.2, 1), b.pos.z + 0.1), 1, i * 0.22);
    setTimeout(() => { if (mounted && !editing && G.flock.birds.includes(b)) selectBird(b, { focusName: true }); }, HATCH_REVEAL_S * 1000);
  }, () => { hatchPending.delete(res.bird.uid); reconcileBirds(false); });
  const info = speciesInfo(res.bird.species);
  const vName = rare ? variantFor(res.bird.species, res.bird.variant)?.name || '' : '';
  if (res.isNewSpecies) {
    showBanner({ title: '🎉 Neue Art entdeckt!', sub: rare ? `${info.de} · seltene Variante ${vName}` : `${info.de} · neu in deinem Vogelbuch`, rare });
  } else if (rare) {
    showBanner({ title: '✨ Seltene Variante!', sub: `${info.de} · ${vName}` + (res.isNewVariant ? ' – neu in deinem Vogelbuch' : ''), rare: true });
  } else {
    showBanner({ title: '🐣 Geschlüpft!', sub: info.de });
  }
}

function tap(x, y) {
  if (editing) return tapEdit(x, y);
  if (feeding) return feedAt(x, y);
  const egg = G.nest.pick(x, y, G.camera, W, H, 4);
  if (egg) return tapEgg(egg);
  const b = G.flock.pick(x, y, G.camera, W, H);
  if (b && !b.leaving) return selectBird(b);
  const egg2 = G.nest.pick(x, y, G.camera, W, H, 14);
  if (egg2) return tapEgg(egg2);
  deselect();
}

/* ================================================================ feeding */

function setFeeding(on) {
  on = !!on;
  if (on && editing) setEditing(false);
  feeding = on;
  if (on) deselect();
  wrap?.classList.toggle('is-feeding', on);
  ui?.feedBtn.classList.toggle('on', on);
  if (on) hint(`Tippe auf den Rasen, um Körner zu streuen – jede Handvoll kostet ${FEED_COST} Münze.`);
  else if (ui) ui.hint.classList.remove('on');
}
// Header wallet (app.js owns it; the shop updates it the same way).
function syncHeaderCoins() {
  const el = document.getElementById('coinCount');
  if (el) el.textContent = getCoins();
}
function feedAt(x, y) {
  const now = performance.now();
  if (now - lastFeed < FEED_GAP_MS) return;
  const p = groundAt(x, y);
  if (!p || !G.world.walkable(p.x, p.z)) { hint('Dort kann man nichts streuen – tippe auf den Rasen.'); return; }
  if (!spendCoins(FEED_COST)) {
    hint('Dir fehlt eine Münze – im Quiz verdienst du neue.');
    ui.feedBtn.classList.remove('shake'); void ui.feedBtn.offsetWidth; ui.feedBtn.classList.add('shake');
    return;
  }
  lastFeed = now;
  syncHeaderCoins();
  G.flock.addSeeds(p.x, p.z);
  const tag = el('div', 'g3d-cost', `−${FEED_COST}`);
  tag.style.left = `${Math.round(x)}px`; tag.style.top = `${Math.round(y)}px`;
  wrap.appendChild(tag);
  setTimeout(() => tag.remove(), 1000);
}

/* ================================================================ edit mode */

function setEditing(on) {
  on = !!on;
  if (on && feeding) setFeeding(false);
  if (!on) { abortDrag(); cancelPlacing(); }
  editing = on;
  selectObj(null);
  G.decor.setEditing(on);
  G.nest.setEditing(on);
  if (on) deselect();
  wrap?.classList.toggle('is-editing', on);
  updateEditUI();
}
function selectObj(id) {
  selObj = id;
  G.decor.select(id && id !== 'nest' ? id : null);
  G.nest.select(id === 'nest');
  G.nest.preview(true);
  updateEditUI();
}

function startPlacing(uid) {
  const it = store.getDecorItem(uid);
  if (!it || it.pos) return;
  if (!editing) setEditing(true);
  cancelPlacing();
  const r = radiusOf(it.id);
  const s = freeSpot(cam.x, cam.z + 1, r, uid) || freeSpot(0, 0, r, uid);
  if (!s) { hint('Hier ist kein Platz mehr frei – räum etwas ins Lager.'); return; }
  placing = { uid, id: it.id, x: s.x, z: s.z, valid: true };
  G.decor.setGhost(uid);
  syncDecor();
  selectObj(uid);
  hint('Zieh es an die richtige Stelle und tippe dann auf „Hier aufstellen“.');
}
function confirmPlacing() {
  if (!placing) return false;
  // re-check: the ground or the other decor may have changed since it was dragged
  placing.valid = G.world.canPlace(placing.x, placing.z, radiusOf(placing.id), placing.uid);
  if (!placing.valid) { G.decor.preview(placing.uid, placing.x, placing.z, false); updateEditUI(); hint('Dort ist kein Platz – such dir eine freie Stelle.'); return false; }
  const { uid, x, z } = placing;
  placing = null;
  G.decor.setGhost(null);
  store.placeDecor(uid, x, z);                        // → 'decor' → syncDecor
  sparkleAt(x, z);
  selectObj(null);
  return true;
}
// A drag in progress is abandoned (Escape, leaving edit mode, …): nothing is saved.
function abortDrag() {
  if (!objDrag) return;
  const o = objDrag;
  objDrag = null;
  drag = null;
  G.decor.setDragging(null);
  if (o.kind === 'nest') { syncNest(); G.nest.preview(true); }
  else syncDecor();
}
function cancelPlacing() {
  if (!placing) return;
  if (objDrag && objDrag.uid === placing.uid) objDrag = null;
  placing = null;
  G.decor.setGhost(null);
  syncDecor();
}
function sparkleAt(x, z) {
  const y = G.world.heightAt(x, z);
  for (let i = 0; i < 6; i++) G.xfx.sparkle(new THREE.Vector3(x + rnd(-0.5, 0.5), y + rnd(0.2, 1.2), z + 0.1), i % 2 ? 0.7 : 1, i * 0.06);
}

function pickObject(x, y) {
  const d = G.decor.pick(x, y, G.camera, W, H);
  if (d) return { kind: 'decor', uid: d };
  if (G.nest.pickNest(x, y, G.camera, W, H)) return { kind: 'nest', uid: 'nest' };
  return null;
}
function tapEdit(x, y) {
  const o = pickObject(x, y);
  if (placing && (!o || o.uid !== placing.uid)) return;     // finish placing first
  selectObj(o ? o.uid : null);
}
function objPos(o) {
  if (o.kind === 'nest') return G.nest.position();
  if (placing && o.uid === placing.uid) return { x: placing.x, z: placing.z };
  return G.decor.position(o.uid);
}
function dragObject(o, sx, sy) {
  const p = groundAt(sx, sy - o.grabDy);
  if (!p) return;
  const x = +p.x.toFixed(2), z = +p.z.toFixed(2);
  const r = o.kind === 'nest' ? 0.75 : G.decor.radius(o.uid);
  const valid = G.world.canPlace(x, z, r, o.uid);
  if (!o.moved && o.kind === 'decor') { G.decor.setDragging(o.uid); reportDecor(); }   // its birds fly off
  o.x = x; o.z = z; o.valid = valid; o.moved = true;
  if (o.kind === 'nest') { G.nest.setPosition(x, z); G.nest.preview(valid); }
  else {
    G.decor.preview(o.uid, x, z, valid);
    if (placing && placing.uid === o.uid) { placing.x = x; placing.z = z; placing.valid = valid; }
  }
}
function dropObject(o) {
  if (!o.moved) return;
  G.decor.setDragging(null);
  if (placing && o.uid === placing.uid) { updateEditUI(); return; }     // confirmed with the button
  if (o.valid) {
    if (o.kind === 'nest') store.setNestPosition(o.x, o.z);
    else store.placeDecor(o.uid, o.x, o.z);
    sparkleAt(o.x, o.z);
  } else {
    hint('Dort ist kein Platz – zurück an den alten Platz.');
  }
  objDrag = null;
  if (o.kind === 'nest') { syncNest(); G.nest.preview(true); reportDecor(); } else syncDecor();
}

/* ================================================================ DOM */

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(cls, text, title) { const b = el('button', cls, text); b.type = 'button'; if (title) b.title = title; return b; }

let hintT = 0;
function hint(text) {
  if (!ui) return;
  ui.hint.textContent = text;
  ui.hint.classList.add('on');
  clearTimeout(hintT);
  hintT = setTimeout(() => ui?.hint.classList.remove('on'), 3600);
}

function buildDom(container) {
  wrap = el('div', 'garden g3d');
  wrap.appendChild(G.canvas);
  const labels = el('div', 'g3d-labels');
  const label = el('div', 'g3d-tag'), hover = el('div', 'g3d-tag soft');
  label.hidden = hover.hidden = true;
  labels.append(label, hover);
  const clockEl = el('div', 'g3d-clock');
  const actions = el('div', 'g3d-actions');
  const feedBtn = btn('g3d-btn', '🌾 Füttern', 'Körner streuen – jede Handvoll kostet 1 Münze');
  const editBtn = btn('g3d-btn', '✏️ Gestalten', 'Deko und Nest umstellen, Deko ins Lager räumen');
  const shopBtn = btn('garden-shop-btn g3d-btn', '🛒 Shop');
  const fullBtn = btn('g3d-btn g3d-icon', '⛶', 'Vollbild');
  actions.append(feedBtn, editBtn, shopBtn);
  if (wrap.requestFullscreen || wrap.webkitRequestFullscreen) actions.append(fullBtn);
  // edit mode bar + object bar + storage
  const bar = el('div', 'g3d-editbar');
  const barText = el('span', 'g3d-editbar-text', 'Ziehe Deko oder das Nest an einen neuen Platz.');
  const lagerBtn = btn('g3d-btn', '📦 Lager');
  const doneBtn = btn('g3d-btn is-gold', '✓ Fertig');
  bar.append(barText, lagerBtn, doneBtn);
  const objBar = el('div', 'g3d-objbar');
  const objName = el('span', 'g3d-objname');
  const placeBtn = btn('g3d-btn is-gold', '✓ Hier aufstellen');
  const storeBtn = btn('g3d-btn', '📦 Ins Lager');
  const cancelBtn = btn('g3d-btn', 'Abbrechen');
  objBar.append(objName, placeBtn, storeBtn, cancelBtn);
  const lager = el('div', 'g3d-lager');
  const hintEl = el('div', 'g3d-hint');
  wrap.append(labels, clockEl, actions, bar, objBar, lager, hintEl);
  const cap = el('div', 'garden-cap',
    '🐦 Vogel antippen = Steckbrief · 🌾 Füttern: Rasen antippen streut Körner (1 Münze) · ✏️ Gestalten = Deko umstellen · ziehen = schwenken, Mausrad / zwei Finger = zoomen');
  container.innerHTML = '';
  container.append(wrap, cap);
  shopBtn.onclick = () => openShop();
  editBtn.onclick = () => setEditing(!editing);
  feedBtn.onclick = () => setFeeding(!feeding);
  feedBtn.addEventListener('animationend', () => feedBtn.classList.remove('shake'));
  doneBtn.onclick = () => {
    // a piece that is still being placed is put down where it is (if that spot is free)
    if (placing && !confirmPlacing()) return;
    setEditing(false);
  };
  lagerBtn.onclick = () => { lager.classList.toggle('open'); updateEditUI(); };
  placeBtn.onclick = () => confirmPlacing();
  cancelBtn.onclick = () => { if (placing) cancelPlacing(); selectObj(null); };
  storeBtn.onclick = () => {
    const uid = selObj;
    if (!uid || uid === 'nest') return;
    if (placing && placing.uid === uid) { cancelPlacing(); selectObj(null); return; }
    selectObj(null);
    store.storeDecor(uid);
    hint('Ins Lager geräumt – über 📦 Lager kannst du es wieder aufstellen.');
  };
  fullBtn.onclick = () => {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (wrap.requestFullscreen || wrap.webkitRequestFullscreen).call(wrap);
  };
  ui = { label, hover, clock: clockEl, editBtn, feedBtn, bar, lagerBtn, objBar, objName, placeBtn, storeBtn, cancelBtn, lager, hint: hintEl };
}

function updateEditUI() {
  if (!ui) return;
  ui.editBtn.classList.toggle('on', editing);
  ui.bar.classList.toggle('show', editing);
  const stored = store.listDecorItems().filter(i => !i.pos && !(placing && i.uid === placing.uid));
  ui.lagerBtn.textContent = `📦 Lager (${stored.length})`;
  // object bar: placing → confirm/cancel; selected decor → to storage; nest → just a hint
  const show = editing && (placing || selObj);
  ui.objBar.classList.toggle('show', !!show);
  if (show) {
    const id = placing ? placing.id : selObj === 'nest' ? null : store.getDecorItem(selObj)?.id;
    ui.objName.textContent = placing ? `${decorById(placing.id)?.name || 'Deko'} aufstellen` : selObj === 'nest' ? 'Nest – zum Verschieben ziehen' : `${decorById(id)?.name || 'Deko'} – zum Verschieben ziehen`;
    ui.placeBtn.hidden = !placing;
    ui.placeBtn.disabled = !!placing && !placing.valid;
    ui.storeBtn.hidden = !!placing || selObj === 'nest';
    ui.cancelBtn.textContent = placing ? 'Abbrechen' : 'Schließen';
  }
  // storage tray
  const open = editing && ui.lager.classList.contains('open');
  ui.lager.classList.toggle('show', open);
  if (!open) return;
  const groups = new Map();
  for (const it of stored) { if (!groups.has(it.id)) groups.set(it.id, []); groups.get(it.id).push(it); }
  const sig = [...groups].map(([id, l]) => id + l.length).join('|');
  if (ui.lager.dataset.sig === sig) return;
  ui.lager.dataset.sig = sig;
  ui.lager.replaceChildren();
  if (!groups.size) {
    ui.lager.append(el('p', 'g3d-lager-empty', 'Dein Lager ist leer. Neue Deko gibt es im 🛒 Shop.'));
    return;
  }
  for (const [id, list] of groups) {
    const row = el('div', 'g3d-lager-row');
    const cv = el('canvas', 'g3d-lager-ico');
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.height = Math.round(40 * dpr);
    try { const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.imageSmoothingEnabled = false; drawDecorIcon(c, id, 40, 40); } catch (e) { /* icon optional */ }
    const name = el('span', 'g3d-lager-name', `${decorById(id)?.name || id}${list.length > 1 ? ` ×${list.length}` : ''}`);
    const b = btn('g3d-btn is-gold', 'Aufstellen');
    b.onclick = () => {
      const it = store.listDecorItems().find(i => i.id === id && !i.pos);   // the current stored piece
      ui.lager.classList.remove('open');
      if (it) startPlacing(it.uid); else updateEditUI();
    };
    row.append(cv, name, b);
    ui.lager.append(row);
  }
}

/* ================================================================ input */

function local(e) { const r = G.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function onDown(e) {
  if (!mounted) return;
  try { G.canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
  const p = local(e);
  ptrs.set(e.pointerId, p);
  if (ptrs.size === 1) {
    drag = { start: p, last: p, moved: false };
    if (editing) {
      const o = pickObject(p[0], p[1]);
      if (o && (!placing || o.uid === placing.uid)) {
        const at = objPos(o);
        const s = at ? toScreen(new THREE.Vector3(at.x, at.y ?? G.world.heightAt(at.x, at.z), at.z)) : { y: p[1] };
        objDrag = { ...o, grabDy: p[1] - s.y, moved: false, valid: true, x: at?.x, z: at?.z };
        selectObj(o.uid);
      }
    }
  }
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
    if (drag) drag.moved = true;
    if (objDrag) { dropObject(objDrag); objDrag = null; }
  }
}
function onMove(e) {
  if (!mounted) return;
  const p = local(e);
  if (e.pointerType === 'mouse' && !ptrs.size) { hoverXY = p; return; }
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, p);
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    cam.gdist *= pinch.d / Math.max(1, d);
    cam.zoomed = true;
    panBy(mid[0] - pinch.mid[0], mid[1] - pinch.mid[1]);
    pinch.d = d; pinch.mid = mid;
    return;
  }
  if (!drag || ptrs.size !== 1) return;
  if (!drag.moved && Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) > TAP_SLOP) drag.moved = true;
  if (drag.moved) {
    if (objDrag) dragObject(objDrag, p[0], p[1]);
    else panBy(p[0] - drag.last[0], p[1] - drag.last[1]);
  }
  drag.last = p;
}
function onUp(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2 && pinch) {
    pinch = null;
    // the finger that stays down pans on from where it is now (no jump, no tap)
    const rest = [...ptrs.values()][0];
    if (rest) drag = { start: rest, last: rest, moved: true };
  }
  if (ptrs.size) return;
  const d = drag, o = objDrag;
  drag = null; objDrag = null;
  if (o) { if (o.moved) { objDrag = o; dropObject(o); objDrag = null; } else updateEditUI(); }
  if (d && !d.moved && e.type === 'pointerup' && !(o && o.moved)) tap(...d.last);
}
function onLeave(e) { if (e.pointerType === 'mouse') { hoverXY = null; ui.hover.hidden = true; G.canvas.style.cursor = ''; } }
function onWheel(e) {
  e.preventDefault();
  cam.gdist *= Math.exp(e.deltaY * 0.0011);
  cam.zoomed = true;
  clampCam();
}
// Safari (macOS trackpad / iPad) pinches with its own gesture events.
let gestureDist = 0;
function onGestureStart(e) { e.preventDefault(); gestureDist = cam.gdist; }
function onGestureChange(e) {
  e.preventDefault();
  if (e.scale > 0) { cam.gdist = gestureDist / e.scale; cam.zoomed = true; clampCam(); }
}
function onKey(e) {
  if (!mounted || e.key !== 'Escape' || e.defaultPrevented) return;
  if (document.querySelector('dialog[open]')) return;
  if (objDrag) { abortDrag(); return; }
  if (placing) { cancelPlacing(); selectObj(null); return; }
  if (editing) { setEditing(false); return; }
  if (feeding) { setFeeding(false); return; }
  deselect();
}
function onVisibility() { if (document.hidden) stop(); else if (mounted) start(); }

/* ================================================================ loop */

const _lp = new THREE.Vector3();
function placeLabel(elm, b, text) {
  if (!b) { elm.hidden = true; return; }
  _lp.set(b.pos.x, b.pos.y + b.h + 0.08, b.pos.z).project(G.camera);
  if (_lp.z > 1) { elm.hidden = true; return; }
  elm.hidden = false;
  if (elm.textContent !== text) elm.textContent = text;
  elm.style.transform = `translate(${Math.round((_lp.x + 1) / 2 * W)}px, ${Math.round((1 - _lp.y) / 2 * H)}px) translate(-50%, -100%)`;
}

let uiT = 0;
function tick(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now; clock += dt;
  hour = timeOverride.hour != null ? timeOverride.hour : gardenHour();
  if (cam.follow && G.flock.selected) { cam.gx = G.flock.selected.pos.x; cam.gz = G.flock.selected.pos.z - 0.4; clampCam(); }
  const k = ease(dt, 7);
  cam.x += (cam.gx - cam.x) * k; cam.z += (cam.gz - cam.z) * k; cam.dist += (cam.gdist - cam.dist) * k;
  placeCamera();
  shared.uTime.value = clock;
  const st = G.sky.update(hour, clock, focus);
  G.scene.fog.near = cam.dist * 1.02; G.scene.fog.far = cam.dist * 2.5;
  const open = shopOpen();
  // a purchase in the shop arrives once the shop has closed
  if (placeAsked && !open) { const uid = placeAsked; placeAsked = null; startPlacing(uid); }
  if (effectReveal && !open) {
    effectReveal = false;
    for (let i = 0; i < 16; i++) G.xfx.sparkle(new THREE.Vector3(cam.x + rnd(-8, 8), rnd(0.5, 3), cam.z + rnd(-5, 4)), i % 3 ? 0.8 : 1.4, i * 0.07);
  }
  G.flock.update(dt, { night: st.night, day: st.day, hour: st.hour, dir: st.dir, isSun: st.isSun });
  G.fx.update(dt, clock, st, G.camera);
  G.xfx.update(dt, clock, st, G.camera, { heightAt: G.world.heightAt, blossoms: G.world.blossoms, bounds: G.world.bounds });
  G.decor.update(dt, clock, st, G.camera);
  G.nest.update(dt, clock, G.camera, open);
  updateWorld(G.world, clock);
  if (G.world.water) {
    const wu = G.world.water.uniforms, lt = clamp(st.sunI * 1.25 + 0.08, 0, 1);
    wu.uShallow.value.copy(WATER.darkDay).lerp(WATER.lightDay, lt);
    wu.uDeep.value.copy(WATER.darkDeep).lerp(WATER.lightDeep, lt);
    wu.uSky.value.copy(st.fogC).lerp(st.skyC, 0.4);
    wu.uSun.value.copy(st.sunC).multiplyScalar(st.sunI * 1.4);
    wu.uFoam.value.copy(WATER.foamNight).lerp(WATER.foamDay, lt);
    wu.uNight.value = st.night; wu.uGlint.value = st.day;
    wu.uFogColor.value.copy(G.scene.fog.color); wu.uFogNear.value = G.scene.fog.near; wu.uFogFar.value = G.scene.fog.far;
  }
  const pu = G.post.uniforms;
  pu.uExposure.value = st.exp; pu.uSat.value = st.sat; pu.uGain.value.set(...st.gain);
  pu.uTilt.value = clamp((cam.dist - 9) / 14, 0.25, 1);
  pu.uTime.value = clock;
  G.post.render(G.scene, G.camera);
  // HUD
  if ((uiT -= dt) <= 0) {
    uiT = 0.5;
    const icon = st.night > 0.5 ? '🌙' : st.hour < 8.5 ? '🌅' : st.hour > 18.8 ? '🌇' : '☀️';
    ui.clock.textContent = `${icon} ${formatHour(hour)}`;
  }
  const sel = G.flock.selected;
  placeLabel(ui.label, sel, sel ? sel.name : '');
  let hov = null, hovObj = null;
  if (hoverXY && !ptrs.size) {
    if (editing) hovObj = pickObject(hoverXY[0], hoverXY[1]);
    else hov = G.nest.pick(hoverXY[0], hoverXY[1], G.camera, W, H, 4) ? null : G.flock.pick(hoverXY[0], hoverXY[1], G.camera, W, H);
    const overEgg = !editing && G.nest.pick(hoverXY[0], hoverXY[1], G.camera, W, H, 4);
    G.canvas.style.cursor = feeding ? 'crosshair' : hov || hovObj || overEgg ? (editing ? 'grab' : 'pointer') : 'grab';
  }
  G.decor.hover(hovObj && hovObj.kind === 'decor' ? hovObj.uid : null);
  placeLabel(ui.hover, hov && hov !== sel && !hov.leaving ? hov : null, hov ? hov.name : '');
}
const WATER = {
  lightDay: new THREE.Color('#4f8f87'), darkDay: new THREE.Color('#152a3a'),
  lightDeep: new THREE.Color('#1c4552'), darkDeep: new THREE.Color('#081521'),
  foamDay: new THREE.Color('#d9efe9'), foamNight: new THREE.Color('#33476a'),
};
let lastFrame = 0;
function frame(now) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  if (now - lastFrame < 15) return;          // ~60 fps is plenty, also on 120 Hz screens (battery)
  lastFrame = now;
  try { tick(now); } catch (e) { console.error('[garden]', e); }
}
function start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
function stop() { running = false; cancelAnimationFrame(raf); }

/* ================================================================ public API */

// Throws if WebGL is not available (app.js then falls back to the 2D garden).
export function mountGarden(container) {
  if (mounted && wrap && container.contains(wrap)) { start(); return; }
  if (mounted) unmountGarden();
  const first = !G;
  if (first) G = build();
  mounted = true;
  try { mountInto(container, first); }
  catch (e) { try { unmountGarden(); } catch (e2) { /* already half gone */ } throw e; }
}
function mountInto(container, first) {
  buildDom(container);
  initGardenUI(wrap);
  const c = G.canvas;
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', onUp);
  c.addEventListener('pointerleave', onLeave);
  c.addEventListener('wheel', onWheel, { passive: false });
  c.addEventListener('gesturestart', onGestureStart);
  c.addEventListener('gesturechange', onGestureChange);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();
  editing = false; feeding = false; placing = null; selObj = null; placeAsked = null;
  // mirror the store
  syncNest();
  syncEggs(first);
  syncDecor();
  effectReveal = false;
  reconcileBirds(false);
  unsub = store.onGardenChange(onStore);
  placeCamera();
  start();
}

export function unmountGarden() {
  if (!mounted) return;
  stop();
  mounted = false;
  if (placing) cancelPlacing();
  abortDrag();
  editing = false; feeding = false;
  selectObj(null);
  G.decor.setEditing(false); G.nest.setEditing(false);
  const c = G.canvas;
  c.removeEventListener('pointerdown', onDown);
  c.removeEventListener('pointermove', onMove);
  c.removeEventListener('pointerup', onUp);
  c.removeEventListener('pointercancel', onUp);
  c.removeEventListener('pointerleave', onLeave);
  c.removeEventListener('wheel', onWheel);
  c.removeEventListener('gesturestart', onGestureStart);
  c.removeEventListener('gesturechange', onGestureChange);
  document.removeEventListener('keydown', onKey);
  document.removeEventListener('visibilitychange', onVisibility);
  if (ro) { ro.disconnect(); ro = null; }
  if (unsub) { unsub(); unsub = null; }
  try { destroyGardenUI(); } catch (e) { console.error(e); }
  G.flock.select(null);
  ptrs.clear(); drag = pinch = objDrag = hoverXY = null;
  if (wrap) wrap.remove();
  wrap = null; ui = null;
}

// Debug helpers (console): __garden.setHour(21.5), __garden.step(dt, n), __garden.shot(name).
window.__garden = {
  get G() { return G; },
  setHour(h) { timeOverride.hour = h; },
  realTime() { timeOverride.hour = null; },
  step(sec = 0.1, n = 1) { for (let i = 0; i < n; i++) { last = performance.now() - sec * 1000; tick(performance.now()); } },
  // Dev: render one frame and POST it to the local dev server (.claude/launch.json 'garden-3d').
  shot(name = 'shot') {
    this.step(0.016);
    return new Promise(res => G.canvas.toBlob(b => fetch('/__shot?' + name, { method: 'POST', body: b }).then(r => res(r.ok ? 'saved ' + name : 'failed')), 'image/jpeg', 0.88));
  },
};
