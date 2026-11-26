// Tests for the garden save model in js/garden-store.js (decor pieces that the
// player places herself, the nest position, and the migration of old saves).
//
// Run from the project root:   node tools/test-garden-store.mjs
//
// No test framework and no browser: localStorage is a Map-backed mock that
// exists BEFORE the modules are imported (engine.js and garden-store.js read
// it at import time). Every scenario loads a fresh garden-store instance via a
// cache-busting query, so its top-level load() runs against the save the
// scenario wrote. engine.js (the coin wallet) is shared between instances; it
// re-reads its key on every call, so writing 'microbioCoinsV1' is enough.

import assert from 'node:assert/strict';

/* ---------- localStorage mock ---------- */
const mem = new Map();
const writes = {};                 // key → number of setItem calls (to prove "no write")
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); writes[k] = (writes[k] || 0) + 1; },
  removeItem: k => { mem.delete(k); },
};

const KEY = 'microbioBirdsV1';
const COIN_KEY = 'microbioCoinsV1';

const data = await import('../js/garden-data.js');
const { variantsOf } = await import('../js/garden-variants.js');
const engine = await import('../js/engine.js');

let instance = 0;
async function freshStore() { return import(`../js/garden-store.js?s=${++instance}`); }

// Wipe the mock and write the given garden save (object or raw string) and wallet.
function seed({ garden, coins = 5000 } = {}) {
  mem.clear();
  for (const k of Object.keys(writes)) delete writes[k];
  if (garden !== undefined) mem.set(KEY, typeof garden === 'string' ? garden : JSON.stringify(garden));
  mem.set(COIN_KEY, JSON.stringify({ coins, streak: 0, bestStreak: 0, earnedTotal: 0, spentTotal: 0 }));
}
const saved = () => JSON.parse(mem.get(KEY));
function record(S) {
  const ev = [];
  S.onGardenChange((type, d) => ev.push({ type, ...d }));
  return ev;
}
// Every uid in the save is unique and below nextUid.
function assertUidsSane(sv) {
  const all = [...sv.birds, ...sv.eggs, ...sv.items].map(x => x.uid);
  assert.equal(new Set(all).size, all.length, `duplicate uids: ${all.join(', ')}`);
  for (const u of all) assert.ok(parseInt(u.slice(1), 10) < sv.nextUid, `${u} not below nextUid ${sv.nextUid}`);
}

// A realistic save from before decor pieces existed.
const FLAMINGO_VARIANT = variantsOf('flamingo')[0].id;
const OLD_SAVE = {
  owned: { pigeon: 2, flamingo: 1 },
  birds: [
    { uid: 'b1', species: 'pigeon', variant: null, name: 'Gurke', from: 'starter', at: 1000 },
    { uid: 'b2', species: 'pigeon', variant: null, name: '', from: 'legacy', at: null },
    { uid: 'b4', species: 'flamingo', variant: FLAMINGO_VARIANT, name: 'Rosa', from: 'egg', at: 3000 },
  ],
  nextUid: 6,
  eggs: [{ uid: 'e5', tier: 'normal', warmth: 3.5, need: 10, at: 4000 }],
  decor: { lantern: { on: true, at: 1 }, feeder: { on: false, at: 2 }, pond: { on: true, at: 3 }, butterflies: { on: true, at: 4 } },
  variantsSeen: { [`flamingo:${FLAMINGO_VARIANT}`]: 3000 },
  discovered: { pigeon: 1000, flamingo: 3000 },
  hatched: 1,
  sinceVariant: 2,
};
const clone = o => JSON.parse(JSON.stringify(o));
const spot = id => { const s = data.decorById(id).spot; return { x: s[0], z: s[1] }; };

/* ---------- runner ---------- */
const results = [];
async function scenario(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`ok    ${name}`);
  } catch (e) {
    results.push(false);
    console.log(`FAIL  ${name}\n      ${String(e.stack || e).split('\n').slice(0, 4).join('\n      ')}`);
  }
}

