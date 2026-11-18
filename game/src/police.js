// Halcyon PD: cruisers with sirens and lightbars that route by road to the search area and ram
// once they see Sol, officers who step out to shoot and to arrest her when she stops, roadblocks
// across her path from three stars and the helicopter with its searchlight and gun from four; all
// of it scales with the wanted stars and leaves when they are gone. Exports createPolice(G).
import * as THREE from 'three';
import { DRIVER_AI, POLICE, WANTED } from './config.js';
import { createDriver } from './vehicles/driver.js';
import { createCharacter, createGunMesh, LOOKS } from './characters.js';
import { createRng, frand } from './rng.js';
import { dirVec, rightVec, yawOfDir } from './navigation.js';

/** Colliders a line of sight passes through: low walls and the water's edge hide nobody. */
const SEE_THROUGH = new Set(['sea', 'edge', 'railing', 'steps']);
/** Scratch for shots and officer movement, never handed out. */
const eye = new THREE.Vector3();
const dir = new THREE.Vector3();
const shotEnd = new THREE.Vector3();
const officerBody = { x: 0, z: 0 };
const officerHits = [];
/** The helicopter's searchlight cone geometry is this long; it is scaled to the real distance. */
const BEAM_LENGTH = 34;

/**
 * The force: cruisers (fleet vehicles with `crew`, `lostTimer`, `leaving`, `roadblock`), officers on
 * foot (combat targets), roadblocks and the helicopter; update(dt) each step, respond() when the stars rise.
 */
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
  /** What the cruisers chase: Sol, or her car when she drives, read live. */
  const playerTarget = { get x() { return G.player.x; }, get z() { return G.player.z; }, get vx() { return G.player.vehicle ? G.player.vehicle.vx : G.player.vx; }, get vz() { return G.player.vehicle ? G.player.vehicle.vz : G.player.vz; }, get speed() { return G.player.vehicle ? G.player.vehicle.speed : G.player.speed; } };

  /** Is the straight line between two points free of buildings and posts? */
  function clearLine(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const d = Math.hypot(dx, dy, dz) || 1;
    const hit = G.world.colliders.raycast(x1, y1, z1, dx / d, dy / d, dz / d, d);
    return !hit || SEE_THROUGH.has(hit.collider.tag);
  }

  /** Can an eye at (x, y, z) see Sol within `range`? */
  function canSeeFrom(x, y, z, range = WANTED.sightRange) {
    const p = G.player;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > range) return false;
    return clearLine(x, y, z, p.x, p.y + 1.2, p.z);
  }

  /** Does any unit have eyes on Sol right now? (The wanted level stops fading while one does.) */
  function canSeePlayer() {
    if (G.player.dead) return false;
    for (const v of cruisers) if (!v.wrecked && canSeeFrom(v.x, v.y + 1.3, v.z, WANTED.sightRange * POLICE.cruiserSightScale)) return true;
    for (const o of officers) if (!o.dead && canSeeFrom(o.x, o.y + 1.6, o.z)) return true;
    if (heli && canSeeFrom(heli.x, heli.y, heli.z, POLICE.heliSightRange)) return true;
    return false;
  }

  /** Count of a predicate over a list without allocating. */
  function countIf(list, test) {
    let n = 0;
    for (const item of list) if (test(item)) n += 1;
    return n;
  }

  /** A crewed cruiser at a lane spot `{x, z, yaw, node?, dir?, lane?}` (joins that lane if given); `options.silent` mutes the siren. */
  function spawnCruiser(spot, options = {}) {
    const v = G.fleet.spawn('cruiser', spot.x, spot.z, spot.yaw, { role: 'police', rng, color: '#ffffff' });
    const ai = createDriver(v, nav, { limit: POLICE.cruiserSpeed + G.wanted.stars * POLICE.speedPerStar, ignoreLights: true });
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

  /** An officer on foot at (x, z), armed; `cruiser` is the car they stepped out of, if any. */
  function spawnOfficer(x, z, cruiser = null) {
    const model = createCharacter(LOOKS.officer);
    model.setWeapon(createGunMesh('pistol'));
    G.world.scene.add(model.group);
    const o = {
      kind: 'officer', x, z, y: G.world.layout.groundHeight(x, z), yaw: 0, hp: POLICE.officerHealth, dead: false, removed: false,
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

  /** Take a cruiser out of the force and the world. */
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

  /** One pistol shot from `o` at Sol: a hit with probability `accuracy`, else a near miss, with flash and tracer. */
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
    const end = hit ? hit.point : shotEnd.copy(eye).addScaledVector(dir, range);
    G.effects.tracer(eye.x, eye.y, eye.z, end.x, end.y, end.z);
    G.audio.play('pistol', Math.max(0.2, 1 - d / 60));
  }

  /** Close in while far or unsighted, press a Sol on foot at point blank, else hold range and strafe; shoot on the timer. */
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
    const inv = 1 / (d || 1);
    o.yaw = Math.atan2(dx, dz);
    const sees = canSeeFrom(o.x, o.y + 1.6, o.z, POLICE.officerRange * 1.5);
    o.strafeTimer -= dt;
    if (o.strafeTimer <= 0) {
      o.strafeTimer = 1.5 + frand() * 2;
      o.strafe = -o.strafe;
    }
    let move;
    let mx;
    let mz;
    if (d > POLICE.officerCloseRange || !sees) {
      move = POLICE.officerRunSpeed;
      mx = dx * inv;
      mz = dz * inv;
    } else if (d < POLICE.officerPointBlank && p.state === 'foot') {
      move = POLICE.officerCloseSpeed;
      mx = dx * inv;
      mz = dz * inv;
    } else {
      move = POLICE.officerStrafeSpeed;
      mx = -dz * inv * o.strafe;
      mz = dx * inv * o.strafe;
    }
    o.x += mx * move * dt;
    o.z += mz * move * dt;
    officerBody.x = o.x;
    officerBody.z = o.z;
    if (G.world.colliders.resolveCircle(officerBody, o.radius, 0, officerHits).length) {
      o.x = officerBody.x;
      o.z = officerBody.z;
    }
    o.y = G.world.layout.groundHeight(o.x, o.z);
    o.fireTimer -= dt;
    if (sees && d < POLICE.officerRange && o.fireTimer <= 0 && !p.dead) {
      o.fireTimer = POLICE.fireInterval * (0.8 + frand() * 0.5);
      shootAt(o, 1.45, POLICE.officerRange + 10, POLICE.pistolDamage, p.state === 'car' ? POLICE.accuracyAtCar : POLICE.accuracy);
      G.wanted.noticePlayer();
    }
    o.model.group.position.set(o.x, o.y, o.z);
    o.model.group.rotation.y = o.yaw;
    o.model.resetPose();
    o.model.animateWalk(move, dt, move > 2);
    o.model.animateAim(true);
  }

  /** The helicopter model: body, rotors, skids, the searchlight and its visible beam cone, a red blinker. */
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
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, BEAM_LENGTH, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.renderOrder = 4;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(1.8, BEAM_LENGTH, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#fff8d8', transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    inner.position.y = 0;
    cone.add(inner);
    G.world.scene.add(cone);
    const blink = new THREE.PointLight('#ff3030', 0, 20);
    blink.position.set(0, 1.6, -3);
    g.add(blink);
    G.world.scene.add(g);
    return { group: g, rotor, rotor2, tailRotor, light, cone, blink, x: 0, y: POLICE.heliHeight, z: 0, angle: 0, fireTimer: 1, vx: 0, vz: 0 };
  }

  /** Arrives at POLICE.heliStars, orbits Sol with the searchlight on her, fires when she is exposed, climbs away when the stars drop. */
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
    const tx = leaving ? heli.x + 200 : p.x + Math.cos(heli.angle) * POLICE.heliOrbitRadius;
    const tz = leaving ? heli.z - 200 : p.z + Math.sin(heli.angle) * POLICE.heliOrbitRadius;
    const k = Math.min(1, dt * 0.9);
    heli.vx += ((tx - heli.x) * 0.9 - heli.vx) * k;
    heli.vz += ((tz - heli.z) * 0.9 - heli.vz) * k;
    const sp = Math.hypot(heli.vx, heli.vz);
    if (sp > POLICE.heliMaxSpeed) {
      heli.vx *= POLICE.heliMaxSpeed / sp;
      heli.vz *= POLICE.heliMaxSpeed / sp;
    }
    heli.x += heli.vx * dt;
    heli.z += heli.vz * dt;
    heli.y += ((leaving ? POLICE.heliLeaveHeight : POLICE.heliHeight) - heli.y) * Math.min(1, dt * 0.8);
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
    heli.cone.scale.set(1, len / BEAM_LENGTH, 1);
    heli.cone.lookAt(p.x, p.y, p.z);
    heli.cone.rotateX(-Math.PI / 2);
    heli.fireTimer -= dt;
    if (!leaving && heli.fireTimer <= 0 && (stars >= WANTED.maxStars || p.state === 'foot' || (p.vehicle && p.vehicle.spec.open))) {
      heli.fireTimer = POLICE.heliInterval;
      eye.set(heli.x, heli.y - 1, heli.z);
      dir.set(p.x - eye.x + (frand() - 0.5) * 3, p.y + 1 - eye.y, p.z - eye.z + (frand() - 0.5) * 3).normalize();
      const hit = G.combat.raycast(eye, dir, POLICE.heliRange, null);
      const end = hit ? hit.point : shotEnd.copy(eye).addScaledVector(dir, POLICE.heliRange);
      G.effects.tracer(eye.x, eye.y, eye.z, end.x, end.y, end.z);
      if (hit && hit.kind === 'player') p.damage(POLICE.heliDamage, 'helicopter');
      else if (hit && hit.kind === 'vehicle' && hit.target.driver === p) G.combat.damageVehicle(hit.target, POLICE.heliDamage * 0.6, 'helicopter');
      else if (hit) G.effects.hitSparks(end.x, end.y, end.z);
      G.audio.play('smg', 0.35);
    }
    if (leaving && Math.hypot(heli.x - p.x, heli.z - p.z) > POLICE.heliLeaveDistance) removeHeli();
  }

  function removeHeli() {
    if (!heli) return;
    G.world.scene.remove(heli.group);
    G.world.scene.remove(heli.cone);
    heli = null;
  }

  /** Two cruisers parked across the road two intersections ahead of Sol, an officer behind each. */
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

  /** One step of the whole force: spawn to strength, drive, disembark, arrest, roadblocks, helicopter. */
  function update(dt) {
    const stars = G.wanted.stars;
    const p = G.player;
    respondTimer += dt;
    spawnTimer -= dt;
    // Cruisers: keep the count for the stars, spawning out of sight around the search area.
    const wantCruisers = p.dead ? 0 : POLICE.cruisersByStar[stars];
    const active = countIf(cruisers, (v) => !v.wrecked && !v.leaving && !v.roadblock);
    if (active < wantCruisers && spawnTimer <= 0) {
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
        if (d > POLICE.wreckLeaveDistance) removeCruiser(v);
        continue;
      }
      if (v.roadblock) continue;
      if (v.driver === p) { cruisers.splice(i, 1); continue; }
      if (stars === 0 || p.dead) {
        // Stand down: siren off, back to lane driving, gone once out of sight.
        v.siren = false;
        if (!v.leaving) {
          v.leaving = true;
          if (v.ai) {
            v.ai.setRoad();
            v.ai.limit = DRIVER_AI.defaultLimit;
          }
        }
        if (d > POLICE.cruiserLeaveDistance) removeCruiser(v);
        if (v.ai) v.ai.step(dt, G.traffic.ctx);
        continue;
      }
      const sees = canSeeFrom(v.x, v.y + 1.3, v.z, WANTED.sightRange * POLICE.cruiserSightScale);
      if (sees) v.lostTimer = 0;
      else v.lostTimer += dt;
      if (v.ai) {
        // Chase on sight (or when very close); after losing her for a while, route back to the search area.
        if ((sees || d < POLICE.engageDistance) && v.ai.mode !== 'chase') v.ai.setChase(playerTarget, POLICE.chaseSpeed + stars * POLICE.speedPerStar);
        else if (v.ai.mode === 'chase' && v.lostTimer > POLICE.lostSeconds && d > POLICE.lostDistance) {
          v.ai.setRoad();
          v.ai.routeTo(G.wanted.search.x, G.wanted.search.z);
        } else if (v.ai.mode === 'road' && (!v.ai.routeDirs || !v.ai.routeDirs.length) && v.ai.destination && Math.hypot(v.ai.destination.x - v.x, v.ai.destination.z - v.z) > POLICE.lostDistance) {
          v.ai.routeTo(G.wanted.search.x, G.wanted.search.z);
        }
        v.ai.step(dt, G.traffic.ctx);
      }
      if (sees) G.wanted.noticePlayer();
      // Officers get out when the cruiser has pulled up close to a stopped or on-foot Sol.
      const playerSlow = p.state === 'foot' || (p.vehicle && Math.abs(p.vehicle.speed) < 2.5);
      if (v.crew > 0 && d < POLICE.disembarkDistance && playerSlow && Math.abs(v.speed) < 3 && countIf(officers, (o) => !o.dead) < POLICE.officersByStar[stars] + 1) {
        const rx = -Math.cos(v.yaw);
        const rz = Math.sin(v.yaw);
        for (let k = 0; k < Math.min(2, v.crew); k += 1) {
          const side = k === 0 ? -1 : 1;
          spawnOfficer(v.x + rx * side * 1.8, v.z + rz * side * 1.8, v);
        }
        v.crew = 0;
      }
      // Once its officers are gone and it is far away, the cruiser is crewed again.
      if (v.crew === 0 && d > POLICE.lostDistance && countIf(officers, (o) => o.cruiser === v && !o.dead) === 0) v.crew = 2;
      if (d < 60) G.audio.siren(v, d);
    }
    // Officers on foot.
    for (let i = officers.length - 1; i >= 0; i -= 1) {
      const o = officers[i];
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (!o.dead && (stars === 0 || d > POLICE.officerLeaveDistance || p.dead)) {
        removeOfficer(o);
        continue;
      }
      updateOfficer(o, dt);
    }
    // Arrest: an officer (or a crewed cruiser, when she is on foot) right next to a Sol who has stopped.
    let arresting = false;
    if (!p.dead && stars > 0) {
      const slow = p.state === 'foot' ? p.speed < 2.5 : Math.abs(p.vehicle ? p.vehicle.speed : 0) < WANTED.arrestSpeed;
      if (slow) {
        for (const o of officers) {
          if (!o.dead && Math.hypot(o.x - p.x, o.z - p.z) < 2.7) arresting = true;
        }
        if (p.state === 'foot') {
          for (const v of cruisers) {
            if (!v.wrecked && v.crew > 0 && Math.abs(v.speed) < 2 && Math.hypot(v.x - p.x, v.z - p.z) < 4) arresting = true;
          }
        }
      }
    }
    arrestTimer = arresting ? arrestTimer + dt : Math.max(0, arrestTimer - dt * 2);
    if (arrestTimer >= WANTED.arrestSeconds && !p.dead) {
      arrestTimer = 0;
      G.events.emit('arrested');
    }
    // Roadblocks ahead of a fast car at three stars; cleared once far behind or the stars are gone.
    roadblockTimer -= dt;
    if (stars >= POLICE.roadblockStars && p.state === 'car' && p.vehicle && Math.abs(p.vehicle.speed) > POLICE.roadblockSpeed && roadblockTimer <= 0 && roadblocks.length < POLICE.maxRoadblocks) {
      roadblockTimer = POLICE.roadblockInterval;
      placeRoadblock();
    }
    for (let i = roadblocks.length - 1; i >= 0; i -= 1) {
      const b = roadblocks[i];
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (stars === 0 || d > POLICE.roadblockLeaveDistance) {
        for (const cr of b.cruisers) removeCruiser(cr);
        for (const o of b.officers) removeOfficer(o);
        roadblocks.splice(i, 1);
      }
    }
    updateHeli(dt, stars);
  }

  /** Every unit gone at once: a new game, an arrest, a hospital trip, a respray. */
  function clearAll() {
    for (const v of [...cruisers]) removeCruiser(v);
    for (const o of [...officers]) removeOfficer(o);
    roadblocks.length = 0;
    removeHeli();
    arrestTimer = 0;
  }

  G.combat.registerGroup(officers);
  return {
    cruisers, officers, roadblocks, update, respond, canSeePlayer, spawnCruiser, spawnOfficer, clearAll, placeRoadblock,
    get heli() { return heli; },
    /** 0..1 toward the arrest, for the HUD. */
    arrestProgress: () => arrestTimer / WANTED.arrestSeconds,
    /** Force a helicopter now at (x, z) (screenshot scenes). */
    summonHeli(x, z) {
      if (!heli) heli = buildHeli();
      heli.x = x;
      heli.z = z;
      heli.y = POLICE.heliHeight;
    },
  };
}
