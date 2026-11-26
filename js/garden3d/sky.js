// Time of day: sun / moon path, light colours, haze, lanterns and the colour
// grade handed to the post-processing. `hour` is 0..24 (local time).

import * as THREE from 'three';
import { shared } from './sprites.js';
import { clamp, smoothstep, lerp } from './util.js';

export const SUNRISE = 6.0, SUNSET = 20.2;

// Key frames of the day. Intensities are relative (× π for three's physical lights).
const KEYS = [
  { t: 0.0, sun: '#8fa6e6', sunI: 0.23, sky: '#354a80', gnd: '#10152a', hemiI: 0.55, fog: '#0d1530', exp: 1.42, sat: 0.74, gain: [0.8, 0.9, 1.14] },
  { t: 4.7, sun: '#8fa6e6', sunI: 0.2, sky: '#354a80', gnd: '#10152a', hemiI: 0.55, fog: '#0d1530', exp: 1.42, sat: 0.74, gain: [0.8, 0.9, 1.14] },
  { t: 5.4, sun: '#7d8fd0', sunI: 0.08, sky: '#53669e', gnd: '#1d2132', hemiI: 0.6, fog: '#33406a', exp: 1.3, sat: 0.82, gain: [0.9, 0.9, 1.06] },
  { t: 6.2, sun: '#ff9a6a', sunI: 0.5, sky: '#d4a6a2', gnd: '#3e342e', hemiI: 0.66, fog: '#eab49c', exp: 1.1, sat: 1.0, gain: [1.1, 0.97, 0.9] },
  { t: 7.4, sun: '#ffd1a1', sunI: 0.74, sky: '#a9c7dd', gnd: '#4c4c3a', hemiI: 0.68, fog: '#bfd2d6', exp: 1.0, sat: 1.03, gain: [1.04, 1.0, 0.96] },
  { t: 13.0, sun: '#fff6e6', sunI: 0.95, sky: '#b4d3e8', gnd: '#56614a', hemiI: 0.72, fog: '#b0ccd6', exp: 0.98, sat: 1.0, gain: [1.02, 1.01, 0.97] },
  { t: 17.2, sun: '#ffe6bd', sunI: 0.88, sky: '#b2cde0', gnd: '#5a5a44', hemiI: 0.7, fog: '#b6ccd2', exp: 0.98, sat: 1.06, gain: [1.03, 1.0, 0.95] },
  { t: 19.0, sun: '#ffb870', sunI: 0.98, sky: '#e2bb9c', gnd: '#58493a', hemiI: 0.74, fog: '#f0c7a0', exp: 1.08, sat: 1.1, gain: [1.1, 0.99, 0.88] },
  { t: 20.0, sun: '#ff8050', sunI: 0.48, sky: '#b4849f', gnd: '#3d2c3c', hemiI: 0.62, fog: '#d48e8c', exp: 1.14, sat: 1.05, gain: [1.1, 0.92, 0.93] },
  { t: 20.8, sun: '#8e86d6', sunI: 0.12, sky: '#58568f', gnd: '#1d1d33', hemiI: 0.58, fog: '#3c3d72', exp: 1.3, sat: 0.84, gain: [0.86, 0.86, 1.1] },
  { t: 22.0, sun: '#8fa6e6', sunI: 0.23, sky: '#354a80', gnd: '#10152a', hemiI: 0.55, fog: '#0d1530', exp: 1.42, sat: 0.74, gain: [0.8, 0.9, 1.14] },
  { t: 24.0, sun: '#8fa6e6', sunI: 0.23, sky: '#354a80', gnd: '#10152a', hemiI: 0.55, fog: '#0d1530', exp: 1.42, sat: 0.74, gain: [0.8, 0.9, 1.14] },
].map(k => ({ ...k, sunC: new THREE.Color(k.sun), skyC: new THREE.Color(k.sky), gndC: new THREE.Color(k.gnd), fogC: new THREE.Color(k.fog) }));