/* ---------- scenarios ---------- */
await scenario('0. catalog: placeable flags, max/spot/r, NEST_SPOT, legacy fields kept', () => {
  const want = {
    flowers: { max: 10, spot: [-10.8, 5.6], r: 0.7 }, mushrooms: { max: 8, spot: [-10.3, -0.9], r: 0.35 },
    birdbath: { max: 3, spot: [-0.4, 2.2], r: 0.55 }, lantern: { max: 8, spot: [0.7, 6.3], r: 0.25 },
    feeder: { max: 3, spot: [-7.4, -1.4], r: 0.35 }, stones: { max: 6, spot: [14.0, 4.1], r: 0.6 },
  };
  for (const [id, w] of Object.entries(want)) {
    const d = data.decorById(id);
    assert.equal(data.isPlaceable(id), true, id);
    assert.deepEqual({ max: d.max, spot: d.spot, r: d.r }, w, id);
    assert.ok(Number.isFinite(d.x), `${id} keeps x for the 2D fallback`);
  }
  const pond = data.decorById('pond');
  assert.equal(pond.terrain, true);
  assert.equal(pond.kind, 'object');
  assert.ok(Number.isFinite(pond.x));
  assert.equal(pond.max ?? pond.spot ?? pond.r, undefined, 'pond has no max/spot/r');
  for (const id of ['pond', 'butterflies', 'petals', 'fireflies', 'sunbeams', 'nope', undefined]) {
    assert.equal(data.isPlaceable(id), false, String(id));
  }
  assert.deepEqual(data.NEST_SPOT, [-5.0, 4.6]);
  assert.equal(data.NEST_X, 0.42);
});

let migratedJSON;
await scenario('1. old save migrates: lantern placed at its spot, feeder stored, rest untouched', async () => {
  seed({ garden: clone(OLD_SAVE) });
  const S = await freshStore();
  const sv = saved();
  assert.ok(writes[KEY] >= 1, 'migration persisted');

  const items = sv.items;
  assert.equal(items.length, 2, 'one piece per owned placeable decor');
  const lantern = items.find(i => i.id === 'lantern'), feeder = items.find(i => i.id === 'feeder');
  assert.deepEqual(lantern.pos, spot('lantern'));
  assert.equal(lantern.at, 1);
  assert.equal(feeder.pos, null);
  assert.equal(feeder.at, 2);
  assert.ok(!items.some(i => i.id === 'pond' || i.id === 'butterflies'), 'no pieces for terrain/effects');
  for (const it of items) assert.match(it.uid, /^d\d+$/);

  assert.deepEqual(sv.decor, OLD_SAVE.decor, 'legacy decor flags unchanged');
  for (const k of ['owned', 'birds', 'eggs', 'discovered', 'variantsSeen', 'hatched', 'sinceVariant']) {
    assert.deepEqual(sv[k], OLD_SAVE[k], `${k} untouched`);
  }
  assert.equal(sv.nestPos, undefined);
  assertUidsSane(sv);

  // Read API on the migrated state.
  assert.deepEqual(S.listDecorItems(), items);
  assert.equal(S.decorCount('lantern'), 1);
  assert.equal(S.placedCount('lantern'), 1);
  assert.equal(S.storedCount('feeder'), 1);
  assert.equal(S.placedCount('feeder'), 0);
  assert.equal(S.ownsDecor('lantern'), true);
  assert.equal(S.ownsDecor('feeder'), true);
  assert.equal(S.ownsDecor('flowers'), false);
  assert.equal(S.isDecorOn('lantern'), true);
  assert.equal(S.isDecorOn('feeder'), false);
  assert.equal(S.ownsDecor('pond'), true);
  assert.equal(S.isDecorOn('pond'), true);
  assert.deepEqual(S.activeDecor().sort(), ['butterflies', 'lantern', 'pond']);
  assert.deepEqual(S.getDecorItem(lantern.uid), lantern);
  assert.equal(S.getDecorItem('d999'), undefined);
  assert.deepEqual(S.nestPosition(), { x: -5.0, z: 4.6 });
  // Copies, not live references.
  S.listDecorItems()[0].pos.x = 99;
  S.getDecorItem(lantern.uid).pos.z = 99;
  assert.deepEqual(S.getDecorItem(lantern.uid).pos, spot('lantern'));
  migratedJSON = mem.get(KEY);
});

