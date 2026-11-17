// Buildings: every lot of the plan becomes geometry by district style (glass towers on podiums,
// pastel beachfront hotels with balconies, neon-lit bars, white villas with pools, corrugated
// warehouses with container yards, the bank with its colonnade, Teo's body shop) and registers its
// footprint as a collider. One merged mesh per wall texture.
import * as THREE from 'three';
import { CITY } from '../config.js';
import { MeshBatch } from './batch.js';
import { addSignQuad, PANEL_UV } from './signs.js';
import { createRng, hash2 } from '../rng.js';

/** A per-building texture shift so neighbours do not light the same windows. */
const uvo = (lot) => hash2(Math.floor(lot.x * 3), Math.floor(lot.z * 3), 5) * 5;

const FLOOR = 3.4;
const WIN_W = 3.0;

export function buildBuildings(layout, textures, colliders, signs) {
  const rng = createRng(layout.seed + 101);
  const batches = {
    facade: new MeshBatch(), glass: new MeshBatch(), hotel: new MeshBatch(), neon: new MeshBatch(),
    villa: new MeshBatch(), stone: new MeshBatch(), warehouse: new MeshBatch(), flat: new MeshBatch(),
    signs: new MeshBatch(), water: new MeshBatch(), containers: new MeshBatch(),
  };
  const emissiveMats = [];
  for (const lot of layout.lots) {
    const front = frontFace(lot);
    switch (lot.style) {
      case 'glass': buildTower(batches, lot, rng, colliders); break;
      case 'facade': buildMidRise(batches, lot, rng, colliders, front, signs); break;
      case 'hotel': buildHotel(batches, lot, rng, colliders, front, signs); break;
      case 'neon': buildNeon(batches, lot, rng, colliders, front, signs); break;
      case 'villa': buildVilla(batches, lot, rng, colliders, front); break;
      case 'warehouse': buildWarehouse(batches, lot, rng, colliders, front, signs); break;
      case 'stone': buildBank(batches, lot, colliders, front, signs); break;
      default: break;
    }
  }
  const group = new THREE.Group();
  const textured = (key, tex, extra = {}) => {
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: tex.emissive ? new THREE.Color('#ffffff') : new THREE.Color('#000000'), emissiveIntensity: 0, vertexColors: true, roughness: extra.roughness ?? 0.8, metalness: extra.metalness ?? 0.05 });
    if (tex.emissive) emissiveMats.push({ material: mat, day: 0, night: extra.night ?? 1 });
    if (!batches[key].isEmpty()) group.add(batches[key].build(mat));
  };
  textured('facade', textures.facade);
  textured('glass', textures.glass, { roughness: 0.25, metalness: 0.5, night: 0.9 });
  textured('hotel', textures.hotel);
  textured('neon', textures.neon);
  textured('villa', textures.villa);
  textured('stone', textures.stone);
  textured('warehouse', textures.warehouse, { roughness: 0.7, metalness: 0.3 });
  const flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  group.add(batches.flat.build(flatMat));
  const containerMat = new THREE.MeshStandardMaterial({ map: textures.container || null, vertexColors: true, roughness: 0.6, metalness: 0.3 });
  if (!batches.containers.isEmpty()) group.add(batches.containers.build(containerMat));
  const signTex = signs.textures();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex.map, emissiveMap: signTex.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9, vertexColors: true, roughness: 0.5, side: THREE.DoubleSide });
  emissiveMats.push({ material: signMat, day: 0.9, night: 1.9 });
  if (!batches.signs.isEmpty()) group.add(batches.signs.build(signMat, { castShadow: false }));
  const waterMat = new THREE.MeshStandardMaterial({ color: '#39b6e6', emissive: new THREE.Color('#1c7fb0'), emissiveIntensity: 0.3, roughness: 0.15, metalness: 0.2 });
  if (!batches.water.isEmpty()) group.add(batches.water.build(waterMat, { castShadow: false }));
  return { group, emissiveMats };
}