function sample(hour) {
  const t = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const f = clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
  const k = f * f * (3 - 2 * f);
  return {
    sunC: a.sunC.clone().lerp(b.sunC, k), sunI: lerp(a.sunI, b.sunI, k),
    skyC: a.skyC.clone().lerp(b.skyC, k), gndC: a.gndC.clone().lerp(b.gndC, k), hemiI: lerp(a.hemiI, b.hemiI, k),
    fogC: a.fogC.clone().lerp(b.fogC, k),
    exp: lerp(a.exp, b.exp, k), sat: lerp(a.sat, b.sat, k),
    gain: a.gain.map((v, j) => lerp(v, b.gain[j], k)),
  };
}

// Direction towards the sun (day) or the moon (night). East = +x, south = +z.
function lightDir(hour) {
  const t = ((hour % 24) + 24) % 24;
  let p, maxElev, isSun;
  if (t >= SUNRISE && t <= SUNSET) { p = (t - SUNRISE) / (SUNSET - SUNRISE); maxElev = 58; isSun = true; }
  else { const n = (t - SUNSET + 24) % 24; p = n / (24 - (SUNSET - SUNRISE)); maxElev = 40; isSun = false; }
  const az = lerp(-112, 112, p) * Math.PI / 180;          // from south, + = towards west
  const elev = Math.max(15, maxElev * Math.sin(Math.PI * p)) * Math.PI / 180;   // never quite flat: keeps the lawn lit
  const h = Math.cos(elev);
  return { dir: new THREE.Vector3(-Math.sin(az) * h, Math.sin(elev), Math.cos(az) * h).normalize(), isSun, p };
}

export function createSky(scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -23; sc.right = 23; sc.top = 23; sc.bottom = -23; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xb4d3e8, 0x56614a, 2);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xacc9d6, 30, 80);
  scene.background = new THREE.Color(0xacc9d6);

  const lamps = [];
  const out = {
    sun, hemi, lamps,
    state: null,
    addLantern(pos) {
      const l = new THREE.PointLight(0xffd28a, 0, 7, 2);
      l.position.copy(pos);
      l.userData.active = false;          // decor.js assigns lights to placed lanterns
      scene.add(l);
      lamps.push(l);
      return l;
    },
    setShadowQuality(size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    },
    update(hour, time, focus) {
      const s = sample(hour);
      const { dir, isSun } = lightDir(hour);
      sun.color.copy(s.sunC);
      sun.intensity = s.sunI * Math.PI;
      sun.position.copy(focus).addScaledVector(dir, 60);
      sun.target.position.copy(focus);
      if ('intensity' in sun.shadow) sun.shadow.intensity = isSun ? 0.88 : 0.6;
      hemi.color.copy(s.skyC); hemi.groundColor.copy(s.gndC); hemi.intensity = s.hemiI * Math.PI;
      scene.fog.color.copy(s.fogC);
      scene.background.copy(s.fogC);
      const hd = new THREE.Vector3(dir.x, 0, dir.z);
      if (hd.lengthSq() < 1e-4) hd.set(0, 0, 1);
      shared.uLightDirH.value.copy(hd.normalize());
      // factors used by the rest of the garden
      const t = ((hour % 24) + 24) % 24;
      const lantern = t >= 12 ? smoothstep(19.5, 20.3, t) : 1 - smoothstep(5.7, 6.5, t);
      const night = t >= 12 ? smoothstep(20.5, 21.6, t) : 1 - smoothstep(4.6, 5.8, t);
      const day = clamp((s.sunI - 0.2) / 0.6, 0, 1) * (isSun ? 1 : 0);
      const flicker = 0.86 + 0.08 * Math.sin(time * 2.1) + 0.05 * Math.sin(time * 5.3 + 1.3) + 0.03 * Math.sin(time * 9.7);
      lamps.forEach((l, i) => { l.intensity = l.userData.active ? lantern * 5.5 * (flicker + 0.03 * Math.sin(time * 7 + i)) : 0; });
      shared.uCloudAmt.value = 0.42 * day;
      shared.uCloudOff.value.set(time * 0.012, time * 0.006);
      this.state = { ...s, dir, isSun, lantern, night, day, flicker, hour: t };
      return this.state;
    },
  };
  return out;
}

export function formatHour(h) {
  const t = ((h % 24) + 24) % 24;
  const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
