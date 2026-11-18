// Every texture the game uses is painted on a canvas at start-up, seeded so it is the same every
// run: window grids by building style (with the lit-window emissive map for the night), the road
// with its lane markings, asphalt, pavement, sand, grass, boardwalk planks, corrugated steel,
// containers and the soft glow sprite for smoke and lights. No image files. Exports the painters
// and createTextureSet(), the one shared set the world builders and the effects read from.
import * as THREE from 'three';
import { createRng } from './rng.js';

const TILE = 256;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Wrap a canvas as a three.js texture: repeating and sRGB by default (the painters work in sRGB colours). */
function toTexture(c, { repeat = true, srgb = true, anisotropy = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

/**
 * Seeded grain over the whole canvas: each pixel shifts by up to ±alpha/2 of full scale. With `dark`
 * false the blue channel moves less, so sand and grass grain reads warm rather than grey.
 */
function noise(ctx, w, h, rng, alpha, dark = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * alpha * 255;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + (dark ? n : n * 0.6)));
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * A wall tile with a grid of windows. One tile is `cols` windows wide and `rows` floors tall; `winW`
 * and `winH` are the window's share of its cell; `sill`, `balcony` and `mullions` add detail. The
 * emissive map lights a seeded `litChance` share of the windows for the night. Returns {map, emissive}.
 */
export function windowTexture({ cols = 2, rows = 1, wall = '#d9d6cf', frame = '#3b3f46', glass = '#5d7f9c', glassTop = '#9fc3dc', litChance = 0.45, seed = 7, winW = 0.55, winH = 0.6, sill = false, balcony = false, mullions = false } = {}) {
  const size = TILE;
  const rng = createRng(seed);
  const day = canvas(size, size);
  const night = canvas(size, size);
  const dc = day.getContext('2d');
  const nc = night.getContext('2d');
  dc.fillStyle = wall;
  dc.fillRect(0, 0, size, size);
  noise(dc, size, size, rng, 0.08);
  nc.fillStyle = '#000';
  nc.fillRect(0, 0, size, size);
  const cw = size / cols;
  const ch = size / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const ww = cw * winW;
      const wh = ch * winH;
      const x = c * cw + (cw - ww) / 2;
      const y = r * ch + (ch - wh) / 2 + ch * 0.05;
      dc.fillStyle = frame;
      dc.fillRect(x - 3, y - 3, ww + 6, wh + 6);
      const g = dc.createLinearGradient(0, y, 0, y + wh);
      g.addColorStop(0, glassTop);
      g.addColorStop(1, glass);
      dc.fillStyle = g;
      dc.fillRect(x, y, ww, wh);
      if (mullions) {
        dc.fillStyle = frame;
        dc.fillRect(x + ww / 2 - 1, y, 2, wh);
        dc.fillRect(x, y + wh / 2 - 1, ww, 2);
      }
      if (sill) {
        dc.fillStyle = 'rgba(255,255,255,0.35)';
        dc.fillRect(x - 5, y + wh + 3, ww + 10, 3);
      }
      if (balcony) {
        dc.fillStyle = 'rgba(0,0,0,0.25)';
        dc.fillRect(x - 8, y + wh + 2, ww + 16, 10);
        dc.fillStyle = 'rgba(255,255,255,0.6)';
        for (let k = 0; k < 6; k += 1) dc.fillRect(x - 8 + k * (ww + 16) / 5, y + wh + 2, 2, 10);
      }
      const lit = rng.next() < litChance;
      if (lit) {
        const warm = rng.next();
        nc.fillStyle = warm < 0.6 ? '#ffd27a' : warm < 0.85 ? '#fff2c8' : '#9fd8ff';
        nc.fillRect(x, y, ww, wh);
        if (mullions) {
          nc.fillStyle = '#000';
          nc.fillRect(x + ww / 2 - 1, y, 2, wh);
          nc.fillRect(x, y + wh / 2 - 1, ww, 2);
        }
      }
    }
  }
  return { map: toTexture(day), emissive: toTexture(night) };
}

/** Corrugated steel for the warehouses: vertical ribs over the base colour. Returns {map, emissive: null}. */
export function corrugatedTexture(color = '#8d8f93', seed = 3) {
  const size = TILE;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 8) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, 0, 3, size);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 4, 0, 2, size);
  }
  noise(ctx, size, size, createRng(seed), 0.1);
  return { map: toTexture(c), emissive: null };
}

/**
 * One road tile, kerb to kerb across u: white edge lines, a double yellow centre line and a dash in
 * each lane over the first 30 % of v, so a 12 m repeat gives one dash cycle.
 */
