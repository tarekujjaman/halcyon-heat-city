// The world: the scene with the city built from the seeded plan (ground, roads, buildings, props,
// beach and sea), the static colliders, the sky and clock, and the per-frame update of what moves
// in the scenery (water, ferris wheel, lights by time of day).
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
    /** Scenery animation and lighting for the frame; `focus` is the player's position. */
    update(dt, focus, cameraPos) {
      time += dt;
      sky.update(dt, focus);
      beach.update(dt, time, cameraPos);
      beach.setLighting(sky.state.sunDir, sky.state.sunColor, sky.state.top, sky.state.fogColor, scene.fog.near, scene.fog.far);
    },
  };
  return world;
}