await scenario('2. loading the migrated save again is idempotent (no write, same JSON, same uids)', async () => {
  seed({ garden: migratedJSON });
  for (let i = 0; i < 3; i++) {
    const S = await freshStore();
    assert.equal(S.listDecorItems().length, 2);
  }
  assert.equal(writes[KEY] || 0, 0, 'nothing written on reload');
  assert.equal(mem.get(KEY), migratedJSON, 'JSON byte-identical');
});

await scenario('3. buying lanterns up to max, then null; coins spent; place-request with the new uid', async () => {
  seed({ garden: migratedJSON, coins: 5000 });
  const S = await freshStore();
  const ev = record(S);
  const { max, cost } = data.decorById('lantern');
  const uids = new Set(S.listDecorItems().map(i => i.uid));
  let coins = engine.getCoins();
  assert.equal(coins, 5000);
  for (let n = S.decorCount('lantern'); n < max; n++) {
    assert.equal(S.canBuyDecor('lantern'), true);
    ev.length = 0;
    const item = S.buyDecor('lantern');
    assert.ok(item && item.id === 'lantern' && item.pos === null, `buy #${n + 1} returns the stored piece`);
    assert.ok(!uids.has(item.uid), `fresh uid ${item.uid}`);
    uids.add(item.uid);
    assert.equal(engine.getCoins(), coins - cost, 'coins spent');
    coins -= cost;
    assert.deepEqual(ev.map(e => e.type), ['decor', 'place-request']);
    assert.equal(ev[1].uid, item.uid);
    assert.deepEqual(S.getDecorItem(item.uid), item);
  }
  assert.equal(S.decorCount('lantern'), max);
  assert.equal(S.placedCount('lantern'), 1);
  assert.equal(S.storedCount('lantern'), max - 1);
  assert.equal(S.canBuyDecor('lantern'), false);
  ev.length = 0;
  assert.equal(S.buyDecor('lantern'), null, 'at max');
  assert.equal(engine.getCoins(), coins, 'nothing spent at max');
  assert.equal(ev.length, 0, 'no events at max');

  const sv = saved();
  assert.equal(sv.items.filter(i => i.id === 'lantern').length, max, 'persisted');
  assert.deepEqual(sv.decor.lantern, { on: true, at: 1 }, 'legacy flag: still on, original time');
  assertUidsSane(sv);

  // Not affordable: null, nothing changes.
  mem.set(COIN_KEY, JSON.stringify({ coins: 10, streak: 0, bestStreak: 0, earnedTotal: 0, spentTotal: 0 }));
  const before = mem.get(KEY);
  assert.equal(S.canBuyDecor('flowers'), true);
  assert.equal(S.buyDecor('flowers'), null);
  assert.equal(engine.getCoins(), 10);
  assert.equal(mem.get(KEY), before);
});