/** Which block edge the lot is nearest: its street-facing wall. */
function frontFace(lot) {
  if (lot.front) return lot.front;
  const b = lot.block;
  const dN = lot.z - b.z;
  const dS = b.z + b.d - (lot.z + lot.d);
  const dW = lot.x - b.x;
  const dE = b.x + b.w - (lot.x + lot.w);
  const m = Math.min(dN, dS, dW, dE);
  if (m === dS) return 's';
  if (m === dN) return 'n';
  if (m === dW) return 'w';
  return 'e';
}

function faceCentre(lot, face) {
  if (face === 's') return { cx: lot.x + lot.w / 2, cz: lot.z + lot.d, width: lot.w };
  if (face === 'n') return { cx: lot.x + lot.w / 2, cz: lot.z, width: lot.w };
  if (face === 'w') return { cx: lot.x, cz: lot.z + lot.d / 2, width: lot.d };
  return { cx: lot.x + lot.w, cz: lot.z + lot.d / 2, width: lot.d };
}

function roofDetails(flat, x, y, z, w, d, rng, { helipad = false, parapet = true, units = 2 } = {}) {
  if (parapet) {
    flat.box(x, y, z, w, 0.7, 0.5, '#8a857c');
    flat.box(x, y, z + d - 0.5, w, 0.7, 0.5, '#8a857c');
    flat.box(x, y, z, 0.5, 0.7, d, '#8a857c');
    flat.box(x + w - 0.5, y, z, 0.5, 0.7, d, '#8a857c');
  }
  for (let i = 0; i < units; i += 1) {
    const uw = rng.range(1.5, 3.2);
    const ud = rng.range(1.5, 2.6);
    const ux = x + rng.range(2, Math.max(2.1, w - uw - 2));
    const uz = z + rng.range(2, Math.max(2.1, d - ud - 2));
    flat.box(ux, y, uz, uw, rng.range(1, 2.2), ud, rng.pick(['#b5b2ab', '#9d9a94', '#c7c4bd']));
  }
  if (helipad) {
    flat.disc(x + w / 2, y + 0.06, z + d / 2, Math.min(w, d) * 0.32, 20, '#4b4f55');
    flat.disc(x + w / 2, y + 0.08, z + d / 2, Math.min(w, d) * 0.27, 20, '#f2c53d');
    flat.disc(x + w / 2, y + 0.1, z + d / 2, Math.min(w, d) * 0.22, 20, '#4b4f55');
  }
}

function buildTower(B, lot, rng, colliders) {
  const podiumH = lot.podium;
  const y0 = CITY.kerb;
  // Podium takes the lot, textured as a concrete facade.
  B.facade.boxSides(lot.x, y0, lot.z, lot.w, podiumH, lot.d, '#d6d2c8', [WIN_W, FLOOR], uvo(lot));
  B.flat.boxTop(lot.x, y0 + podiumH, lot.z, lot.w, lot.d, '#7d7a74');
  roofDetails(B.flat, lot.x, y0 + podiumH, lot.z, lot.w, lot.d, rng, { units: 1 });
  colliders.addBox(lot.x, lot.z, lot.x + lot.w, lot.z + lot.d, podiumH + y0, 'building', lot);
  // Tower inset on the podium, with a setback near the top.
  const inset = rng.range(2.5, 4.5);
  const tx = lot.x + inset;
  const tz = lot.z + inset;
  const tw = lot.w - inset * 2;
  const td = lot.d - inset * 2;
  const towerH = lot.h;
  const setback = rng.chance(0.6);
  const lowerH = setback ? towerH * rng.range(0.6, 0.78) : towerH;
  B.glass.boxSides(tx, y0 + podiumH, tz, tw, lowerH, td, lot.color, [WIN_W, FLOOR], uvo(lot));
  B.flat.boxTop(tx, y0 + podiumH + lowerH, tz, tw, td, '#5a6168');
  colliders.addBox(tx, tz, tx + tw, tz + td, y0 + podiumH + towerH, 'building', lot);
  if (setback) {
    const s = rng.range(2, 3.5);
    B.glass.boxSides(tx + s, y0 + podiumH + lowerH, tz + s, tw - 2 * s, towerH - lowerH, td - 2 * s, lot.color, [WIN_W, FLOOR], uvo(lot));
    B.flat.boxTop(tx + s, y0 + podiumH + towerH, tz + s, tw - 2 * s, td - 2 * s, '#5a6168');
    roofDetails(B.flat, tx + s, y0 + podiumH + towerH, tz + s, tw - 2 * s, td - 2 * s, rng, { helipad: rng.chance(0.5), units: 1 });
  } else {
    roofDetails(B.flat, tx, y0 + podiumH + towerH, tz, tw, td, rng, { helipad: rng.chance(0.5), units: 2 });
  }
  // Crown: a lighter cap band and an antenna on the tallest.
  const capY = y0 + podiumH + towerH;
  B.flat.box(tx + tw / 2 - 1.5, capY, tz + td / 2 - 1.5, 3, 1.6, 3, '#aeb6bd');
  if (towerH > 90) B.flat.cylinder(tx + tw / 2, capY + 1.6, tz + td / 2, 0.35, 0.12, 14, 6, '#d8dde2');
}

