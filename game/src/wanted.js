// The wanted level: crimes add heat, heat makes stars (1 to 5), the police search circle on the
// minimap follows the last place they saw Sol, and stars fade only while she stays out of sight,
// faster once she has left the circle. Arrests and hospital trips clear it.
import { WANTED } from './config.js';

export function createWanted(G) {
  const w = {
    heat: 0, stars: 0, evadeTimer: 0, inSight: false, search: { x: 0, z: 0, r: 0 }, flash: 0, lastCrime: null,
    sinceSeen: 0, peakStars: 0, evaded: 0,
  };

  function starsForHeat(h) {
    let s = 0;
    for (let i = 1; i <= WANTED.maxStars; i += 1) if (h >= WANTED.starHeat[i]) s = i;
    return s;
  }

  function setStars(n, announce = true) {
    const before = w.stars;
    w.stars = Math.max(0, Math.min(WANTED.maxStars, n));
    w.heat = w.stars > 0 ? Math.max(w.heat, WANTED.starHeat[w.stars]) : 0;
    if (w.stars !== before) {
      w.evadeTimer = WANTED.evadeSeconds[w.stars];
      w.flash = 1.2;
      if (w.stars > before) {
        G.audio.play('wantedUp');
        w.peakStars = Math.max(w.peakStars, w.stars);
      }
      if (announce && w.stars === 0 && before > 0) {
        G.notify('You lost the cops');
        w.evaded += 1;
        G.economy.stat('escapes', 1);
      }
      G.events.emit('wantedChanged', w.stars, before);
    }
  }

  /** Is anyone around to see a crime here: a pedestrian close by, or a police unit in range? */
  w.witnessed = (x, z) => {
    for (const ped of G.pedestrians.list) if (!ped.dead && Math.hypot(ped.x - x, ped.z - z) < 36) return true;
    for (const v of G.police.cruisers) if (!v.wrecked && Math.hypot(v.x - x, v.z - z) < 70) return true;
    for (const o of G.police.officers) if (!o.dead && Math.hypot(o.x - x, o.z - z) < 50) return true;
    return !!G.police.heli;
  };

  w.crime = (type, x = G.player.x, z = G.player.z) => {
    let value = WANTED.crimes[type] || 0;
    if (type === 'shoot' && !w.witnessed(x, z)) value = WANTED.crimes.shootUnseen;
    w.heat += value;
    w.lastCrime = type;
    w.search.x = x;
    w.search.z = z;
    w.sinceSeen = 0;
    const s = starsForHeat(w.heat);
    if (s > w.stars) setStars(s);
    else w.evadeTimer = WANTED.evadeSeconds[w.stars];
    if (w.stars > 0) G.police.respond();
  };

  w.setStars = (n) => {
    w.heat = n > 0 ? WANTED.starHeat[n] : 0;
    setStars(n, false);
    w.search.x = G.player.x;
    w.search.z = G.player.z;
    w.search.r = WANTED.searchRadius[w.stars];
    if (w.stars > 0) G.police.respond();
  };

  w.clear = () => {
    w.heat = 0;
    setStars(0, false);
  };

  /** The police have eyes on Sol: the search moves to her. */
  w.noticePlayer = () => {
    if (w.stars === 0) return;
    w.search.x = G.player.x;
    w.search.z = G.player.z;
    w.evadeTimer = WANTED.evadeSeconds[w.stars];
    w.inSight = true;
    w.sinceSeen = 0;
  };

  w.update = (dt) => {
    w.flash = Math.max(0, w.flash - dt);
    if (w.stars === 0) {
      w.heat = Math.max(0, w.heat - WANTED.heatCooldown * dt);
      w.inSight = false;
      w.search.r = 0;
      return;
    }
    const targetR = WANTED.searchRadius[w.stars];
    w.search.r += (targetR - w.search.r) * Math.min(1, dt * 2);
    w.inSight = G.police.canSeePlayer();
    if (w.inSight) {
      w.noticePlayer();
    } else {
      w.sinceSeen += dt;
      const outside = Math.hypot(G.player.x - w.search.x, G.player.z - w.search.z) > w.search.r;
      w.evadeTimer -= dt * (outside ? 1.7 : 1);
      if (w.evadeTimer <= 0) setStars(w.stars - 1);
    }
  };

  /** 0..1 progress toward losing the current star, for the HUD stars to blink. */
  w.evadeProgress = () => (w.stars === 0 ? 0 : 1 - w.evadeTimer / WANTED.evadeSeconds[w.stars]);
  w.isOutsideSearch = () => w.stars > 0 && Math.hypot(G.player.x - w.search.x, G.player.z - w.search.z) > w.search.r;
  w.serialize = () => ({ heat: w.heat, stars: w.stars, search: { ...w.search } });
  w.restore = (data) => {
    if (!data) return;
    w.heat = data.heat || 0;
    w.stars = data.stars || 0;
    Object.assign(w.search, data.search || {});
    w.evadeTimer = WANTED.evadeSeconds[w.stars];
  };
  return w;
}