await scenario('4. placeDecor / storeDecor / requestPlacement keep pos and decor.<id>.on in sync', async () => {
  seed({});
  const S = await freshStore();
  const ev = record(S);
  const a = S.buyDecor('lantern'), b = S.buyDecor('lantern');
  assert.ok(a && b);
  assert.equal(saved().decor.lantern.on, false, 'bought pieces start in storage');
  assert.equal(S.isDecorOn('lantern'), false);
  assert.ok(!S.activeDecor().includes('lantern'));

  ev.length = 0;
  assert.equal(S.placeDecor(a.uid, 1.23456, -2.5), true);
  assert.deepEqual(S.getDecorItem(a.uid).pos, { x: 1.23, z: -2.5 }, 'rounded to 2 decimals');
  assert.deepEqual(ev.map(e => e.type), ['decor']);
  assert.equal(saved().decor.lantern.on, true);
  assert.deepEqual(saved().items.find(i => i.uid === a.uid).pos, { x: 1.23, z: -2.5 });
  assert.ok(S.activeDecor().includes('lantern'));

  assert.equal(S.placeDecor(b.uid, -3, 0.005), true);
  assert.equal(S.placedCount('lantern'), 2);
  assert.equal(S.placeDecor(a.uid, 4, 4), true, 'moving a placed piece');
  assert.deepEqual(S.getDecorItem(a.uid).pos, { x: 4, z: 4 });

  ev.length = 0;
  assert.equal(S.storeDecor(a.uid), true);
  assert.equal(S.getDecorItem(a.uid).pos, null);
  assert.equal(saved().decor.lantern.on, true, 'b is still placed');
  assert.equal(S.storeDecor(b.uid), true);
  assert.equal(saved().decor.lantern.on, false, 'all stored → off');
  assert.equal(S.isDecorOn('lantern'), false);
  assert.equal(S.storedCount('lantern'), 2);
  assert.deepEqual(ev.map(e => e.type), ['decor', 'decor']);

  // Invalid input: rejected without a write or an event.
  const before = mem.get(KEY), w = writes[KEY];
  ev.length = 0;
  assert.equal(S.placeDecor('d999', 1, 1), false);
  assert.equal(S.placeDecor(a.uid, NaN, 1), false);
  assert.equal(S.placeDecor(a.uid, 1, Infinity), false);
  assert.equal(S.placeDecor(a.uid, '1', 2), false);
  assert.equal(S.placeDecor(a.uid), false);
  assert.equal(S.storeDecor('nope'), false);
  assert.equal(S.requestPlacement('nope'), false);
  assert.equal(ev.length, 0);
  assert.equal(mem.get(KEY), before);
  assert.equal(writes[KEY], w);

  assert.equal(S.requestPlacement(a.uid), true);
  assert.deepEqual(ev, [{ type: 'place-request', uid: a.uid }]);
  assert.equal(writes[KEY], w, 'requestPlacement saves nothing');
});

await scenario('5. pond and effects: bought once, setDecorOn as before; activeDecor', async () => {
  seed({});
  const S = await freshStore();
  const ev = record(S);
  const coins = engine.getCoins();
  assert.equal(S.canBuyDecor('pond'), true);
  assert.equal(S.buyDecor('pond'), true);
  assert.equal(engine.getCoins(), coins - data.decorById('pond').cost);
  assert.deepEqual(ev.map(e => e.type), ['decor'], 'no place-request for terrain');
  assert.equal(S.ownsDecor('pond'), true);
  assert.equal(S.isDecorOn('pond'), true);
  assert.equal(S.decorCount('pond'), 0, 'terrain has no pieces');
  assert.deepEqual(S.listDecorItems(), []);
  assert.equal(S.canBuyDecor('pond'), false);
  assert.equal(S.buyDecor('pond'), false, 'only once');
  assert.equal(engine.getCoins(), coins - data.decorById('pond').cost);

  S.setDecorOn('pond', false);
  assert.equal(S.isDecorOn('pond'), false);
  assert.equal(saved().decor.pond.on, false);
  assert.deepEqual(S.activeDecor(), []);

  assert.equal(S.buyDecor('butterflies'), true);
  assert.equal(S.canBuyDecor('butterflies'), false);
  assert.deepEqual(S.activeDecor(), ['butterflies']);
  S.setDecorOn('pond', true);
  assert.deepEqual(S.activeDecor().sort(), ['butterflies', 'pond']);

  // setDecorOn is a no-op for placeable ids.
  const lamp = S.buyDecor('lantern');
  S.placeDecor(lamp.uid, 0, 0);
  const before = mem.get(KEY);
  S.setDecorOn('lantern', false);
  assert.equal(S.isDecorOn('lantern'), true);
  assert.equal(mem.get(KEY), before);
  S.setDecorOn('fireflies', true);    // not owned: no-op as before
  assert.equal(S.ownsDecor('fireflies'), false);
  assert.deepEqual(S.activeDecor().sort(), ['butterflies', 'lantern', 'pond']);

  assert.equal(S.canBuyDecor('nope'), false);
  assert.ok(!S.buyDecor('nope'), 'unknown id fails');
});