function buildMidRise(B, lot, rng, colliders, front, signs) {
  const y0 = CITY.kerb;
  B.facade.boxSides(lot.x, y0, lot.z, lot.w, lot.h, lot.d, lot.color, [WIN_W, FLOOR], uvo(lot));
  B.flat.boxTop(lot.x, y0 + lot.h, lot.z, lot.w, lot.d, '#8b8780');
  roofDetails(B.flat, lot.x, y0 + lot.h, lot.z, lot.w, lot.d, rng);
  colliders.addBox(lot.x, lot.z, lot.x + lot.w, lot.z + lot.d, y0 + lot.h, 'building', lot);
  const f = faceCentre(lot, front);
  B.flat.boxSides(lot.x - 0.15, y0, lot.z - 0.15, lot.w + 0.3, 4.2, lot.d + 0.3, '#5a5f66');
  const rect = signs.allocate(rng.pick(['CAFE ORO', 'PHARMACY', 'GLASSWATER GYM', 'BOOKS', 'DELI 44', 'BANK ATM', 'OFFICE SPACE', 'CO-WORK']), { bg: rng.pick(['#f4efe6', '#1f3b5a', '#7a2d2d']), fg: rng.pick(['#1b1b24', '#ffffff']) });
  addSignQuad(B.signs, rect, front, f.cx, y0 + 3.0, f.cz, Math.min(10, f.width * 0.6), 1.3, 0.32);
}

