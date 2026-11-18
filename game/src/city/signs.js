// The sign atlas: every shop, hotel, bar and billboard text of the city is painted once into one
// big canvas (and a glowing twin that serves as the emissive map at night), so all the signs of
// Halcyon Bay share one material and draw in one call. Exports SignAtlas (allocate a cell, then
// textures()), addSignQuad (a sign on a building face) and PANEL_UV (a plain coloured panel).
import * as THREE from 'three';

const CELL_W = 512;
const CELL_H = 128;
const COLS = 8;
const ROWS = 16;
const CAPACITY = COLS * ROWS;
/** Text is centred in a cell with this margin so a long name is squeezed, never clipped. */
const TEXT_MARGIN = 40;
/** Handed out, shared, once the atlas is full: a speck of the first cell, so a sign still renders. */
const FULL_RECT = Object.freeze({ u0: 0, v0: 1 - 1 / ROWS, u1: 0.001, v1: 1 - 1 / ROWS + 0.001 });

/** A 4096 x 2048 canvas of 128 sign cells, each 512 x 128, filled left to right, top to bottom. */
export class SignAtlas {
  constructor() {
    this.color = document.createElement('canvas');
    this.color.width = CELL_W * COLS;
    this.color.height = CELL_H * ROWS;
    this.glow = document.createElement('canvas');
    this.glow.width = this.color.width;
    this.glow.height = this.color.height;
    this.cc = this.color.getContext('2d');
    this.gc = this.glow.getContext('2d');
    this.cc.fillStyle = '#101018';
    this.cc.fillRect(0, 0, this.color.width, this.color.height);
    this.gc.fillStyle = '#000000';
    this.gc.fillRect(0, 0, this.glow.width, this.glow.height);
    this.next = 0;
    this.cache = new Map();
    this.map = null;
    this.emissive = null;
  }

  /**
   * The UV rectangle of a sign, painted on first use and shared by every later request for the same
   * text and colours. `neon` gives the tube colour (glowing text on near-black), else `bg`/`fg` paint
   * a lit shop sign. Returns `{u0, v0, u1, v1}` with v measured from the bottom as three.js does.
   * Must be called before textures(): the canvases are uploaded once. A full atlas returns FULL_RECT.
   */
  allocate(text, { neon = null, bg = '#f4efe6', fg = '#1b1b24', font = 'bold 88px Impact, "Arial Black", Arial, sans-serif' } = {}) {
    const key = `${text}|${neon}|${bg}|${fg}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const slot = this.next;
    if (slot >= CAPACITY) return FULL_RECT;
    this.next += 1;
    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    const x = col * CELL_W;
    const y = row * CELL_H;
    const cc = this.cc;
    const gc = this.gc;
    cc.save();
    gc.save();
    cc.textAlign = 'center';
    cc.textBaseline = 'middle';
    gc.textAlign = 'center';
    gc.textBaseline = 'middle';
    cc.font = font;
    gc.font = font;
    const tx = x + CELL_W / 2;
    const ty = y + CELL_H / 2 + 4;
    const maxW = CELL_W - TEXT_MARGIN;
    if (neon) {
      // Tubes: the colour canvas shows the glow lit; the emissive twin burns brighter at night.
      cc.fillStyle = '#0d0c14';
      cc.fillRect(x, y, CELL_W, CELL_H);
      cc.shadowColor = neon;
      cc.shadowBlur = 24;
      cc.fillStyle = neon;
      for (let i = 0; i < 2; i += 1) cc.fillText(text, tx, ty, maxW);
      cc.shadowBlur = 0;
      cc.fillStyle = '#ffffff';
      cc.globalAlpha = 0.8;
      cc.fillText(text, tx, ty, maxW - 8);
      gc.fillStyle = '#000';
      gc.fillRect(x, y, CELL_W, CELL_H);
      gc.shadowColor = neon;
      gc.shadowBlur = 30;
      gc.fillStyle = neon;
      for (let i = 0; i < 3; i += 1) gc.fillText(text, tx, ty, maxW);
      gc.shadowBlur = 0;
      gc.fillStyle = '#ffffff';
      gc.globalAlpha = 0.9;
      gc.fillText(text, tx, ty, maxW - 8);
    } else {
      // A painted shop sign with a border; at night it is lit warm from within.
      cc.fillStyle = bg;
      cc.fillRect(x, y, CELL_W, CELL_H);
      cc.strokeStyle = fg;
      cc.lineWidth = 6;
      cc.strokeRect(x + 6, y + 6, CELL_W - 12, CELL_H - 12);
      cc.fillStyle = fg;
      cc.fillText(text, tx, ty, maxW);
      gc.fillStyle = '#4a4538';
      gc.fillRect(x, y, CELL_W, CELL_H);
      gc.fillStyle = '#fff3d6';
      gc.fillText(text, tx, ty, maxW);
    }
    cc.restore();
    gc.restore();
    const rect = {
      u0: col / COLS,
      u1: (col + 1) / COLS,
      v0: 1 - (row + 1) / ROWS,
      v1: 1 - row / ROWS,
    };
    this.cache.set(key, rect);
    return rect;
  }

  /** The colour and emissive textures, created on first call once every sign is allocated. */
  textures() {
    if (!this.map) {
      this.map = new THREE.CanvasTexture(this.color);
      this.map.colorSpace = THREE.SRGBColorSpace;
      this.map.anisotropy = 4;
      this.emissive = new THREE.CanvasTexture(this.glow);
      this.emissive.colorSpace = THREE.SRGBColorSpace;
      this.emissive.anisotropy = 4;
    }
    return { map: this.map, emissive: this.emissive };
  }
}

/**
 * A vertical sign quad on a building face, textured with the atlas cell `rect`. `face` is
 * 'n' | 's' | 'e' | 'w' (which wall it hangs on), `cx`/`cz` the wall's centre, `w` the sign width,
 * `y` its bottom, `h` its height, `offset` how far it stands off the wall, `color` a tint.
 */
export function addSignQuad(batch, rect, face, cx, y, cz, w, h, offset = 0.12, color = '#ffffff') {
  const uv = [[rect.u0, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1], [rect.u0, rect.v1]];
  const hw = w / 2;
  if (face === 's') batch.quad([cx - hw, y, cz + offset], [cx + hw, y, cz + offset], [cx + hw, y + h, cz + offset], [cx - hw, y + h, cz + offset], [0, 0, 1], uv, color);
  else if (face === 'n') batch.quad([cx + hw, y, cz - offset], [cx - hw, y, cz - offset], [cx - hw, y + h, cz - offset], [cx + hw, y + h, cz - offset], [0, 0, -1], uv, color);
  else if (face === 'e') batch.quad([cx + offset, y, cz + hw], [cx + offset, y, cz - hw], [cx + offset, y + h, cz - hw], [cx + offset, y + h, cz + hw], [1, 0, 0], uv, color);
  else batch.quad([cx - offset, y, cz - hw], [cx - offset, y, cz + hw], [cx - offset, y + h, cz + hw], [cx - offset, y + h, cz - hw], [-1, 0, 0], uv, color);
}

/**
 * The rect for a plain coloured wall panel (doors, shutters) placed like a sign: every corner samples
 * the atlas's bottom-left pixel, which is the dark background until the last cell is used, so the
 * quad shows its tint colour.
 */
export const PANEL_UV = Object.freeze({ u0: 0, v0: 0, u1: 0, v1: 0 });
