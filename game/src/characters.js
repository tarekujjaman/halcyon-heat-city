// Human figures from primitives: head with hair, a chest (torso, shoulders, neck and head) that
// leans as one, hips, jointed arms and legs, shoes and clothing colours, with walk, run, idle,
// seated, aiming and fallen poses. The origin is between the feet; the hips sit HIP_HEIGHT up.
// Used by Sol, every pedestrian, officer, gang member and motorbike rider, with a palette per
// role so they read at a glance.
import * as THREE from 'three';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const limbBox = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
const headGeo = new THREE.SphereGeometry(0.5, 10, 8);
const materials = new Map();

/** Hip centre above the feet, and the bottom of the pelvis: what rests on a saddle. */
export const HIP_HEIGHT = 0.98;
export const SEAT_HEIGHT = 0.87;
const CHEST_PIVOT = 1.09;
const THIGH = 0.46;
const SHIN = 0.44;

function mat(color) {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    materials.set(color, m);
  }
  return m;
}

const SKINS = ['#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#5c3a1e', '#f7d9c4', '#a86f3e'];
const HAIR = ['#1b1b1b', '#3a2a1a', '#6b4423', '#b57a3a', '#d9b36a', '#2d1b10', '#6b6b6b'];
const SHIRTS = ['#ffffff', '#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#f783ac', '#ff922b', '#20c997', '#845ef7', '#1c2b3a', '#e9ecef'];
const PANTS = ['#2b2b3a', '#4a4a5a', '#1f3b6f', '#7a6a5a', '#d9d4c7', '#3b3b3b', '#aa5a3a'];

/** A random civilian look from a seeded generator. */
export function civilianLook(rng) {
  return {
    skin: rng.pick(SKINS),
    hair: rng.pick(HAIR),
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    shoes: rng.pick(['#222', '#fff', '#5a3a1a']),
    hat: rng.chance(0.2) ? rng.pick(['#ffffff', '#ff6b6b', '#2b2b3a']) : null,
    skirt: rng.chance(0.3),
    scale: rng.range(0.92, 1.06),
    hairStyle: rng.int(0, 2),
  };
}

export const LOOKS = {
  sol: { skin: '#d9a070', hair: '#2d1b10', shirt: '#1d1f2b', jacket: '#c8542f', pants: '#1f2a44', shoes: '#111', hairStyle: 2, scale: 1.0 },
  officer: { skin: '#e0ac7e', hair: '#1b1b1b', shirt: '#1f3b6f', pants: '#152a4a', shoes: '#111', hat: '#1f3b6f', badge: true, scale: 1.0, hairStyle: 0 },
  gang: { skin: '#c68642', hair: '#1b1b1b', shirt: '#1c8a7a', pants: '#2b2b3a', shoes: '#222', hat: null, scale: 1.02, hairStyle: 1 },
  teo: { skin: '#a86f3e', hair: '#6b6b6b', shirt: '#4a5a6a', pants: '#3b3b3b', shoes: '#222', hat: null, scale: 0.98, hairStyle: 0 },
  kane: { skin: '#5c3a1e', hair: '#1b1b1b', shirt: '#ffffff', jacket: '#1c8a7a', pants: '#111', shoes: '#111', hairStyle: 0, scale: 1.06 },
  ruiz: { skin: '#e0ac7e', hair: '#3a2a1a', shirt: '#d9d4c7', jacket: '#5a4a3a', pants: '#2b2b3a', shoes: '#222', hairStyle: 1, scale: 1.0 },
  dani: { skin: '#d9a070', hair: '#1b1b1b', shirt: '#ffd43b', pants: '#1f3b6f', shoes: '#fff', hairStyle: 1, scale: 0.96 },
};

