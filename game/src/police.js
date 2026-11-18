// Halcyon PD: cruisers with sirens and flashing lightbars that route by road to the search area
// and ram once they see Sol, officers who step out to shoot and arrest, roadblocks across her
// path from three stars, and the helicopter with its searchlight from four.
import * as THREE from 'three';
import { POLICE, WANTED } from './config.js';
import { createDriver } from './vehicles/driver.js';
import { createCharacter, createGunMesh, LOOKS } from './characters.js';
import { createRng, frand } from './rng.js';
import { dirVec, rightVec, yawOfDir } from './navigation.js';

const eye = new THREE.Vector3();
const dir = new THREE.Vector3();

export function createPolice(G) {
  const rng = createRng(G.seed + 707);
  const nav = G.nav;
  const cruisers = [];
  const officers = [];
  const roadblocks = [];
  let heli = null;
  let roadblockTimer = 12;
  let arrestTimer = 0;
  let respondTimer = 0;
  let spawnTimer = 0;
  const playerTarget = { get x() { return G.player.x; }, get z() { return G.player.z; }, get vx() { return G.player.vehicle ? G.player.vehicle.vx : G.player.vx; }, get vz() { return G.player.vehicle ? G.player.vehicle.vz : G.player.vz; }, get speed() { return G.player.vehicle ? G.player.vehicle.speed : G.player.speed; } };

  function clearLine(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const d = Math.hypot(dx, dy, dz) || 1;
    const hit = G.world.colliders.raycast(x1, y1, z1, dx / d, dy / d, dz / d, d);
    return !hit || hit.collider.tag === 'sea' || hit.collider.tag === 'edge' || hit.collider.tag === 'railing' || hit.collider.tag === 'steps';
  }

  function canSeeFrom(x, y, z, range = WANTED.sightRange) {
    const p = G.player;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > range) return false;
    return clearLine(x, y, z, p.x, p.y + 1.2, p.z);
  }

  function canSeePlayer() {
    if (G.player.dead) return false;
    for (const v of cruisers) if (!v.wrecked && canSeeFrom(v.x, v.y + 1.3, v.z, WANTED.sightRange * 1.3)) return true;
    for (const o of officers) if (!o.dead && canSeeFrom(o.x, o.y + 1.6, o.z)) return true;
    if (heli && canSeeFrom(heli.x, heli.y, heli.z, 140)) return true;
    return false;
  }

  function spawnCruiser(spot, options = {}) {
    const v = G.fleet.spawn('cruiser', spot.x, spot.z, spot.yaw, { role: 'police', rng, color: '#ffffff' });
    const ai = createDriver(v, nav, { limit: 22 + G.wanted.stars * 2.5, ignoreLights: true, aggressive: true });
    if (spot.node) ai.reset(spot.node, spot.dir, spot.lane);
    else ai.setRoad();
    v.ai = ai;
    v.siren = !options.silent;
    v.driver = { kind: 'officer', x: v.x, z: v.z };
    v.crew = 2;
    v.lostTimer = 0;
    v.leaving = false;
    cruisers.push(v);
    return v;
  }

  function spawnOfficer(x, z, cruiser = null) {
    const model = createCharacter(LOOKS.officer);
    model.setWeapon(createGunMesh('pistol'));
    G.world.scene.add(model.group);
    const o = {
      kind: 'officer', x, z, y: G.world.layout.groundHeight(x, z), yaw: 0, hp: 70, dead: false, removed: false,
      radius: 0.42, height: 1.85, model, cruiser, fireTimer: 0.8 + frand(), deadTimer: 0, strafe: frand() < 0.5 ? 1 : -1, strafeTimer: 0,
      onHit(dmg, source) {
        if (o.dead) return;
        o.hp -= dmg;
        if (o.hp <= 0) {
          o.dead = true;
          o.model.animateDead(1);
          G.economy.stat('copsDown', 1);
        }
      },
    };
    officers.push(o);
    return o;
  }

  function removeOfficer(o) {
    o.removed = true;
    G.world.scene.remove(o.model.group);
    const i = officers.indexOf(o);
    if (i >= 0) officers.splice(i, 1);
  }

  function removeCruiser(v) {
    const i = cruisers.indexOf(v);
    if (i >= 0) cruisers.splice(i, 1);
    G.fleet.remove(v);
  }

  /** Called when the wanted level rises: get units moving at once. */
  function respond() {
    respondTimer = 0;
    spawnTimer = 0;
  }

  function shootAt(o, originY, range, damage, accuracy) {
    const p = G.player;
    const tx = p.x;
    const ty = p.y + 1.1;
    const tz = p.z;
    eye.set(o.x, o.y + originY, o.z);
    dir.set(tx - eye.x, ty - eye.y, tz - eye.z);
    const d = dir.length() || 1;
    dir.divideScalar(d);
    const miss = frand() > accuracy;
    if (miss) {
      dir.x += (frand() - 0.5) * 0.25;
      dir.y += (frand() - 0.5) * 0.12;
      dir.z += (frand() - 0.5) * 0.25;
      dir.normalize();
    }
    G.effects.muzzleFlash(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z);
    const hit = G.combat.shoot(eye, dir, range, damage, o);
    const end = hit ? hit.point : eye.clone().addScaledVector(dir, range);
    G.effects.tracer(eye.x, eye.y, eye.z, end.x, end.y, end.z);
    G.audio.play('pistol', Math.max(0.2, 1 - d / 60));
  }

  function updateOfficer(o, dt) {
    const p = G.player;
    if (o.dead) {
      o.deadTimer += dt;
      if (o.deadTimer > 30) removeOfficer(o);
      o.model.group.position.set(o.x, o.y, o.z);
      return;
    }
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const d = Math.hypot(dx, dz);
    o.yaw = Math.atan2(dx, dz);
    const sees = canSeeFrom(o.x, o.y + 1.6, o.z, POLICE.officerRange * 1.5);
    let move = 0;
    o.strafeTimer -= dt;
    if (o.strafeTimer <= 0) {
      o.strafeTimer = 1.5 + frand() * 2;
      o.strafe = -o.strafe;
    }
    let mx = 0;
    let mz = 0;
    if (d > 13 || !sees) {
      move = 4.2;
      mx = dx / (d || 1);
      mz = dz / (d || 1);
    } else if (d < 6 && (p.state === 'foot')) {
      move = 2.2;
      mx = dx / (d || 1);
      mz = dz / (d || 1);
    } else {
      move = 1.4;
      mx = -dz / (d || 1) * o.strafe;
      mz = dx / (d || 1) * o.strafe;
    }
    o.x += mx * move * dt;
    o.z += mz * move * dt;
    const body = { x: o.x, z: o.z };
    const res = G.world.colliders.resolveCircle(body, o.radius, 0, []);
    if (res.length) { o.x = body.x; o.z = body.z; }
    o.y = G.world.layout.groundHeight(o.x, o.z);
    o.fireTimer -= dt;
    const target = p.state === 'car' && p.vehicle ? p.vehicle : p;
    if (sees && d < POLICE.officerRange && o.fireTimer <= 0 && !p.dead) {
      o.fireTimer = POLICE.fireInterval * (0.8 + frand() * 0.5);
      shootAt(o, 1.45, POLICE.officerRange + 10, POLICE.pistolDamage, p.state === 'car' ? 0.5 : POLICE.accuracy);
      G.wanted.noticePlayer();
    }
    o.model.group.position.set(o.x, o.y, o.z);
    o.model.group.rotation.y = o.yaw;
    o.model.resetPose();
    if (move > 2) o.model.animateWalk(move, dt, true);
    else o.model.animateWalk(move, dt, false);
    o.model.animateAim(true);
    void target;
  }

  function buildHeli() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 5.5), new THREE.MeshStandardMaterial({ color: '#15306b', metalness: 0.4, roughness: 0.5 }));
    body.castShadow = true;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshStandardMaterial({ color: '#1a2a3a', metalness: 0.8, roughness: 0.1 }));
    nose.position.set(0, 0.1, 2.9);
    nose.scale.set(1, 0.8, 0.8);
    g.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 6), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    tail.position.set(0, 0.3, -5.5);
    g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 1.2), new THREE.MeshStandardMaterial({ color: '#15306b' }));
    fin.position.set(0, 1.1, -8.2);
    g.add(fin);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: '#222' }));
    rotor.position.set(0, 1.35, 0);
    g.add(rotor);
    const rotor2 = rotor.clone();
    rotor2.rotation.y = Math.PI / 2;
    g.add(rotor2);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.3), new THREE.MeshStandardMaterial({ color: '#222' }));
    tailRotor.position.set(0.4, 0.6, -8.3);
    g.add(tailRotor);
    for (const x of [-0.9, 0.9]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 4), new THREE.MeshStandardMaterial({ color: '#444' }));
      skid.position.set(x, -1.3, 0);
      g.add(skid);
    }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    label.position.set(1.21, -0.3, 0);
    label.rotation.y = Math.PI / 2;
    g.add(label);
    const light = new THREE.SpotLight('#fff3c4', 0, 120, 0.3, 0.5, 1);
    light.position.set(0, -1, 1.5);
    g.add(light);
    g.add(light.target);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 34, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.renderOrder = 4;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(1.8, 34, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#fff8d8', transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    inner.position.y = 0;
    cone.add(inner);
    G.world.scene.add(cone);
    const blink = new THREE.PointLight('#ff3030', 0, 20);
    blink.position.set(0, 1.6, -3);
    g.add(blink);
    G.world.scene.add(g);
    return { group: g, rotor, rotor2, tailRotor, light, cone, blink, x: 0, y: POLICE.heliHeight, z: 0, angle: 0, fireTimer: 1, vx: 0, vz: 0 };
  }

  function updateHeli(dt, stars) {
    const p = G.player;
    if (stars >= POLICE.heliStars && !heli && !p.dead) {
      heli = buildHeli();
      heli.x = p.x - 120;
      heli.z = p.z - 80;
      G.notify('Police helicopter inbound');
    }
    if (!heli) return;
    const leaving = stars < POLICE.heliStars || p.dead;
    heli.angle += dt * 0.35;
    const orbitR = 26;
    const tx = leaving ? heli.x + 200 : p.x + Math.cos(heli.angle) * orbitR;
    const tz = leaving ? heli.z - 200 : p.z + Math.sin(heli.angle) * orbitR;
    const k = Math.min(1, dt * 0.9);
    heli.vx += ((tx - heli.x) * 0.9 - heli.vx) * k;
    heli.vz += ((tz - heli.z) * 0.9 - heli.vz) * k;
    const maxV = 42;
    const sp = Math.hypot(heli.vx, heli.vz);
    if (sp > maxV) { heli.vx *= maxV / sp; heli.vz *= maxV / sp; }
    heli.x += heli.vx * dt;
    heli.z += heli.vz * dt;
    heli.y += ((leaving ? 90 : POLICE.heliHeight) - heli.y) * Math.min(1, dt * 0.8);
    const g = heli.group;
    g.position.set(heli.x, heli.y, heli.z);
    g.rotation.y = Math.atan2(heli.vx, heli.vz);
    g.rotation.z = -Math.max(-0.3, Math.min(0.3, heli.vx * 0.01));
    g.rotation.x = Math.max(-0.25, Math.min(0.25, sp * 0.006));
    heli.rotor.rotation.y += dt * 40;
    heli.rotor2.rotation.y += dt * 40;
    heli.tailRotor.rotation.x += dt * 50;
    heli.blink.intensity = Math.sin(G.world.time * 8) > 0 ? 6 : 0;
    // Searchlight on Sol.
    heli.light.intensity = leaving ? 0 : 2600;
    heli.light.target.position.set(p.x - heli.x, p.y - heli.y, p.z - heli.z);
    heli.cone.visible = !leaving;
    const cx = (heli.x + p.x) / 2;
    const cy = (heli.y + p.y) / 2;
    const cz = (heli.z + p.z) / 2;
    heli.cone.position.set(cx, cy, cz);
    const len = Math.hypot(p.x - heli.x, p.y - heli.y, p.z - heli.z);
    heli.cone.scale.set(1, len / 34, 1);
    heli.cone.lookAt(p.x, p.y, p.z);
    heli.cone.rotateX(-Math.PI / 2);
    heli.fireTimer -= dt;
    if (!leaving && heli.fireTimer <= 0 && (stars >= 5 || p.state === 'foot' || (p.vehicle && p.vehicle.spec.open))) {
      heli.fireTimer = POLICE.heliInterval;
      eye.set(heli.x, heli.y - 1, heli.z);
      dir.set(p.x - eye.x + (frand() - 0.5) * 3, p.y + 1 - eye.y, p.z - eye.z + (frand() - 0.5) * 3).normalize();
      const hit = G.combat.raycast(eye, dir, 120, null);
      const end = hit ? hit.point : eye.clone().addScaledVector(dir, 120);
      G.effects.tracer(eye.x, eye.y, eye.z, end.x, end.y, end.z);
      if (hit && hit.kind === 'player') p.damage(POLICE.heliDamage, 'helicopter');
      else if (hit && hit.kind === 'vehicle' && hit.target.driver === p) G.combat.damageVehicle(hit.target, POLICE.heliDamage * 0.6, 'helicopter');
      else if (hit) G.effects.hitSparks(end.x, end.y, end.z);
      G.audio.play('smg', 0.35);
    }
    if (leaving && Math.hypot(heli.x - p.x, heli.z - p.z) > 260) {
      G.world.scene.remove(heli.group);
      G.world.scene.remove(heli.cone);
      heli = null;
    }
  }

  /** Two cruisers parked across the road two intersections ahead of Sol, officers behind them. */
  function placeRoadblock() {
    const p = G.player;
    const v = p.vehicle;
    if (!v) return;
    const loc = nav.locate(v.x, v.z, v.yaw);
    const d = loc.dir;
    const ahead1 = nav.neighbor(loc.node, d);
    const ahead2 = ahead1 ? nav.neighbor(ahead1, d) : null;
    const target = ahead2 || ahead1;
    if (!target || target.key) return;
    const fv = dirVec(d);
    const rv = rightVec(d);
    const centre = { x: target.x - fv[0] * (nav.stopDistance + 10), z: target.z - fv[1] * (nav.stopDistance + 10) };
    const block = { cruisers: [], officers: [], x: centre.x, z: centre.z };
    const acrossYaw = yawOfDir(nav.rightOf(d));
    for (const side of [-0.5, 0.5]) {
      const x = centre.x + rv[0] * side * 4.6;
      const z = centre.z + rv[1] * side * 4.6;
      const cr = G.fleet.spawn('cruiser', x, z, acrossYaw, { role: 'police', rng, color: '#ffffff' });
      cr.siren = true;
      cr.ctrl.handbrake = true;
      cr.driver = { kind: 'officer' };
      cr.roadblock = true;
      cr.crew = 0;
      cruisers.push(cr);
      block.cruisers.push(cr);
      const o = spawnOfficer(x + fv[0] * 3.5, z + fv[1] * 3.5, cr);
      block.officers.push(o);
    }
    roadblocks.push(block);
    G.notify('Roadblock ahead');
  }

  function update(dt) {
    const stars = G.wanted.stars;
    const p = G.player;
    respondTimer += dt;
    spawnTimer -= dt;
    // Cruisers.
    const wantCruisers = p.dead ? 0 : POLICE.cruisersByStar[stars];
    const active = cruisers.filter((v) => !v.wrecked && !v.leaving && !v.roadblock);
    if (active.length < wantCruisers && spawnTimer <= 0) {
      const s = G.wanted.search;
      const spot = nav.randomLaneSpot(rng, s.x, s.z, 70, 130, 40);
      if (spot && G.fleet.spotFree(spot.x, spot.z, 8)) {
        const v = spawnCruiser(spot);
        v.ai.routeTo(s.x, s.z);
        spawnTimer = 0.7;
      } else spawnTimer = 0.2;
    }
    for (let i = cruisers.length - 1; i >= 0; i -= 1) {
      const v = cruisers[i];
      if (v.removed) { cruisers.splice(i, 1); continue; }
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (v.wrecked) {
        if (d > 90) removeCruiser(v);
        continue;
      }
      if (v.roadblock) continue;
      if (v.driver === p) { cruisers.splice(i, 1); continue; }
      if (stars === 0 || p.dead) {
        v.siren = false;
        if (!v.leaving) {
          v.leaving = true;
          if (v.ai) v.ai.setRoad();
          if (v.ai) v.ai.limit = 12;
        }
        if (d > 150) removeCruiser(v);
        if (v.ai) v.ai.step(dt, G.traffic.ctx);
        continue;
      }
      const sees = canSeeFrom(v.x, v.y + 1.3, v.z, WANTED.sightRange * 1.3);
      if (sees) v.lostTimer = 0;
      else v.lostTimer += dt;
      if (v.ai) {
        if ((sees || d < 28) && v.ai.mode !== 'chase') v.ai.setChase(playerTarget, 23 + stars * 2.5);
        else if (v.ai.mode === 'chase' && v.lostTimer > 4 && d > 60) {
          v.ai.setRoad();
          v.ai.routeTo(G.wanted.search.x, G.wanted.search.z);
        } else if (v.ai.mode === 'road' && (!v.ai.routeDirs || !v.ai.routeDirs.length) && v.ai.destination && Math.hypot(v.ai.destination.x - v.x, v.ai.destination.z - v.z) > 60) {
          v.ai.routeTo(G.wanted.search.x, G.wanted.search.z);
        }
        v.ai.step(dt, G.traffic.ctx);
      }
      if (sees) G.wanted.noticePlayer();
      // Ramming counts as police contact: reset the evasion timer.
      // Officers get out when close to a stopped or on-foot Sol.
      const playerSlow = p.state === 'foot' || (p.vehicle && Math.abs(p.vehicle.speed) < 2.5);
      if (v.crew > 0 && d < 16 && playerSlow && Math.abs(v.speed) < 3 && officers.filter((o) => !o.dead).length < POLICE.officersByStar[stars] + 1) {
        const rx = -Math.cos(v.yaw);
        const rz = Math.sin(v.yaw);
        for (let k = 0; k < Math.min(2, v.crew); k += 1) {
          const side = k === 0 ? -1 : 1;
          spawnOfficer(v.x + rx * side * 1.8, v.z + rz * side * 1.8, v);
        }
        v.crew = 0;
      }
      if (v.crew === 0 && d > 60 && officers.filter((o) => o.cruiser === v && !o.dead).length === 0) v.crew = 2;
      if (d < 60) G.audio.siren(v, d);
    }
    // Officers on foot.
    for (let i = officers.length - 1; i >= 0; i -= 1) {
      const o = officers[i];
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (!o.dead && (stars === 0 || d > 110 || p.dead)) {
        removeOfficer(o);
        continue;
      }
      updateOfficer(o, dt);
    }
    // Arrest: an officer close to a Sol who is on foot or stopped.
    let arresting = false;
    if (!p.dead && stars > 0) {
      const slow = p.state === 'foot' ? p.speed < 2.5 : Math.abs(p.vehicle ? p.vehicle.speed : 0) < WANTED.arrestSpeed;
      for (const o of officers) {
        if (o.dead) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) < 2.7 && slow) arresting = true;
      }
      for (const v of cruisers) {
        if (v.wrecked || v.crew === 0) continue;
        if (Math.hypot(v.x - p.x, v.z - p.z) < 4 && slow && Math.abs(v.speed) < 2 && p.state === 'foot') arresting = true;
      }
    }
    arrestTimer = arresting ? arrestTimer + dt : Math.max(0, arrestTimer - dt * 2);
    if (arrestTimer >= WANTED.arrestSeconds && !p.dead) {
      arrestTimer = 0;
      G.events.emit('arrested');
    }
    // Roadblocks.
    roadblockTimer -= dt;
    if (stars >= POLICE.roadblockStars && p.state === 'car' && p.vehicle && Math.abs(p.vehicle.speed) > 8 && roadblockTimer <= 0 && roadblocks.length < 2) {
      roadblockTimer = 22;
      placeRoadblock();
    }
    for (let i = roadblocks.length - 1; i >= 0; i -= 1) {
      const b = roadblocks[i];
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (stars === 0 || d > 220) {
        for (const cr of b.cruisers) { const k = cruisers.indexOf(cr); if (k >= 0) cruisers.splice(k, 1); G.fleet.remove(cr); }
        for (const o of b.officers) removeOfficer(o);
        roadblocks.splice(i, 1);
      }
    }
    updateHeli(dt, stars);
  }

  function clearAll() {
    for (const v of [...cruisers]) removeCruiser(v);
    for (const o of [...officers]) removeOfficer(o);
    roadblocks.length = 0;
    if (heli) {
      G.world.scene.remove(heli.group);
      G.world.scene.remove(heli.cone);
      heli = null;
    }
    arrestTimer = 0;
  }

  G.combat.registerGroup(officers);
  return {
    cruisers, officers, roadblocks, update, respond, canSeePlayer, spawnCruiser, spawnOfficer, clearAll, placeRoadblock,
    get heli() { return heli; },
    arrestProgress: () => arrestTimer / WANTED.arrestSeconds,
    /** Force a helicopter now (screenshot scenes). */
    summonHeli(x, z) {
      if (!heli) heli = buildHeli();
      heli.x = x;
      heli.z = z;
      heli.y = POLICE.heliHeight;
    },
  };
}
