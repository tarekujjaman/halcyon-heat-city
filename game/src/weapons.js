// The arsenal: fists, pistol, SMG and shotgun with ammo and clips, weapon switching by number
// keys and mouse wheel, reputation unlocks, firing with spread and pellets, muzzle flash, tracers
// and the crime each shot is. Hits are resolved by combat.js.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { KEYS } from './input.js';
import { createGunMesh } from './characters.js';
import { frand } from './rng.js';

const ORDER = ['fists', 'pistol', 'smg', 'shotgun'];
const origin = new THREE.Vector3();
const dir = new THREE.Vector3();

export function createWeapons(G) {
  const inv = {
    fists: { owned: true, ammo: Infinity, clip: Infinity },
    pistol: { owned: false, ammo: 0, clip: 0 },
    smg: { owned: false, ammo: 0, clip: 0 },
    shotgun: { owned: false, ammo: 0, clip: 0 },
  };
  const w = {
    inv, current: 'fists', cooldown: 0, reloading: 0, shotHeat: 0, shotsFired: 0,
    spec: () => WEAPONS[w.current],
  };

  function equipModel() {
    G.player.model.setWeapon(w.current === 'fists' ? null : createGunMesh(w.current));
  }

  w.give = (id, ammo = 0) => {
    const slot = inv[id];
    if (!slot) return;
    const was = slot.owned;
    slot.owned = true;
    slot.ammo = Math.min(WEAPONS[id].ammo * 3, slot.ammo + ammo);
    if (slot.clip === 0 && slot.ammo > 0) {
      const take = Math.min(WEAPONS[id].clip, slot.ammo);
      slot.clip = take;
      slot.ammo -= take;
    }
    if (!was) {
      G.notify(`${WEAPONS[id].name} acquired`);
      w.select(id);
    }
  };

  w.select = (id) => {
    if (!inv[id] || !inv[id].owned || w.current === id) return;
    w.current = id;
    w.reloading = 0;
    equipModel();
    G.audio.play('switch');
    G.hud.flashWeapon();
  };

  w.cycle = (step) => {
    const owned = ORDER.filter((id) => inv[id].owned);
    const i = owned.indexOf(w.current);
    w.select(owned[(i + step + owned.length) % owned.length]);
  };

  w.canUnlock = (id) => G.economy.repLevel() >= WEAPONS[id].unlockRep;

  w.reload = () => {
    const slot = inv[w.current];
    const spec = WEAPONS[w.current];
    if (w.current === 'fists' || slot.clip >= spec.clip || slot.ammo <= 0 || w.reloading > 0) return;
    w.reloading = 1.1;
    G.audio.play('reload');
  };

  function finishReload() {
    const slot = inv[w.current];
    const spec = WEAPONS[w.current];
    const need = spec.clip - slot.clip;
    const take = Math.min(need, slot.ammo);
    slot.clip += take;
    slot.ammo -= take;
  }

  /** One shot (or punch) from the player, aimed where the camera looks. */
  w.fire = () => {
    const spec = WEAPONS[w.current];
    const p = G.player;
    if (w.current === 'fists') {
      p.punchTimer = 0.4;
      p.aimTimer = 1.2;
      G.audio.play('punch');
      G.combat.meleeAttack(p, spec.damage, spec.range);
      w.cooldown = spec.rate;
      return;
    }
    const slot = inv[w.current];
    if (slot.clip <= 0) {
      if (slot.ammo > 0) w.reload();
      else {
        G.audio.play('empty');
        w.cooldown = 0.3;
      }
      return;
    }
    slot.clip -= 1;
    w.shotsFired += 1;
    w.cooldown = spec.rate;
    p.aimTimer = 2.5;
    G.camera.aimRay(dir);
    // Fire from the chest toward where the crosshair points.
    origin.set(p.x, p.y + 1.4, p.z).addScaledVector(dir, 0.5);
    const mx = origin.x + dir.x * 0.3;
    const my = origin.y;
    const mz = origin.z + dir.z * 0.3;
    G.effects.muzzleFlash(mx, my, mz, dir.x, dir.y, dir.z);
    G.audio.play(w.current === 'shotgun' ? 'shotgun' : w.current === 'smg' ? 'smg' : 'pistol');
    G.camera.kick(w.current === 'shotgun' ? 0.35 : 0.12);
    for (let i = 0; i < spec.pellets; i += 1) {
      const d = dir.clone();
      d.x += (frand() - 0.5) * spec.spread * 2;
      d.y += (frand() - 0.5) * spec.spread * 2;
      d.z += (frand() - 0.5) * spec.spread * 2;
      d.normalize();
      const hit = G.combat.shoot(origin, d, spec.range, spec.damage, p);
      const end = hit ? hit.point : origin.clone().addScaledVector(d, spec.range);
      G.effects.tracer(mx, my, mz, end.x, end.y, end.z);
    }
    if (w.shotHeat <= 0) {
      G.wanted.crime('shoot', p.x, p.z);
      w.shotHeat = 1.5;
    }
    G.pedestrians.alarm(p.x, p.z, 40);
    G.gangs.alert(p.x, p.z, 45);
    G.economy.stat('shotsFired', 1);
    if (slot.clip === 0 && slot.ammo > 0) w.reload();
  };

  w.update = (dt, input) => {
    const p = G.player;
    w.cooldown = Math.max(0, w.cooldown - dt);
    w.shotHeat = Math.max(0, w.shotHeat - dt);
    if (w.reloading > 0) {
      w.reloading -= dt;
      if (w.reloading <= 0) {
        w.reloading = 0;
        finishReload();
      }
    }
    if (p.dead || p.surrender) return;
    if (input.wasPressed(KEYS.weapon1)) w.select('fists');
    if (input.wasPressed(KEYS.weapon2)) w.select('pistol');
    if (input.wasPressed(KEYS.weapon3)) w.select('smg');
    if (input.wasPressed(KEYS.weapon4)) w.select('shotgun');
    const wheel = input.takeWheel();
    if (wheel !== 0) w.cycle(wheel > 0 ? 1 : -1);
    const canShoot = p.state === 'foot' || (p.state === 'car' && p.vehicle && p.vehicle.spec.open);
    if (!canShoot) return;
    const spec = WEAPONS[w.current];
    let wantFire = spec.auto ? input.fireHeld() : input.clicked();
    // A click that captures the pointer is not a shot.
    if (wantFire && !input.locked && !input.lockRefused) wantFire = false;
    const punchKey = w.current === 'fists' && input.wasPressed(KEYS.punch);
    if ((wantFire || punchKey) && w.cooldown <= 0 && w.reloading <= 0) w.fire();
  };

  w.serialize = () => ({ current: w.current, inv: Object.fromEntries(ORDER.map((id) => [id, { owned: inv[id].owned, ammo: inv[id].ammo === Infinity ? -1 : inv[id].ammo, clip: inv[id].clip === Infinity ? -1 : inv[id].clip }])) });
  w.restore = (data) => {
    if (!data) return;
    for (const id of ORDER) {
      const s = data.inv && data.inv[id];
      if (!s) continue;
      inv[id].owned = !!s.owned;
      inv[id].ammo = s.ammo < 0 ? Infinity : s.ammo;
      inv[id].clip = s.clip < 0 ? Infinity : s.clip;
    }
    w.current = inv[data.current] && inv[data.current].owned ? data.current : 'fists';
    equipModel();
  };
  w.ammoText = () => {
    if (w.current === 'fists') return '';
    const slot = inv[w.current];
    return `${slot.clip} / ${slot.ammo}`;
  };
  w.ORDER = ORDER;
  return w;
}