await scenario('6. nest position round-trip; resetGarden clears items and nestPos', async () => {
  seed({ garden: migratedJSON });
  let S = await freshStore();
  let ev = record(S);
  assert.deepEqual(S.nestPosition(), { x: -5.0, z: 4.6 });
  assert.equal(S.setNestPosition(3.333, -4), true);
  assert.deepEqual(S.nestPosition(), { x: 3.33, z: -4 });
  assert.deepEqual(saved().nestPos, { x: 3.33, z: -4 });
  assert.deepEqual(ev.map(e => e.type), ['nest']);
  ev.length = 0;
  assert.equal(S.setNestPosition(NaN, 1), false);
  assert.equal(S.setNestPosition(1, undefined), false);
  assert.equal(ev.length, 0);
  assert.deepEqual(S.nestPosition(), { x: 3.33, z: -4 });

  // Survives a reload.
  S = await freshStore();
  assert.deepEqual(S.nestPosition(), { x: 3.33, z: -4 });

  ev = record(S);
  const nextUid = saved().nextUid;
  S.resetGarden();
  const sv = saved();
  assert.deepEqual(sv.items, []);
  assert.ok(!('nestPos' in sv), 'nestPos gone');
  assert.deepEqual(sv.decor, {});
  assert.deepEqual(S.listDecorItems(), []);
  assert.deepEqual(S.nestPosition(), { x: -5.0, z: 4.6 });
  assert.equal(S.listBirds().length, 1);
  assert.ok(sv.nextUid > nextUid - 1, 'uids keep counting up');
  assert.deepEqual(ev.map(e => e.type), ['reset', 'decor', 'eggs', 'nest']);
  assert.ok(JSON.parse(mem.get('microbioBirdsV1-backup')).nestPos, 'backup has the old garden');

  // A malformed nestPos is dropped on load.
  seed({ garden: { ...JSON.parse(migratedJSON), nestPos: { x: 'a', z: 1 } } });
  S = await freshStore();
  assert.ok(!('nestPos' in saved()));
  assert.deepEqual(S.nestPosition(), { x: -5.0, z: 4.6 });
});

await scenario('7. brand-new player: items [], starter pigeon, default nest', async () => {
  seed({});
  const S = await freshStore();
  const sv = saved();
  assert.deepEqual(sv.items, []);
  assert.deepEqual(sv.decor, {});
  assert.ok(!('nestPos' in sv));
  const birds = S.listBirds();
  assert.equal(birds.length, 1);
  assert.equal(birds[0].species, 'pigeon');
  assert.equal(birds[0].from, 'starter');
  assert.deepEqual(sv.owned, { pigeon: 1 });
  assert.deepEqual(S.listDecorItems(), []);
  assert.deepEqual(S.activeDecor(), []);
  assert.deepEqual(S.nestPosition(), { x: -5.0, z: 4.6 });
  // A reload doesn't write again.
  const w = writes[KEY];
  await freshStore();
  assert.equal(writes[KEY], w);
});

await scenario('8. old save without placeable decor still gets `items` written (once)', async () => {
  const garden = clone(OLD_SAVE);
  garden.decor = { pond: { on: true, at: 3 } };
  seed({ garden });
  await freshStore();
  assert.deepEqual(saved().items, []);
  assert.deepEqual(saved().decor, garden.decor);
  const w = writes[KEY];
  assert.equal(w, 1);
  await freshStore();
  assert.equal(writes[KEY], w);
});

