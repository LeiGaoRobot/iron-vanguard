// Visual effects: particles (additive + smoke), streaks (tracers / beams / lightning),
// shock rings, scorch decals, flash lights, camera trauma.
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
const smokeTex = canvasTex(64, (g, s) => {
  for (let i = 0; i < 9; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.35, y = s / 2 + (Math.random() - 0.5) * s * 0.35;
    const r = g.createRadialGradient(x, y, 0, x, y, s * 0.32);
    r.addColorStop(0, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }
});
const lineTex = canvasTex(64, (g, s) => {
  const r = g.createLinearGradient(0, 0, s, 0);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.42, 'rgba(255,255,255,0.7)'); r.addColorStop(0.5, 'rgba(255,255,255,1)');
  r.addColorStop(0.58, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
const scorchTex = canvasTex(128, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgb(40,38,36)'); r.addColorStop(0.5, 'rgb(110,106,100)'); r.addColorStop(1, 'rgb(255,255,255)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
const ringTex = canvasTex(128, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.75, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
export const TEX = { softTex, smokeTex, lineTex };

// ------------------------------------------------------------------ particle system
function makePoints(cap, tex, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 4), size = new Float32Array(cap);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: 600 }, boost: { value: blending === THREE.AdditiveBlending ? 3.2 : 1.0 } },
    vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC;
      uniform float scale;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform float boost; varying vec4 vC;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb * t.rgb * boost, vC.a * t.a); }`,
    transparent: true, depthWrite: false, blending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const P = [];
  for (let i = 0; i < cap; i++) P.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s0: 1, s1: 1, r0: 1, g0: 1, b0: 1, r1: 1, g1: 1, b1: 1, a0: 1, a1: 0, drag: 0, grav: 0 });
  return { pts, P, cap, next: 0, geo };
}

const _c0 = new THREE.Color(), _c1 = new THREE.Color();
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = makePoints(5000, softTex, THREE.AdditiveBlending);
    this.smk = makePoints(2000, smokeTex, THREE.NormalBlending);
    this.smk.pts.renderOrder = 1; this.add.pts.renderOrder = 2;
    scene.add(this.smk.pts, this.add.pts);
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
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), decalMat, this.decalCap);
    this.decals.count = 0; this.decals.renderOrder = 0; this.decals.frustumCulled = false;
    this.decals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.decalCap * 3).fill(1), 3);
    this.decalAge = new Float32Array(this.decalCap);
    scene.add(this.decals);
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
    p.alive = true; p.t = 0;
    p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = o.life || 0.5; p.s0 = o.s0 ?? 1; p.s1 = o.s1 ?? p.s0;
    _c0.set(o.c0 ?? 0xffffff); _c1.set(o.c1 ?? o.c0 ?? 0xffffff);
    p.r0 = _c0.r; p.g0 = _c0.g; p.b0 = _c0.b; p.r1 = _c1.r; p.g1 = _c1.g; p.b1 = _c1.b;
    p.a0 = o.a0 ?? 1; p.a1 = o.a1 ?? 0; p.drag = o.drag ?? 0; p.grav = o.grav ?? 0;
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

  explosion(pos, size = 1, color = 0xff9a40) {
    const s = size;
    this.emit('add', { x: pos.x, y: pos.y, z: pos.z, life: 0.18, s0: 6 * s, s1: 11 * s, c0: 0xfff4d0, c1: color });
    for (let i = 0; i < 14 * s + 6; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, v = (4 + Math.random() * 9) * s;
      this.emit('add', { x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * Math.cos(b) * v, vy: Math.abs(Math.sin(b)) * v * 0.8, vz: Math.sin(a) * Math.cos(b) * v,
        life: 0.45 + Math.random() * 0.4, s0: (2.5 + Math.random() * 2) * s, s1: 0.6 * s, c0: 0xffd080, c1: color, drag: 3.5 });
    }
    this.sparks(pos, { x: 0, y: 0.6, z: 0 }, 18 * s + 6, 0xffd080, 26 * Math.sqrt(s), 1.0, 0.7, 0.35);
    this.smoke(pos, 6 * s + 3, 3.5 * s, 2.4, 0x55524e, 3 * s, 0.7);
    this.flash(pos, color, 40 * s, 30 * s, 0.35);
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
    this._m.compose(this._v.set(pos.x, 0.03 + (i % 7) * 0.002, pos.z), this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28), this._s.set(r, 1, r));
    this.decals.setMatrixAt(i, this._m);
    this.decals.count = Math.min(this.decalCap, this.decalN);
    this.decalAge[i] = 0;
    this.decals.instanceMatrix.needsUpdate = true;
  }
  flash(pos, color, intensity, dist, life) {
    let L = this.lights[0];
    for (const l of this.lights) { if (l.l.intensity <= 0.01) { L = l; break; } if (l.t / l.life > L.t / L.life) L = l; }
    L.l.position.copy(pos); L.l.color.set(color); L.l.distance = dist; L.i0 = intensity * 4; L.l.intensity = L.i0; L.t = 0; L.life = life;
  }

  update(dt, camera) {
    for (const S of [this.add, this.smk]) {
      const pos = S.geo.attributes.position.array, col = S.geo.attributes.color.array, size = S.geo.attributes.size.array;
      for (let i = 0; i < S.cap; i++) {
        const p = S.P[i];
        if (!p.alive) { size[i] = 0; continue; }
        p.t += dt;
        if (p.t >= p.life) { p.alive = false; size[i] = 0; continue; }
        const k = p.t / p.life, d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05 && p.grav > 0) { p.y = 0.05; p.vy *= -0.3; }
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 4] = p.r0 + (p.r1 - p.r0) * k; col[i * 4 + 1] = p.g0 + (p.g1 - p.g0) * k; col[i * 4 + 2] = p.b0 + (p.b1 - p.b0) * k;
        col[i * 4 + 3] = p.a0 + (p.a1 - p.a0) * k;
        size[i] = p.s0 + (p.s1 - p.s0) * k;
      }
      S.geo.attributes.position.needsUpdate = true; S.geo.attributes.color.needsUpdate = true; S.geo.attributes.size.needsUpdate = true;
    }
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
    // decals fade back to white over 25 s
    let any = false;
    for (let i = 0; i < this.decals.count; i++) {
      this.decalAge[i] += dt;
      const k = Math.min(1, Math.max(0, (this.decalAge[i] - 15) / 10));
      this.decals.setColorAt(i, _c0.setScalar(k)); any = true;
    }
    // multiply blending: colour 0 = full scorch, 1 = invisible.  (texture already white at the rim)
    if (any) this.decals.instanceColor.needsUpdate = true;
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