function buildHotel(B, lot, rng, colliders, front, signs) {
  const y0 = CITY.kerb;
  B.hotel.boxSides(lot.x, y0, lot.z, lot.w, lot.h, lot.d, lot.color, [WIN_W, FLOOR], uvo(lot));
  B.flat.boxTop(lot.x, y0 + lot.h, lot.z, lot.w, lot.d, '#d9d3c6');
  roofDetails(B.flat, lot.x, y0 + lot.h, lot.z, lot.w, lot.d, rng, { units: 1 });
  colliders.addBox(lot.x, lot.z, lot.x + lot.w, lot.z + lot.d, y0 + lot.h, 'building', lot);
  const f = faceCentre(lot, front);
  // Ground floor arcade and an awning in the hotel's accent colour.
  B.flat.boxSides(lot.x - 0.2, y0, lot.z - 0.2, lot.w + 0.4, 4.0, lot.d + 0.4, '#f6f3ec');
  const accent = rng.pick(['#e85d75', '#2bb3a3', '#f2a541', '#6b8ef2']);
  const floors = Math.floor(lot.h / FLOOR);
  for (let k = 1; k < floors; k += 1) {
    const y = y0 + k * FLOOR - 0.1;
    if (front === 's') B.flat.box(lot.x + 0.6, y, lot.z + lot.d, lot.w - 1.2, 0.25, 1.3, '#ffffff');
    else if (front === 'n') B.flat.box(lot.x + 0.6, y, lot.z - 1.3, lot.w - 1.2, 0.25, 1.3, '#ffffff');
    else if (front === 'w') B.flat.box(lot.x - 1.3, y, lot.z + 0.6, 1.3, 0.25, lot.d - 1.2, '#ffffff');
    else B.flat.box(lot.x + lot.w, y, lot.z + 0.6, 1.3, 0.25, lot.d - 1.2, '#ffffff');
  }
  if (front === 's') B.flat.box(lot.x + 1, y0 + 3.6, lot.z + lot.d, lot.w - 2, 0.3, 2.2, accent);
  else if (front === 'n') B.flat.box(lot.x + 1, y0 + 3.6, lot.z - 2.2, lot.w - 2, 0.3, 2.2, accent);
  else if (front === 'w') B.flat.box(lot.x - 2.2, y0 + 3.6, lot.z + 1, 2.2, 0.3, lot.d - 2, accent);
  else B.flat.box(lot.x + lot.w, y0 + 3.6, lot.z + 1, 2.2, 0.3, lot.d - 2, accent);
  if (lot.h > 20) {
    // Rooftop pool with a deck.
    B.flat.box(lot.x + lot.w * 0.25, y0 + lot.h, lot.z + lot.d * 0.25, lot.w * 0.5, 0.4, lot.d * 0.5, '#e8e2d4');
    B.water.boxTop(lot.x + lot.w * 0.3, y0 + lot.h + 0.42, lot.z + lot.d * 0.3, lot.w * 0.4, lot.d * 0.4, '#ffffff');
  }
  if (lot.sign) {
    const rect = signs.allocate(lot.sign, { neon: accent });
    addSignQuad(B.signs, rect, front, f.cx, y0 + lot.h - 2.2, f.cz, Math.min(14, f.width * 0.8), 2.4, 0.2);
    // A roof-edge sign too, readable from the beach.
    addSignQuad(B.signs, rect, front, f.cx, y0 + lot.h + 0.8, f.cz - (front === 's' ? 1 : front === 'n' ? -1 : 0), Math.min(14, f.width * 0.8), 2.4, 0.2);
  }
}

