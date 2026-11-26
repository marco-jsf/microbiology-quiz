// Post-processing for the 2.5D look: the scene is rendered into an HDR target,
// a blurred quarter-size copy gives the tilt-shift depth of field (top and
// bottom of the screen go soft, like a miniature); then exposure, saturation,
// a time-of-day tint, a vignette and a soft highlight roll-off, and finally the
// conversion to sRGB.

import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN = `
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

const BLUR = `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const FINAL = `
uniform sampler2D tScene, tBlur;
uniform float uTilt, uFocusY, uExposure, uSat, uVig, uTime;
uniform vec3 uGain;
varying vec2 vUv;
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 shoulder(vec3 x) {
  float k = 0.8;
  vec3 over = max(x - k, 0.0);
  return min(x, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec3 sharp = texture2D(tScene, vUv).rgb;
  vec3 soft = texture2D(tBlur, vUv).rgb;
  float dy = vUv.y - uFocusY;
  float m = dy > 0.0 ? smoothstep(0.17, 0.52, dy) * 0.9 : smoothstep(0.25, 0.6, -dy) * 0.75;
  vec3 col = mix(sharp, soft, clamp(m * uTilt, 0.0, 1.0));
  col *= uExposure;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, uSat), 0.0);
  col *= uGain;
  vec2 q = (vUv - 0.5) * vec2(1.0, 1.2);
  col *= 1.0 - dot(q, q) * uVig;
  col = shoulder(col);
  col = toSRGB(col);
  col += (h12(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createPost(renderer) {
  const hf = THREE.HalfFloatType;
  const mk = (depth) => new THREE.WebGLRenderTarget(4, 4, { type: hf, depthBuffer: depth, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const rtScene = mk(true), rtHalf = mk(false), rtA = mk(false), rtB = mk(false);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const qs = new THREE.Scene();
  qs.add(quad);
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const down = mat(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const blur = mat(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const fin = mat(FINAL, {
    tScene: { value: rtScene.texture }, tBlur: { value: null },
    uTilt: { value: 1 }, uFocusY: { value: 0.5 },
    uExposure: { value: 1 }, uSat: { value: 1 }, uVig: { value: 0.55 }, uTime: { value: 0 },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
  });
  let W = 4, H = 4;
  const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(qs, cam); };
  return {
    uniforms: fin.uniforms,
    setSize(w, h) {
      W = Math.max(4, w); H = Math.max(4, h);
      rtScene.setSize(W, H);
      rtHalf.setSize(Math.ceil(W / 2), Math.ceil(H / 2));
      rtA.setSize(Math.ceil(W / 4), Math.ceil(H / 4));
      rtB.setSize(Math.ceil(W / 4), Math.ceil(H / 4));
    },
    render(scene, camera) {
      renderer.setRenderTarget(rtScene);
      renderer.render(scene, camera);
      down.uniforms.tSrc.value = rtScene.texture;
      down.uniforms.uTexel.value.set(1 / W, 1 / H);
      pass(down, rtHalf);
      // half → quarter happens implicitly in the first blur (linear sampling)
      const qw = Math.ceil(W / 4), qh = Math.ceil(H / 4);
      blur.uniforms.tSrc.value = rtHalf.texture; blur.uniforms.uDir.value.set(1 / qw, 0); pass(blur, rtA);
      blur.uniforms.tSrc.value = rtA.texture; blur.uniforms.uDir.value.set(0, 1 / qh); pass(blur, rtB);
      blur.uniforms.tSrc.value = rtB.texture; blur.uniforms.uDir.value.set(2 / qw, 0); pass(blur, rtA);
      blur.uniforms.tSrc.value = rtA.texture; blur.uniforms.uDir.value.set(0, 2 / qh); pass(blur, rtB);
      fin.uniforms.tBlur.value = rtB.texture;
      pass(fin, null);
    },
  };
}
