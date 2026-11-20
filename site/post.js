// atmosphere: screen-space light shafts (god rays) through cloud gaps, depth-based sun in-scattering (aerial perspective),
// a light colour grade + vignette, and a distant ridge silhouette ring that gives the horizon depth.
// AtmospherePass sits between the RenderPass and bloom, reads the scene colour + depth of the composer's read buffer,
// and works in linear HDR (tone mapping happens later in OutputPass).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const HZ_N = 12;
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
// ambient occlusion (half res, depth only): scalable-ambient-obscurance style hemisphere test around the view-space
// position rebuilt from depth; normals come from the depth neighbours (the side with the smaller step, so silhouettes
// stay clean). Grounds mechs, props and building bases. Output: r = AO (1 = open), g = view depth for the blur.
const AO_FS = `uniform sampler2D tDepth; uniform mat4 projInv; uniform vec2 res; uniform float projY; uniform float radius; uniform float aoInt; varying vec2 vUv;
  vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
  float hs(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  void main(){
    float d0 = texture2D(tDepth, vUv).x;
    if (d0 > 0.99999) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
    vec3 P = vpos(vUv); vec2 px = 1.0 / res;
    vec3 pr = vpos(vUv + vec2(px.x, 0.0)) - P, pl = P - vpos(vUv - vec2(px.x, 0.0));
    vec3 pu = vpos(vUv + vec2(0.0, px.y)) - P, pd = P - vpos(vUv - vec2(0.0, px.y));
    vec3 n = normalize(cross(abs(pr.z) < abs(pl.z) ? pr : pl, abs(pu.z) < abs(pd.z) ? pu : pd));
    float z = -P.z, R = radius * (1.0 + z * 0.012);                     // grow the radius a little with distance so far buildings still read
    float rpx = clamp(R * projY * 0.5 * res.y / z, 3.0, 48.0);
    const int N = 14; float a = 0.0, R2 = R * R, ang = hs(gl_FragCoord.xy) * 6.2832, jit = hs(gl_FragCoord.yx + 7.0);
    for (int i = 0; i < N; i++) {
      float t = (float(i) + jit) / float(N); float th = ang + t * 6.2832 * 3.0 + float(i) * 2.4;
      vec2 o = vec2(cos(th), sin(th)) * rpx * (0.12 + 0.88 * t) * px;
      vec3 v = vpos(vUv + o) - P; float vv = dot(v, v), vn = dot(v, n);
      float f = max(R2 - vv, 0.0); a += f * f * f * max((vn - 0.06 - 0.003 * z) / (0.01 + vv), 0.0);
    }
    float ao = max(0.0, 1.0 - a * aoInt * 5.0 / (R2 * R2 * R2 * float(N)));
    ao = mix(ao, 1.0, smoothstep(140.0, 260.0, z));
    gl_FragColor = vec4(ao, z, 0.0, 1.0);
  }`;
// depth-aware 4x4 blur of the AO (hides the per-pixel rotation noise without bleeding across silhouettes)
const AOBLUR_FS = `uniform sampler2D tAO; uniform vec2 res; varying vec2 vUv;
  void main(){
    vec2 c = texture2D(tAO, vUv).rg; float s = 0.0, w = 0.0;
    for (int y = -2; y < 2; y++) for (int x = -2; x < 2; x++) {
      vec2 q = texture2D(tAO, vUv + (vec2(x, y) + 0.5) / res).rg;
      float k = 1.0 / (0.002 + abs(q.y - c.y) / max(c.y, 1.0) * 40.0); s += q.x * k; w += k;
    }
    gl_FragColor = vec4(s / w, c.y, 0.0, 1.0);
  }`;
