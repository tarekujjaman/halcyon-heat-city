// Saving and loading: three manual slots, an autosave and the settings in localStorage (every
// access wrapped in try/catch, so a browser without storage still plays), a snapshot of the whole
// run (position, car, money, reputation, missions, activities, weapons, wanted level, time of day,
// radio, gang standing) and the restore that puts it all back. Exports SAVE_VERSION and createSave(G).
import { PLAYER, SAVE_PREFIX } from './config.js';

/** Bumped when the snapshot shape changes; a newer snapshot than this build knows is refused. */
export const SAVE_VERSION = 3;
const SLOTS = [1, 2, 3];

const finite = (n, fallback) => (Number.isFinite(n) ? n : fallback);

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The save system: write/read/load by slot (1, 2, 3 or 'auto'), list() for the menus, latest() for Continue. */
export function createSave(G) {
  const keyOf = (slot) => `${SAVE_PREFIX}-slot-${slot}`;
  const AUTO = `${SAVE_PREFIX}-autosave`;
  const SETTINGS = `${SAVE_PREFIX}-settings`;

  /** The parsed JSON under `key`, or null when missing, unreadable or storage is unavailable. */
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

  /** Store `value` as JSON under `key`; false when storage is unavailable or full. */
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

  /** Everything that makes this run, as plain JSON. A wrecked car is not saved: Sol wakes up on foot. */
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

  /** Can this build read the snapshot at all? (An object with a player, not from a newer version.) */
  function readable(data) {
    if (!data || typeof data !== 'object' || !data.player || typeof data.player !== 'object') return false;
    return !(Number.isFinite(data.version) && data.version > SAVE_VERSION);
  }

  /**
   * Replace the whole run with a snapshot: the world is cleared, every system restores its part,
   * Sol is placed (in her car if she saved in one) and the camera snaps behind her. Returns false,
   * touching nothing, for a snapshot this build cannot read; a snapshot that fails half-way leaves a
   * reset world and also returns false rather than throwing into the menu.
   */
  function restore(data) {
    if (!readable(data)) return false;
    try {
      G.resetWorldState();
      G.economy.restore(data.economy);
      G.missions.restore(data.missions);
      G.activities.restore(data.activities);
      G.weapons.restore(data.weapons);
      G.wanted.restore(data.wanted);
      G.gangs.setHostile(!!data.gangHostile);
      if (Number.isFinite(data.hour)) G.world.sky.setHour(data.hour);
      if (Number.isFinite(data.radio)) G.radio.setStation(data.radio, true);
      const p = data.player;
      const start = G.world.layout.landmarks.start;
      G.player.revive(finite(p.x, start.x), finite(p.z, start.z), finite(p.yaw, 0));
      G.player.health = finite(p.health, PLAYER.maxHealth);
      G.player.armor = finite(p.armor, 0);
      const d = data.vehicle;
      if (d && typeof d.type === 'string' && Number.isFinite(d.x) && Number.isFinite(d.z)) {
        const v = G.fleet.spawn(d.type, d.x, d.z, finite(d.yaw, 0), { color: d.color, role: 'player', owner: 'player' });
        v.hp = finite(d.hp, 100);
        G.player.enterVehicle(v);
      }
      G.economy.stats.playtime = finite(data.playtime, 0);
      // Two snaps: the first turns the camera right round so the second settles behind Sol at once.
      G.camera.snapTo(G.player.yaw + Math.PI, 0.25);
      G.camera.snapTo(G.player.yaw, 0.25);
      return true;
    } catch (err) {
      console.warn('HALCYON HEAT: save could not be restored', err);
      return false;
    }
  }

  return {
    SLOTS,
    /** Snapshot the run into a slot (1..3 or 'auto') and tell the player; false when storage refused. */
    write(slot, label = 'manual') {
      const data = snapshot(label);
      const ok = writeRaw(slot === 'auto' ? AUTO : keyOf(slot), data);
      if (ok) G.notify(slot === 'auto' ? 'Autosaved' : `Saved to slot ${slot}`);
      else G.notify('Could not save (storage unavailable)');
      G.audio.play(ok ? 'save' : 'deny');
      return ok;
    },
    /** The raw snapshot in a slot, or null. */
    read(slot) {
      return readRaw(slot === 'auto' ? AUTO : keyOf(slot));
    },
    /** Restore a slot into the running game; false (with a notice) when empty or unreadable. */
    load(slot) {
      const data = this.read(slot);
      if (!data) {
        G.notify('That slot is empty');
        return false;
      }
      const ok = restore(data);
      G.notify(ok ? (slot === 'auto' ? 'Autosave loaded' : `Slot ${slot} loaded`) : 'That save could not be loaded');
      return ok;
    },
    /** One summary per slot for the menus: `{slot, empty: true}` or `{slot, empty, time, money, missions, playtime, label}`. */
    list() {
      return [...SLOTS, 'auto'].map((slot) => {
        const d = this.read(slot);
        if (!d) return { slot, empty: true };
        const completed = d.missions && Array.isArray(d.missions.completed) ? d.missions.completed.length : 0;
        return { slot, empty: false, time: finite(d.time, 0), money: d.economy ? finite(d.economy.money, 0) : 0, missions: completed, playtime: finite(d.playtime, 0), label: d.label };
      });
    },
    /** The most recent save of any slot, for Continue; null when there is none. */
    latest() {
      let best = null;
      for (const s of this.list()) if (!s.empty && (!best || s.time > best.time)) best = s;
      return best;
    },
    hasAny() {
      return this.latest() !== null;
    },
    /** The autosave after a mission. */
    autosave() {
      return this.write('auto', 'auto');
    },
    snapshot,
    restore,
    saveSettings(settings) {
      writeRaw(SETTINGS, settings);
    },
    loadSettings() {
      return readRaw(SETTINGS);
    },
  };
}