await scenario('9. sanitizing: bad pieces dropped/repaired; decor bought by an older build gets a piece', async () => {
  const garden = clone(OLD_SAVE);
  garden.nextUid = 3;     // stale: below existing uids
  garden.items = [
    { uid: 'd10', id: 'lantern', at: 1, pos: { x: 1, z: 2 } },
    { uid: 'd11', id: 'rocket', at: 5, pos: null },             // unknown id → dropped
    { uid: 'd12', id: 'pond', at: 5, pos: { x: 0, z: 0 } },     // not placeable → dropped
    null,                                                       // → dropped
    { uid: 'd13', id: 'feeder', at: 2, pos: { x: 'a', z: 1 } }, // bad pos → storage
    { uid: 'd14', id: 'stones', at: 'x' },                      // no pos, bad at
    { uid: 'd10', id: 'stones', at: 7, pos: null },             // duplicate uid → new uid
    { id: 'mushrooms', at: 8, pos: { x: 1, z: 1 }, tilt: 3 },   // no uid → new uid; extra field kept
  ];
  // An older build bought flowers after the migration (decor only, no piece).
  garden.decor.flowers = { on: true, at: 9 };
  seed({ garden });
  const S = await freshStore();
  const sv = saved();
  assertUidsSane(sv);
  assert.ok(sv.nextUid > 14, 'nextUid moved past every existing uid');
  const ids = sv.items.map(i => i.id);
  assert.deepEqual(ids, ['lantern', 'feeder', 'stones', 'stones', 'mushrooms', 'flowers']);
  assert.deepEqual(sv.items[0], { uid: 'd10', id: 'lantern', at: 1, pos: { x: 1, z: 2 } });
  assert.equal(sv.items[1].pos, null);
  assert.equal(sv.items[2].pos, null);
  assert.ok(Number.isFinite(sv.items[2].at));
  assert.notEqual(sv.items[3].uid, 'd10');
  assert.match(sv.items[4].uid, /^d\d+$/);
  assert.equal(sv.items[4].tilt, 3, 'unknown item fields are kept');
  assert.deepEqual(sv.items[5].pos, spot('flowers'));
  assert.equal(sv.items[5].at, 9);
  // Legacy flags follow the pieces; existing times kept, new ids get the oldest piece's.
  assert.deepEqual(sv.decor.lantern, { on: true, at: 1 });
  assert.deepEqual(sv.decor.feeder, { on: false, at: 2 });
  assert.equal(sv.decor.stones.on, false);
  assert.ok(Number.isFinite(sv.decor.stones.at));
  assert.deepEqual(sv.decor.mushrooms, { on: true, at: 8 });
  assert.deepEqual(sv.decor.flowers, { on: true, at: 9 });
  assert.equal(S.decorCount('stones'), 2);

  // And stable from here on.
  const json = mem.get(KEY), w = writes[KEY];
  await freshStore();
  assert.equal(writes[KEY], w);
  assert.equal(mem.get(KEY), json);
});

await scenario("10. a 'storage' event from another tab also emits 'nest'", async () => {
  seed({ garden: migratedJSON });
  let onStorage = null;
  globalThis.window = { addEventListener: (type, fn) => { if (type === 'storage') onStorage = fn; } };
  let S;
  try { S = await freshStore(); } finally { delete globalThis.window; }
  assert.ok(onStorage, 'listener registered');
  const ev = record(S);
  // Another tab moved the nest and placed the feeder.
  const other = JSON.parse(migratedJSON);
  other.nestPos = { x: 1, z: 1 };
  other.items.find(i => i.id === 'feeder').pos = { x: 2, z: 2 };
  mem.set(KEY, JSON.stringify(other));
  onStorage({ key: KEY });
  const types = ev.map(e => e.type);
  for (const t of ['decor', 'eggs', 'nest']) assert.ok(types.includes(t), `emits ${t}`);
  assert.deepEqual(S.nestPosition(), { x: 1, z: 1 });
  assert.equal(S.isDecorOn('feeder'), true);
  ev.length = 0;
  onStorage({ key: 'neuroQuizV1' });
  assert.equal(ev.length, 0, 'other keys ignored');
});

await scenario('11. legacy exports still exist with the same names', async () => {
  seed({});
  const S = await freshStore();
  const names = [
    'ownedCount', 'isOwned', 'isDiscovered', 'ownedFlock', 'listBirds', 'getBird', 'buy', 'sellValue', 'canSell',
    'sellBird', 'renameBird', 'BIRD_NAME_MAX', 'listEggs', 'nestCapacity', 'nestFull', 'isEggReady', 'readyEggCount',
    'buyEgg', 'warmEggs', 'hatchEgg', 'hasSeenVariant', 'variantsSeenCount', 'hatchedCount', 'ownsDecor', 'isDecorOn',
    'activeDecor', 'buyDecor', 'setDecorOn', 'resetGarden', 'onGardenChange',
    // new
    'listDecorItems', 'getDecorItem', 'decorCount', 'placedCount', 'storedCount', 'canBuyDecor', 'placeDecor',
    'storeDecor', 'requestPlacement', 'nestPosition', 'setNestPosition',
  ];
  for (const n of names) assert.ok(n in S, `export ${n}`);
});

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
process.exit(failed ? 1 : 0);
