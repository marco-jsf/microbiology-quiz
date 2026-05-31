// Bird shop — a modal dialog with a grid of tiles. Each tile shows a still
// sprite (a black silhouette until the bird is owned), the name in a pixel font
// coloured by rarity, and a Buy button priced in gold coins.

import { BIRDS, birdById } from './garden-data.js';
import { ownedCount, buy } from './garden-store.js';
import { getCoins } from './engine.js';
import { getIdleClip, addBirdToScene } from './garden.js';

const RARITY_LABEL = { normal: 'Normal', rare: 'Rare', epic: 'Epic' };
const RARITY_ORDER = { normal: 0, rare: 1, epic: 2 };
// Tiles shown grouped by rarity (Normal → Rare → Epic), cheapest first within a tier.
const SORTED = [...BIRDS].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.cost - b.cost);

let dialog, coinEl;
const tiles = new Map();

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'shop-dialog';
  dialog.innerHTML = `
    <div class="shop-head">
      <div class="shop-title">Bird Shop</div>
      <div class="shop-wallet"><i class="coin-ico"></i> <b id="shopCoins">0</b></div>
      <button class="shop-close" aria-label="Close">✕</button>
    </div>
    <div class="shop-grid"></div>`;
  document.body.appendChild(dialog);
  coinEl = dialog.querySelector('#shopCoins');
  dialog.querySelector('.shop-close').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }); // backdrop

  const grid = dialog.querySelector('.shop-grid');
  for (const def of SORTED) {
    const tile = document.createElement('div');
    tile.className = `shop-tile rarity-${def.rarity}`;
    tile.innerHTML = `
      <div class="shop-sprite-wrap"><canvas class="shop-sprite"></canvas></div>
      <div class="shop-info">
        <div class="shop-name">${def.name}</div>
        <div class="shop-sub"><span class="shop-rarity">${RARITY_LABEL[def.rarity]}</span><span class="shop-owned"></span></div>
        <button class="shop-buy"><span class="shop-buy-label"></span></button>
      </div>`;
    grid.appendChild(tile);
    const btn = tile.querySelector('.shop-buy');
    btn.onclick = () => onBuy(def.id);
    tiles.set(def.id, {
      tile, btn,
      canvas: tile.querySelector('.shop-sprite'),
      owned: tile.querySelector('.shop-owned'),
      label: tile.querySelector('.shop-buy-label'),
    });
  }
}

function onBuy(id) {
  if (buy(id)) {
    addBirdToScene(id);   // fly it into the live garden
    refreshAll();
  } else {
    const t = tiles.get(id);   // can't afford — nudge the button
    t.btn.classList.remove('shake'); void t.btn.offsetWidth; t.btn.classList.add('shake');
  }
}

// Draw a still sprite (idle frame 0) into the tile, black silhouette if locked.
async function drawTileSprite(id) {
  const t = tiles.get(id);
  let clip;
  try { clip = await getIdleClip(birdById(id)); } catch (e) { return; }
  const cv = t.canvas, dpr = window.devicePixelRatio || 1, cssW = 76, cssH = 62, pad = 6;
  cv.width = cssW * dpr; cv.height = cssH * dpr;
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, cssW, cssH);
  const u = clip.u, f = clip.frames[0];
  const s = Math.min((cssW - 2 * pad) / u.w, (cssH - 2 * pad) / u.h);
  const dw = u.w * s, dh = u.h * s;
  const dx = (cssW - dw) / 2, dy = cssH - pad - dh;   // bottom-aligned, standing
  c.drawImage(clip.img, f.x + u.lx, f.y + u.ty, u.w, u.h, dx, dy, dw, dh);
  if (ownedCount(id) === 0) {                          // recolour to a pure black silhouette
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#000';
    c.fillRect(0, 0, cssW, cssH);
    c.globalCompositeOperation = 'source-over';
  }
}

function refreshAll() {
  const coins = getCoins();
  coinEl.textContent = coins;
  const hdr = document.getElementById('coinCount');   // keep the header wallet in sync
  if (hdr) hdr.textContent = coins;
  for (const def of BIRDS) {
    const t = tiles.get(def.id), n = ownedCount(def.id);
    drawTileSprite(def.id);
    t.tile.classList.toggle('is-owned', n > 0);
    t.owned.textContent = n ? `Owned ×${n}` : '';
    t.label.innerHTML = `${n ? 'Buy another' : 'Buy'} <i class="coin-ico"></i> ${def.cost}`;
    t.btn.disabled = coins < def.cost;
  }
}

export function openShop() {
  if (!dialog) build();
  refreshAll();
  dialog.showModal();
}
