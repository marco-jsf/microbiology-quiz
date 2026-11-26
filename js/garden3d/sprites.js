// Upright pixel-art billboards (birds, trees, decor) for the 2.5D garden.
//
// Every sprite is a quad standing on its feet (local y = 0 at the ground,
// x centred), facing the camera. It is lit like the ground (Lambert, normal
// tilted up) and casts a real shadow: in the shadow pass a custom depth
// material turns the quad to face the light, so the silhouette always throws
// a full shadow, long and thin at sunset, short at noon.

import * as THREE from 'three';
import { VSTRETCH } from './config.js';

// Uniforms shared by every patched material (updated once per frame).
export const shared = {
  uTime: { value: 0 },
  uLightDirH: { value: new THREE.Vector3(0, 0, 1) },   // horizontal direction to the light
  uCloudAmt: { value: 0 },
  uCloudOff: { value: new THREE.Vector2() },
};

const SPRITE_N = new THREE.Vector3(0, 0.78, 0.62).normalize();

export function pixelTexture(canvas, { mips = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = mips;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* ---------- quad geometry ---------- */
export function makeQuad(w, h, ox = 0) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
    SPRITE_N.x, SPRITE_N.y, SPRITE_N.z, SPRITE_N.x, SPRITE_N.y, SPRITE_N.z,
    SPRITE_N.x, SPRITE_N.y, SPRITE_N.z, SPRITE_N.x, SPRITE_N.y, SPRITE_N.z]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12).fill(1), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  setQuadSize(g, w, h, ox);
  return g;
}
export function setQuadSize(g, w, h, ox = 0) {
  const p = g.attributes.position.array;
  const l = -w / 2 + ox, r = w / 2 + ox;
  p.set([l, 0, 0, r, 0, 0, r, h, 0, l, h, 0]);
  g.attributes.position.needsUpdate = true;
  g.computeBoundingSphere();
}
export function setQuadUV(g, u0, v0, u1, v1, flip = false) {
  const a = g.attributes.uv.array;
  if (flip) { const t = u0; u0 = u1; u1 = t; }
  a[0] = u0; a[1] = v0; a[2] = u1; a[3] = v0; a[4] = u1; a[5] = v1; a[6] = u0; a[7] = v1;
  g.attributes.uv.needsUpdate = true;
}
export function setQuadColor(g, r, gg, b) {
  const a = g.attributes.color.array;
  if (a[0] === r && a[1] === gg && a[2] === b) return;
  for (let i = 0; i < 12; i += 3) { a[i] = r; a[i + 1] = gg; a[i + 2] = b; }
  g.attributes.color.needsUpdate = true;
}

/* ---------- material patches ---------- */
const NOISE_GLSL = `
uniform float uCloudAmt; uniform vec2 uCloudOff; varying vec3 vGW;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float gCloud(vec2 p) {
  p = floor(p * 10.0) / 10.0;
  p = p * 0.05 + uCloudOff;
  float n = gNoise(p) * 0.6 + gNoise(p * 2.3 + 7.1) * 0.3 + gNoise(p * 5.1 + 3.3) * 0.1;
  return 1.0 - smoothstep(0.5, 0.66, n) * uCloudAmt;
}`;

function swayGLSL(amp, h) {
  if (!amp) return '';
  return `
    float gk = clamp(position.y / ${h.toFixed(3)}, 0.0, 1.0);
    float gs = sin(uTime * 1.6 + gOrg.x * 0.61 + gOrg.z * 0.37) + 0.35 * sin(uTime * 3.3 + gOrg.x * 1.7);
    transformed.x += gs * ${amp.toFixed(4)} * gk * gk;`;
}
const ORIGIN_GLSL = `
    vec4 gOrg = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
      gOrg = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    #endif`;

// Lambert + drifting cloud shadows (+ optional wind sway for foliage).
// `sprite`: clouds are sampled at the object's origin, so a sprite is shaded as a whole.
export function patchLit(mat, { sway = 0, swayH = 1, sprite = false } = {}) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uCloudAmt = shared.uCloudAmt;
    sh.uniforms.uCloudOff = shared.uCloudOff;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${ORIGIN_GLSL}
        ${swayGLSL(sway, swayH)}
        vGW = ${sprite ? 'gOrg.xyz' : '(gOrg.xyz + (modelMatrix * vec4(transformed, 0.0)).xyz)'};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directDiffuse *= gCloud(vGW.xz);');
  };
  mat.customProgramCacheKey = () => `g25lit|${sway}|${sway ? swayH.toFixed(3) : 0}|${sprite}`;
  return mat;
}

// Shadow-pass material for a sprite: same texture + alpha test, but the quad is
// turned to face the light so its silhouette is always cast in full.
export function spriteDepthMaterial(tex, { sway = 0, swayH = 1 } = {}) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uLightDirH = shared.uLightDirH;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uLightDirH;')
      .replace('#include <project_vertex>', `
        ${ORIGIN_GLSL}
        ${swayGLSL(sway, swayH)}
        vec3 gR = normalize(vec3(uLightDirH.z, 0.0, -uLightDirH.x));
        vec3 gW = gOrg.xyz + gR * transformed.x + vec3(0.0, transformed.y, 0.0);
        vec4 mvPosition = viewMatrix * vec4(gW, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => `g25depth|${sway}|${sway ? swayH.toFixed(3) : 0}`;
  return m;
}

export function spriteMaterials(tex, { sway = 0, swayH = 1, emissiveMap = null } = {}) {
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, vertexColors: true });
  if (emissiveMap) { mat.emissiveMap = emissiveMap; mat.emissive = new THREE.Color(0, 0, 0); }
  mat.shadowSide = THREE.DoubleSide;
  patchLit(mat, { sway, swayH, sprite: true });
  return { mat, depth: spriteDepthMaterial(tex, { sway, swayH }) };
}

// A static prop from a canvas: anchored at sprite pixel (ax, bottom row).
// texel = world units per sprite pixel. Returns the mesh plus a helper that
// turns sprite pixel coordinates into world positions (for perches).
export function makeProp(canvas, { x = 0, y = 0, z = 0, texel, ax = canvas.width / 2, sway = 0, shadow = true, tex = null, emissiveMap = null }) {
  const w = canvas.width * texel, h = canvas.height * texel * VSTRETCH;
  const ox = (canvas.width / 2 - ax) * texel;
  const g = makeQuad(w, h, ox);
  const t = tex || pixelTexture(canvas);
  const { mat, depth } = spriteMaterials(t, { sway, swayH: h, emissiveMap });
  const mesh = new THREE.Mesh(g, mat);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = shadow;
  mesh.receiveShadow = false;
  mesh.position.set(x, y, z);
  const toWorld = (px, py, dz = 0.06) => new THREE.Vector3(
    x + (px - ax) * texel, y + (canvas.height - py) * texel * VSTRETCH, z + dz);
  return { mesh, w, h, toWorld, mat, tex: t };
}