// pass 3 (full res): heat haze + ambient occlusion + aerial perspective + rays + grade + lens flare / dirt.
// heat haze: up to HZ_N screen-space sources (thruster exhaust, explosions, fires) wobble the pixels behind them with
// rising value noise; the displaced fetch is rejected when it would pull a foreground object into the background.
const COMP_FS = `uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tRays; uniform sampler2D tAO; uniform float aoStr;
  uniform mat4 projInv; uniform mat4 camWorld; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 hiTint; uniform vec3 loTint;
  uniform float aDen; uniform float aStr; uniform float rayStr; uniform float grade; uniform float vig; varying vec2 vUv;
  uniform vec4 hz[${HZ_N}]; uniform float hzZ[${HZ_N}]; uniform int hzN; uniform float aspect; uniform float uT;
  uniform vec2 sunUV; uniform float flareK; uniform sampler2D tDirt; uniform float dirtOn; uniform vec4 dl[4]; uniform vec3 dlC[4];
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vh(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
  float vz(vec2 uv){ float d = texture2D(tDepth, uv).x; if (d > 0.99999) return 1e5; vec4 p = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return -p.z / p.w; }
  vec3 ghost(vec2 ax, float k, float r, vec3 col, float ring){
    float d = length((vUv - sunUV - ax * k) * vec2(aspect, 1.0));
    float disc = smoothstep(r, r * 0.55, d) * (0.55 + 0.45 * d / r);
    float rg = exp(-pow((d - r) / (r * 0.1), 2.0));
    return col * mix(disc, rg, ring);
  }
  void main(){
    float d = texture2D(tDepth, vUv).x; vec2 uv = vUv;
    if (hzN > 0) {
      float pz = vz(vUv), zMin = 1e6; vec2 off = vec2(0.0);
      for (int i = 0; i < ${HZ_N}; i++) {
        if (i >= hzN) break;
        vec4 h = hz[i]; vec2 q = (vUv - h.xy) * vec2(aspect, 1.0) / h.z; float r2 = dot(q, q);
        if (r2 >= 1.0 || pz < hzZ[i]) continue;
        float f = 1.0 - r2; f *= f; zMin = min(zMin, hzZ[i]);
        vec2 nq = q * 3.2 + vec2(float(i) * 7.31, -uT * 2.8);
        off += vec2(vh(nq) - vh(nq + vec2(5.2, 1.3)), vh(nq + vec2(2.7, 8.1)) - vh(nq + vec2(9.4, 3.6))) * f * h.w;
      }
      if (dot(off, off) > 1e-10) { vec2 u2 = clamp(vUv + off * vec2(1.0 / aspect, 1.0), 0.001, 0.999); if (vz(u2) >= zMin) uv = u2; }
    }
    vec3 c = texture2D(tColor, uv).rgb;
    if (aoStr > 0.0 && d < 0.99999) {   // bright emitters (glow strips, muzzle flashes) are not occluded
      float ao = texture2D(tAO, vUv).r, lc = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(1.0, ao, aoStr * (1.0 - smoothstep(1.2, 3.0, lc)));
    }
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
    // lens: ghosts mirrored through the centre, a chromatic halo, an anamorphic streak and dirt lit by the sun / flashes
    if (dirtOn > 0.5) {
      vec3 dt = texture2D(tDirt, vUv * vec2(aspect, 1.0) * 0.75).rgb;
      if (flareK > 0.002) {
        float occ = 0.0;
        for (int k = 0; k < 5; k++) {
          vec2 s = sunUV + vec2(float(k - 2), float(k == 1 ? 2 : k == 3 ? -2 : 0)) * 0.007;
          occ += (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0) ? step(0.99999, texture2D(tDepth, s).x) : 0.0;
        }
        float fk = flareK * occ * 0.2;
        if (fk > 0.0) {
          vec2 ax = (vec2(0.5) - sunUV) * 2.0, sv = (vUv - sunUV) * vec2(aspect, 1.0); float d0 = length(sv);
          vec3 fl = ghost(ax, 0.3, 0.032, vec3(1.0, 0.62, 0.3), 0.0) + ghost(ax, 0.52, 0.07, vec3(0.35, 0.8, 1.0), 0.0) * 0.55
                  + ghost(ax, 0.74, 0.018, vec3(0.6, 1.0, 0.5), 0.0) + ghost(ax, 1.0, 0.12, vec3(0.5, 0.62, 1.0), 1.0) * 0.8
                  + ghost(ax, 1.2, 0.05, vec3(0.95, 0.5, 1.0), 0.0) * 0.65 + ghost(ax, -0.2, 0.045, vec3(1.0, 0.8, 0.5), 0.0) * 0.5;
          vec3 halo = vec3(exp(-pow((d0 - 0.335) / 0.022, 2.0)), exp(-pow((d0 - 0.32) / 0.022, 2.0)), exp(-pow((d0 - 0.305) / 0.022, 2.0))) * 0.09;
          float streak = exp(-abs(sv.y) * 110.0) * exp(-abs(sv.x) * 2.0);
          c += sunCol * fk * (fl * 0.34 + halo * 1.3 + vec3(0.55, 0.72, 1.0) * streak * 0.35 + exp(-d0 * 9.0) * 0.35);
          c += dt * sunCol * fk * (0.035 + 2.0 * exp(-d0 * 3.4));
        }
      }
      for (int i = 0; i < 4; i++) {
        vec4 g = dl[i]; if (g.w <= 0.0) continue;
        float dd = length((vUv - g.xy) * vec2(aspect, 1.0));
        c += dt * dlC[i] * g.w * exp(-dd / g.z);
      }
    }
    vec2 q = (vUv - 0.5) * vec2(1.0, 0.82); c *= 1.0 - vig * pow(length(q) * 1.32, 2.6);
    gl_FragColor = vec4(c, 1.0);
  }`;

