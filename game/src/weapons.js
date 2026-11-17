// Sol's arsenal: fists, pistol, SMG and shotgun with ammo and clips, switching by number keys and
// mouse wheel, reputation unlocks, firing with spread and pellets, reloads, the muzzle flash and
// tracers, and the crime each shot is. Hits are resolved by combat.js. Exports createWeapons(G),
// whose state is saved and restored with the run.
import * as THREE from 'three';
import { GUNPLAY, WEAPONS } from './config.js';
import { KEYS } from './input.js';
import { createGunMesh } from './characters.js';
import { frand } from './rng.js';

/** Slot order for the number keys and the mouse wheel. */
const ORDER = ['fists', 'pistol', 'smg', 'shotgun'];
/** How far ahead of the chest a shot starts, and how far ahead of that the flash sits. */
const MUZZLE_FORWARD = 0.5;
const FLASH_FORWARD = 0.3;
const CHEST_HEIGHT = 1.4;
// Scratch vectors: firing allocates nothing per pellet.
const origin = new THREE.Vector3();
const dir = new THREE.Vector3();
const pellet = new THREE.Vector3();
const endPoint = new THREE.Vector3();

/**
 * The weapon system: {inv, current, cooldown, reloading, give, select, cycle, canUnlock, reload,
 * fire, update, serialize, restore, ammoText, ORDER}. `inv[id]` is {owned, ammo, clip}; fists are
 * always owned with infinite ammo.
 */
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

  /** Hand Sol weapon `id` with `ammo` rounds (capped at a few times its spec), loading the first clip; a new weapon is equipped. */
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

  /** Equip weapon `id` if owned (no-op for an unknown, unowned or already current one). */
  w.select = (id) => {
    if (!inv[id] || !inv[id].owned || w.current === id) return;
    w.current = id;
    w.reloading = 0;
    equipModel();
    G.audio.play('switch');
    G.hud.flashWeapon();
  };

  /** Step through the owned weapons by `step` (+1 / -1), wrapping around. */
  w.cycle = (step) => {
    const owned = ORDER.filter((id) => inv[id].owned);
    if (!owned.length) return;
    const i = owned.indexOf(w.current);
    w.select(owned[(i + step + owned.length) % owned.length]);
  };

  /** Has Sol the reputation Teo's asks for weapon `id`? */
  w.canUnlock = (id) => G.economy.repLevel() >= WEAPONS[id].unlockRep;

  /** Start a reload of the current gun if it needs one and ammo is left. */
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

  /**
   * One shot (or punch) from the player, aimed where the camera looks: every pellet is a ray
   * resolved by combat, with a tracer to where it landed. A burst counts as one 'shoot' crime.
   */
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
    origin.set(p.x, p.y + CHEST_HEIGHT, p.z).addScaledVector(dir, MUZZLE_FORWARD);
    const mx = origin.x + dir.x * FLASH_FORWARD;
    const my = origin.y;
    const mz = origin.z + dir.z * FLASH_FORWARD;
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

  /** Tick the timers, read the weapon keys and wheel, and fire when the trigger is held or clicked. */
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

  /** The save form: the current weapon and every slot, with -1 standing for infinite (JSON has no Infinity). */
  w.serialize = () => ({ current: w.current, inv: Object.fromEntries(ORDER.map((id) => [id, { owned: inv[id].owned, ammo: inv[id].ammo === Infinity ? -1 : inv[id].ammo, clip: inv[id].clip === Infinity ? -1 : inv[id].clip }])) });
  /** Put a serialized arsenal back; an unowned or unknown current weapon falls back to fists. */
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
  /** "clip / reserve" for the HUD, empty for fists. */
  w.ammoText = () => {
    if (w.current === 'fists') return '';
    const slot = inv[w.current];
    return `${slot.clip} / ${slot.ammo}`;
  };
  w.ORDER = ORDER;
  return w;
}