function buildNeon(B, lot, rng, colliders, front, signs) {
  const y0 = CITY.kerb;
  B.neon.boxSides(lot.x, y0, lot.z, lot.w, lot.h, lot.d, lot.color, [WIN_W, FLOOR], uvo(lot));
  B.flat.boxTop(lot.x, y0 + lot.h, lot.z, lot.w, lot.d, '#3b3842');
  roofDetails(B.flat, lot.x, y0 + lot.h, lot.z, lot.w, lot.d, rng, { units: 1 });
  colliders.addBox(lot.x, lot.z, lot.x + lot.w, lot.z + lot.d, y0 + lot.h, 'building', lot);
  const f = faceCentre(lot, front);
  const neon = lot.neon || '#ff4fd8';
  // Shopfront band, an awning strip in the neon colour and the sign above the door.
  B.flat.boxSides(lot.x - 0.2, y0, lot.z - 0.2, lot.w + 0.4, 3.6, lot.d + 0.4, '#23202b');
  const stripY = y0 + 3.3;
  if (front === 's') B.flat.box(lot.x + 0.5, stripY, lot.z + lot.d, lot.w - 1, 0.35, 1.4, neon);
  else if (front === 'n') B.flat.box(lot.x + 0.5, stripY, lot.z - 1.4, lot.w - 1, 0.35, 1.4, neon);
  else if (front === 'w') B.flat.box(lot.x - 1.4, stripY, lot.z + 0.5, 1.4, 0.35, lot.d - 1, neon);
  else B.flat.box(lot.x + lot.w, stripY, lot.z + 0.5, 1.4, 0.35, lot.d - 1, neon);
  const rect = signs.allocate(lot.sign || 'BAR', { neon });
  const signW = Math.min(12, f.width * 0.75);
  addSignQuad(B.signs, rect, front, f.cx, y0 + Math.min(lot.h - 3, 5.2), f.cz, signW, signW / 4, 0.25);
  if (lot.kind === 'gangbar' || rng.chance(0.3)) {
    // A rooftop billboard on a frame.
    const bw = Math.min(12, lot.w - 2);
    const bx = lot.x + lot.w / 2;
    const bz = lot.z + lot.d / 2;
    B.flat.box(bx - bw / 2, y0 + lot.h, bz - 0.2, 0.3, 4, 0.4, '#555');
    B.flat.box(bx + bw / 2 - 0.3, y0 + lot.h, bz - 0.2, 0.3, 4, 0.4, '#555');
    const bill = signs.allocate(rng.pick(['HALCYON FM 98.1', 'CORAL 88', 'SUN & SALT', 'DRINK AGUA LUZ', 'RIPTIDE NIGHTS']), { neon: rng.pick(['#37f3ff', '#ffd23f', '#ff6b4a']) });
    addSignQuad(B.signs, bill, 's', bx, y0 + lot.h + 1.5, bz, bw, bw / 4, 0.1);
    addSignQuad(B.signs, bill, 'n', bx, y0 + lot.h + 1.5, bz, bw, bw / 4, 0.1);
  }
}

function buildVilla(B, lot, rng, colliders, front) {
  const y0 = CITY.kerb;
  const houseD = lot.d * 0.5;
  const houseW = lot.w * 0.8;
  const hx = lot.x + (lot.w - houseW) / 2;
  const hz = front === 'n' ? lot.z + lot.d - houseD - 2 : lot.z + 2;
  B.villa.boxSides(hx, y0, hz, houseW, lot.h, houseD, lot.color, [WIN_W, FLOOR], uvo(lot));
  B.flat.boxTop(hx, y0 + lot.h, hz, houseW, houseD, '#d8c9a8');
  B.flat.box(hx - 0.3, y0 + lot.h, hz - 0.3, houseW + 0.6, 0.5, houseD + 0.6, '#efe7d6');
  colliders.addBox(hx, hz, hx + houseW, hz + houseD, y0 + lot.h, 'building', lot);
  // A wing and a shaded terrace.
  const wingW = houseW * 0.45;
  const wz = front === 'n' ? hz - houseD * 0.5 : hz + houseD;
  B.villa.boxSides(hx, y0, wz, wingW, lot.h * 0.7, houseD * 0.5, lot.color, [WIN_W, FLOOR], uvo(lot));
  B.flat.boxTop(hx, y0 + lot.h * 0.7, wz, wingW, houseD * 0.5, '#d8c9a8');
  colliders.addBox(hx, wz, hx + wingW, wz + houseD * 0.5, y0 + lot.h * 0.7, 'building', lot);
  if (lot.pool) {
    const pw = Math.min(10, lot.w * 0.4);
    const pd = Math.min(5, lot.d * 0.2);
    const px = hx + houseW - pw - 1;
    const pz = front === 'n' ? lot.z + 3 : lot.z + lot.d - pd - 3;
    B.flat.box(px - 1.2, y0, pz - 1.2, pw + 2.4, 0.12, pd + 2.4, '#efe9db');
    B.water.boxTop(px, y0 + 0.14, pz, pw, pd, '#ffffff');
  }
  // Low garden wall with a gate gap on the street side.
  const wallH = 0.9;
  const gate = 4;
  const sides = ['n', 's', 'w', 'e'];
  for (const side of sides) {
    const color = '#f1ebe0';
    if (side === 'n' || side === 's') {
      const z = side === 'n' ? lot.z : lot.z + lot.d - 0.3;
      if (side === front) {
        const gx = lot.x + lot.w / 2;
        B.flat.box(lot.x, y0, z, gx - gate / 2 - lot.x, wallH, 0.3, color);
        B.flat.box(gx + gate / 2, y0, z, lot.x + lot.w - gx - gate / 2, wallH, 0.3, color);
        colliders.addBox(lot.x, z, gx - gate / 2, z + 0.3, wallH, 'wall');
        colliders.addBox(gx + gate / 2, z, lot.x + lot.w, z + 0.3, wallH, 'wall');
      } else {
        B.flat.box(lot.x, y0, z, lot.w, wallH, 0.3, color);
        colliders.addBox(lot.x, z, lot.x + lot.w, z + 0.3, wallH, 'wall');
      }
    } else {
      const x = side === 'w' ? lot.x : lot.x + lot.w - 0.3;
      if (side === front) {
        const gz = lot.z + lot.d / 2;
        B.flat.box(x, y0, lot.z, 0.3, wallH, gz - gate / 2 - lot.z, color);
        B.flat.box(x, y0, gz + gate / 2, 0.3, wallH, lot.z + lot.d - gz - gate / 2, color);
        colliders.addBox(x, lot.z, x + 0.3, gz - gate / 2, wallH, 'wall');
        colliders.addBox(x, gz + gate / 2, x + 0.3, lot.z + lot.d, wallH, 'wall');
      } else {
        B.flat.box(x, y0, lot.z, 0.3, wallH, lot.d, color);
        colliders.addBox(x, lot.z, x + 0.3, lot.z + lot.d, wallH, 'wall');
      }
    }
  }
}

