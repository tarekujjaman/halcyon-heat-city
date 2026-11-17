// World markers: the glowing rings and light columns that mark mission starts, objectives,
// race checkpoints, shops and safehouses, with the trigger when Sol is inside one in the right
// mode (on foot or driving, also after changing mode inside the ring), the hint when she is in
// the wrong one, and the blips the minimap and map draw for them.
import * as THREE from 'three';

const ringGeo = new THREE.CylinderGeometry(1, 1, 0.5, 28, 1, true);
const beamGeo = new THREE.CylinderGeometry(0.35, 0.9, 14, 12, 1, true);

export function createMarkers(G) {
  const list = [];
  const materials = new Map();
  function matFor(color) {
    let m = materials.get(color);
    if (!m) {
      m = {
        ring: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
        beam: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      };
      materials.set(color, m);
    }
    return m;
  }

  /**
   * Add a marker at (x, z). Options: radius, color, kind ('mission'|'objective'|'checkpoint'|'shop'|
   * 'safehouse'|'race'|'taxi'|'waypoint'|'shard'), label, needVehicle, needFoot, beam, onEnter(marker).
   */
  function add(x, z, options = {}) {
    const m = {
      x, z, radius: options.radius || 3, color: options.color || '#ffd43b', kind: options.kind || 'objective', label: options.label || '',
      needVehicle: !!options.needVehicle, needFoot: !!options.needFoot, onEnter: options.onEnter || null, beam: options.beam !== false,
      // inside: fired for the current stay; hinted: the wrong-mode hint was shown for this stay.
      inside: false, hinted: false, group: new THREE.Group(), t: Math.random() * 6, hidden: false, blip: options.blip !== false, once: options.once !== false,
    };
    const mats = matFor(m.color);
    const ring = new THREE.Mesh(ringGeo, mats.ring);
    ring.scale.set(m.radius, 1, m.radius);
    ring.position.y = 0.3;
    m.group.add(ring);
    m.ring = ring;
    if (m.beam) {
      const beam = new THREE.Mesh(beamGeo, mats.beam);
      beam.position.y = 7.3;
      m.group.add(beam);
    }
    const y = G.world.layout.groundHeight(x, z);
    m.group.position.set(x, y, z);
    G.world.scene.add(m.group);
    list.push(m);
    return m;
  }

  function remove(m) {
    if (!m) return;
    const i = list.indexOf(m);
    if (i >= 0) list.splice(i, 1);
    G.world.scene.remove(m.group);
    m.removed = true;
  }

  /** Is the player in the mode this marker asks for (any mode when it asks for none)? */
  function modeOk(m, inCar) {
    return (!m.needVehicle || inCar) && (!m.needFoot || !inCar);
  }

  function update(dt) {
    const p = G.player;
    const inCar = p.state === 'car';
    for (const m of [...list]) {
      m.t += dt;
      m.ring.position.y = 0.3 + Math.sin(m.t * 2) * 0.12;
      m.ring.rotation.y += dt * 0.6;
      m.ring.material.opacity = 0.45 + Math.sin(m.t * 3) * 0.15;
      if (m.hidden) {
        m.group.visible = false;
        continue;
      }
      m.group.visible = true;
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      const within = d < m.radius + (inCar ? 1.2 : 0.4);
      if (!within) {
        // Leaving the ring re-arms it for the next visit.
        m.inside = false;
        m.hinted = false;
        continue;
      }
      if (!m.onEnter || p.dead) continue;
      if (modeOk(m, inCar)) {
        // Fires on entering in the right mode, and on changing to it while still inside: a
        // mission start reached by car triggers the moment Sol steps out within the ring.
        if (m.inside) continue;
        m.inside = true;
        m.onEnter(m);
        if (m.once) remove(m);
      } else if (!m.hinted) {
        m.hinted = true;
        m.inside = false;
        G.hud.hint(m.needVehicle ? 'You need a car for this' : 'Get out of the car first');
      }
    }
  }

  return {
    list, add, remove, update, modeOk,
    clearKind(kind) {
      for (const m of [...list]) if (m.kind === kind) remove(m);
    },
    nearest(kind, x, z) {
      let best = null;
      let bd = Infinity;
      for (const m of list) {
        if (kind && m.kind !== kind) continue;
        const d = Math.hypot(m.x - x, m.z - z);
        if (d < bd) { bd = d; best = m; }
      }
      return best;
    },
  };
}