export function roadTexture() {
  const w = 512;
  const h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3b40';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, createRng(11), 0.14);
  const lineW = 7;
  ctx.fillStyle = '#e9e5d8';
  ctx.fillRect(8, 0, lineW, h);
  ctx.fillRect(w - 8 - lineW, 0, lineW, h);
  ctx.fillStyle = '#f0c437';
  ctx.fillRect(w / 2 - 10, 0, 6, h);
  ctx.fillRect(w / 2 + 4, 0, 6, h);
  ctx.fillStyle = '#e9e5d8';
  for (const u of [0.25, 0.75]) {
    ctx.fillRect(w * u - lineW / 2, 0, lineW, h * 0.3);
  }
  return toTexture(c);
}

/** Plain asphalt for intersections and the island loop. */
export function asphaltTexture() {
  const size = TILE;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3b40';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, size, createRng(12), 0.14);
  return toTexture(c);
}

/** Pavement slabs: a 2 x 2 grid of joints per tile. */
export function pavementTexture() {
  const size = TILE;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8c3b8';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, size, createRng(13), 0.1);
  ctx.strokeStyle = 'rgba(60,55,50,0.45)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 128, 0);
    ctx.lineTo(i * 128, size);
    ctx.moveTo(0, i * 128);
    ctx.lineTo(size, i * 128);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Beach sand with warm grain. */
export function sandTexture() {
  const size = TILE;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efd9a8';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, size, createRng(14), 0.12, false);
  return toTexture(c);
}

/** Lawn and park grass. */
export function grassTexture() {
  const size = TILE;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6fa64a';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, size, createRng(15), 0.18, false);
  return toTexture(c);
}

/** Boardwalk and pier planks: eight boards per tile with a dark seam. */
export function woodTexture() {
  const size = TILE;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rng = createRng(16);
  for (let i = 0; i < 8; i += 1) {
    const shade = 150 + rng.int(-20, 20);
    ctx.fillStyle = `rgb(${shade + 20},${shade - 10},${shade - 50})`;
    ctx.fillRect(0, i * 32, size, 32);
    ctx.fillStyle = 'rgba(40,25,10,0.5)';
    ctx.fillRect(0, i * 32 + 30, size, 2);
  }
  noise(ctx, size, size, rng, 0.1);
  return toTexture(c);
}

/** Concrete for lots, the causeway, the quay and plinths. */
export function concreteTexture(color = '#9b9a95') {
  const size = TILE;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, size, createRng(17), 0.12);
  return toTexture(c);
}

/** Shipping-container steel: wider ribs than the warehouse walls, tinted per container by vertex colour. */
export function containerTexture(color = '#ffffff', seed = 5) {
  const size = TILE;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, 0, 5, size);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + 8, 0, 3, size);
  }
  noise(ctx, size, size, createRng(seed), 0.08);
  return toTexture(c);
}

/** A soft round sprite (solid to 40 % of the radius, then fading) for smoke, glows, lamps and the sun. */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const size = 128;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c, { repeat: false });
}

/**
 * Every texture, painted once at start-up and shared by the city builders and the effects. The
 * building styles are {map, emissive} pairs; the surfaces are single textures.
 */
export function createTextureSet() {
  return {
    facade: windowTexture({ cols: 2, rows: 1, wall: '#d9d6cf', seed: 21, sill: true }),
    glass: windowTexture({ cols: 3, rows: 1, wall: '#5d8db0', frame: '#2a4a63', glass: '#6fa8cf', glassTop: '#cde7f6', litChance: 0.5, seed: 22, winW: 0.9, winH: 0.84, mullions: true }),
    hotel: windowTexture({ cols: 2, rows: 1, wall: '#f4efe6', frame: '#ffffff', glass: '#6f8fae', glassTop: '#b6d2e6', litChance: 0.4, seed: 23, winW: 0.5, winH: 0.55, balcony: true }),
    neon: windowTexture({ cols: 2, rows: 1, wall: '#d8d0e0', frame: '#2a2634', glass: '#3f4f6e', glassTop: '#8da0c0', litChance: 0.7, seed: 24, winW: 0.45, winH: 0.5, sill: true }),
    villa: windowTexture({ cols: 2, rows: 1, wall: '#fbf6ea', frame: '#5a4a3a', glass: '#7fa9c7', glassTop: '#cfe6f3', litChance: 0.5, seed: 25, winW: 0.5, winH: 0.5 }),
    stone: windowTexture({ cols: 2, rows: 1, wall: '#efe6d2', frame: '#6b5c45', glass: '#4f5f70', glassTop: '#8ea2b6', litChance: 0.3, seed: 26, winW: 0.4, winH: 0.7 }),
    warehouse: corrugatedTexture('#9a9ea5', 27),
    container: containerTexture('#ffffff', 28),
    road: roadTexture(),
    asphalt: asphaltTexture(),
    pavement: pavementTexture(),
    sand: sandTexture(),
    grass: grassTexture(),
    wood: woodTexture(),
    concrete: concreteTexture(),
    glow: glowTexture(),
    smoke: glowTexture('rgba(200,200,205,0.8)', 'rgba(200,200,205,0)'),
  };
}
