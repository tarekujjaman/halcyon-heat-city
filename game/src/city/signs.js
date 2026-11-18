// Sign atlas for the city: every shop, hotel, bar and billboard text is painted once into one big
// canvas (plus a glowing twin used as the emissive map at night), so all the signs of Halcyon Bay
// draw in a single call. Exports the SignAtlas class that allocates a cell per text and builds the
// textures, addSignQuad to place a cell on a building face, and the PANEL_UV constant.
import * as THREE from 'three';

const CELL_W = 512;
const CELL_H = 128;
const COLS = 8;
const ROWS = 16;

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
   * The UV rectangle of a sign; `neon` gives the tube colour (glowing text on black), else `bg`/`fg`
   * paint a lit shop sign. Returns {u0, v0, u1, v1} with v measured from the bottom as three.js does.
   */
  allocate(text, { neon = null, bg = '#f4efe6', fg = '#1b1b24', font = 'bold 88px Impact, "Arial Black", Arial, sans-serif' } = {}) {
    const key = `${text}|${neon}|${bg}|${fg}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const slot = this.next;
    if (slot >= COLS * ROWS) return { u0: 0, v0: 0, u1: 0.001, v1: 0.001 };
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
    if (neon) {
      cc.fillStyle = '#0d0c14';
      cc.fillRect(x, y, CELL_W, CELL_H);
      cc.shadowColor = neon;
      cc.shadowBlur = 24;
      cc.fillStyle = neon;
      for (let i = 0; i < 2; i += 1) cc.fillText(text, x + CELL_W / 2, y + CELL_H / 2 + 4, CELL_W - 40);
      cc.shadowBlur = 0;
      cc.fillStyle = '#ffffff';
      cc.globalAlpha = 0.8;
      cc.fillText(text, x + CELL_W / 2, y + CELL_H / 2 + 4, CELL_W - 48);
      gc.fillStyle = '#000';
      gc.fillRect(x, y, CELL_W, CELL_H);
      gc.shadowColor = neon;
      gc.shadowBlur = 30;
      gc.fillStyle = neon;
      for (let i = 0; i < 3; i += 1) gc.fillText(text, x + CELL_W / 2, y + CELL_H / 2 + 4, CELL_W - 40);
      gc.shadowBlur = 0;
      gc.fillStyle = '#ffffff';
      gc.globalAlpha = 0.9;
      gc.fillText(text, x + CELL_W / 2, y + CELL_H / 2 + 4, CELL_W - 48);
    } else {
      cc.fillStyle = bg;
      cc.fillRect(x, y, CELL_W, CELL_H);
      cc.strokeStyle = fg;
      cc.lineWidth = 6;
      cc.strokeRect(x + 6, y + 6, CELL_W - 12, CELL_H - 12);
      cc.fillStyle = fg;
      cc.fillText(text, x + CELL_W / 2, y + CELL_H / 2 + 4, CELL_W - 40);
      gc.fillStyle = '#4a4538';
      gc.fillRect(x, y, CELL_W, CELL_H);
      gc.fillStyle = '#fff3d6';
      gc.fillText(text, x + CELL_W / 2, y + CELL_H / 2 + 4, CELL_W - 40);
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

  /** The two textures, built once every sign is allocated. */
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
 * A vertical sign quad on a building face. `face` is 'n' | 's' | 'e' | 'w' (which wall it hangs on),
 * `cx`/`cz` the wall's centre, `w` the sign width, `y` its bottom, `h` its height.
 */
export function addSignQuad(batch, rect, face, cx, y, cz, w, h, offset = 0.12, color = '#ffffff') {
  const uv = [[rect.u0, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1], [rect.u0, rect.v1]];
  const hw = w / 2;
  if (face === 's') batch.quad([cx - hw, y, cz + offset], [cx + hw, y, cz + offset], [cx + hw, y + h, cz + offset], [cx - hw, y + h, cz + offset], [0, 0, 1], uv, color);
  else if (face === 'n') batch.quad([cx + hw, y, cz - offset], [cx - hw, y, cz - offset], [cx - hw, y + h, cz - offset], [cx + hw, y + h, cz - offset], [0, 0, -1], uv, color);
  else if (face === 'e') batch.quad([cx + offset, y, cz + hw], [cx + offset, y, cz - hw], [cx + offset, y + h, cz - hw], [cx + offset, y + h, cz + hw], [1, 0, 0], uv, color);
  else batch.quad([cx - offset, y, cz - hw], [cx - offset, y, cz + hw], [cx - offset, y + h, cz + hw], [cx - offset, y + h, cz - hw], [-1, 0, 0], uv, color);
}

/** A plain coloured wall panel (doors, shutters) placed like a sign. */
export const PANEL_UV = { u0: 0, v0: 0, u1: 0, v1: 0 };