const CONTAINER_COLORS = ['#c0392b', '#2471a3', '#1e8449', '#d68910', '#7d6608', '#5d6d7e', '#a04000', '#117a65'];

function buildWarehouse(B, lot, rng, colliders, front, signs) {
  const y0 = CITY.kerb;
  if (lot.h > 0) {
    const depth = lot.kind === 'garage' || lot.kind === 'carshop' ? lot.d : lot.d;
    B.warehouse.boxSides(lot.x, y0, lot.z, lot.w, lot.h, depth, lot.color, [2.4, lot.h]);
    B.flat.boxTop(lot.x, y0 + lot.h, lot.z, lot.w, depth, '#6e6f72');
    B.flat.box(lot.x - 0.2, y0 + lot.h, lot.z - 0.2, lot.w + 0.4, 0.4, depth + 0.4, '#8a8c90');
    for (let k = 0; k < 3; k += 1) B.flat.box(lot.x + 2 + k * (lot.w - 4) / 3, y0 + lot.h + 0.4, lot.z + depth / 2 - 1, (lot.w - 4) / 3 - 1, 0.5, 2, '#9fb3c2');
    colliders.addBox(lot.x, lot.z, lot.x + lot.w, lot.z + depth, y0 + lot.h, 'building', lot);
    const f = faceCentre(lot, front);
    // Roll-up doors on the street face.
    const doorW = Math.min(6, f.width * 0.3);
    for (const off of [-f.width * 0.25, f.width * 0.25]) {
      const cx = front === 'n' || front === 's' ? f.cx + off : f.cx;
      const cz = front === 'w' || front === 'e' ? f.cz + off : f.cz;
      addSignQuad(B.flat, PANEL_UV, front, cx, y0, cz, doorW, Math.min(5, lot.h - 1.5), 0.08, '#45484d');
    }
    if (lot.sign) {
      const rect = signs.allocate(lot.sign, lot.kind === 'carshop' ? { neon: '#37f3ff' } : { bg: '#f2c53d', fg: '#1b1b24' });
      addSignQuad(B.signs, rect, front, f.cx, y0 + lot.h - 2.4, f.cz, Math.min(16, f.width * 0.8), 2.4, 0.3);
    }
  }
  if (lot.containers || lot.h === 0) {
    const yardZ = lot.h > 0 ? lot.z + lot.d * 0.6 : lot.z;
    const yardD = lot.h > 0 ? lot.d * 0.4 : lot.d;
    const n = rng.int(3, 7);
    for (let k = 0; k < n; k += 1) {
      const cw = 12;
      const cd = 2.5;
      const cx = lot.x + 4 + rng.range(0, Math.max(1, lot.w - cw - 8)) + cw / 2;
      const cz = yardZ + 2 + rng.range(0, Math.max(1, yardD - cd - 4)) + cd / 2;
      const yaw = rng.range(-0.15, 0.15) + (rng.chance(0.3) ? Math.PI / 2 : 0);
      const stack = rng.int(1, 2);
      for (let s = 0; s < stack; s += 1) {
        B.containers.rotatedBox(cx, y0 + s * 2.6, cz, cw, 2.6, cd, yaw, rng.pick(CONTAINER_COLORS), [1, 2.6]);
      }
      colliders.addBox(cx - cw / 2, cz - cd / 2 - 0.6, cx + cw / 2, cz + cd / 2 + 0.6, 2.6 * stack, 'container');
    }
  }
}

