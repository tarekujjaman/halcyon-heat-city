// The side activities of Halcyon Bay: three street races against AI drivers through checkpoints,
// taxi fares picked up in a stolen cab and paid by distance, twenty sea-glass shards hidden across
// the districts, the paint shops that respray, repair and shake the cops, and the safehouses
// that save and heal. Exports createActivities(G): init, update, abortAll, serialize, restore, reset.
import * as THREE from 'three';
import { ECONOMY } from './config.js';
import { createDriver } from './vehicles/driver.js';
import { frand } from './rng.js';

const shardGeo = new THREE.OctahedronGeometry(0.45, 0);
const shardMat = new THREE.MeshStandardMaterial({ color: '#5de0d6', emissive: new THREE.Color('#2ab8ad'), emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.9 });
const SHARD_HOVER = 0.9;
const SHARD_PICKUP_RADIUS = 2.2;
/** Where a shard is nudged to if its spot landed against a post or wall. */
const SHARD_NUDGES = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [2.5, 2.5], [-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5]];
const RACE = { countdown: 3.5, rivalLimit: 19, rivalLimitStep: 2, checkpointRadius: 7, rivalReach: 9, abandonAfter: 8 };
const TAXI = { firstFareAfter: 8, nextFareAfter: 14, afterDropAfter: 10, fareWalksAfter: 12, maxStopSpeed: 3, minFareDistance: 40, maxFareDistance: 110 };

/**
 * The activities: {shardsFound, shardMeshes, race, racesWon, taxi, taxiTimer, busy, update(dt),
 * init(), abortAll(), serialize(), restore(data), reset(), raceActive()}. init() places the
 * markers and shards for a run; abortAll() ends a race or fare when a mission or death cuts in.
 */
