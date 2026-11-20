// Visual effects: particles (additive + lit smoke), streaks (tracers / beams / lightning),
// shock rings, scorch decals with cooling embers, tumbling debris, flash lights, camera trauma.
import * as THREE from 'three';

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const softTex = canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
// puffy smoke blob: many overlapping soft circles inside the unit disc (shader adds fine noise on top)
const smokeTex = canvasTex(128, (g, s) => {
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * s * 0.24;
    const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d, rr = s * (0.12 + Math.random() * 0.16);
    const r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, 'rgba(255,255,255,0.34)'); r.addColorStop(0.6, 'rgba(255,255,255,0.16)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }
});
const lineTex = canvasTex(64, (g, s) => {
  const r = g.createLinearGradient(0, 0, s, 0);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.42, 'rgba(255,255,255,0.7)'); r.addColorStop(0.5, 'rgba(255,255,255,1)');
  r.addColorStop(0.58, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
// scorch: dark core, ragged rim, radial blast streaks and speckle (multiply-blended, white = no change)
const scorchTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
  const c = s / 2;
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * 6.283, w = 0.04 + Math.random() * 0.09, L = s * (0.24 + Math.random() * 0.24);
    const gr = g.createLinearGradient(c, c, c + Math.cos(a) * L, c + Math.sin(a) * L);
    gr.addColorStop(0, 'rgba(70,66,62,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(c, c);
    g.lineTo(c + Math.cos(a - w) * L, c + Math.sin(a - w) * L); g.lineTo(c + Math.cos(a + w) * L, c + Math.sin(a + w) * L); g.closePath(); g.fill();
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * 6.283, d = Math.random() * s * 0.12, x = c + Math.cos(a) * d, y = c + Math.sin(a) * d, rr = s * (0.12 + Math.random() * 0.12);
    const r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, 'rgba(34,32,30,0.7)'); r.addColorStop(0.55, 'rgba(90,86,80,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * 6.283, d = s * (0.1 + Math.pow(Math.random(), 0.7) * 0.36);
    const v = 60 + Math.random() * 80;
    g.fillStyle = `rgba(${v},${v - 4},${v - 8},${0.25 + Math.random() * 0.4})`;
    g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // fade the outermost band back to white so square edges never show
  g.globalCompositeOperation = 'lighter';
  const e = g.createRadialGradient(c, c, s * 0.38, c, c, s * 0.5);
  e.addColorStop(0, 'rgba(255,255,255,0)'); e.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = e; g.fillRect(0, 0, s, s);
});
const ringTex = canvasTex(128, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.75, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
export const TEX = { softTex, smokeTex, lineTex };

// ------------------------------------------------------------------ particle system
// Camera-facing instanced quads (not GL points): no max point size, per-particle rotation and seed, and the fragment
// knows its world position, so smoke fades where it meets the ground and near the camera, and everything takes fog.
const NOISE = `
  float fh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ return fn(p) * 0.55 + fn(p * 2.03 + 7.1) * 0.3 + fn(p * 4.1 + 3.7) * 0.15; }`;
const PART_VS = `attribute vec4 iP; attribute vec4 iC; attribute vec2 iR;
  uniform vec3 uRight, uUp; uniform float uK;
  varying vec2 vUv; varying vec2 vQ; varying vec4 vC; varying float vSeed; varying vec3 vW; varying float vSize;
  void main(){
    float s = iP.w * uK; float c = cos(iR.x), sn = sin(iR.x);
    vec2 q = position.xy;
    vec2 r = vec2(q.x * c - q.y * sn, q.x * sn + q.y * c);
    vec3 w = iP.xyz + (uRight * q.x + uUp * q.y) * s;
    vUv = r + 0.5; vQ = q * 2.0; vC = iC; vSeed = iR.y; vW = w; vSize = s;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }`;
const ADD_FS = `uniform sampler2D map; uniform float boost; uniform vec3 uCam; uniform float uFogN, uFogF, uT;
  varying vec2 vUv; varying vec2 vQ; varying vec4 vC; varying float vSeed; varying vec3 vW; varying float vSize;
  ${NOISE}
  void main(){
    float t = texture2D(map, vUv).a;
    // big sprites (fireballs, flashes) get turbulent breakup; sparks and tracers stay smooth
    float amt = smoothstep(0.9, 3.0, vSize);
    float n = fbm(vUv * 2.6 + vSeed * 17.0 + vec2(0.0, -uT * 0.9));
    float m = mix(1.0, smoothstep(0.3, 0.8, n * 0.9 + t * 0.5) * (0.6 + 0.9 * n), amt);
    float d = distance(vW, uCam);
    float fog = 1.0 - 0.85 * smoothstep(uFogN, uFogF, d);
    float a = vC.a * t * m * smoothstep(0.15, 0.15 + vSize * 0.6, d);
    gl_FragColor = vec4(vC.rgb * t * boost * fog, a);
  }`;
const SMOKE_FS = `uniform sampler2D map; uniform vec3 uCam, uL, uSunC, uAmb, uFogC; uniform float uFogN, uFogF, uT;
  varying vec2 vUv; varying vec2 vQ; varying vec4 vC; varying float vSeed; varying vec3 vW; varying float vSize;
  ${NOISE}
  void main(){
    float t = texture2D(map, vUv).a;
    float n = fbm(vUv * 3.4 + vSeed * 13.0 + vec2(uT * 0.05, uT * 0.12));
    float n2 = fn(vUv * 9.0 + vSeed * 31.0 + uT * 0.2);
    t = smoothstep(0.02, 0.62, t * (0.45 + 1.1 * n) - (1.0 - n) * 0.12 + (n2 - 0.5) * 0.08);
    // treat the puff as a lumpy sphere lit by sun + sky: sunward side bright, far side and core in shade
    float r2 = dot(vQ, vQ);
    vec3 nrm = normalize(vec3(vQ + (n - 0.5) * 0.9, sqrt(max(0.0, 1.0 - min(r2, 1.0))) + 0.25));
    float wrap = clamp((dot(nrm, uL) + 0.35) / 1.35, 0.0, 1.0);
    float thick = smoothstep(0.0, 0.55, t);
    vec3 col = vC.rgb * (uAmb * (1.05 - 0.35 * thick) + uSunC * wrap * (1.35 - 0.6 * thick));
    float d = distance(vW, uCam);
    float a = vC.a * t;
    a *= smoothstep(0.0, vSize * 0.32, vW.y);                    // soft where it meets the ground
    a *= smoothstep(0.4, 0.4 + vSize * 0.9, d);                   // and in front of the lens
    col = mix(col, uFogC, smoothstep(uFogN, uFogF, d));
    gl_FragColor = vec4(col, a);
  }`;

function makeParts(cap, tex, blending) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
  const iP = new Float32Array(cap * 4), iC = new Float32Array(cap * 4), iR = new Float32Array(cap * 2);
  geo.setAttribute('iP', new THREE.InstancedBufferAttribute(iP, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('iC', new THREE.InstancedBufferAttribute(iC, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('iR', new THREE.InstancedBufferAttribute(iR, 2).setUsage(THREE.DynamicDrawUsage));
  geo.instanceCount = 0;
  const add = blending === THREE.AdditiveBlending;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex }, boost: { value: add ? 3.2 : 1.0 }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
      uK: { value: 0.7 }, uCam: { value: new THREE.Vector3() }, uT: { value: 0 }, uFogN: { value: 90 }, uFogF: { value: 560 },
      uFogC: { value: new THREE.Color() }, uL: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(0.75, 0.72, 0.66) }, uAmb: { value: new THREE.Color(0.45, 0.47, 0.5) },
    },
    vertexShader: PART_VS, fragmentShader: add ? ADD_FS : SMOKE_FS,
    transparent: true, depthWrite: false, blending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const P = [];
  for (let i = 0; i < cap; i++) P.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, delay: 0, s0: 1, s1: 1, r0: 1, g0: 1, b0: 1, r1: 1, g1: 1, b1: 1, a0: 1, a1: 0, drag: 0, grav: 0, rot: 0, spin: 0, seed: 0 });
  return { pts: mesh, P, cap, next: 0, geo, iP, iC, iR };
}