function buildBank(B, lot, colliders, front, signs) {
  const y0 = CITY.kerb;
  const steps = 3;
  B.stone.boxSides(lot.x, y0, lot.z, lot.w, lot.h, lot.d, lot.color, [WIN_W, FLOOR + 1.2]);
  B.flat.boxTop(lot.x, y0 + lot.h, lot.z, lot.w, lot.d, '#a89f8c');
  B.flat.box(lot.x - 0.4, y0 + lot.h - 1.2, lot.z - 0.4, lot.w + 0.8, 1.4, lot.d + 0.8, '#e7dfcb');
  B.flat.box(lot.x + lot.w / 2 - 6, y0 + lot.h, lot.z + lot.d / 2 - 6, 12, 2.5, 12, '#d9d0bc');
  B.flat.cylinder(lot.x + lot.w / 2, y0 + lot.h + 2.5, lot.z + lot.d / 2, 5, 0.5, 4, 12, '#8fb4c9');
  colliders.addBox(lot.x, lot.z, lot.x + lot.w, lot.z + lot.d, y0 + lot.h, 'building', lot);
  // The colonnade on the west (plaza-facing) side: steps, six columns and an entablature.
  const faceX = lot.x;
  for (let s = 0; s < steps; s += 1) {
    B.flat.box(faceX - 3 + s, y0 + s * 0.25, lot.z + 4, 3 - s, 0.25, lot.d - 8, '#e3dac7');
  }
  colliders.addBox(faceX - 3, lot.z + 4, faceX, lot.z + lot.d - 4, 0, 'steps');
  B.flat.box(faceX - 4, y0 + 11, lot.z + 2, 4.2, 1.6, lot.d - 4, '#e7dfcb');
  for (let k = 0; k < 6; k += 1) {
    const cz = lot.z + 4 + (k + 0.5) * ((lot.d - 8) / 6);
    B.flat.cylinder(faceX - 2.2, y0 + 0.75, cz, 0.7, 0.6, 10.3, 10, '#f1e9d8');
    colliders.addCircle(faceX - 2.2, cz, 0.75, 11, 'column');
  }
  const rect = signs.allocate(lot.sign, { bg: '#2a3a4a', fg: '#f1e4c2' });
  addSignQuad(B.signs, rect, 'w', faceX - 4, y0 + 12.8, lot.z + lot.d / 2, Math.min(20, lot.d - 6), 2.6, 0.1);
  const rect2 = signs.allocate('BANK', { bg: '#2a3a4a', fg: '#f1e4c2' });
  addSignQuad(B.signs, rect2, 's', lot.x + lot.w / 2, y0 + lot.h - 3.5, lot.z + lot.d, 10, 2.5, 0.2);
}