export function createCharacter(look) {
  const g = new THREE.Group();
  const s = look.scale || 1;
  const part = (geo, color, w, h, d, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const pivot = (x, y, z, parent = g) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    parent.add(p);
    return p;
  };
  // Everything above the belt hangs from the chest, which pivots at the waist: leaning forward
  // (running, a motorbike tuck) carries the shoulders, arms and head along.
  const chest = pivot(0, CHEST_PIVOT, 0);
  const cpart = (geo, color, w, h, d, x, y, z) => part(geo, color, w, h, d, x, y - CHEST_PIVOT, z, chest);

  const hips = part(unitBox, look.pants, 0.36, 0.22, 0.24, 0, HIP_HEIGHT, 0);
  part(unitBox, look.belt || '#2a2016', 0.38, 0.05, 0.26, 0, 1.085, 0);
  const torsoColor = look.jacket || look.shirt;
  const torso = cpart(unitBox, torsoColor, 0.42, 0.52, 0.26, 0, 1.35, 0);
  // Shoulders and a collar give the torso a shape.
  cpart(unitBox, torsoColor, 0.54, 0.12, 0.27, 0, 1.56, 0);
  cpart(unitBox, look.collar || look.skin, 0.2, 0.05, 0.2, 0, 1.63, 0.01);
  if (look.jacket) cpart(unitBox, look.shirt, 0.16, 0.5, 0.05, 0, 1.35, 0.13);
  if (look.badge) cpart(unitBox, '#f2c53d', 0.07, 0.07, 0.02, 0.12, 1.45, 0.14);
  const neck = cpart(unitBox, look.skin, 0.12, 0.1, 0.12, 0, 1.64, 0);
  const head = cpart(headGeo, look.skin, 0.28, 0.32, 0.29, 0, 1.83, 0);
  // Hair: a cap and, by style, a back fall or a top knot.
  const hairStyle = look.hairStyle ?? 0;
  if (look.hat) {
    cpart(unitBox, look.hat, 0.3, 0.1, 0.3, 0, 1.95, 0);
    cpart(unitBox, look.hat, 0.3, 0.03, 0.14, 0, 1.91, 0.2);
  } else if (hairStyle === 0) {
    cpart(headGeo, look.hair, 0.3, 0.2, 0.31, 0, 1.92, -0.01);
  } else if (hairStyle === 1) {
    cpart(headGeo, look.hair, 0.31, 0.27, 0.32, 0, 1.91, -0.02);
  } else {
    cpart(headGeo, look.hair, 0.31, 0.25, 0.32, 0, 1.91, -0.02);
    cpart(unitBox, look.hair, 0.2, 0.34, 0.12, 0, 1.7, -0.15);
  }
  // Ears and a mouth line.
  cpart(unitBox, look.skin, 0.04, 0.07, 0.05, -0.15, 1.82, 0);
  cpart(unitBox, look.skin, 0.04, 0.07, 0.05, 0.15, 1.82, 0);
  cpart(unitBox, '#7a3b3b', 0.08, 0.015, 0.02, 0, 1.75, 0.14);
  // Eyes.
  cpart(unitBox, '#111', 0.04, 0.03, 0.02, -0.05, 1.84, 0.13);
  cpart(unitBox, '#111', 0.04, 0.03, 0.02, 0.05, 1.84, 0.13);

  const shoulderL = pivot(-0.27, 1.56 - CHEST_PIVOT, 0, chest);
  const shoulderR = pivot(0.27, 1.56 - CHEST_PIVOT, 0, chest);
  part(limbBox, torsoColor, 0.12, 0.3, 0.12, 0, 0, 0, shoulderL);
  part(limbBox, torsoColor, 0.12, 0.3, 0.12, 0, 0, 0, shoulderR);
  const elbowL = new THREE.Group();
  elbowL.position.set(0, -0.3, 0);
  shoulderL.add(elbowL);
  const elbowR = new THREE.Group();
  elbowR.position.set(0, -0.3, 0);
  shoulderR.add(elbowR);
  part(limbBox, look.skin, 0.1, 0.28, 0.1, 0, 0, 0, elbowL);
  part(limbBox, look.skin, 0.1, 0.28, 0.1, 0, 0, 0, elbowR);
  const handR = new THREE.Group();
  handR.position.set(0, -0.3, 0);
  elbowR.add(handR);

  const hipL = pivot(-0.1, HIP_HEIGHT, 0);
  const hipR = pivot(0.1, HIP_HEIGHT, 0);
  const legColor = look.pants;
  if (look.skirt) {
    part(unitBox, look.shirt, 0.4, 0.3, 0.28, 0, 0.82, 0);
  }
  part(limbBox, legColor, 0.15, THIGH, 0.15, 0, 0, 0, hipL);
  part(limbBox, legColor, 0.15, THIGH, 0.15, 0, 0, 0, hipR);
  const kneeL = new THREE.Group();
  kneeL.position.set(0, -THIGH, 0);
  hipL.add(kneeL);
  const kneeR = new THREE.Group();
  kneeR.position.set(0, -THIGH, 0);
  hipR.add(kneeR);
  part(limbBox, look.skirt ? look.skin : legColor, 0.13, SHIN, 0.13, 0, 0, 0, kneeL);
  part(limbBox, look.skirt ? look.skin : legColor, 0.13, SHIN, 0.13, 0, 0, 0, kneeR);
  const shoeL = part(unitBox, look.shoes, 0.14, 0.08, 0.26, 0, -0.48, 0.05, kneeL);
  const shoeR = part(unitBox, look.shoes, 0.14, 0.08, 0.26, 0, -0.48, 0.05, kneeR);

  g.scale.setScalar(s);
  const parts = { hips, chest, torso, head, neck, shoulderL, shoulderR, elbowL, elbowR, handR, hipL, hipR, kneeL, kneeR, shoeL, shoeR };
  let weaponMesh = null;

  const api = {
    group: g,
    parts,
    look,
    phase: 0,
    /** Hip centre and pelvis bottom above the origin, in world metres (the figure's scale applied). */
    hipHeight: HIP_HEIGHT * s,
    seatHeight: SEAT_HEIGHT * s,
    /** Pose from motion: `speed` m/s, `dt` seconds; running swings further and leans forward. */
    animateWalk(speed, dt, running = false) {
      const rate = running ? 2.4 : 1.9;
      this.phase += dt * speed * rate;
      const amp = Math.min(1, speed / 2.2) * (running ? 0.95 : 0.65);
      const swing = Math.sin(this.phase) * amp;
      hipL.rotation.set(swing, 0, 0);
      hipR.rotation.set(-swing, 0, 0);
      kneeL.rotation.x = Math.max(0, -Math.sin(this.phase - 0.5)) * amp * 1.2;
      kneeR.rotation.x = Math.max(0, Math.sin(this.phase - 0.5)) * amp * 1.2;
      shoulderL.rotation.x = -swing * 0.8;
      shoulderR.rotation.x = swing * 0.8;
      elbowL.rotation.x = -0.3 - Math.max(0, swing) * 0.4;
      elbowR.rotation.x = -0.3 - Math.max(0, -swing) * 0.4;
      chest.rotation.x = running ? 0.18 : 0.02;
      hips.rotation.x = 0;
      head.rotation.x = 0;
      const bob = speed > 0.2 ? Math.abs(Math.sin(this.phase)) * (running ? 0.07 : 0.03) : 0;
      g.position.y = bob;
      shoulderL.rotation.z = 0.08;
      shoulderR.rotation.z = -0.08;
    },
    animateIdle(t) {
      hipL.rotation.set(0, 0, 0);
      hipR.rotation.set(0, 0, 0);
      kneeL.rotation.x = 0;
      kneeR.rotation.x = 0;
      shoulderL.rotation.x = Math.sin(t * 1.3) * 0.03;
      shoulderR.rotation.x = -Math.sin(t * 1.3) * 0.03;
      shoulderL.rotation.z = 0.1;
      shoulderR.rotation.z = -0.1;
      elbowL.rotation.x = -0.15;
      elbowR.rotation.x = -0.15;
      chest.rotation.x = 0;
      g.position.y = Math.sin(t * 1.3) * 0.005;
    },
    /** Right arm straight forward holding the gun. */
    animateAim(hasWeapon) {
      shoulderR.rotation.x = hasWeapon ? -Math.PI / 2 + 0.1 : -0.3;
      shoulderR.rotation.z = 0;
      elbowR.rotation.x = hasWeapon ? 0 : -1.2;
      if (hasWeapon) {
        shoulderL.rotation.x = -1.1;
        shoulderL.rotation.z = 0.5;
        elbowL.rotation.x = -1.4;
      }
    },
    animatePunch(t) {
      const k = Math.sin(Math.min(1, t) * Math.PI);
      shoulderR.rotation.x = -1.4 * k;
      elbowR.rotation.x = -1.2 * (1 - k);
      chest.rotation.y = -0.3 * k;
    },
    /**
     * Seated in a car or on a bike, the group parented to the vehicle's seat point: the pelvis
     * rests on the seat (the origin, between the feet, drops by seatHeight), the thighs reach
     * forward and the shins come back so the feet hang on the pegs below the hips, the chest
     * tucks forward over the tank with the arms out to the bars. `lean` counter-rolls the rider.
     */
    animateSeated(onBike = false, lean = 0) {
      hipL.rotation.set(onBike ? -0.95 : -1.5, 0, onBike ? -0.3 : -0.08);
      hipR.rotation.set(onBike ? -0.95 : -1.5, 0, onBike ? 0.3 : 0.08);
      kneeL.rotation.x = onBike ? 1.75 : 1.4;
      kneeR.rotation.x = onBike ? 1.75 : 1.4;
      // The arms hang in the chest's frame, whose "down" tilts backwards as the chest leans
      // forward: on the bike they swing well past the lean to reach forward-down to the grips.
      shoulderL.rotation.x = onBike ? -1.8 : -0.9;
      shoulderR.rotation.x = onBike ? -1.8 : -0.9;
      shoulderL.rotation.z = 0.22;
      shoulderR.rotation.z = -0.22;
      elbowL.rotation.x = onBike ? -0.15 : -0.9;
      elbowR.rotation.x = onBike ? -0.15 : -0.9;
      chest.rotation.x = onBike ? 0.8 : 0.05;
      chest.rotation.y = 0;
      head.rotation.x = onBike ? -0.6 : 0;
      g.rotation.set(0, 0, -lean);
      g.position.set(0, -this.seatHeight, 0);
    },
    /** Fallen to the ground. */
    animateDead(side = 1) {
      g.rotation.x = -Math.PI / 2 * 0.98;
      g.rotation.z = side * 0.3;
      g.position.y = 0.2;
      for (const p of [hipL, hipR, kneeL, kneeR, shoulderL, shoulderR, elbowL, elbowR]) p.rotation.set(0, 0, 0);
      shoulderL.rotation.z = 0.9;
      shoulderR.rotation.z = -0.5;
      kneeR.rotation.x = 0.6;
    },
    /** Hands in the air. */
    animateSurrender() {
      shoulderL.rotation.x = Math.PI - 0.2;
      shoulderR.rotation.x = Math.PI - 0.2;
      shoulderL.rotation.z = 0.2;
      shoulderR.rotation.z = -0.2;
      elbowL.rotation.x = 0.2;
      elbowR.rotation.x = 0.2;
    },
    resetPose() {
      g.rotation.set(0, 0, 0);
      g.position.set(0, 0, 0);
      chest.rotation.set(0, 0, 0);
      torso.rotation.set(0, 0, 0);
      head.rotation.set(0, 0, 0);
      hipL.rotation.set(0, 0, 0);
      hipR.rotation.set(0, 0, 0);
    },
    setWeapon(mesh) {
      if (weaponMesh) handR.remove(weaponMesh);
      weaponMesh = mesh;
      if (mesh) handR.add(mesh);
    },
    setVisible(v) {
      g.visible = v;
    },
  };
  return api;
}

/** A small gun model held in the right hand. */
export function createGunMesh(kind) {
  const g = new THREE.Group();
  const dark = mat('#2a2d33');
  const body = new THREE.Mesh(unitBox, dark);
  if (kind === 'pistol') {
    body.scale.set(0.05, 0.08, 0.22);
    body.position.set(0, -0.02, 0.12);
    g.add(body);
  } else if (kind === 'smg') {
    body.scale.set(0.07, 0.12, 0.42);
    body.position.set(0, -0.04, 0.2);
    g.add(body);
    const mag = new THREE.Mesh(unitBox, dark);
    mag.scale.set(0.05, 0.16, 0.06);
    mag.position.set(0, -0.14, 0.12);
    g.add(mag);
  } else if (kind === 'shotgun') {
    body.scale.set(0.06, 0.08, 0.8);
    body.position.set(0, -0.02, 0.35);
    g.add(body);
    const stock = new THREE.Mesh(unitBox, mat('#6b4423'));
    stock.scale.set(0.07, 0.12, 0.3);
    stock.position.set(0, -0.06, -0.1);
    g.add(stock);
  } else {
    return null;
  }
  return g;
}
