// Sol's arsenal: fists, pistol, SMG and shotgun with ammo and clips, switching by number keys and
// mouse wheel, reputation unlocks, firing with spread and pellets, the muzzle flash and tracers,
// the crime each shot is and who hears it. Hits themselves are resolved by combat.js. Exports
// createWeapons(G); the HUD, the shop menu, the missions and the save file read its object.
import * as THREE from 'three';
import { GUNPLAY, WEAPONS } from './config.js';
import { KEYS } from './input.js';
import { createGunMesh } from './characters.js';
import { frand } from './rng.js';

/** Slot order for the number keys and the wheel. */
const ORDER = ['fists', 'pistol', 'smg', 'shotgun'];
/** Scratch for a shot: the muzzle, the aim, one pellet's direction and where it ends. */
const origin = new THREE.Vector3();
const dir = new THREE.Vector3();
const pellet = new THREE.Vector3();
const endPoint = new THREE.Vector3();

/** Weapon state: `inv[id] = {owned, ammo, clip}` (Infinity for fists), `current`, the timers, and give/select/cycle/reload/fire/update. */
export function createWeapons(G) {
  const inv = {
    fists: { owned: true, ammo: Infinity, clip: Infinity },
    pistol: { owned: false, ammo: 0, clip: 0 },
    smg: { owned: false, ammo: 0, clip: 0 },
    shotgun: { owned: false, ammo: 0, clip: 0 },
  };
  const w = {
    inv, current: 'fists', cooldown: 0, reloading: 0, shotHeat: 0, shotsFired: 0,
    /** The config entry of the current weapon. */
    spec: () => WEAPONS[w.current],
  };

  function equipModel() {
    G.player.model.setWeapon(w.current === 'fists' ? null : createGunMesh(w.current));
  }

  /** Hand Sol a weapon with `ammo` rounds (capped at a few times its full load); a new one is equipped at once. */
  w.give = (id, ammo = 0) => {
    const slot = inv[id];
    if (!slot) return;
    const was = slot.owned;
    slot.owned = true;
    slot.ammo = Math.min(WEAPONS[id].ammo * GUNPLAY.ammoCapMultiplier, slot.ammo + ammo);
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

  /** Switch to an owned weapon (no-op for an unknown, unowned or already current one). */
  w.select = (id) => {
    if (!inv[id] || !inv[id].owned || w.current === id) return;
    w.current = id;
    w.reloading = 0;
    equipModel();
    G.audio.play('switch');
    G.hud.flashWeapon();
  };

  /** Step through the owned weapons in slot order (+1 next, -1 previous). */
  w.cycle = (step) => {
    const owned = ORDER.filter((id) => inv[id].owned);
    if (owned.length === 0) return;
    const i = owned.indexOf(w.current);
    w.select(owned[(i + step + owned.length) % owned.length]);
  };

  /** Is Sol's reputation high enough for Teo to sell this weapon? */
  w.canUnlock = (id) => G.economy.repLevel() >= WEAPONS[id].unlockRep;

  /** Start a reload if the clip is not full and there is ammo to load. */
  w.reload = () => {
    const slot = inv[w.current];
    const spec = WEAPONS[w.current];
    if (w.current === 'fists' || slot.clip >= spec.clip || slot.ammo <= 0 || w.reloading > 0) return;
    w.reloading = GUNPLAY.reloadSeconds;
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

  /** One shot (or punch) aimed where the camera looks; an empty clip reloads or clicks, a shot is a crime once per GUNPLAY.shotCrimeInterval. */
  w.fire = () => {
    const spec = WEAPONS[w.current];
    const p = G.player;
    if (w.current === 'fists') {
      p.punchTimer = GUNPLAY.punchSeconds;
      p.aimTimer = GUNPLAY.aimAfterPunch;
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
        w.cooldown = GUNPLAY.emptyClickCooldown;
      }
      return;
    }
    slot.clip -= 1;
    w.shotsFired += 1;
    w.cooldown = spec.rate;
    p.aimTimer = GUNPLAY.aimAfterShot;
    G.camera.aimRay(dir);
    // Fire from the chest toward where the crosshair points.
    origin.set(p.x, p.y + 1.4, p.z).addScaledVector(dir, 0.5);
    const mx = origin.x + dir.x * 0.3;
    const my = origin.y;
    const mz = origin.z + dir.z * 0.3;
    G.effects.muzzleFlash(mx, my, mz, dir.x, dir.y, dir.z);
    G.audio.play(w.current === 'shotgun' ? 'shotgun' : w.current === 'smg' ? 'smg' : 'pistol');
    G.camera.kick(w.current === 'shotgun' ? GUNPLAY.kickShotgun : GUNPLAY.kickGun);
    for (let i = 0; i < spec.pellets; i += 1) {
      pellet.copy(dir);
      pellet.x += (frand() - 0.5) * spec.spread * 2;
      pellet.y += (frand() - 0.5) * spec.spread * 2;
      pellet.z += (frand() - 0.5) * spec.spread * 2;
      pellet.normalize();
      const hit = G.combat.shoot(origin, pellet, spec.range, spec.damage, p);
      const end = hit ? hit.point : endPoint.copy(origin).addScaledVector(pellet, spec.range);
      G.effects.tracer(mx, my, mz, end.x, end.y, end.z);
    }
    if (w.shotHeat <= 0) {
      G.wanted.crime('shoot', p.x, p.z);
      w.shotHeat = GUNPLAY.shotCrimeInterval;
    }
    G.pedestrians.alarm(p.x, p.z, GUNPLAY.pedAlarmRadius);
    G.gangs.alert(p.x, p.z, GUNPLAY.gangAlertRadius);
    G.economy.stat('shotsFired', 1);
    if (slot.clip === 0 && slot.ammo > 0) w.reload();
  };

  /** Per step: run the timers, then read the switch keys, the wheel and the trigger (not while dead or surrendering). */
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

  /** The inventory for the save file: Infinity is stored as -1, which JSON cannot hold otherwise. */
  w.serialize = () => ({ current: w.current, inv: Object.fromEntries(ORDER.map((id) => [id, { owned: inv[id].owned, ammo: inv[id].ammo === Infinity ? -1 : inv[id].ammo, clip: inv[id].clip === Infinity ? -1 : inv[id].clip }])) });

  /** Put a serialized inventory back; missing or malformed counts read as 0, and the fists are never lost. */
  w.restore = (data) => {
    if (!data) return;
    const count = (n) => (n < 0 ? Infinity : Number.isFinite(n) ? Math.max(0, n) : 0);
    for (const id of ORDER) {
      const s = data.inv && data.inv[id];
      if (!s) continue;
      inv[id].owned = !!s.owned;
      inv[id].ammo = count(s.ammo);
      inv[id].clip = count(s.clip);
    }
    inv.fists.owned = true;
    w.current = inv[data.current] && inv[data.current].owned ? data.current : 'fists';
    w.reloading = 0;
    equipModel();
  };

  /** "clip / reserve" for the HUD, empty for fists. */
  w.ammoText = () => {
    if (w.current === 'fists') return '';
    const slot = inv[w.current];
    return `${slot.clip} / ${slot.ammo}`;
  };
  w.ORDER = ORDER;
  return w;
}
