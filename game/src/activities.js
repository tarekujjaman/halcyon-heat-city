// Side activities: three street races against AI drivers through checkpoints, taxi fares picked
// up in a stolen cab and paid by distance, twenty sea-glass shards hidden across the districts,
// the paint shops that repaint, repair and shake the cops, and the safehouses that save and heal.
import * as THREE from 'three';
import { ECONOMY } from './config.js';
import { createDriver } from './vehicles/driver.js';
import { createRng, frand } from './rng.js';

const shardGeo = new THREE.OctahedronGeometry(0.45, 0);
const shardMat = new THREE.MeshStandardMaterial({ color: '#5de0d6', emissive: new THREE.Color('#2ab8ad'), emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.9 });

export function createActivities(G) {
  const rng = createRng(G.seed + 606);
  const L = G.world.layout.landmarks;
  const a = {
    shardsFound: new Set(),
    shardMeshes: [],
    race: null,
    racesWon: {},
    taxi: null,
    taxiTimer: 8,
    shopMarkers: [],
    safehouseMarkers: [],
    raceMarkers: [],
    busy: false,
  };

  // Shards: one small crystal per spot.
  function placeShards() {
    for (const m of a.shardMeshes) G.world.scene.remove(m);
    a.shardMeshes = [];
    L.shards.forEach((s, i) => {
      if (a.shardsFound.has(i)) return;
      // Nudge a shard off any post or wall it landed against.
      if (G.world.colliders.overlaps(s.x, s.z, 0.5)) {
        for (const [ox, oz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [2.5, 2.5], [-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5]]) {
          if (!G.world.colliders.overlaps(s.x + ox, s.z + oz, 0.5)) { s.x += ox; s.z += oz; break; }
        }
      }
      const mesh = new THREE.Mesh(shardGeo, shardMat);
      mesh.position.set(s.x, G.world.layout.groundHeight(s.x, s.z) + 0.9, s.z);
      mesh.userData.index = i;
      G.world.scene.add(mesh);
      a.shardMeshes.push(mesh);
    });
  }

  function updateShards(dt) {
    const p = G.player;
    for (let i = a.shardMeshes.length - 1; i >= 0; i -= 1) {
      const m = a.shardMeshes[i];
      m.rotation.y += dt * 1.6;
      m.position.y = G.world.layout.groundHeight(m.position.x, m.position.z) + 0.9 + Math.sin(G.world.time * 2 + i) * 0.15;
      if (Math.hypot(p.x - m.position.x, p.z - m.position.z) < 2.2) {
        a.shardsFound.add(m.userData.index);
        G.world.scene.remove(m);
        a.shardMeshes.splice(i, 1);
        G.economy.addMoney(ECONOMY.shardPrize, 'sea-glass shard');
        G.economy.stat('shards', 1);
        G.economy.addRep(4);
        G.audio.play('pickup');
        G.effects.sparks(m.position.x, m.position.y, m.position.z, 14, '#8ff7ee');
        const n = a.shardsFound.size;
        G.notify(`Sea-glass shard ${n} / ${ECONOMY.shardCount}`);
        if (n === ECONOMY.shardCount) {
          G.economy.addMoney(ECONOMY.shardsBonus, 'all shards found!');
          G.economy.addRep(60);
        }
      }
    }
  }

  // Paint shops.
  function placeShops() {
    for (const shop of L.carShops) {
      const m = G.markers.add(shop.x, shop.z, {
        radius: 3.5, color: '#37f3ff', kind: 'shop', label: shop.name, needVehicle: true, once: false,
        onEnter() {
          const v = G.player.vehicle;
          if (!v) return;
          if (!G.economy.spend(ECONOMY.repaintPrice, `${shop.name} respray`)) return;
          const colors = v.spec.colors.filter((c) => c !== v.color);
          G.fleet.repaint(v, colors.length ? colors[Math.floor(frand() * colors.length)] : v.color);
          G.fleet.repair(v);
          if (G.wanted.stars > 0 && G.wanted.stars <= 3) {
            G.wanted.clear();
            G.notify('New paint, new car: the cops lost you');
          } else if (G.wanted.stars > 3) G.notify('Too hot for a respray to help');
          G.audio.play('spray');
          G.effects.smoke(v.x, v.y + 1, v.z, { size: 3, color: v.color, life: 1.2 });
        },
      });
      a.shopMarkers.push(m);
    }
  }

  // Safehouses: save, heal, buy.
  function placeSafehouses() {
    for (const def of ECONOMY.safehouses) {
      const spot = L.safehouses[def.id];
      const m = G.markers.add(spot.x, spot.z, {
        radius: 2.6, color: '#8bff6b', kind: 'safehouse', label: def.name, needFoot: true, once: false, beam: true,
        onEnter() {
          if (G.economy.ownsSafehouse(def.id)) G.menus.openSafehouse(def);
          else G.menus.openPurchase(def);
        },
      });
      a.safehouseMarkers.push(m);
    }
  }

  // Races.
  function placeRaces() {
    for (const race of L.races) {
      const n = G.world.layout.intersectionAt(race.start.i, race.start.j);
      const x = n.x + 1.75;
      const z = n.z - 18;
      const m = G.markers.add(x, z, {
        radius: 4, color: '#ff6ad5', kind: 'race', label: race.name, needVehicle: true, once: false,
        onEnter() {
          if (a.race || G.missions.current) return;
          startRace(race);
        },
      });
      a.raceMarkers.push(m);
    }
  }

  function checkpointPos(race, k) {
    const [i, j] = race.checkpoints[k];
    const n = G.world.layout.intersectionAt(i, j);
    return { x: n.x, z: n.z };
  }

  function startRace(race) {
    const v = G.player.vehicle;
    if (!v) return;
    a.busy = true;
    const rivals = [];
    const start = checkpointPos(race, race.checkpoints.length - 1);
    for (let k = 0; k < 2; k += 1) {
      const type = k === 0 ? 'coupe' : 'sedan';
      const rx = v.x + (k + 1) * 4.2 * -Math.cos(v.yaw) * (k === 0 ? 1 : -1);
      const rz = v.z + (k + 1) * 4.2 * Math.sin(v.yaw) * (k === 0 ? 1 : -1);
      const rv = G.fleet.spawn(type, rx, rz, v.yaw, { role: 'racer', mission: true, color: k === 0 ? '#ffd166' : '#7b2cbf' });
      const ai = createDriver(rv, G.nav, { limit: 19 + k * 2, ignoreLights: true });
      ai.setRoad();
      rv.ai = ai;
      rv.driver = { kind: 'ped', look: null };
      rivals.push({ v: rv, next: 0, laps: 0 });
    }
    a.race = { def: race, next: 0, time: 0, countdown: 3.5, rivals, marker: null, started: false, finished: false, start };
    G.hud.setObjective(`${race.name}: get ready`);
    G.notify(`${race.name} — ${race.checkpoints.length} checkpoints, $${ECONOMY.racePrize[0]} to win`);
    G.audio.play('countdown');
    setCheckpoint();
  }

  function setCheckpoint() {
    const r = a.race;
    if (r.marker) G.markers.remove(r.marker);
    const pos = checkpointPos(r.def, r.next);
    r.marker = G.markers.add(pos.x, pos.z, { radius: 7, color: '#ffd166', kind: 'checkpoint', label: `Checkpoint ${r.next + 1}`, once: false, needVehicle: true, onEnter: passCheckpoint });
    G.hud.setWaypoint(pos.x, pos.z, 'checkpoint');
  }

  function passCheckpoint() {
    const r = a.race;
    if (!r || !r.started) return;
    r.next += 1;
    G.audio.play('checkpoint');
    if (r.next >= r.def.checkpoints.length) finishRace();
    else {
      setCheckpoint();
      G.hud.setObjective(`${r.def.name}: checkpoint ${r.next + 1} / ${r.def.checkpoints.length}`);
    }
  }

  function endRace() {
    const r = a.race;
    if (!r) return;
    if (r.marker) G.markers.remove(r.marker);
    for (const rv of r.rivals) G.fleet.remove(rv.v);
    a.race = null;
    a.busy = false;
    G.hud.setObjective('');
    G.hud.setWaypoint(null);
  }

  function finishRace() {
    const r = a.race;
    const ahead = r.rivals.filter((rv) => rv.next >= r.def.checkpoints.length).length;
    const place = ahead + 1;
    const prize = place === 1 ? ECONOMY.racePrize[0] : place === 2 ? Math.floor(ECONOMY.racePrize[0] * 0.4) : 0;
    const t = r.time;
    G.economy.stat('races', 1);
    if (place === 1) {
      a.racesWon[r.def.id] = (a.racesWon[r.def.id] || 0) + 1;
      G.economy.addRep(25);
    }
    G.menus.showResult({
      title: place === 1 ? 'RACE WON' : `FINISHED ${place}${place === 2 ? 'ND' : 'RD'}`,
      lines: [`${r.def.name}`, `Time ${t.toFixed(1)} s`, prize ? `Prize $${prize.toLocaleString()}` : 'No prize'],
      money: prize, rep: place === 1 ? 25 : 0,
    });
    if (prize) G.economy.addMoney(prize);
    endRace();
  }

  function updateRace(dt) {
    const r = a.race;
    if (!r) return;
    const p = G.player;
    if (!r.started) {
      r.countdown -= dt;
      const n = Math.ceil(r.countdown);
      G.hud.setObjective(n > 0 ? `${r.def.name}: ${n}` : `${r.def.name}: GO!`);
      if (r.countdown <= 0) {
        r.started = true;
        G.audio.play('go');
        for (const rv of r.rivals) {
          const pos = checkpointPos(r.def, 0);
          rv.v.ai.routeTo(pos.x, pos.z);
        }
      }
      if (p.vehicle) {
        p.vehicle.ctrl.throttle = 0;
        p.vehicle.ctrl.brake = 1;
      }
      return;
    }
    r.time += dt;
    for (const rv of r.rivals) {
      if (rv.next >= r.def.checkpoints.length) continue;
      const pos = checkpointPos(r.def, rv.next);
      const d = Math.hypot(rv.v.x - pos.x, rv.v.z - pos.z);
      if (d < 9) {
        rv.next += 1;
        if (rv.next < r.def.checkpoints.length) {
          const np = checkpointPos(r.def, rv.next);
          rv.v.ai.routeTo(np.x, np.z);
        } else {
          rv.v.ai.limit = 10;
        }
      } else if (!rv.v.ai.routeDirs || rv.v.ai.routeDirs.length === 0) {
        rv.v.ai.routeTo(pos.x, pos.z);
      }
      rv.v.ai.step(dt, G.traffic.ctx);
    }
    if (p.state !== 'car') {
      r.outOfCar = (r.outOfCar || 0) + dt;
      if (r.outOfCar > 8) {
        G.notify('Race abandoned');
        endRace();
      }
    } else r.outOfCar = 0;
    const finished = r.rivals.filter((rv) => rv.next >= r.def.checkpoints.length).length;
    if (finished >= 2 && !r.finished) {
      G.notify('Both rivals finished. Race lost.');
      endRace();
    }
  }

  // Taxi fares.
  function updateTaxi(dt) {
    const p = G.player;
    const inTaxi = p.state === 'car' && p.vehicle && p.vehicle.type === 'taxi';
    const t = a.taxi;
    if (!inTaxi) {
      if (t && t.phase === 'ride') {
        t.outTimer = (t.outTimer || 0) + dt;
        if (t.outTimer > 12) {
          G.notify('The fare walked off');
          cancelTaxi();
        }
      } else if (t) cancelTaxi();
      return;
    }
    if (!t) {
      a.taxiTimer -= dt;
      if (a.taxiTimer <= 0 && !G.missions.current && !a.race) {
        const spot = pickSidewalkSpot(p.x, p.z, 40, 110);
        if (spot) {
          const ped = G.pedestrians.spawnFare(spot.x, spot.z);
          const m = G.markers.add(spot.x, spot.z, { radius: 5, color: '#ffd43b', kind: 'taxi', label: 'Fare', needVehicle: true, once: true, onEnter: () => pickUpFare() });
          a.taxi = { phase: 'pickup', ped, marker: m, spot };
          G.hud.setObjective('Taxi: pick up the fare');
          G.hud.setWaypoint(spot.x, spot.z, 'taxi');
          G.notify('A fare is waving you down');
        }
        a.taxiTimer = 14;
      }
      return;
    }
    if (t.phase === 'ride') {
      t.time += dt;
      G.hud.setObjective(`Taxi: drop the fare at ${t.destName}  (${Math.round(Math.hypot(p.x - t.dest.x, p.z - t.dest.z))} m)`);
    }
  }

  function pickSidewalkSpot(x, z, minD, maxD) {
    const nodes = G.world.layout.walk.nodes;
    const candidates = [];
    for (const n of nodes) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d >= minD && d <= maxD) candidates.push(n);
    }
    if (!candidates.length) return null;
    const n = candidates[Math.floor(frand() * candidates.length)];
    return { x: n.x, z: n.z };
  }

  function pickUpFare() {
    const t = a.taxi;
    if (!t || t.phase !== 'pickup') return;
    const p = G.player;
    if (!p.vehicle || Math.abs(p.vehicle.speed) > 3) {
      G.notify('Stop next to the fare');
      t.marker = G.markers.add(t.spot.x, t.spot.z, { radius: 5, color: '#ffd43b', kind: 'taxi', needVehicle: true, once: true, onEnter: () => pickUpFare() });
      return;
    }
    G.pedestrians.removePed(t.ped);
    const names = ['the Pier', 'Glasswater Plaza', 'The Riptide', 'the Docks', 'Palmetto Heights', 'the Strand'];
    const spots = [L.pierStart, L.plaza, L.gangBar, L.docksYardRoad, L.palmettoDrive, L.safehouses.strand];
    const k = Math.floor(frand() * spots.length);
    t.phase = 'ride';
    t.dest = { x: spots[k].x, z: spots[k].z };
    t.destName = names[k];
    t.time = 0;
    t.startDist = Math.hypot(p.x - t.dest.x, p.z - t.dest.z);
    t.marker = G.markers.add(t.dest.x, t.dest.z, { radius: 5, color: '#ffd43b', kind: 'taxi', needVehicle: true, once: true, onEnter: () => dropFare() });
    G.hud.setWaypoint(t.dest.x, t.dest.z, 'taxi');
    G.audio.play('door');
    G.say('Fare', `Take me to ${t.destName}, and step on it.`, 3);
  }

  function dropFare() {
    const t = a.taxi;
    if (!t || t.phase !== 'ride') return;
    const p = G.player;
    if (!p.vehicle || Math.abs(p.vehicle.speed) > 3) {
      G.notify('Stop to let the fare out');
      t.marker = G.markers.add(t.dest.x, t.dest.z, { radius: 5, color: '#ffd43b', kind: 'taxi', needVehicle: true, once: true, onEnter: () => dropFare() });
      return;
    }
    const pay = Math.round(ECONOMY.taxiBase + t.startDist * ECONOMY.taxiPerMetre * (t.time < t.startDist / 12 ? 1.5 : 1));
    G.economy.addMoney(pay, 'taxi fare');
    G.economy.stat('fares', 1);
    G.economy.addRep(6);
    G.say('Fare', t.time < t.startDist / 12 ? 'Fast! Keep the change.' : 'Thanks for the ride.', 2.5);
    a.taxi = null;
    a.taxiTimer = 10;
    G.hud.setObjective('');
    G.hud.setWaypoint(null);
  }

  function cancelTaxi() {
    const t = a.taxi;
    if (!t) return;
    if (t.marker && !t.marker.removed) G.markers.remove(t.marker);
    if (t.ped && !t.ped.removed) G.pedestrians.removePed(t.ped);
    a.taxi = null;
    G.hud.setObjective('');
    G.hud.setWaypoint(null);
  }

  a.update = (dt) => {
    updateShards(dt);
    updateRace(dt);
    updateTaxi(dt);
  };
  a.init = () => {
    for (const m of [...a.shopMarkers, ...a.safehouseMarkers, ...a.raceMarkers]) G.markers.remove(m);
    a.shopMarkers = [];
    a.safehouseMarkers = [];
    a.raceMarkers = [];
    placeShards();
    placeShops();
    placeSafehouses();
    placeRaces();
  };
  a.abortAll = () => {
    if (a.race) endRace();
    cancelTaxi();
  };
  a.serialize = () => ({ shards: [...a.shardsFound], racesWon: { ...a.racesWon } });
  a.restore = (data) => {
    a.shardsFound = new Set((data && data.shards) || []);
    a.racesWon = (data && data.racesWon) || {};
    placeShards();
  };
  a.reset = () => {
    a.shardsFound = new Set();
    a.racesWon = {};
    a.abortAll();
    placeShards();
  };
  a.raceActive = () => !!a.race;
  a.rng = rng;
  return a;
}
