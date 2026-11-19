// atmosphere: screen-space light shafts (god rays) through cloud gaps, depth-based sun in-scattering (aerial perspective),
// a light colour grade + vignette, and a distant ridge silhouette ring that gives the horizon depth.
// AtmospherePass sits between the RenderPass and bloom, reads the scene colour + depth of the composer's read buffer,
// and works in linear HDR (tone mapping happens later in OutputPass).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// pass 1 (quarter res): bright sky pixels near the sun become the occluder mask
const MASK_FS = `uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 sunUV; uniform float aspect; varying vec2 vUv;
  void main(){
    float d = texture2D(tDepth, vUv).x; vec3 c = texture2D(tColor, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec2 dv = (vUv - sunUV) * vec2(aspect, 1.0);
    float fall = exp(-length(dv) * 2.4);
    vec3 m = c * step(0.99999, d) * smoothstep(0.35, 1.6, l) * fall;
    gl_FragColor = vec4(m / (1.0 + dot(m, vec3(0.2126, 0.7152, 0.0722)) * 0.8), 1.0);   // soft-clip: the tiny sun core must not dominate (star spikes)
  }`;
// pass 2 (quarter res): radial blur toward the sun, jittered start to hide banding
const BLUR_FS = `uniform sampler2D tMask; uniform vec2 sunUV; uniform float density; uniform float decay; varying vec2 vUv;
  float hs(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  void main(){
    const int N = 40; vec2 dl = (vUv - sunUV) * density / float(N); vec2 uv = vUv - dl * hs(gl_FragCoord.xy);
    vec3 acc = vec3(0.0); float w = 1.0;
    for (int i = 0; i < N; i++) { uv -= dl; acc += texture2D(tMask, clamp(uv, 0.0, 1.0)).rgb * w; w *= decay; }
    gl_FragColor = vec4(acc / float(N), 1.0);
  }`;
// pass 3 (full res): aerial perspective + rays + grade
const COMP_FS = `uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tRays;
  uniform mat4 projInv; uniform mat4 camWorld; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 hiTint; uniform vec3 loTint;
  uniform float aDen; uniform float aStr; uniform float rayStr; uniform float grade; uniform float vig; varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tColor, vUv).rgb; float d = texture2D(tDepth, vUv).x;
    vec4 vp = projInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vp.xyz /= vp.w;
    vec3 wd = normalize((camWorld * vec4(vp.xyz, 0.0)).xyz);
    float mu = max(dot(wd, sunDir), 0.0);
    if (d < 0.99999) {   // geometry: hazy forward-scatter glow toward the sun grows with distance
      float fa = 1.0 - exp(-length(vp.xyz) * aDen);
      c += sunCol * (pow(mu, 7.0) * 0.8 + pow(mu, 2.0) * 0.22) * fa * aStr;
    }
    c += texture2D(tRays, vUv).rgb * rayStr;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c *= mix(vec3(1.0), mix(loTint, hiTint, smoothstep(0.03, 0.8, l)), grade);   // split tone: cool shadows, warm highlights
    c = max(mix(vec3(l), c, 1.0 + 0.08 * grade), 0.0);
    c = 0.18 * pow(c / 0.18, vec3(1.0 + 0.1 * grade));   // a touch more contrast around mid grey
    vec2 q = (vUv - 0.5) * vec2(1.0, 0.82); c *= 1.0 - vig * pow(length(q) * 1.32, 2.6);
    gl_FragColor = vec4(c, 1.0);
  }`;