export function createActivities(G) {
  const L = G.world.layout.landmarks;
  /** Taxi destinations, named for the fare's line. */
  const TAXI_STOPS = [
    { name: 'the Pier', spot: L.pierStart }, { name: 'Glasswater Plaza', spot: L.plaza }, { name: 'The Riptide', spot: L.gangBar },
    { name: 'the Docks', spot: L.docksYardRoad }, { name: 'Palmetto Heights', spot: L.palmettoDrive }, { name: 'the Strand', spot: L.safehouses.strand },
  ];
  const a = {
    shardsFound: new Set(),
    shardMeshes: [],
    race: null,
    racesWon: {},
    taxi: null,
    taxiTimer: TAXI.firstFareAfter,
    shopMarkers: [],
    safehouseMarkers: [],
    raceMarkers: [],
    busy: false,
  };

  /**
   * One small crystal per shard spot not yet found. A spot that landed against a post or wall is
   * nudged clear, in the layout's own list, so the maps and the playtest see where it really is.
   */
  function placeShards() {
    for (const m of a.shardMeshes) G.world.scene.remove(m);
    a.shardMeshes = [];
    L.shards.forEach((s, i) => {
      if (a.shardsFound.has(i)) return;
      if (G.world.colliders.overlaps(s.x, s.z, 0.5)) {
        for (const [ox, oz] of SHARD_NUDGES) {
          if (!G.world.colliders.overlaps(s.x + ox, s.z + oz, 0.5)) { s.x += ox; s.z += oz; break; }
        }
      }
      const mesh = new THREE.Mesh(shardGeo, shardMat);
      mesh.position.set(s.x, G.world.layout.groundHeight(s.x, s.z) + SHARD_HOVER, s.z);
      mesh.userData.index = i;
      G.world.scene.add(mesh);
      a.shardMeshes.push(mesh);
    });
  }

  /** Spin and bob the shards; walking into one collects it, with a bonus for the full set. */
  function updateShards(dt) {
    const p = G.player;
    for (let i = a.shardMeshes.length - 1; i >= 0; i -= 1) {
      const m = a.shardMeshes[i];
      m.rotation.y += dt * 1.6;
      m.position.y = G.world.layout.groundHeight(m.position.x, m.position.z) + SHARD_HOVER + Math.sin(G.world.time * 2 + i) * 0.15;
      if (Math.hypot(p.x - m.position.x, p.z - m.position.z) < SHARD_PICKUP_RADIUS) {
        a.shardsFound.add(m.userData.index);
        G.world.scene.remove(m);
        a.shardMeshes.splice(i, 1);
        G.economy.addMoney(ECONOMY.shardPrize, 'sea-glass shard');
        G.economy.stat('shards', 1);
        G.economy.addRep(ECONOMY.shardRep);
        G.audio.play('pickup');
        G.effects.sparks(m.position.x, m.position.y, m.position.z, 14, '#8ff7ee');
        const n = a.shardsFound.size;
        G.notify(`Sea-glass shard ${n} / ${ECONOMY.shardCount}`);
        if (n === ECONOMY.shardCount) {
          G.economy.addMoney(ECONOMY.shardsBonus, 'all shards found!');
          G.economy.addRep(ECONOMY.shardsBonusRep);
        }
      }
    }
  }

  /** Paint shop markers: drive in to respray and repair, and lose a low wanted level. */
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

  /** Safehouse markers: walk in to save, heal and rest, or to buy the place. */
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

  /** Race start markers on the kerb lane just before each race's starting intersection. */
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

  /** The world position of checkpoint k of a race (an intersection centre). */
  function checkpointPos(race, k) {
    const [i, j] = race.checkpoints[k];
    const n = G.world.layout.intersectionAt(i, j);
    return { x: n.x, z: n.z };
  }

  /** Line up two AI rivals beside Sol's car and start the countdown. */
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
      const ai = createDriver(rv, G.nav, { limit: RACE.rivalLimit + k * RACE.rivalLimitStep, ignoreLights: true });
      ai.setRoad();
      rv.ai = ai;
      rv.driver = { kind: 'ped', look: null };
      rivals.push({ v: rv, next: 0, laps: 0 });
    }
    a.race = { def: race, next: 0, time: 0, countdown: RACE.countdown, rivals, marker: null, started: false, finished: false, start };
    G.hud.setObjective(`${race.name}: get ready`);
    G.notify(`${race.name} — ${race.checkpoints.length} checkpoints, $${ECONOMY.racePrize[0]} to win`);
    G.audio.play('countdown');
    setCheckpoint();
  }

  /** Move the checkpoint marker and waypoint to the race's next checkpoint. */
  function setCheckpoint() {
    const r = a.race;
    if (r.marker) G.markers.remove(r.marker);
    const pos = checkpointPos(r.def, r.next);
    r.marker = G.markers.add(pos.x, pos.z, { radius: RACE.checkpointRadius, color: '#ffd166', kind: 'checkpoint', label: `Checkpoint ${r.next + 1}`, once: false, needVehicle: true, onEnter: passCheckpoint });
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

  /** Take the race down: its marker, its rivals (unless Sol is driving one), the objective and the waypoint. */
  function endRace() {
    const r = a.race;
    if (!r) return;
    if (r.marker) G.markers.remove(r.marker);
    for (const rv of r.rivals) if (rv.v.driver !== G.player) G.fleet.remove(rv.v);
    a.race = null;
    a.busy = false;
    G.hud.setObjective('');
    G.hud.setWaypoint(null);
  }

  /** Sol crossed the last checkpoint: place by rivals already home, prize, reputation, result screen. */
  function finishRace() {
    const r = a.race;
    const ahead = countFinished(r);
    const place = ahead + 1;
    const prize = place === 1 ? ECONOMY.racePrize[0] : place === 2 ? Math.floor(ECONOMY.racePrize[0] * ECONOMY.raceSecondShare) : 0;
    const rep = place === 1 ? ECONOMY.raceRep : 0;
    const t = r.time;
    G.economy.stat('races', 1);
    if (place === 1) {
      a.racesWon[r.def.id] = (a.racesWon[r.def.id] || 0) + 1;
      G.economy.addRep(rep);
    }
    G.menus.showResult({
      title: place === 1 ? 'RACE WON' : `FINISHED ${place}${place === 2 ? 'ND' : 'RD'}`,
      lines: [`${r.def.name}`, `Time ${t.toFixed(1)} s`, prize ? `Prize $${prize.toLocaleString()}` : 'No prize'],
      money: prize, rep,
    });
    if (prize) G.economy.addMoney(prize);
    endRace();
  }

  function countFinished(r) {
    let n = 0;
    for (const rv of r.rivals) if (rv.next >= r.def.checkpoints.length) n += 1;
    return n;
  }

  /** The countdown, then the rivals routed checkpoint to checkpoint; abandoned out of the car, lost when both rivals finish. */
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
        const first = checkpointPos(r.def, 0);
        for (const rv of r.rivals) if (rv.v.ai) rv.v.ai.routeTo(first.x, first.z);
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
      // A rival Sol stole or that was wrecked no longer races.
      const ai = rv.v.ai;
      if (!ai || rv.v.wrecked) continue;
      const pos = checkpointPos(r.def, rv.next);
      const d = Math.hypot(rv.v.x - pos.x, rv.v.z - pos.z);
      if (d < RACE.rivalReach) {
        rv.next += 1;
        if (rv.next < r.def.checkpoints.length) {
          const np = checkpointPos(r.def, rv.next);
          ai.routeTo(np.x, np.z);
        } else {
          ai.limit = 10;
        }
      } else if (!ai.routeDirs || ai.routeDirs.length === 0) {
        ai.routeTo(pos.x, pos.z);
      }
      ai.step(dt, G.traffic.ctx);
    }
    if (p.state !== 'car') {
      r.outOfCar = (r.outOfCar || 0) + dt;
      if (r.outOfCar > RACE.abandonAfter) {
        G.notify('Race abandoned');
        endRace();
        return;
      }
    } else r.outOfCar = 0;
    if (countFinished(r) >= 2 && !r.finished) {
      G.notify('Both rivals finished. Race lost.');
      endRace();
    }
  }

  /** Fares appear while Sol drives a taxi with nothing else on; a fare left in the cab for too long walks off. */
  function updateTaxi(dt) {
    const p = G.player;
    const inTaxi = p.state === 'car' && p.vehicle && p.vehicle.type === 'taxi';
    const t = a.taxi;
    if (!inTaxi) {
      if (t && t.phase === 'ride') {
        t.outTimer = (t.outTimer || 0) + dt;
        if (t.outTimer > TAXI.fareWalksAfter) {
          G.notify('The fare walked off');
          cancelTaxi();
        }
      } else if (t) cancelTaxi();
      return;
    }
    if (!t) {
      a.taxiTimer -= dt;
      if (a.taxiTimer <= 0 && !G.missions.current && !a.race) {
        const spot = pickSidewalkSpot(p.x, p.z, TAXI.minFareDistance, TAXI.maxFareDistance);
        if (spot) {
          const ped = G.pedestrians.spawnFare(spot.x, spot.z);
          const m = G.markers.add(spot.x, spot.z, { radius: 5, color: '#ffd43b', kind: 'taxi', label: 'Fare', needVehicle: true, once: true, onEnter: () => pickUpFare() });
          a.taxi = { phase: 'pickup', ped, marker: m, spot };
          G.hud.setObjective('Taxi: pick up the fare');
          G.hud.setWaypoint(spot.x, spot.z, 'taxi');
          G.notify('A fare is waving you down');
        }
        a.taxiTimer = TAXI.nextFareAfter;
      }
      return;
    }
    if (t.phase === 'ride') {
      t.time += dt;
      G.hud.setObjective(`Taxi: drop the fare at ${t.destName}  (${Math.round(Math.hypot(p.x - t.dest.x, p.z - t.dest.z))} m)`);
    }
  }

  /** A random sidewalk node between minD and maxD metres of (x, z), or null. */
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

  /** The taxi stopped at the fare: they get in and name a destination (the marker is re-armed if the cab was still moving). */
  function pickUpFare() {
    const t = a.taxi;
    if (!t || t.phase !== 'pickup') return;
    const p = G.player;
    if (!p.vehicle || Math.abs(p.vehicle.speed) > TAXI.maxStopSpeed) {
      G.notify('Stop next to the fare');
      t.marker = G.markers.add(t.spot.x, t.spot.z, { radius: 5, color: '#ffd43b', kind: 'taxi', needVehicle: true, once: true, onEnter: () => pickUpFare() });
      return;
    }
    G.pedestrians.removePed(t.ped);
    const stop = TAXI_STOPS[Math.floor(frand() * TAXI_STOPS.length)];
    t.phase = 'ride';
    t.dest = { x: stop.spot.x, z: stop.spot.z };
    t.destName = stop.name;
    t.time = 0;
    t.startDist = Math.hypot(p.x - t.dest.x, p.z - t.dest.z);
    t.marker = G.markers.add(t.dest.x, t.dest.z, { radius: 5, color: '#ffd43b', kind: 'taxi', needVehicle: true, once: true, onEnter: () => dropFare() });
    G.hud.setWaypoint(t.dest.x, t.dest.z, 'taxi');
    G.audio.play('door');
    G.say('Fare', `Take me to ${t.destName}, and step on it.`, 3);
  }

  /** The taxi stopped at the destination: the fare pays by distance, with a tip for a fast ride. */
  function dropFare() {
    const t = a.taxi;
    if (!t || t.phase !== 'ride') return;
    const p = G.player;
    if (!p.vehicle || Math.abs(p.vehicle.speed) > TAXI.maxStopSpeed) {
      G.notify('Stop to let the fare out');
      t.marker = G.markers.add(t.dest.x, t.dest.z, { radius: 5, color: '#ffd43b', kind: 'taxi', needVehicle: true, once: true, onEnter: () => dropFare() });
      return;
    }
    const fast = t.time < t.startDist / ECONOMY.taxiFastSpeed;
    const pay = Math.round(ECONOMY.taxiBase + t.startDist * ECONOMY.taxiPerMetre * (fast ? ECONOMY.taxiFastBonus : 1));
    G.economy.addMoney(pay, 'taxi fare');
    G.economy.stat('fares', 1);
    G.economy.addRep(ECONOMY.taxiRep);
    G.say('Fare', fast ? 'Fast! Keep the change.' : 'Thanks for the ride.', 2.5);
    a.taxi = null;
    a.taxiTimer = TAXI.afterDropAfter;
    G.hud.setObjective('');
    G.hud.setWaypoint(null);
  }

  /** Drop the current fare job, its marker and its waiting pedestrian. */
  function cancelTaxi() {
    const t = a.taxi;
    if (!t) return;
    if (t.marker && !t.marker.removed) G.markers.remove(t.marker);
    if (t.ped && !t.ped.removed) G.pedestrians.removePed(t.ped);
    a.taxi = null;
    G.hud.setObjective('');
    G.hud.setWaypoint(null);
  }

  /** One step of dt seconds for the shards, the race and the taxi job. */
  a.update = (dt) => {
    updateShards(dt);
    updateRace(dt);
    updateTaxi(dt);
  };
  /** Place (or re-place) every standing marker and the shards for the current run. */
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
  /** End whatever is running (a mission started, Sol died or was arrested). */
  a.abortAll = () => {
    if (a.race) endRace();
    cancelTaxi();
  };
  /** The save form: the shard indices found and the races won by id. */
  a.serialize = () => ({ shards: [...a.shardsFound], racesWon: { ...a.racesWon } });
  /** Put serialized progress back and re-place the shards still to find. */
  a.restore = (data) => {
    a.shardsFound = new Set((data && Array.isArray(data.shards)) ? data.shards : []);
    a.racesWon = (data && data.racesWon) || {};
    placeShards();
  };
  /** A fresh run: nothing found, nothing won, nothing running. */
  a.reset = () => {
    a.shardsFound = new Set();
    a.racesWon = {};
    a.abortAll();
    placeShards();
  };
  a.raceActive = () => !!a.race;
  return a;
}
