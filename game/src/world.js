// The world of Halcyon Bay: one scene holding the city built from the seeded plan (ground, roads,
// buildings, props, beach and sea), the static colliders every mover collides with, the sign
// atlas, the sky with its clock and lighting, and the per-frame tick of what moves in the
// scenery (water, ferris wheel, lamps by time of day). Exports createWorld(seed).
import * as THREE from 'three';
import { buildLayout } from './city/layout.js';
import { buildGround } from './city/ground.js';
import { buildRoads } from './city/roads.js';
import { buildBuildings } from './city/buildings.js';
import { buildProps } from './city/props.js';
import { buildBeach } from './city/beach.js';
import { SignAtlas } from './city/signs.js';
import { StaticColliders } from './collision.js';
import { createTextureSet } from './textures.js';
import { createSky } from './sky.js';

/**
 * Build the whole static world for `seed`. Returns {scene, textures, layout, colliders, signs,
 * sky, props, beach, buildings, time, update(dt, focus, cameraPos)}: `layout` is the pure street
 * plan the AI and the maps read, `colliders` the spatial hash, and `time` the seconds the world
 * has run (the clock the waves and the animated props follow).
 */
export function createWorld(seed) {
  const scene = new THREE.Scene();
  const textures = createTextureSet();
  const layout = buildLayout(seed);
  const colliders = new StaticColliders();
  const signs = new SignAtlas();

  const ground = buildGround(layout, textures, colliders);
  const roads = buildRoads(layout, textures, colliders);
  const buildings = buildBuildings(layout, textures, colliders, signs);
  const props = buildProps(layout, textures, colliders);
  const beach = buildBeach(layout, textures, colliders);
  scene.add(ground, roads, buildings.group, props.group, beach.group);

  const sky = createSky(scene);
  sky.registerEmissive(buildings.emissiveMats);
  sky.registerEmissive(props.emissiveMats);
  sky.registerNightMaterials(props.nightMats);

  let time = 0;
  const world = {
    scene, textures, layout, colliders, signs, sky, props, beach, buildings,
    get time() {
      return time;
    },
    /**
     * Scenery animation and lighting for one step of dt seconds: the sky's clock and sun follow
     * `focus` (the player's position, where the shadow map is centred) and the water follows the
     * sky's light and the camera at `cameraPos`.
     */
    update(dt, focus, cameraPos) {
      time += dt;
      sky.update(dt, focus);
      beach.update(dt, time, cameraPos);
      const fog = scene.fog;
      beach.setLighting(sky.state.sunDir, sky.state.sunColor, sky.state.top, sky.state.fogColor, fog ? fog.near : 200, fog ? fog.far : 900);
    },
  };
  return world;
}
