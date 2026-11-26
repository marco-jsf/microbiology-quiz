// Small living details: fireflies at night and butterflies by day (both shop
// effects) and the "z" of sleeping birds. Lantern glow lives in decor.js.

import * as THREE from 'three';
import { pixelTexture } from './sprites.js';
import { paintGlow, paintZ, spriteFromData } from './pixelart.js';
import { SPRITE_DATA } from '../garden-art.js';
import { rnd, clamp, pick } from './util.js';
import { FOV } from './config.js';

export function createFx(scene, world) {
  /* ---- fireflies ---- */
  const N = 70;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const s = world.randomSpot() || { x: 0, y: 0, z: 0 };
    pos.set([s.x, s.y + rnd(0.3, 1.6), s.z], i * 3);
    seed.set([Math.random(), Math.random(), Math.random()], i * 3);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  fg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  const fmat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uScale: { value: 800 }, uColor: { value: new THREE.Color().setRGB(2.4, 3.0, 1.1) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aSeed; uniform float uTime, uScale; varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime;
        p.x += sin(t * (0.25 + aSeed.x * 0.35) + aSeed.y * 6.28) * 0.9;
        p.z += cos(t * (0.2 + aSeed.z * 0.3) + aSeed.x * 6.28) * 0.7;
        p.y += sin(t * (0.45 + aSeed.y * 0.5) + aSeed.z * 6.28) * 0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = smoothstep(0.25, 0.95, sin(t * (0.8 + aSeed.x * 0.9) + aSeed.z * 12.0) * 0.5 + 0.5);
        gl_PointSize = clamp(uScale * 0.36 / -mv.z, 2.0, 22.0);
      }`,
    fragmentShader: `
      uniform float uAmt; uniform vec3 uColor; varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float core = step(max(abs(c.x), abs(c.y)), 0.1);
        float halo = smoothstep(0.5, 0.0, length(c));
        float a = (core + halo * halo * 0.5) * vA * uAmt;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const flies = new THREE.Points(fg, fmat);
  flies.frustumCulled = false;
  flies.renderOrder = 6;
  scene.add(flies);

  /* ---- butterflies ---- */
  const bfly = ['yellow', 'white', 'blue'].map(c => [0, 1].map(f => {
    const t = pixelTexture(spriteFromData(SPRITE_DATA['butterfly_' + c], f, false));
    return new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide });
  }));
  const flyers = [];
  // Flower beds the player placed (world.flowers changes with the decor); without any, the lawn.
  const flowerSpot = () => {
    if (world.flowers.length) return pick(world.flowers);
    return world.randomSpot() || { x: 0, y: 0, z: 0 };
  };
  for (let i = 0; i < 7; i++) {
    const mats = bfly[i % 3];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7 * 0.042, 5 * 0.042 * 1.35), mats[0]);
    const f = flowerSpot();
    m.position.set(f.x + rnd(-2, 2), f.y + rnd(0.5, 1.5), f.z + rnd(-1, 1));
    scene.add(m);
    flyers.push({ m, mats, target: null, rest: 0, flapT: 0, frame: 0, ph: Math.random() * 6, vel: new THREE.Vector3() });
  }
  const newTarget = b => {
    const f = flowerSpot();
    b.target = new THREE.Vector3(f.x + rnd(-0.6, 0.6), f.y + rnd(0.25, 0.4), f.z + rnd(-0.2, 0.2));
    if (Math.random() < 0.35) { const s = world.randomSpot(); if (s) b.target.set(s.x, s.y + rnd(0.6, 2), s.z); }
  };

  /* ---- "z" of sleeping birds ---- */
  const zTex = pixelTexture(paintZ());
  const zs = [];
  for (let i = 0; i < 30; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: zTex, transparent: true, depthWrite: false, opacity: 0, fog: false });
    mat.color.setRGB(0.95, 1.0, 1.25);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), mat);
    m.visible = false; m.renderOrder = 7;
    scene.add(m);
    zs.push({ m, mat, t: 0, life: 0 });
  }
  let zi = 0;

  const enabled = { fireflies: false, butterflies: false };
  return {
    // shop effects (decor kind 'effect') that are switched on
    setEnabled(e) { Object.assign(enabled, e); },
    zzz(x, y, z) {
      const e = zs[zi++ % zs.length];
      e.m.position.set(x, y, z); e.t = 0; e.life = 2.6; e.x0 = x; e.y0 = y; e.m.visible = true;
    },
    setPixelScale(heightPx) { fmat.uniforms.uScale.value = heightPx / (2 * Math.tan(FOV * Math.PI / 360)); },
    update(dt, time, st, camera) {
      // fireflies: dusk to dawn
      fmat.uniforms.uTime.value = time;
      fmat.uniforms.uAmt.value = enabled.fireflies ? clamp((st.lantern - 0.25) / 0.75, 0, 1) * (1 - st.day) : 0;
      flies.visible = fmat.uniforms.uAmt.value > 0.01;
      // butterflies: by day
      const showB = enabled.butterflies && st.day > 0.3;
      for (const b of flyers) {
        b.m.visible = showB;
        if (!showB) continue;
        if (!b.target) newTarget(b);
        const p = b.m.position;
        if (b.rest > 0) {
          b.rest -= dt;
          b.flapT += dt;
          if (b.flapT > 0.45) { b.flapT = 0; b.frame ^= 1; b.m.material = b.mats[b.frame]; }
          if (b.rest <= 0) newTarget(b);
        } else {
          const to = b.target.clone().sub(p);
          const d = to.length();
          if (d < 0.08) { b.rest = Math.random() < 0.6 ? rnd(1.5, 5) : 0.01; b.vel.set(0, 0, 0); continue; }
          to.normalize().multiplyScalar(1.1);
          b.vel.lerp(to, Math.min(1, dt * 2.2));
          p.addScaledVector(b.vel, dt);
          p.y += Math.sin(time * 9 + b.ph) * dt * 0.6;
          p.x += Math.sin(time * 3.1 + b.ph) * dt * 0.25;
          b.flapT += dt;
          if (b.flapT > 0.1) { b.flapT = 0; b.frame ^= 1; b.m.material = b.mats[b.frame]; }
          if (Math.abs(b.vel.x) > 0.05) b.m.scale.x = b.vel.x > 0 ? -1 : 1;
        }
        b.m.quaternion.copy(camera.quaternion);
      }
      // z's
      for (const e of zs) {
        if (!e.m.visible) continue;
        e.t += dt;
        const k = e.t / e.life;
        if (k >= 1) { e.m.visible = false; continue; }
        e.m.position.set(e.x0 + Math.sin(k * 5) * 0.08 + k * 0.25, e.y0 + k * 0.75, e.m.position.z);
        e.mat.opacity = Math.min(1, k * 5) * (1 - Math.max(0, (k - 0.6) / 0.4));
        const s = 0.75 + k * 0.45;
        e.m.scale.set(s, s, s);
        e.m.quaternion.copy(camera.quaternion);
      }
    },
  };
}
