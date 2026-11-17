// Original vehicle models from primitives, nose along +Z: the Vega sports coupe, a sedan, the
// Bayline taxi, a pickup, a panel van, the Halcyon PD cruiser with its lightbar and the Kestrel
// motorbike (an open seat, the rider stays visible). Each type has its driving spec.
import * as THREE from 'three';
import { MeshBatch } from '../city/batch.js';

export const VEHICLE_SPECS = {
  coupe: { name: 'Vega GT', length: 4.4, width: 1.9, height: 1.25, mass: 1250, maxSpeed: 58, accel: 9.8, brake: 14, grip: 1.0, turn: 1.0, open: false, seatY: 0.55, colors: ['#e63946', '#f4a261', '#2a9d8f', '#ffffff', '#1d3557', '#ffd166', '#7b2cbf'] },
  sedan: { name: 'Marlin Sedan', length: 4.7, width: 1.85, height: 1.45, mass: 1450, maxSpeed: 46, accel: 5.6, brake: 12, grip: 0.95, turn: 0.9, open: false, seatY: 0.6, colors: ['#8d99ae', '#ffffff', '#1b263b', '#b56576', '#6d6875', '#cdb4db', '#a7c957'] },
  taxi: { name: 'Bayline Taxi', length: 4.7, width: 1.85, height: 1.45, mass: 1450, maxSpeed: 44, accel: 5.4, brake: 12, grip: 0.95, turn: 0.9, open: false, seatY: 0.6, colors: ['#f6c800'] },
  pickup: { name: 'Dockhand Pickup', length: 5.3, width: 2.0, height: 1.7, mass: 1900, maxSpeed: 40, accel: 5.0, brake: 11, grip: 0.9, turn: 0.8, open: false, seatY: 0.8, colors: ['#9a3b3b', '#2f4858', '#c9c9c9', '#4f6d7a', '#d08c60'] },
  van: { name: 'Saltmarsh Van', length: 5.1, width: 2.1, height: 2.1, mass: 2100, maxSpeed: 36, accel: 4.4, brake: 10, grip: 0.85, turn: 0.75, open: false, seatY: 0.9, colors: ['#ffffff', '#d9d9d9', '#3a5a40', '#8ecae6', '#e76f51'] },
  cruiser: { name: 'HPD Interceptor', length: 4.9, width: 1.9, height: 1.45, mass: 1600, maxSpeed: 55, accel: 7.4, brake: 14, grip: 1.05, turn: 1.0, open: false, seatY: 0.6, colors: ['#ffffff'] },
  bike: { name: 'Kestrel 900', length: 2.2, width: 0.75, height: 1.1, mass: 260, maxSpeed: 60, accel: 9.5, brake: 13, grip: 0.9, turn: 1.3, open: true, seatY: 0.75, colors: ['#111111', '#c1121f', '#1f7a8c', '#f4d35e'] },
};

const paintCache = new Map();
let environment = null;
/** The sky reflection for every paint material, set once by main. */
export function setVehicleEnvironment(envMap) {
  environment = envMap;
  for (const m of paintCache.values()) {
    m.envMap = envMap;
    m.envMapIntensity = 0.75;
    m.needsUpdate = true;
  }
  glassMat.envMap = envMap;
  glassMat.needsUpdate = true;
}
function paint(color) {
  let m = paintCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.3, envMap: environment, envMapIntensity: 0.75 });
    paintCache.set(color, m);
  }
  return m;
}
const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.5 });
const glassMat = new THREE.MeshStandardMaterial({ color: '#1a2a3a', metalness: 0.8, roughness: 0.1 });
const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const brakeMat = new THREE.MeshBasicMaterial({ color: '#ff1a1a' });
const redBar = new THREE.MeshBasicMaterial({ color: '#ff2020' });
const blueBar = new THREE.MeshBasicMaterial({ color: '#2a60ff' });
const tyreMat = new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.9 });
const hubMat = new THREE.MeshStandardMaterial({ color: '#c9ccd1', metalness: 0.7, roughness: 0.3 });
const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14).rotateZ(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 8).rotateZ(Math.PI / 2);
const bikeWheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14).rotateZ(Math.PI / 2);
const geometryCache = new Map();
let textures = null;

function labelTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = fg;
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function ensureTextures() {
  if (!textures) {
    textures = {
      police: new THREE.MeshBasicMaterial({ map: labelTexture('HALCYON PD', '#ffffff', '#15306b') }),
      taxi: new THREE.MeshBasicMaterial({ map: labelTexture('TAXI', '#f6c800', '#1b1b1b') }),
      glow: glowTexture(),
    };
  }
  return textures;
}

/** Body (paint) and trim geometries for a type, built once. */
function geometriesFor(type) {
  if (geometryCache.has(type)) return geometryCache.get(type);
  const s = VEHICLE_SPECS[type];
  const body = new MeshBatch();
  const trim = new MeshBatch();
  const lamps = new MeshBatch();
  const brake = new MeshBatch();
  const L = s.length;
  const W = s.width;
  const hw = W / 2;
  const white = '#ffffff';
  const dark = '#23252b';
  const chrome = '#d8dbe0';
  if (type === 'bike') {
    body.box(-0.12, 0.55, -0.35, 0.24, 0.3, 1.3, white);
    body.box(-0.16, 0.78, 0.05, 0.32, 0.22, 0.6, white);
    trim.box(-0.2, 0.62, -0.95, 0.4, 0.22, 0.6, dark);
    trim.box(-0.05, 0.3, -0.9, 0.1, 0.35, 1.8, dark);
    trim.rotatedBox(0, 0.9, 0.75, 0.6, 0.05, 0.05, 0, chrome);
    trim.box(-0.03, 0.4, 0.6, 0.06, 0.5, 0.06, chrome);
    trim.box(-0.06, 0.35, -0.5, 0.12, 0.08, 0.6, '#5a5a5a');
    lamps.box(-0.08, 0.85, 0.72, 0.16, 0.12, 0.08, '#fff2c0');
    brake.box(-0.07, 0.8, -1.02, 0.14, 0.08, 0.06, '#ff2020');
    geometryCache.set(type, finish(body, trim, lamps, brake));
    return geometryCache.get(type);
  }
  const base = 0.32;
  const lowerH = type === 'van' ? 0.9 : type === 'pickup' ? 0.75 : 0.55;
  const cabinH = s.height - base - lowerH + 0.1;
  // Lower body.
  body.box(-hw, base, -L / 2, W, lowerH, L, white);
  // Cabin.
  if (type === 'van') {
    body.box(-hw + 0.05, base + lowerH, -L / 2 + 0.1, W - 0.1, cabinH, L - 0.5, white);
    trim.box(-hw + 0.02, base + lowerH + 0.25, L / 2 - 1.5, W - 0.04, 0.6, 1.2, '#1a2a3a');
    trim.box(-hw - 0.01, base + lowerH + 0.25, -L / 2 + 0.3, 0.02, 0.5, 1.3, '#1a2a3a');
    trim.box(hw - 0.01, base + lowerH + 0.25, -L / 2 + 0.3, 0.02, 0.5, 1.3, '#1a2a3a');
  } else if (type === 'pickup') {
    body.box(-hw + 0.06, base + lowerH, 0.1, W - 0.12, cabinH, L * 0.36, white);
    trim.box(-hw + 0.03, base + lowerH + 0.15, 0.2, W - 0.06, cabinH - 0.35, L * 0.36 - 0.2, '#1a2a3a');
    // Open bed with side walls.
    trim.box(-hw + 0.1, base + lowerH - 0.3, -L / 2 + 0.15, W - 0.2, 0.05, L * 0.5, '#3a3d44');
    body.box(-hw, base + lowerH, -L / 2, 0.12, 0.3, L * 0.52, white);
    body.box(hw - 0.12, base + lowerH, -L / 2, 0.12, 0.3, L * 0.52, white);
    body.box(-hw, base + lowerH, -L / 2, W, 0.3, 0.12, white);
  } else {
    const cabinFront = type === 'coupe' ? 0.55 : 0.95;
    const cabinBack = type === 'coupe' ? -1.75 : -1.9;
    const cabinW = W - 0.3;
    const sloped = type === 'coupe';
    // Cabin as a box with sloped glass pieces at front and back (trim).
    body.box(-cabinW / 2, base + lowerH, cabinBack, cabinW, sloped ? cabinH * 0.9 : cabinH, cabinFront - cabinBack, white);
    trim.box(-cabinW / 2 + 0.02, base + lowerH + 0.12, cabinBack + 0.05, cabinW - 0.04, (sloped ? cabinH * 0.9 : cabinH) - 0.22, cabinFront - cabinBack - 0.1, '#1a2a3a');
    // Windscreen and rear glass as angled panels.
    const topY = base + lowerH + (sloped ? cabinH * 0.9 : cabinH);
    trim.quad([-cabinW / 2, base + lowerH, cabinFront + 0.55], [cabinW / 2, base + lowerH, cabinFront + 0.55], [cabinW / 2, topY, cabinFront], [-cabinW / 2, topY, cabinFront], [0, 0.6, 0.8], null, '#1a2a3a');
    trim.quad([cabinW / 2, base + lowerH, cabinBack - 0.45], [-cabinW / 2, base + lowerH, cabinBack - 0.45], [-cabinW / 2, topY, cabinBack], [cabinW / 2, topY, cabinBack], [0, 0.6, -0.8], null, '#1a2a3a');
    // Hood and boot as paint boxes filling to the body ends.
    body.box(-hw + 0.08, base + lowerH, cabinFront + 0.5, W - 0.16, 0.06, L / 2 - cabinFront - 0.5, white);
    // Spoiler for the coupe.
    if (type === 'coupe') {
      trim.box(-hw + 0.2, base + lowerH + 0.15, -L / 2 + 0.05, W - 0.4, 0.06, 0.3, dark);
      trim.box(-hw + 0.3, base + lowerH, -L / 2 + 0.1, 0.08, 0.15, 0.2, dark);
      trim.box(hw - 0.38, base + lowerH, -L / 2 + 0.1, 0.08, 0.15, 0.2, dark);
    }
  }
  // Bumpers, grille, mirrors and sills.
  trim.box(-hw, base - 0.05, L / 2 - 0.12, W, 0.3, 0.16, dark);
  trim.box(-hw, base - 0.05, -L / 2 - 0.04, W, 0.3, 0.16, dark);
  trim.box(-hw * 0.5, base + 0.28, L / 2 - 0.02, W * 0.5, 0.18, 0.06, '#101216');
  trim.box(-hw - 0.12, base + lowerH + 0.15, 0.3, 0.12, 0.1, 0.22, dark);
  trim.box(hw, base + lowerH + 0.15, 0.3, 0.12, 0.1, 0.22, dark);
  trim.box(-hw, base - 0.08, -L / 2 + 0.9, W, 0.12, L - 1.8, dark);
  // Headlights and tail lights.
  lamps.box(-hw + 0.12, base + 0.3, L / 2 - 0.04, 0.42, 0.16, 0.08, '#fff6d0');
  lamps.box(hw - 0.54, base + 0.3, L / 2 - 0.04, 0.42, 0.16, 0.08, '#fff6d0');
  lamps.box(-hw + 0.12, base + 0.32, -L / 2 - 0.04, 0.4, 0.14, 0.06, '#c01818');
  lamps.box(hw - 0.52, base + 0.32, -L / 2 - 0.04, 0.4, 0.14, 0.06, '#c01818');
  brake.box(-hw + 0.1, base + 0.3, -L / 2 - 0.06, 0.44, 0.18, 0.06, '#ff2020');
  brake.box(hw - 0.54, base + 0.3, -L / 2 - 0.06, 0.44, 0.18, 0.06, '#ff2020');
  if (type === 'cruiser') {
    // Dark blue doors band.
    trim.box(-hw - 0.01, base + 0.1, -1.4, W + 0.02, 0.32, 2.8, '#15306b');
    trim.box(-hw + 0.1, base + lowerH + 0.05, L / 2 - 1.3, W - 0.2, 0.04, 0.5, '#15306b');
    // Push bar.
    trim.box(-hw + 0.3, base + 0.05, L / 2 + 0.05, W - 0.6, 0.45, 0.08, '#2b2f36');
  }
  if (type === 'taxi') {
    trim.box(-hw - 0.01, base + 0.12, -L / 2 + 0.5, W + 0.02, 0.18, L - 1, '#1b1b1b');
  }
  const out = finish(body, trim, lamps, brake);
  geometryCache.set(type, out);
  return out;
}