const _v = new THREE.Vector3(), _f = new THREE.Vector3();
// lens dirt: soft dust specks, a few larger smears and wipe streaks (linear data, sampled additively)
function dirtTex() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  let sd = 91; const r = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const blob = (x, y, rad, a) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const X = x + ox, Y = y + oy; if (X < -rad || X > S + rad || Y < -rad || Y > S + rad) continue; const gr = g.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(0.6, 'rgba(255,255,255,' + a * 0.45 + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2); } };
  for (let i = 0; i < 26; i++) blob(r() * S, r() * S, 30 + r() * 70, 0.05 + r() * 0.07);    // broad smudges
  for (let i = 0; i < 160; i++) blob(r() * S, r() * S, 2 + r() * 9, 0.12 + r() * 0.3);       // dust specks
  for (let i = 0; i < 9; i++) {                                                            // wipe streaks
    g.save(); g.translate(r() * S, r() * S); g.rotate(r() * 3.14); g.scale(1, 0.08 + r() * 0.1);
    const L = 60 + r() * 120, gr = g.createRadialGradient(0, 0, 0, 0, 0, L); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(-L, -L, L * 2, L * 2); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
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
      aDen: { value: 0.004 }, aStr: { value: 0.5 }, rayStr: { value: 0 }, grade: { value: 0.5 }, vig: { value: 0.22 }, tAO: { value: null }, aoStr: { value: 0 },
      hz: { value: Array.from({ length: HZ_N }, () => new THREE.Vector4()) }, hzZ: { value: new Array(HZ_N).fill(0) }, hzN: { value: 0 }, aspect: this.mU.aspect, uT: { value: 0 },
      sunUV: this.mU.sunUV, flareK: { value: 0 }, tDirt: { value: dirtTex() }, dirtOn: { value: 0 },
      dl: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, dlC: { value: Array.from({ length: 4 }, () => new THREE.Color()) } };
    this.rtO = new THREE.WebGLRenderTarget(1, 1, opt); this.rtO2 = new THREE.WebGLRenderTarget(1, 1, opt);
    this.oU = { tDepth: { value: null }, projInv: this.cU.projInv, res: { value: new THREE.Vector2(1, 1) }, projY: { value: 1 }, radius: { value: 2.2 }, aoInt: { value: 4.0 } };
    this.obU = { tAO: { value: this.rtO.texture }, res: this.oU.res };
    this.cU.tAO.value = this.rtO2.texture;
    const mk = (u, fs) => new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false }));
    this.qMask = mk(this.mU, MASK_FS); this.qBlur = mk(this.bU, BLUR_FS); this.qComp = mk(this.cU, COMP_FS);
    this.qAO = mk(this.oU, AO_FS); this.qAOB = mk(this.obU, AOBLUR_FS);
    this.env = { rays: 0.5, air: 0.5, ao: 0.7, flare: 0.5 }; this.rayK = 0; this.raysOn = true; this.aoOn = true; this.hazeOn = true; this.flareOn = true;
    this.heat = []; this.glints = [];   // filled by main each frame: heat sources {x,y,z,r,s} (world) and bright flashes {x,y,z,k,c}
    this.setSize(w, h);
  }
  setSize(w, h) {
    const qw = Math.max(1, Math.floor(w / 4)), qh = Math.max(1, Math.floor(h / 4));
    this.rtA.setSize(qw, qh); this.rtB.setSize(qw, qh); this.mU.aspect.value = w / Math.max(1, h);
    const hw = Math.max(1, Math.floor(w / 2)), hh = Math.max(1, Math.floor(h / 2));
    this.rtO.setSize(hw, hh); this.rtO2.setSize(hw, hh); this.oU.res.value.set(hw, hh);
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
    this.env.ao = E.ao ?? 0.7;
    this.env.flare = E.flare ?? (vacuum ? 0.7 : Math.min(1, disc) * 0.55);
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
    this.oU.projY.value = camera.projectionMatrix.elements[5];
    this.cU.aoStr.value = this.aoOn ? this.env.ao : 0;
    this.cU.uT.value = performance.now() / 1000;
    const inView = su > -0.05 && su < 1.05 && sv > -0.05 && sv < 1.05;
    this.cU.flareK.value = this.flareOn && inView ? facing * THREE.MathUtils.smoothstep(sunDir.y, -0.03, 0.08) * this.env.flare : 0;
    this.packHeat(camera); this.packGlints(camera);
  }
  // heat shimmer: project the world-space sources, keep the HZ_N that cover the most screen
  packHeat(camera) {
    const U = this.cU, py = camera.projectionMatrix.elements[5], H = [];
    if (this.hazeOn) for (const h of this.heat) {
      _v.set(h.x, h.y, h.z).applyMatrix4(camera.matrixWorldInverse); const z = -_v.z;
      if (z < 0.5 || z > 160) continue;
      const r = h.r * py / (2 * z); if (r < 0.004) continue;
      _v.set(h.x, h.y, h.z).project(camera); const u = _v.x * 0.5 + 0.5, v = _v.y * 0.5 + 0.5, ra = r / U.aspect.value;
      if (u < -ra || u > 1 + ra || v < -r || v > 1 + r) continue;
      H.push({ u, v, r, w: Math.min(0.014, h.s * py / (2 * z)), z: Math.max(0.3, z - h.r) });
    }
    H.sort((a, b) => b.r * b.w - a.r * a.w);
    const n = Math.min(HZ_N, H.length); U.hzN.value = n;
    for (let i = 0; i < n; i++) { U.hz.value[i].set(H[i].u, H[i].v, H[i].r, H[i].w); U.hzZ.value[i] = H[i].z; }
    this.heat.length = 0;
  }
  // lens dirt lights up around bright on-screen flashes (explosions, muzzle blasts) as well as the sun
  packGlints(camera) {
    const U = this.cU; let n = 0;
    if (this.flareOn) for (const g of this.glints) {
      if (n >= 4) break;
      _v.set(g.x, g.y, g.z).applyMatrix4(camera.matrixWorldInverse); if (-_v.z < 1) continue;
      _v.set(g.x, g.y, g.z).project(camera); if (Math.abs(_v.x) > 1.3 || Math.abs(_v.y) > 1.3) continue;
      U.dl.value[n].set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, 0.35, g.k); U.dlC.value[n].copy(g.c); n++;
    }
    for (let i = n; i < 4; i++) U.dl.value[i].w = 0;
    U.dirtOn.value = n > 0 || U.flareK.value > 0.002 ? 1 : 0;
    this.glints.length = 0;
  }
  render(renderer, writeBuffer, readBuffer) {
    const dt = readBuffer.depthTexture;
    this.cU.tColor.value = readBuffer.texture; this.cU.tDepth.value = dt;
    if (this.rayK > 0.004) {
      this.mU.tColor.value = readBuffer.texture; this.mU.tDepth.value = dt;
      renderer.setRenderTarget(this.rtA); this.qMask.render(renderer);
      renderer.setRenderTarget(this.rtB); this.qBlur.render(renderer);
    }
    if (this.cU.aoStr.value > 0) {
      this.oU.tDepth.value = dt;
      renderer.setRenderTarget(this.rtO); this.qAO.render(renderer);
      renderer.setRenderTarget(this.rtO2); this.qAOB.render(renderer);
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.qComp.render(renderer);
  }
  dispose() { this.rtA.dispose(); this.rtB.dispose(); this.qMask.dispose(); this.qBlur.dispose(); this.qComp.dispose(); this.rtO.dispose(); this.rtO2.dispose(); this.qAO.dispose(); this.qAOB.dispose(); }
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