const _v = new THREE.Vector3(), _f = new THREE.Vector3();
const lumOf = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export class AtmospherePass extends Pass {
  constructor(w, h) {
    super();
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opt); this.rtB = new THREE.WebGLRenderTarget(1, 1, opt);
    this.mU = { tColor: { value: null }, tDepth: { value: null }, sunUV: { value: new THREE.Vector2() }, aspect: { value: 1 } };
    this.bU = { tMask: { value: this.rtA.texture }, sunUV: this.mU.sunUV, density: { value: 0.92 }, decay: { value: 0.965 } };
    this.cU = { tColor: { value: null }, tDepth: { value: null }, tRays: { value: this.rtB.texture }, projInv: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, hiTint: { value: new THREE.Color(1, 1, 1) }, loTint: { value: new THREE.Color(1, 1, 1) },
      aDen: { value: 0.004 }, aStr: { value: 0.5 }, rayStr: { value: 0 }, grade: { value: 0.5 }, vig: { value: 0.22 } };
    const mk = (u, fs) => new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false }));
    this.qMask = mk(this.mU, MASK_FS); this.qBlur = mk(this.bU, BLUR_FS); this.qComp = mk(this.cU, COMP_FS);
    this.env = { rays: 0.5, air: 0.5 }; this.rayK = 0; this.raysOn = true;
    this.setSize(w, h);
  }
  setSize(w, h) {
    const qw = Math.max(1, Math.floor(w / 4)), qh = Math.max(1, Math.floor(h / 4));
    this.rtA.setSize(qw, qh); this.rtB.setSize(qw, qh); this.mU.aspect.value = w / Math.max(1, h);
  }
  // per-environment look: E is an ENVS entry, sunColor/top/hor are linear THREE.Colors
  setEnv(E, sunColor, top, hor) {
    const disc = E.disc || 0, vacuum = +E.stars >= 0.9;   // moon / orbit / data space: no air to scatter in
    this.env.rays = E.rays ?? (vacuum ? 0 : Math.min(1.2, disc) * 0.55);
    this.env.air = E.air ?? (vacuum ? 0 : 0.18 + Math.min(1, disc) * 0.5);
    this.cU.aDen.value = 2.2 / Math.max(60, E.fog[1]);
    this.cU.sunCol.value.copy(sunColor).multiplyScalar(Math.min(1.4, E.sun[1] / 2));
    const norm = (c, k) => { const l = Math.max(1e-3, lumOf(c)); return new THREE.Color(Math.pow(c.r / l, k), Math.pow(c.g / l, k), Math.pow(c.b / l, k)); };
    this.cU.hiTint.value.copy(norm(sunColor, 0.32)); this.cU.loTint.value.copy(norm(top, 0.28));
    this.cU.grade.value = E.grade ?? 0.55;
  }
  // per frame: sun screen position + how visible it is
  update(camera, sunDir) {
    camera.updateMatrixWorld();
    this.cU.projInv.value.copy(camera.projectionMatrixInverse); this.cU.camWorld.value.copy(camera.matrixWorld); this.cU.sunDir.value.copy(sunDir);
    camera.getWorldDirection(_f);
    _v.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
    const su = _v.x * 0.5 + 0.5, sv = _v.y * 0.5 + 0.5; this.mU.sunUV.value.set(su, sv);
    const facing = THREE.MathUtils.smoothstep(_f.dot(sunDir), 0.05, 0.55);
    const off = Math.max(Math.abs(su - 0.5), Math.abs(sv - 0.5)) - 0.5;
    const vis = facing * (1 - THREE.MathUtils.smoothstep(off, 0, 0.7)) * THREE.MathUtils.smoothstep(sunDir.y, -0.03, 0.08);
    this.rayK = this.raysOn ? vis * this.env.rays : 0;
    this.cU.rayStr.value = this.rayK * 3.4; this.cU.aStr.value = this.env.air;
  }
  render(renderer, writeBuffer, readBuffer) {
    const dt = readBuffer.depthTexture;
    this.cU.tColor.value = readBuffer.texture; this.cU.tDepth.value = dt;
    if (this.rayK > 0.004) {
      this.mU.tColor.value = readBuffer.texture; this.mU.tDepth.value = dt;
      renderer.setRenderTarget(this.rtA); this.qMask.render(renderer);
      renderer.setRenderTarget(this.rtB); this.qBlur.render(renderer);
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.qComp.render(renderer);
  }
  dispose() { this.rtA.dispose(); this.rtB.dispose(); this.qMask.dispose(); this.qBlur.dispose(); this.qComp.dispose(); }
}

// distant ridge ring: two layers of mesa-like silhouettes far outside the arena, hazed into the horizon colour.
// ridges toward the sun read as dark backlit silhouettes with a bright rim, ridges away from it as warm lit rock.
export function makeRidge(seed = 1) {
  let s = seed >>> 0 || 1; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pos = [], vh = [], lay = [], idx = [];
  const layers = [[860, 30, 95, 0], [1380, 70, 190, 1]];
  for (const [R, H0, H1, L] of layers) {
    const N = 420, waves = []; for (let k = 0; k < 7; k++) waves.push([1 + Math.floor(rnd() * (3 + k * 5)), rnd() * 6.28, 1 / (1 + k * 0.7)]);
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2; let n = 0, ws = 0;
      for (const [f, ph, w] of waves) { n += Math.sin(a * f + ph) * w; ws += w; }
      n = n / ws * 0.5 + 0.5;
      const mesa = THREE.MathUtils.smoothstep(n, 0.42, 0.58) * 0.72 + n * 0.28 + (rnd() - 0.5) * 0.035;
      const h = H0 + (H1 - H0) * mesa, x = Math.cos(a) * R, z = Math.sin(a) * R;
      pos.push(x, -40, z, x, h, z); vh.push(0, 1); lay.push(L, L);
    }
    for (let i = 0; i < N; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('vh', new THREE.Float32BufferAttribute(vh, 1)); g.setAttribute('lay', new THREE.Float32BufferAttribute(lay, 1));
  g.setIndex(idx);
  const U = { hor: { value: new THREE.Color() }, top: { value: new THREE.Color() }, sunC: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, vis: { value: 0.8 }, lit: { value: 1 } };
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, fog: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float vh; attribute float lay; varying float vH; varying float vL; varying vec3 vW; void main(){ vH = vh; vL = lay; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 hor; uniform vec3 top; uniform vec3 sunC; uniform vec3 sunDir; uniform float vis; uniform float lit; varying float vH; varying float vL; varying vec3 vW;
      float hs(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      void main(){
        vec2 dirH = normalize(vW.xz), sunH = normalize(sunDir.xz + 1e-4);
        float toward = max(dot(dirH, sunH), 0.0), away = max(-dot(dirH, sunH), 0.0);
        float hgt = clamp(vW.y / 190.0, 0.0, 1.0);
        float strata = 0.92 + 0.08 * sin(vW.y * 0.35 + hs(floor(vW.xz / 40.0)) * 6.0);
        vec3 rock = mix(hor, top, 0.25) * mix(0.3, 0.52, vL) * strata;                // backlit: a dark silhouette
        rock += sunC * away * 0.3 * lit * (1.0 - vL * 0.5);                          // front-lit faces warm up
        float rim = smoothstep(0.9, 1.0, vH) * pow(toward, 2.0) * lit;               // bright rim on backlit crests
        rock += sunC * rim * 0.45;
        vec3 c = mix(hor, rock, smoothstep(0.2, 0.7, vH) * (1.0 - 0.3 * vL));       // haze pools at the base and on the far layer
        gl_FragColor = vec4(mix(hor, c, vis * (0.8 + 0.2 * hgt)), 1.0);
      }` }));
  m.frustumCulled = false; m.renderOrder = -5; m.userData.U = U;
  return m;
}