function finish(body, trim, lamps, brake) {
  const geo = (batch) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(batch.colors, 3));
    g.computeBoundingSphere();
    return g;
  };
  return { body: geo(body), trim: geo(trim), lamps: geo(lamps), brake: geo(brake) };
}

/**
 * A vehicle's visual: a group at the ground centre, facing +Z, with the parts the physics animates
 * (wheels spin and steer, the body rolls, brake lights, the police lightbar).
 */
export function createVehicleModel(type, color) {
  const spec = VEHICLE_SPECS[type];
  const geos = geometriesFor(type);
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);
  const body = new THREE.Mesh(geos.body, paint(color));
  body.castShadow = true;
  body.receiveShadow = true;
  bodyGroup.add(body);
  const trim = new THREE.Mesh(geos.trim, trimMat);
  trim.castShadow = true;
  bodyGroup.add(trim);
  const lamps = new THREE.Mesh(geos.lamps, lampMat);
  bodyGroup.add(lamps);
  const brake = new THREE.Mesh(geos.brake, brakeMat);
  brake.visible = false;
  bodyGroup.add(brake);
  const wheels = [];
  const steerPivots = [];
  const L = spec.length;
  const hw = spec.width / 2;
  if (type === 'bike') {
    for (const z of [0.75, -0.72]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.34, z);
      bodyGroup.add(pivot);
      const w = new THREE.Mesh(bikeWheelGeo, tyreMat);
      w.castShadow = true;
      pivot.add(w);
      wheels.push(w);
      if (z > 0) steerPivots.push(pivot);
    }
  } else {
    const axleFront = L / 2 - 0.9;
    const axleBack = -L / 2 + 0.95;
    for (const [x, z] of [[-hw + 0.1, axleFront], [hw - 0.1, axleFront], [-hw + 0.1, axleBack], [hw - 0.1, axleBack]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.33, z);
      root.add(pivot);
      const w = new THREE.Mesh(wheelGeo, tyreMat);
      w.castShadow = true;
      pivot.add(w);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      w.add(hub);
      wheels.push(w);
      if (z > 0) steerPivots.push(pivot);
    }
  }
  let lightbar = null;
  if (type === 'cruiser') {
    const barY = spec.height + 0.22;
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.32), redBar);
    red.position.set(-0.3, barY, -0.55);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.32), blueBar);
    blue.position.set(0.3, barY, -0.55);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.36), trimMat.clone());
    bar.material.vertexColors = false;
    bar.material.color.set('#2b2f36');
    bar.position.set(0, barY - 0.12, -0.55);
    bodyGroup.add(bar, red, blue);
    const t = ensureTextures();
    for (const side of [-1, 1]) {
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), t.police);
      label.position.set(side * (hw + 0.015), 0.62, -0.1);
      label.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      bodyGroup.add(label);
    }
    const glowR = new THREE.PointLight('#ff3030', 0, 14, 2);
    glowR.position.set(0, barY + 0.3, -0.55);
    const glowB = new THREE.PointLight('#3060ff', 0, 14, 2);
    glowB.position.set(0, barY + 0.3, -0.55);
    bodyGroup.add(glowR, glowB);
    const glowTex = ensureTextures().glow;
    const spriteR = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff2a2a', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    spriteR.position.set(-0.3, barY + 0.05, -0.55);
    spriteR.scale.set(2.2, 1.6, 1);
    const spriteB = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#2a6aff', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    spriteB.position.set(0.3, barY + 0.05, -0.55);
    spriteB.scale.set(2.2, 1.6, 1);
    bodyGroup.add(spriteR, spriteB);
    lightbar = { red, blue, glowR, glowB, spriteR, spriteB, phase: 0 };
  }
  if (type === 'taxi') {
    const t = ensureTextures();
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.26, 0.3), [trimMat, trimMat, trimMat, trimMat, t.taxi, t.taxi]);
    sign.position.set(0, spec.height + 0.28, -0.4);
    bodyGroup.add(sign);
  }
  // Smoke/fire anchor at the engine.
  const engine = new THREE.Object3D();
  engine.position.set(0, spec.height * 0.6, L / 2 - 0.8);
  bodyGroup.add(engine);
  const seat = new THREE.Object3D();
  seat.position.set(type === 'bike' ? 0 : -0.35, spec.seatY, type === 'bike' ? -0.25 : -0.3);
  bodyGroup.add(seat);
  return { root, bodyGroup, body, trim, lamps, brake, wheels, steerPivots, lightbar, engine, seat, spec, type };
}

export function vehicleColorOptions(type) {
  return VEHICLE_SPECS[type].colors;
}

export function setVehiclePaint(model, color) {
  model.body.material = paint(color);
}