const _c0 = new THREE.Color(), _c1 = new THREE.Color();
const _e = new THREE.Euler(), _bk = new THREE.Vector3(), _up0 = new THREE.Vector3(0, 1, 0);
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = makeParts(5000, softTex, THREE.AdditiveBlending);
    this.smk = makeParts(3200, smokeTex, THREE.NormalBlending);
    this.smk.pts.renderOrder = 1; this.add.pts.renderOrder = 2;
    scene.add(this.smk.pts, this.add.pts);
    this.time = 0;
    this.lightRefs = null;   // { sun, hemi } set by main so smoke picks up the scene's light
    // streaks: crossed quads, local z 0..1
    const q = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2);   // along +z, width x
    const q2 = q.clone().rotateZ(Math.PI / 2);
    const geo = mergeTwo(q, q2);
    this.streakCap = 900;
    this.streakMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: lineTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), this.streakCap);
    this.streakMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.streakCap * 3), 3);
    this.streakMesh.frustumCulled = false; this.streakMesh.renderOrder = 3;
    scene.add(this.streakMesh);
    this.streaks = [];     // persistent (with life)
    this.frameStreaks = []; // drawn once
    // rings
    this.rings = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false; scene.add(m); this.rings.push({ m, t: 0, life: 1, r0: 1, r1: 5 });
    }
    // decals (multiply blended scorch marks)
    this.decalCap = 60; this.decalN = 0;
    // instanceColor.r = fade (0 = full scorch, 1 = gone); multiply blending so white = no change
    const decalMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: scorchTex } },
      vertexShader: `varying vec2 vUv; varying float vK;
        void main(){ vUv = uv; vK = instanceColor.r; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vK;
        void main(){ vec3 c = mix(texture2D(map, vUv).rgb, vec3(1.0), vK); gl_FragColor = vec4(c, 1.0); }`,
      blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, premultipliedAlpha: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const dGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.decals = new THREE.InstancedMesh(dGeo, decalMat, this.decalCap);
    this.decals.count = 0; this.decals.renderOrder = 0; this.decals.frustumCulled = false;
    this.decals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.decalCap * 3).fill(1), 3);
    this.decalAge = new Float32Array(this.decalCap);
    scene.add(this.decals);
    // cooling embers on fresh scorch marks: additive noise glow sharing the decal matrices, instanceColor.r = heat
    const emberMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying float vH; varying float vS;
        void main(){ vUv = uv; vH = instanceColor.r; vS = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.61;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uT; varying vec2 vUv; varying float vH; varying float vS;
        ${NOISE}
        void main(){
          float r = length(vUv - 0.5) * 2.0;
          float n = fbm(vUv * 9.0 + vS) * 0.7 + fn(vUv * 26.0 + vS * 3.0 + uT * 0.4) * 0.3;
          float g = smoothstep(0.62, 0.95, n + (0.5 - r) * 0.55 + vH * 0.12) * smoothstep(0.85, 0.3, r);
          float h = vH * vH;
          vec3 c = mix(vec3(0.9, 0.12, 0.02), vec3(1.6, 0.75, 0.25), g * h) * g * h * (0.75 + 0.25 * sin(uT * 7.0 + vS * 9.0));
          gl_FragColor = vec4(c * 2.2, 1.0);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.embers = new THREE.InstancedMesh(dGeo, emberMat, this.decalCap);
    this.embers.count = 0; this.embers.renderOrder = 1; this.embers.frustumCulled = false;
    this.embers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.decalCap * 3), 3);
    this.embers.instanceMatrix = this.decals.instanceMatrix;   // same placements
    scene.add(this.embers);
    // debris: lit, shadow-casting chunks that tumble, bounce and trail smoke
    this.debCap = 260;
    const dg = new THREE.DodecahedronGeometry(0.5, 0); dg.scale(1, 0.62, 0.85);
    this.debMesh = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.45, flatShading: true }), this.debCap);
    this.debMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.debCap * 3), 3);
    this.debMesh.count = 0; this.debMesh.castShadow = true; this.debMesh.receiveShadow = true; this.debMesh.frustumCulled = false;
    scene.add(this.debMesh);
    this.deb = [];
    this._eu = new THREE.Euler(); this._dq = new THREE.Quaternion();
    // flash lights (fixed count so shaders never recompile)
    this.lights = [];
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 20, 1.6); scene.add(l);
      this.lights.push({ l, t: 0, life: 1, i0: 0 });
    }
    this.trauma = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  // ---------------- particles
  emit(sys, o) {
    const S = sys === 'smoke' ? this.smk : this.add;
    const p = S.P[S.next]; S.next = (S.next + 1) % S.cap;
    p.alive = true; p.t = 0; p.delay = o.delay || 0;
    p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = o.life || 0.5; p.s0 = o.s0 ?? 1; p.s1 = o.s1 ?? p.s0;
    _c0.set(o.c0 ?? 0xffffff); _c1.set(o.c1 ?? o.c0 ?? 0xffffff);
    p.r0 = _c0.r; p.g0 = _c0.g; p.b0 = _c0.b; p.r1 = _c1.r; p.g1 = _c1.g; p.b1 = _c1.b;
    p.a0 = o.a0 ?? 1; p.a1 = o.a1 ?? 0; p.drag = o.drag ?? 0; p.grav = o.grav ?? 0;
    p.rot = Math.random() * 6.283; p.spin = o.spin ?? (Math.random() - 0.5) * (sys === 'smoke' ? 0.9 : 2); p.seed = Math.random();
  }

  sparks(pos, dir, n, color = 0xffc070, speed = 18, spread = 0.6, life = 0.35, size = 0.25) {
    for (let i = 0; i < n; i++) {
      const vx = (dir ? dir.x : 0) + (Math.random() - 0.5) * 2 * spread;
      const vy = (dir ? dir.y : 0) + (Math.random() - 0.5) * 2 * spread;
      const vz = (dir ? dir.z : 0) + (Math.random() - 0.5) * 2 * spread;
      const l = Math.hypot(vx, vy, vz) || 1, s = speed * (0.4 + Math.random() * 0.8);
      this.emit('add', { x: pos.x, y: pos.y, z: pos.z, vx: vx / l * s, vy: vy / l * s, vz: vz / l * s, life: life * (0.5 + Math.random()), s0: size, s1: size * 0.3, c0: color, c1: 0xff5020, grav: 20, drag: 2 });
    }
  }

  muzzle(pos, dir, color = 0xffd27a, size = 1.2) {
    this.emit('add', { x: pos.x, y: pos.y, z: pos.z, life: 0.07, s0: size * 2.2, s1: size * 1.2, c0: color, c1: color });
    for (let i = 0; i < 3; i++) {
      const k = 0.3 + i * 0.35;
      this.emit('add', { x: pos.x + dir.x * k, y: pos.y + dir.y * k, z: pos.z + dir.z * k, vx: dir.x * 8, vy: dir.y * 8, vz: dir.z * 8, life: 0.06, s0: size * (1.2 - i * 0.3), c0: color });
    }
    this.flash(pos, color, 6 * size, 12, 0.06);
  }

  smoke(pos, n = 4, size = 2, life = 1.6, color = 0x8a8a88, up = 2, a0 = 0.55) {
    for (let i = 0; i < n; i++) {
      this.emit('smoke', { x: pos.x + (Math.random() - 0.5) * size * 0.5, y: pos.y + (Math.random() - 0.5) * size * 0.5, z: pos.z + (Math.random() - 0.5) * size * 0.5,
        vx: (Math.random() - 0.5) * 2, vy: up * (0.5 + Math.random()), vz: (Math.random() - 0.5) * 2,
        life: life * (0.6 + Math.random() * 0.6), s0: size * 0.6, s1: size * 1.8, c0: color, c1: color, a0, a1: 0, drag: 1.2 });
    }
  }

  dust(pos, n, size = 2.5, speed = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.5 + Math.random() * 0.7);
      this.emit('smoke', { x: pos.x, y: pos.y + 0.3, z: pos.z, vx: Math.cos(a) * s, vy: 0.5 + Math.random(), vz: Math.sin(a) * s,
        life: 0.9 + Math.random() * 0.6, s0: size * 0.6, s1: size * 1.6, c0: 0xa8a49c, c1: 0xb8b4ac, a0: 0.45, a1: 0, drag: 3 });
    }
  }

  // tumbling chunks; `hot` ones trail fire + smoke for their first second
  debris(pos, n, size = 1, speed = 14, hot = 0.35) {
    for (let i = 0; i < n; i++) {
      let d = this.deb.length < this.debCap ? null : this.deb.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
      if (!d) { d = {}; this.deb.push(d); }
      const a = Math.random() * 6.283, up = 0.35 + Math.random() * 0.9, v = speed * (0.35 + Math.random() * 0.8);
      d.x = pos.x; d.y = Math.max(pos.y, 0.4); d.z = pos.z;
      d.vx = Math.cos(a) * v; d.vy = up * v * 0.9 + 3; d.vz = Math.sin(a) * v;
      d.rx = Math.random() * 6; d.ry = Math.random() * 6; d.rz = Math.random() * 6;
      d.wx = (Math.random() - 0.5) * 16; d.wy = (Math.random() - 0.5) * 16; d.wz = (Math.random() - 0.5) * 16;
      d.s = size * (0.25 + Math.pow(Math.random(), 2) * 0.75); d.t = 0; d.life = 3.5 + Math.random() * 2.5;
      d.hot = Math.random() < hot; d.rest = false;
      const g = 0.1 + Math.random() * 0.16, k = Math.random();
      d.r = g * (k < 0.25 ? 1.35 : 1); d.g = g * (k < 0.25 ? 1.1 : 1); d.b = g * (k < 0.25 ? 0.85 : 1.02);
    }
  }

  explosion(pos, size = 1, color = 0xff9a40) {
    const s = size;
    this.emit('add', { x: pos.x, y: pos.y, z: pos.z, life: 0.12, s0: 5 * s, s1: 8 * s, c0: 0xfff0c8, c1: color, a0: 0.8 });
    // rolling fireball: a few large noisy billows that drift up and cool to deep red
    for (let i = 0; i < 3 + 3 * s; i++) {
      this.emit('add', { x: pos.x + (Math.random() - 0.5) * 2 * s, y: pos.y + (Math.random() - 0.3) * 1.6 * s, z: pos.z + (Math.random() - 0.5) * 2 * s,
        vx: (Math.random() - 0.5) * 5 * s, vy: (1.5 + Math.random() * 3) * s, vz: (Math.random() - 0.5) * 5 * s,
        life: 0.5 + Math.random() * 0.4, s0: (3 + Math.random() * 2.5) * s, s1: (5.5 + Math.random() * 3) * s, c0: 0xff9a3a, c1: 0x801a04, a0: 0.55, drag: 2.5 });
    }
    for (let i = 0; i < 14 * s + 6; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, v = (4 + Math.random() * 9) * s;
      this.emit('add', { x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * Math.cos(b) * v, vy: Math.abs(Math.sin(b)) * v * 0.8, vz: Math.sin(a) * Math.cos(b) * v,
        life: 0.45 + Math.random() * 0.4, s0: (2.2 + Math.random() * 1.8) * s, s1: 0.6 * s, c0: 0xffc070, c1: color, a0: 0.75, drag: 3.5 });
    }
    this.sparks(pos, { x: 0, y: 0.6, z: 0 }, 18 * s + 6, 0xffd080, 26 * Math.sqrt(s), 1.0, 0.7, 0.35);
    this.smoke(pos, 6 * s + 3, 3.5 * s, 2.4, 0x55524e, 3 * s, 0.7);
    // the smoke column that rises once the fire has burnt out
    for (let i = 0; i < 3 + 2 * s; i++) {
      this.emit('smoke', { delay: 0.12 + Math.random() * 0.25, x: pos.x + (Math.random() - 0.5) * 2 * s, y: pos.y + Math.random() * s, z: pos.z + (Math.random() - 0.5) * 2 * s,
        vx: (Math.random() - 0.5) * 1.5, vy: (2.5 + Math.random() * 2) * Math.sqrt(s), vz: (Math.random() - 0.5) * 1.5,
        life: 2.8 + Math.random() * 1.6, s0: 3 * s, s1: 8 * s, c0: 0x575249, c1: 0x8a867e, a0: 0.5, drag: 0.9 });
    }
    if (pos.y < 2.5 * s + 1) this.dust({ x: pos.x, y: 0, z: pos.z }, Math.round(6 + 6 * s), 2.4 * s, 10 * Math.sqrt(s));
    if (s >= 0.5) this.debris(pos, Math.round(3 + 6 * s), Math.min(1.1, 0.4 + 0.25 * s), 11 + 6 * Math.sqrt(s));
    this.flash(pos, color, 28 * s, 30 * s, 0.3);
    this.ring(pos, null, 0.5 * s, 9 * s, 0.35, color);
    this.trauma = Math.min(1, this.trauma + 0.12 * s);
  }

  // ---------------- streaks
  streak(a, b, width, color, life = 0, fade = true) {
    const s = { ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, w: width, c: new THREE.Color(color), t: 0, life, fade };
    if (life > 0) this.streaks.push(s); else this.frameStreaks.push(s);
    return s;
  }
  lightning(a, b, color = 0x9ff6ff, width = 0.35, life = 0.12, jag = 1.6) {
    const n = Math.max(4, Math.round(a.distanceTo(b) / 2.2));
    let prev = a.clone();
    const tmp = new THREE.Vector3();
    for (let i = 1; i <= n; i++) {
      tmp.lerpVectors(a, b, i / n);
      if (i < n) { tmp.x += (Math.random() - 0.5) * jag; tmp.y += (Math.random() - 0.5) * jag; tmp.z += (Math.random() - 0.5) * jag; }
      this.streak(prev, tmp, width, color, life);
      this.streak(prev, tmp, width * 3.5, 0x2a7fff, life);
      if (Math.random() < 0.25 && i < n) {
        const br = tmp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4));
        this.streak(tmp, br, width * 0.6, color, life * 0.8);
      }
      prev = tmp.clone();
    }
  }

  // ---------------- rings / decals / lights
  ring(pos, normal, r0, r1, life, color) {
    const R = this.rings.find((r) => !r.m.visible) || this.rings[0];
    R.m.visible = true; R.t = 0; R.life = life; R.r0 = r0; R.r1 = r1;
    R.m.position.copy(pos); R.m.material.color.set(color).multiplyScalar(2.5);
    if (normal) R.m.lookAt(this._v.copy(pos).add(normal)); else R.m.rotation.set(-Math.PI / 2, 0, 0);
    R.m.position.y = Math.max(R.m.position.y, 0.15);
  }
  // ground warning for incoming shells: a thin red circle whose inner disc fills as impact nears
  warn(pos, r, life) {
    if (!this.warns) this.warns = [];
    let W = this.warns.find((w) => !w.g.visible);
    if (!W) {
      if (this.warns.length >= 12) W = this.warns[0];
      else {
        const mk = (geo, op) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a20).multiplyScalar(1.6), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
        const g = new THREE.Group(); g.rotation.x = -Math.PI / 2;
        const edge = mk(new THREE.RingGeometry(0.93, 1, 48), 0.8), fill = mk(new THREE.CircleGeometry(1, 40), 0.18);
        g.add(edge, fill); this.scene.add(g);
        W = { g, edge, fill }; this.warns.push(W);
      }
    }
    W.g.visible = true; W.t = 0; W.life = life; W.g.position.set(pos.x, pos.y + 0.12, pos.z); W.g.scale.setScalar(r);
  }
  decal(pos, r) {
    const i = this.decalN % this.decalCap; this.decalN++;
    this._m.compose(this._v.set(pos.x, 0.03 + (i % 7) * 0.002, pos.z), this._q.setFromAxisAngle(_up0, Math.random() * 6.28), this._s.set(r * 1.25, 1, r * 1.25));
    this.decals.setMatrixAt(i, this._m);
    this.decals.count = this.embers.count = Math.min(this.decalCap, this.decalN);
    this.decalAge[i] = 0;
    this.decals.instanceMatrix.needsUpdate = true;
  }
  flash(pos, color, intensity, dist, life) {
    let L = this.lights[0];
    for (const l of this.lights) { if (l.l.intensity <= 0.01) { L = l; break; } if (l.t / l.life > L.t / L.life) L = l; }
    L.l.position.copy(pos); L.l.color.set(color); L.l.distance = dist; L.i0 = intensity * 4; L.l.intensity = L.i0; L.t = 0; L.life = life;
  }

  updateParts(S, dt) {
    const { iP, iC, iR } = S;
    let n = 0;
    for (let i = 0; i < S.cap; i++) {
      const p = S.P[i];
      if (!p.alive) continue;
      p.t += dt;
      if (p.t < p.delay) continue;
      const tl = p.t - p.delay;
      if (tl >= p.life) { p.alive = false; continue; }
      const k = tl / p.life, d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && p.grav > 0) { p.y = 0.05; p.vy *= -0.3; }
      p.rot += p.spin * dt;
      const o4 = n * 4;
      iP[o4] = p.x; iP[o4 + 1] = p.y; iP[o4 + 2] = p.z; iP[o4 + 3] = p.s0 + (p.s1 - p.s0) * k;
      iC[o4] = p.r0 + (p.r1 - p.r0) * k; iC[o4 + 1] = p.g0 + (p.g1 - p.g0) * k; iC[o4 + 2] = p.b0 + (p.b1 - p.b0) * k;
      iC[o4 + 3] = p.a0 + (p.a1 - p.a0) * k;
      iR[n * 2] = p.rot; iR[n * 2 + 1] = p.seed;
      n++;
    }
    S.geo.instanceCount = n;
    const A = S.geo.attributes;
    for (const a of [A.iP, A.iC, A.iR]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }

  updateDebris(dt) {
    let n = 0;
    const M = this.debMesh;
    for (let i = this.deb.length - 1; i >= 0; i--) {
      const d = this.deb[i];
      d.t += dt;
      if (d.t >= d.life) { this.deb[i] = this.deb[this.deb.length - 1]; this.deb.pop(); continue; }
      if (!d.rest) {
        d.vy -= 24 * dt;
        const k = Math.exp(-0.25 * dt); d.vx *= k; d.vz *= k;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
        const floor = d.s * 0.28;
        if (d.y < floor) {
          d.y = floor;
          if (Math.abs(d.vy) < 2.5) { d.rest = true; d.vx = d.vz = 0; }
          else { d.vy = -d.vy * 0.32; d.vx *= 0.55; d.vz *= 0.55; d.wx *= 0.5; d.wy *= 0.5; d.wz *= 0.5; if (d.s > 0.5) this.emit('smoke', { x: d.x, y: 0.3, z: d.z, vy: 0.6, life: 0.7, s0: d.s * 1.2, s1: d.s * 3, c0: 0xa8a49c, a0: 0.35, drag: 2 }); }
        }
        if (d.hot && d.t < 1.1 && Math.random() < dt * 50) {
          const h = 1 - d.t / 1.1;
          this.emit('add', { x: d.x, y: d.y, z: d.z, life: 0.18, s0: (0.5 * d.s + 0.25) * (0.5 + h), s1: 0.1, c0: 0xffa850, c1: 0xb02808, a0: 0.8 });
          this.emit('smoke', { x: d.x + (Math.random() - 0.5) * 0.3, y: d.y, z: d.z + (Math.random() - 0.5) * 0.3, vy: 0.5, life: 0.8 + Math.random() * 0.6, s0: 0.3 + d.s * 0.4, s1: 1.6 + d.s * 2.2, c0: 0x5a5650, c1: 0x9a968e, a0: 0.28 * (0.4 + h), drag: 1.6 });
        }
      }
      const shrink = Math.min(1, (d.life - d.t) / 0.6);
      _e.set(d.rx, d.ry, d.rz); this._dq.setFromEuler(_e);
      this._m.compose(this._v.set(d.x, d.y, d.z), this._dq, this._s.setScalar(d.s * shrink));
      M.setMatrixAt(n, this._m);
      const heat = d.hot ? Math.max(0, 1 - d.t / 1.4) : 0;
      M.setColorAt(n, _c0.setRGB(d.r + heat * 1.4, d.g + heat * 0.35, d.b));
      n++;
    }
    M.count = n;
    if (n) { M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true; }
  }

  update(dt, camera) {
    this.time += dt;
    // camera basis + scene lighting for the particle shaders
    if (camera) {
      const e = camera.matrixWorld.elements;
      _bk.set(e[8], e[9], e[10]);   // camera +z = towards the viewer
      const K = 600 * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / 1150;
      const fog = this.scene.fog;
      for (const S of [this.add, this.smk]) {
        const u = S.pts.material.uniforms;
        u.uRight.value.set(e[0], e[1], e[2]); u.uUp.value.set(e[4], e[5], e[6]); u.uCam.value.setFromMatrixPosition(camera.matrixWorld);
        u.uK.value = K; u.uT.value = this.time;
        if (fog) { u.uFogN.value = fog.near; u.uFogF.value = fog.far; u.uFogC.value.copy(fog.color); }
      }
      const L = this.lightRefs, u = this.smk.pts.material.uniforms;
      if (L) {
        const sd = L.dir;
        u.uL.value.set(sd.dot(u.uRight.value), sd.dot(u.uUp.value), sd.dot(_bk));
        // normalised so the day preset (sun 2.2, hemi 0.6) reproduces the old unlit colours on average
        u.uSunC.value.copy(L.sun.color).multiplyScalar(0.62 * L.sun.intensity / 2.2);
        u.uAmb.value.copy(L.hemi.color).lerp(L.hemi.groundColor, 0.35).multiplyScalar(0.62 * L.hemi.intensity / 0.6);
      }
    }
    this.updateParts(this.add, dt);
    this.updateParts(this.smk, dt);
    this.updateDebris(dt);
    // streaks
    let n = 0;
    const draw = (s, fadeK) => {
      if (n >= this.streakCap) return;
      const ax = s.ax, ay = s.ay, az = s.az;
      const dx = s.bx - ax, dy = s.by - ay, dz = s.bz - az, len = Math.hypot(dx, dy, dz);
      if (len < 1e-4) return;
      this._v.set(dx / len, dy / len, dz / len);
      this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._v);
      // roll the cross so one quad faces the camera
      this._m.compose(new THREE.Vector3(ax, ay, az), this._q, this._s.set(s.w, s.w, len));
      this.streakMesh.setMatrixAt(n, this._m);
      _c0.copy(s.c).multiplyScalar(fadeK * 3.2);
      this.streakMesh.setColorAt(n, _c0);
      n++;
    };
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i]; s.t += dt;
      if (s.t >= s.life) { this.streaks.splice(i, 1); continue; }
      draw(s, s.fade ? 1 - s.t / s.life : 1);
    }
    for (const s of this.frameStreaks) draw(s, 1);
    this.frameStreaks.length = 0;
    this.streakMesh.count = n;
    this.streakMesh.instanceMatrix.needsUpdate = true;
    if (this.streakMesh.instanceColor) this.streakMesh.instanceColor.needsUpdate = true;
    // rings
    for (const R of this.rings) {
      if (!R.m.visible) continue;
      R.t += dt; const k = R.t / R.life;
      if (k >= 1) { R.m.visible = false; continue; }
      const r = R.r0 + (R.r1 - R.r0) * (1 - (1 - k) * (1 - k));
      R.m.scale.set(r * 2, r * 2, 1);
      R.m.material.opacity = 1 - k;
    }
    if (this.warns) for (const W of this.warns) {
      if (!W.g.visible) continue;
      W.t += dt; const k = W.t / W.life;
      if (k >= 1) { W.g.visible = false; continue; }
      W.fill.scale.setScalar(Math.max(0.01, k));
      W.edge.material.opacity = 0.55 + 0.35 * Math.sin(W.t * 18);
    }
    // decals fade back to white over 25 s; embers cool over the first 4 s
    let any = false, hot = false;
    for (let i = 0; i < this.decals.count; i++) {
      this.decalAge[i] += dt;
      const k = Math.min(1, Math.max(0, (this.decalAge[i] - 15) / 10));
      this.decals.setColorAt(i, _c0.setScalar(k)); any = true;
      const h = Math.max(0, 1 - this.decalAge[i] / 4);
      this.embers.setColorAt(i, _c0.setRGB(h, 0, 0)); if (h > 0) hot = true;
    }
    // multiply blending: colour 0 = full scorch, 1 = invisible.  (texture already white at the rim)
    if (any) this.decals.instanceColor.needsUpdate = true;
    this.embers.visible = hot;
    if (hot) { this.embers.instanceColor.needsUpdate = true; this.embers.material.uniforms.uT.value = this.time; }
    for (const L of this.lights) {
      if (L.l.intensity <= 0) continue;
      L.t += dt; const k = L.t / L.life;
      L.l.intensity = k >= 1 ? 0 : L.i0 * (1 - k) * (1 - k);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
  }
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  const pa = a.attributes.position.array, pb = b.attributes.position.array;
  const ua = a.attributes.uv.array, ub = b.attributes.uv.array;
  g.setAttribute('position', new THREE.Float32BufferAttribute([...pa, ...pb], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([...ua, ...ub], 2));
  const ia = [...a.index.array], off = pa.length / 3;
  g.setIndex([...ia, ...b.index.array].map((v, i) => (i >= ia.length ? v + off : v)));
  return g;
}
