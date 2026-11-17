// The sky and the day-night cycle: a gradient dome with a sun glow, the low warm sun as the shadow
// light following the player, hemisphere and ambient fill, distance fog, and the night factor every
// lit window, neon tube and street lamp follows. Golden hour is the default.
import * as THREE from 'three';
import { TIME } from './config.js';

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uGlow;
uniform float uNight;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  float y = vDir.y;
  vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y * 1.4, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, clamp(-y * 3.0, 0.0, 1.0));
  float s = max(dot(vDir, uSunDir), 0.0);
  col += uSunColor * (pow(s, 6.0) * 0.35 * uGlow + pow(s, 48.0) * 0.6 * uGlow + pow(s, 900.0) * 1.8);
  // Stars at night.
  if (uNight > 0.5 && y > 0.05) {
    vec3 g = floor(vDir * 180.0);
    float star = step(0.997, hash(g)) * (uNight - 0.5) * 2.0 * (0.5 + 0.5 * hash(g + 1.0));
    col += vec3(star);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/** Colour keyframes by hour: [top, horizon, bottom, sunColor, fog, ambient, sunIntensity, glow]. */
const KEYS = [
  { h: 0, top: '#060a1c', horizon: '#141a33', bottom: '#0a0c18', sun: '#8aa0d0', fog: '#141a33', amb: '#2a3250', hemi: '#28304d', ground: '#101418', intensity: 0.18, glow: 0.1 },
  { h: 5.5, top: '#0e1636', horizon: '#3a2f55', bottom: '#1a1a2a', sun: '#c89bb0', fog: '#3a2f55', amb: '#3c3a5a', hemi: '#3f3f66', ground: '#2a2420', intensity: 0.35, glow: 0.4 },
  { h: 7, top: '#4d7fcf', horizon: '#ffb98a', bottom: '#9aa6b4', sun: '#ffd2a0', fog: '#ffc8a0', amb: '#7a7a90', hemi: '#8fb4e8', ground: '#a08060', intensity: 1.1, glow: 1.0 },
  { h: 12, top: '#2f7fe0', horizon: '#bfe3ff', bottom: '#c8d6e0', sun: '#fff5e0', fog: '#cfe4f5', amb: '#9aa6b8', hemi: '#bfe0ff', ground: '#c0b090', intensity: 2.2, glow: 0.5 },
  { h: 16, top: '#3b86df', horizon: '#ffd7a8', bottom: '#d2c6b0', sun: '#ffecc0', fog: '#f5d4ad', amb: '#a8a8b4', hemi: '#a8ccf4', ground: '#c7ad88', intensity: 2.3, glow: 0.8 },
  { h: 17.6, top: '#3f7ad6', horizon: '#ffb97a', bottom: '#d9bc9c', sun: '#ffcd8a', fog: '#f9c89a', amb: '#a898a8', hemi: '#a8c6f2', ground: '#cfa078', intensity: 2.5, glow: 1.3 },
  { h: 18.7, top: '#30509e', horizon: '#ff9a62', bottom: '#b58a78', sun: '#ffa45a', fog: '#f2aa7a', amb: '#9a8aa8', hemi: '#9aa8e8', ground: '#b08878', intensity: 1.7, glow: 1.5 },
  { h: 19.6, top: '#1b2a63', horizon: '#c45c6e', bottom: '#5a3a55', sun: '#ff7a60', fog: '#b06878', amb: '#5c5878', hemi: '#60659f', ground: '#584858', intensity: 0.7, glow: 1.0 },
  { h: 21, top: '#080d2a', horizon: '#2a2550', bottom: '#120f22', sun: '#8aa0d0', fog: '#242147', amb: '#2e3254', hemi: '#2c3358', ground: '#161820', intensity: 0.2, glow: 0.2 },
  { h: 24, top: '#060a1c', horizon: '#141a33', bottom: '#0a0c18', sun: '#8aa0d0', fog: '#141a33', amb: '#2a3250', hemi: '#28304d', ground: '#101418', intensity: 0.18, glow: 0.1 },
];

const cA = new THREE.Color();
const cB = new THREE.Color();

function lerpColor(a, b, t, out) {
  cA.set(a);
  cB.set(b);
  out.copy(cA).lerp(cB, t);
  return out;
}

export function createSky(scene) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color('#4a7fd0') },
        uHorizon: { value: new THREE.Color('#ffb070') },
        uBottom: { value: new THREE.Color('#d4b89a') },
        uSunDir: { value: new THREE.Vector3(-0.7, 0.2, 0.6) },
        uSunColor: { value: new THREE.Color('#ffc27a') },
        uGlow: { value: 1.3 },
        uNight: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  const sun = new THREE.DirectionalLight('#ffc27a', 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.06;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight('#9ec0f0', '#c89a70', 0.85);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight('#9a8aa0', 0.35);
  scene.add(ambient);
  scene.fog = new THREE.Fog('#f7bf8c', 240, 900);
  let envTarget = null;
  /** A painted sky cube for reflections on glass and paint; needs the renderer, so main calls it once. */
  function buildEnvironment(renderer) {
    try {
      const faces = [];
      for (let i = 0; i < 6; i += 1) {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, 64);
        if (i === 2) { grad.addColorStop(0, '#5a8fe0'); grad.addColorStop(1, '#6f9ae8'); } else if (i === 3) { grad.addColorStop(0, '#b89a78'); grad.addColorStop(1, '#8a7560'); } else { grad.addColorStop(0, '#4f86dc'); grad.addColorStop(0.55, '#ffc08a'); grad.addColorStop(0.62, '#d7b596'); grad.addColorStop(1, '#9a8468'); }
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        faces.push(c);
      }
      const cube = new THREE.CubeTexture(faces);
      cube.colorSpace = THREE.SRGBColorSpace;
      cube.needsUpdate = true;
      const pmrem = new THREE.PMREMGenerator(renderer);
      envTarget = pmrem.fromCubemap(cube);
      pmrem.dispose();
      // Only shiny things reflect it (car paint, glass towers, pools): the diffuse light stays golden.
      state.envMap = envTarget.texture;
      scene.traverse((o) => {
        if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
        if (o.material.metalness >= 0.3 || o.material.roughness <= 0.2) {
          o.material.envMap = state.envMap;
          o.material.envMapIntensity = 0.7;
          o.material.needsUpdate = true;
        }
      });
    } catch {
      state.envMap = null;
    }
  }

  const state = {
    hour: TIME.startHour,
    sunDir: new THREE.Vector3(),
    sunColor: new THREE.Color(),
    horizon: new THREE.Color(),
    top: new THREE.Color(),
    fogColor: new THREE.Color(),
    night: 0,
    running: true,
    emissive: [],
    nightMats: [],
  };

  function keyframes(hour) {
    let a = KEYS[0];
    let b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i += 1) {
      if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    const t = b.h === a.h ? 0 : (hour - a.h) / (b.h - a.h);
    const tt = t * t * (3 - 2 * t);
    return { a, b, t: tt };
  }

  function nightFactor(hour) {
    if (hour >= TIME.nightStart) return Math.min(1, (hour - TIME.nightStart) / 1.4);
    if (hour <= TIME.nightEnd) return Math.min(1, (TIME.nightEnd - hour) / 1.4);
    return 0;
  }

  // The sun itself: a soft disc sprite far along the sun direction.
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), color: '#fff2c8', transparent: true, opacity: 1, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending }));
  sunSprite.scale.set(150, 150, 1);
  sunSprite.renderOrder = -9;
  scene.add(sunSprite);

  function sunTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,245,210,1)');
    grad.addColorStop(0.3, 'rgba(255,200,120,0.55)');
    grad.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function apply(focus) {
    const hour = ((state.hour % 24) + 24) % 24;
    const { a, b, t } = keyframes(hour);
    const u = dome.material.uniforms;
    lerpColor(a.top, b.top, t, u.uTop.value);
    lerpColor(a.horizon, b.horizon, t, u.uHorizon.value);
    lerpColor(a.bottom, b.bottom, t, u.uBottom.value);
    lerpColor(a.sun, b.sun, t, u.uSunColor.value);
    u.uGlow.value = a.glow + (b.glow - a.glow) * t;
    // Sun path: rises east (+x), passes south (+z) at noon, sets west (-x) over the sea.
    const phi = (Math.PI * (hour - 6)) / 12;
    const elev = Math.sin(phi) * (62 * Math.PI / 180);
    const dir = new THREE.Vector3(Math.cos(phi) * Math.cos(Math.max(elev, 0.05)), Math.sin(Math.max(elev, 0.05)), (0.38 + 0.4 * Math.sin(phi)) * Math.cos(Math.max(elev, 0.05)));
    if (elev < 0.05) {
      // Moonlight after dusk: high, cool and dim from the north-east.
      dir.set(0.3, 0.8, -0.5);
    }
    dir.normalize();
    state.sunDir.copy(dir);
    u.uSunDir.value.copy(dir);
    state.night = nightFactor(hour);
    u.uNight.value = state.night;
    state.sunColor.copy(u.uSunColor.value);
    state.horizon.copy(u.uHorizon.value);
    state.top.copy(u.uTop.value).lerp(u.uHorizon.value, 0.35);
    lerpColor(a.fog, b.fog, t, state.fogColor);
    scene.fog.color.copy(state.fogColor);
    scene.background = null;
    sun.color.copy(state.sunColor);
    sun.intensity = a.intensity + (b.intensity - a.intensity) * t;
    lerpColor(a.hemi, b.hemi, t, hemi.color);
    lerpColor(a.ground, b.ground, t, hemi.groundColor);
    lerpColor(a.amb, b.amb, t, ambient.color);
    if (focus) {
      sun.position.set(focus.x + dir.x * 260, focus.y + dir.y * 260, focus.z + dir.z * 260);
      sun.target.position.set(focus.x, focus.y, focus.z);
      sun.target.updateMatrixWorld();
      dome.position.set(focus.x, 0, focus.z);
      sunSprite.position.set(focus.x + dir.x * 1300, dir.y * 1300, focus.z + dir.z * 1300);
      sunSprite.visible = elev > 0.02;
      sunSprite.material.opacity = Math.min(1, Math.max(0, (elev - 0.02) * 20)) * (1 - state.night);
    }
    for (const e of state.emissive) e.material.emissiveIntensity = e.day + (e.night - e.day) * state.night;
    for (const m of state.nightMats) m.opacity = 0.55 * state.night;
  }

  return {
    state,
    dome,
    sun,
    buildEnvironment,
    /** Lights and windows that brighten after dark register here. */
    registerEmissive(list) {
      state.emissive.push(...list);
    },
    registerNightMaterials(list) {
      state.nightMats.push(...list);
    },
    setHour(h) {
      state.hour = ((h % 24) + 24) % 24;
    },
    get hour() {
      return state.hour;
    },
    get night() {
      return state.night;
    },
    isNight() {
      return state.night > 0.5;
    },
    update(dt, focus) {
      if (state.running) state.hour = (state.hour + dt / TIME.secondsPerHour) % 24;
      apply(focus);
    },
    apply,
    clockText() {
      const h = Math.floor(state.hour);
      const m = Math.floor((state.hour - h) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
  };
}
