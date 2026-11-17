// Saving and loading a run: three manual slots and an autosave in localStorage (every access
// wrapped in try/catch, so a browser without storage still plays), a versioned snapshot of the
// whole run (position, car, money, reputation, missions, activities, weapons, wanted level, time
// of day, radio) and the restore that puts it all back, plus the settings. Exports SAVE_VERSION
// and createSave(G).
import { SAVE_PREFIX } from './config.js';

/** Bumped whenever the snapshot shape changes; a newer save than the game is refused, not guessed at. */
export const SAVE_VERSION = 3;
const SLOTS = [1, 2, 3];

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The save system: {SLOTS, write(slot, label), read(slot), load(slot), list(), latest(),
 * hasAny(), autosave(), snapshot(label), restore(data), saveSettings(settings), loadSettings()}.
 * A slot is 1, 2, 3 or 'auto'.
 */
export function createSave(G) {
  const keyOf = (slot) => `${SAVE_PREFIX}-slot-${slot}`;
  const AUTO = `${SAVE_PREFIX}-autosave`;
  const SETTINGS = `${SAVE_PREFIX}-settings`;

  function readRaw(key) {
    try {
      const s = storage();
      if (!s) return null;
      const text = s.getItem(key);
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      const s = storage();
      if (!s) return false;
      s.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  /** Everything that makes this run, as plain JSON data; `label` is 'manual' or 'auto'. */
  function snapshot(label = 'manual') {
    const p = G.player;
    const v = p.vehicle;
    return {
      version: SAVE_VERSION,
      label,
      time: Date.now(),
      playtime: G.economy.stats.playtime,
      player: { x: p.x, z: p.z, yaw: p.yaw, health: p.health, armor: p.armor },
      vehicle: v && !v.wrecked ? { type: v.type, color: v.color, x: v.x, z: v.z, yaw: v.yaw, hp: v.hp } : null,
      economy: G.economy.serialize(),
      missions: G.missions.serialize(),
      activities: G.activities.serialize(),
      weapons: G.weapons.serialize(),
      wanted: G.wanted.serialize(),
      hour: G.world.sky.hour,
      radio: G.radio.station,
      gangHostile: G.gangs.hostile,
      seed: G.seed,
    };
  }

  /** Is this a snapshot this build can read: an object of a version no newer than its own? */
  function compatible(data) {
    return !!data && typeof data === 'object' && typeof data.version === 'number' && data.version <= SAVE_VERSION;
  }

  /**
   * Put a snapshot back: the world is reset, every system restored, Sol revived where she was
   * (back in her car if she had one). Returns false, with a notice, for an unreadable snapshot
   * rather than leaving a half-restored run.
   */
  function restore(data) {
    if (!compatible(data)) {
      G.notify('That save is from another version of the game');
      return false;
    }
    G.resetWorldState();
    try {
      G.economy.restore(data.economy);
      G.missions.restore(data.missions);
      G.activities.restore(data.activities);
      G.weapons.restore(data.weapons);
      G.wanted.restore(data.wanted);
      G.gangs.setHostile(!!data.gangHostile);
      if (typeof data.hour === 'number') G.world.sky.setHour(data.hour);
      if (typeof data.radio === 'number') G.radio.setStation(data.radio, true);
      const p = data.player || {};
      G.player.revive(p.x ?? 0, p.z ?? 0, p.yaw ?? 0);
      G.player.health = p.health ?? 100;
      G.player.armor = p.armor ?? 0;
      if (data.vehicle) {
        const d = data.vehicle;
        const v = G.fleet.spawn(d.type, d.x, d.z, d.yaw, { color: d.color, role: 'player', owner: 'player' });
        v.hp = d.hp ?? 100;
        G.player.enterVehicle(v);
      }
      G.economy.stats.playtime = data.playtime || 0;
    } catch (err) {
      console.warn('Save could not be restored', err);
      G.notify('That save could not be read');
      return false;
    }
    G.camera.snapTo(G.player.yaw + Math.PI, 0.25);
    G.camera.snapTo(G.player.yaw, 0.25);
    return true;
  }

  return {
    SLOTS,
    /** Snapshot the run into `slot` (1..3 or 'auto') with a notice and a sound; false if storage refused it. */
    write(slot, label = 'manual') {
      const data = snapshot(label);
      const ok = writeRaw(slot === 'auto' ? AUTO : keyOf(slot), data);
      if (ok) G.notify(slot === 'auto' ? 'Autosaved' : `Saved to slot ${slot}`);
      else G.notify('Could not save (storage unavailable)');
      G.audio.play(ok ? 'save' : 'deny');
      return ok;
    },
    /** The raw snapshot in `slot`, or null when empty or unreadable. */
    read(slot) {
      return readRaw(slot === 'auto' ? AUTO : keyOf(slot));
    },
    /** Restore the run in `slot`; false (with a notice) when it is empty or unreadable. */
    load(slot) {
      const data = this.read(slot);
      if (!data) {
        G.notify('That slot is empty');
        return false;
      }
      const ok = restore(data);
      if (ok) G.notify(slot === 'auto' ? 'Autosave loaded' : `Slot ${slot} loaded`);
      return ok;
    },
    /** Slot summaries for the menus: {slot, empty} or {slot, empty: false, time, money, missions, playtime, label}. */
    list() {
      return [...SLOTS, 'auto'].map((slot) => {
        const d = this.read(slot);
        if (!d) return { slot, empty: true };
        const completed = d.missions && Array.isArray(d.missions.completed) ? d.missions.completed.length : 0;
        return { slot, empty: false, time: d.time || 0, money: d.economy ? d.economy.money : 0, missions: completed, playtime: d.playtime || 0, label: d.label };
      });
    },
    /** The most recent save of any slot, for Continue; null when there is none. */
    latest() {
      let best = null;
      for (const s of this.list()) if (!s.empty && (!best || s.time > best.time)) best = s;
      return best;
    },
    /** Is there any save to continue from? */
    hasAny() {
      return this.latest() !== null;
    },
    /** Write the autosave slot. */
    autosave() {
      return this.write('auto', 'auto');
    },
    snapshot,
    restore,
    /** Persist the settings object (volume, sensitivity, shadows, ...). */
    saveSettings(settings) {
      writeRaw(SETTINGS, settings);
    },
    /** The persisted settings, or null. */
    loadSettings() {
      return readRaw(SETTINGS);
    },
  };
}
