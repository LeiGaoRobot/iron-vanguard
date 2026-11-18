// Arena: floor, buildings, props, AABB collision and ray queries.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { cloneKit, bakeStatic } from './kit.js';

export const WATER = { on: false, y: -50 };   // storm surge: flat water plane at height y (mechs wade slower below it)
export const PLAT = { R: 0 };   // sky elevator: round deck of radius R, void beyond (0 = normal square arena)
export const ARENA = 170;          // playable half-size (m)
export const solids = [];          // {min: V3, max: V3, kind, ref}
export const barrels = [];         // explosive props {obj, pos, hp, solid}
export const relaySites = [];      // objective tower spots (snowfield)
// magma forge: two winding lava rivers (same formula in JS and in the floor shader)
export const LAVA = { on: false, W: 5, uT: { value: 0 } };
export function lavaD(x, z) {
  const fa = 55 * Math.sin(x / 62 + 0.6) - 60, da = Math.abs(z - fa) / Math.sqrt(1 + (55 / 62 * Math.cos(x / 62 + 0.6)) ** 2);
  const fb = 40 * Math.sin(z / 50 + 1.8) + 60, db = Math.abs(x - fb) / Math.sqrt(1 + (40 / 50 * Math.cos(z / 50 + 1.8)) ** 2);
  return Math.min(da, db);
}
export function lavaAt(x, z) { return LAVA.on && lavaD(x, z) < LAVA.W; }

export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function addSolid(cx, cz, w, d, h, y0 = 0, kind = 'block', ref = null) {
  const s = { min: new THREE.Vector3(cx - w / 2, y0, cz - d / 2), max: new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2), kind, ref };
  solids.push(s);
  return s;
}

// world-space panel shader for buildings / floor
function panelMaterial(color, opts) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.1 });
  m.customProgramCacheKey = () => 'panel|' + opts.frag + '|' + (opts.emit || '');   // day / night variants must not share a program
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = LAVA.uT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform float uT;
        float lavaD(vec2 p){ float fa = 55.0 * sin(p.x / 62.0 + 0.6) - 60.0; float da = abs(p.y - fa) / sqrt(1.0 + pow(55.0 / 62.0 * cos(p.x / 62.0 + 0.6), 2.0));
          float fb = 40.0 * sin(p.y / 50.0 + 1.8) + 60.0; float db = abs(p.x - fb) / sqrt(1.0 + pow(40.0 / 50.0 * cos(p.y / 50.0 + 1.8), 2.0)); return min(da, db); }
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
        float gridLine(float x, float s, float w){ float f = abs(fract(x / s + 0.5) - 0.5) * s; return 1.0 - smoothstep(w * 0.5, w, f); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${opts.frag}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${opts.emit || ''}`);
  };
  return m;
}

export function buildArena(scene, seed = 3, env = 'day', road = null, sites = null) {
  const rnd = mulberry32(seed), night = env === 'night', snow = env === 'snow', storm = env === 'storm', desert = env === 'desert' || env === 'dune', dune = env === 'dune', ash = env === 'ash', lunar = env === 'lunar', forge = env === 'forge', autumn = env === 'autumn', cyber = env === 'cyber', abyss = env === 'abyss', jungle = env === 'jungle', toxic = env === 'toxic';
  LAVA.on = forge; const PR = PLAT.R;
  const roadD = (x, z) => {   // distance to the escort road polyline
    let best = 1e9;
    for (let i = 0; road && i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  solids.length = 0; barrels.length = 0; relaySites.length = 0;
  if (snow) relaySites.push(new THREE.Vector3(-104, 0, -40), new THREE.Vector3(96, 0, -64), new THREE.Vector3(-8, 0, -132));
  if (sites) for (const [x, z] of sites) relaySites.push(new THREE.Vector3(x, 0, z));   // capture zones: keep these clear of buildings
  const group = new THREE.Group(); scene.add(group);

  // ---- floor: 4 m concrete tiles with per-tile tone + seams, 16 m darker lane lines
  const floorMat = panelMaterial(0x80848a, {
    rough: storm ? 0.5 : 0.92, metal: storm ? 0.25 : 0.1, frag: `
      vec2 cell = floor(vWP.xz / 4.0);
      float tone = 0.9 + 0.12 * h21(cell) + 0.03 * h21(floor(vWP.xz / 1.0));
      diffuseColor.rgb *= tone;
      float seam = max(gridLine(vWP.x, 4.0, 0.08), gridLine(vWP.z, 4.0, 0.08));
      diffuseColor.rgb *= 1.0 - 0.28 * seam;
      float lane = max(gridLine(vWP.x, 32.0, 0.35), gridLine(vWP.z, 32.0, 0.35));
      diffuseColor.rgb *= 1.0 - 0.12 * lane;
      float ed = max(abs(vWP.x), abs(vWP.z));
      float stripe = step(${ARENA.toFixed(1)} - 3.0, ed) * step(ed, ${ARENA.toFixed(1)} - 1.6) * step(0.5, fract((vWP.x + vWP.z) / 4.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.62, 0.08), stripe * 0.9);${desert ? `
      diffuseColor.rgb *= vec3(1.18, 1.0, 0.74) * (0.94 + 0.12 * h21(floor(vWP.xz / 11.0)));` : ''}${dune ? `
      float drip = 0.5 + 0.5 * sin(vWP.x * 0.55 + vWP.z * 0.2 + sin(vWP.z * 0.08 + vWP.x * 0.03) * 4.0);
      float dbig = 0.5 + 0.5 * sin(vWP.x * 0.045 + sin(vWP.z * 0.03) * 2.0);
      vec3 dsand = vec3(0.78, 0.6, 0.4) * (0.8 + 0.1 * drip + 0.12 * dbig + 0.05 * h21(floor(vWP.xz / 0.5)));
      diffuseColor.rgb = mix(dsand, diffuseColor.rgb, 0.12 + 0.75 * stripe);` : ''}${ash ? `
      diffuseColor.rgb *= vec3(0.62, 0.55, 0.52) * (0.85 + 0.25 * h21(floor(vWP.xz / 6.0)));` : ''}${autumn ? `
      float lfk = smoothstep(0.55, 0.85, h21(floor(vWP.xz / 7.0)) * 0.65 + h21(floor(vWP.xz / 2.3)) * 0.35);
      vec2 lc = floor(vWP.xz / 0.5);
      vec3 leafC = mix(vec3(0.55, 0.16, 0.05), vec3(0.8, 0.52, 0.12), h21(lc + 7.3)) * (0.7 + 0.3 * h21(lc + 2.1));
      diffuseColor.rgb *= vec3(0.78, 0.72, 0.64) * (0.9 + 0.12 * h21(floor(vWP.xz / 9.0)));
      diffuseColor.rgb = mix(diffuseColor.rgb, leafC, lfk * step(0.45, h21(lc)) * (1.0 - stripe) * 0.75);` : ''}${jungle ? `
      float jm = smoothstep(0.35, 0.7, vn2(vWP.xz / 9.0) * 0.65 + vn2(vWP.xz / 2.2) * 0.35);
      vec3 soil = mix(vec3(0.22, 0.17, 0.11), vec3(0.17, 0.29, 0.11), jm) * (0.86 + 0.14 * vn2(vWP.xz / 0.6));
      diffuseColor.rgb = mix(soil, diffuseColor.rgb * vec3(0.62, 0.7, 0.56), 0.18 + 0.55 * stripe);` : ''}${toxic ? `
      float tn = vn2(vWP.xz / 7.0) * 0.6 + vn2(vWP.xz / 2.0) * 0.4;
      vec3 slab = diffuseColor.rgb * vec3(0.62, 0.62, 0.52) * (0.85 + 0.2 * vn2(vWP.xz / 0.8));
      slab = mix(slab, vec3(0.27, 0.21, 0.12), smoothstep(0.45, 0.7, tn) * 0.75);
      float pv = vn2(vWP.xz / 11.0 + 3.7) * 0.75 + vn2(vWP.xz / 3.0) * 0.25;
      float pud = smoothstep(0.69, 0.74, pv);
      slab = mix(slab, vec3(0.2, 0.22, 0.08), smoothstep(0.58, 0.69, pv) * 0.55);
      diffuseColor.rgb = mix(slab, vec3(0.36, 0.5, 0.1), pud * 0.9);` : ''}${cyber ? `
      diffuseColor.rgb = mix(vec3(0.035, 0.03, 0.06) * (0.8 + 0.4 * h21(floor(vWP.xz / 8.0))), diffuseColor.rgb * 0.3, stripe);` : ''}${PR ? `
      float rr = length(vWP.xz), aa = atan(vWP.z, vWP.x);
      diffuseColor.rgb *= vec3(0.86, 0.9, 0.96);
      float rad = 1.0 - smoothstep(0.0, 0.006, abs(fract(aa * 24.0 / 6.2832) - 0.5) * 6.2832 / 24.0 * 0.5);
      float rng = max(gridLine(rr, 24.0, 0.25), 0.0);
      diffuseColor.rgb *= 1.0 - 0.18 * max(rad * step(30.0, rr), rng);
      float edgeK = smoothstep(${(PR - 6).toFixed(1)}, ${(PR - 5.6).toFixed(1)}, rr) * (1.0 - smoothstep(${(PR - 2.4).toFixed(1)}, ${(PR - 2.0).toFixed(1)}, rr));
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.1), vec3(0.9, 0.66, 0.1), step(0.5, fract(aa * 90.0 / 6.2832))), edgeK);` : ''}${abyss ? `
      float rip = 0.5 + 0.5 * sin(vWP.x * 0.9 + sin(vWP.z * 0.13) * 3.0);
      vec3 sand = vec3(0.2, 0.24, 0.21) * (0.82 + 0.1 * rip + 0.1 * h21(floor(vWP.xz / 0.6)) + 0.08 * h21(floor(vWP.xz / 9.0)));
      float weed = smoothstep(0.7, 0.9, h21(floor(vWP.xz / 5.0)) * 0.6 + h21(floor(vWP.xz / 1.4)) * 0.4);
      sand = mix(sand, vec3(0.12, 0.26, 0.2), weed * 0.7);
      diffuseColor.rgb = mix(sand, diffuseColor.rgb * 0.55, 0.15 + 0.65 * stripe);` : ''}${lunar ? `
      vec3 rc = vec3(0.5, 0.5, 0.49) * (0.74 + 0.1 * h21(floor(vWP.xz / 0.7)) + 0.1 * h21(floor(vWP.xz / 5.0)));
      for (int q = 0; q < 2; q++) {
        float sz = q == 0 ? 26.0 : 9.0;
        vec2 cc = floor(vWP.xz / sz) + float(q) * 17.0; vec2 ctr = (floor(vWP.xz / sz) + 0.25 + vec2(h21(cc), h21(cc + 3.7)) * 0.5) * sz;
        float cr = sz * (0.12 + 0.2 * h21(cc + 9.1)) * step(0.35, h21(cc + 5.3));
        float dd = length(vWP.xz - ctr) / max(cr, 0.01);
        float bowl = smoothstep(1.0, 0.45, dd) * 0.32, rim = smoothstep(0.75, 1.0, dd) * smoothstep(1.4, 1.0, dd) * 0.22;
        rc *= 1.0 - bowl + rim;
      }
      diffuseColor.rgb = mix(rc, diffuseColor.rgb * 0.85, 0.16 + 0.7 * stripe);` : ''}${forge ? `
      float ld = lavaD(vWP.xz);
      vec3 bas = vec3(0.13, 0.11, 0.105) * (0.75 + 0.2 * h21(floor(vWP.xz / 1.3)) + 0.15 * h21(floor(vWP.xz / 7.0)));
      bas = mix(bas, vec3(0.12, 0.09, 0.08), smoothstep(9.0, 5.0, ld));
      diffuseColor.rgb = mix(bas, diffuseColor.rgb * 0.6, 0.65 * stripe);
      diffuseColor.rgb *= 1.0 - 0.9 * smoothstep(5.2, 4.6, ld);` : ''}${storm ? `
      float wet = smoothstep(0.55, 0.8, h21(floor(vWP.xz / 9.0)) * 0.6 + h21(floor(vWP.xz / 3.0)) * 0.4);
      diffuseColor.rgb *= 0.46 - 0.2 * wet;` : ''}${snow ? `
      float sn = 0.55 + 0.25 * h21(floor(vWP.xz / 7.0)) + 0.2 * h21(floor(vWP.xz / 1.3));
      float drift = smoothstep(0.25, 0.75, sin(vWP.x * 0.045 + sin(vWP.z * 0.03) * 2.0) * 0.5 + 0.5);
      float cover = clamp(0.8 + 0.17 * drift - 0.35 * stripe, 0.0, 0.97);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.74, 0.8, 0.88), vec3(0.88, 0.91, 0.95), drift) * (0.93 + 0.07 * sn), cover);` : ''}`,
    emit: night ? `
      float ed2 = max(abs(vWP.x), abs(vWP.z));
      float st2 = step(${ARENA.toFixed(1)} - 3.0, ed2) * step(ed2, ${ARENA.toFixed(1)} - 1.6) * step(0.5, fract((vWP.x + vWP.z) / 4.0));
      float ln = max(gridLine(vWP.x, 32.0, 0.25), gridLine(vWP.z, 32.0, 0.25));
      totalEmissiveRadiance += vec3(1.0, 0.62, 0.12) * st2 * 1.6 + vec3(0.25, 0.6, 0.9) * ln * 0.06;` : cyber ? `
      float cg8 = max(gridLine(vWP.x, 8.0, 0.1), gridLine(vWP.z, 8.0, 0.1));
      float cg32 = max(gridLine(vWP.x, 32.0, 0.22), gridLine(vWP.z, 32.0, 0.22));
      float cpl = 0.5 + 0.5 * sin(length(vWP.xz) * 0.06 - uT * 1.6);
      vec2 ccell = floor(vWP.xz / 8.0); float cblk = step(0.93, h21(ccell + floor(uT * 0.5)));
      totalEmissiveRadiance += vec3(0.1, 0.7, 1.0) * cg8 * 0.28 + vec3(1.0, 0.18, 0.8) * cg32 * (0.35 + 0.65 * cpl) + vec3(0.1, 0.5, 0.9) * cblk * 0.05;` : forge ? `
      float lv = lavaD(vWP.xz);
      vec2 fq = vWP.xz * 0.35 + vec2(uT * 0.25, uT * 0.17);
      float fl = 0.55 + 0.25 * sin(fq.x * 2.1 + sin(fq.y * 1.7 + uT * 0.6) * 1.5) + 0.08 * h21(floor(vWP.xz * 1.2 + floor(uT * 2.0)));
      float molten = smoothstep(5.0, 3.6, lv);
      float crust = smoothstep(0.62, 0.9, h21(floor(vWP.xz / 1.6 + vec2(floor(uT * 0.4), 0.0)))) * smoothstep(4.0, 1.5, lv);
      vec3 lc = mix(vec3(0.95, 0.16, 0.02), vec3(1.0, 0.5, 0.1), fl * fl) * (0.75 + 0.7 * fl) * (1.0 - 0.6 * crust);
      float edge = smoothstep(8.0, 5.0, lv) * (1.0 - molten);
      float crack = (1.0 - smoothstep(0.0, 0.06, abs(fract(vWP.x / 5.3 + sin(vWP.z * 0.21) * 0.7) - 0.5))) * step(0.86, h21(floor(vWP.xz / 10.0))) * step(9.0, lv);
      totalEmissiveRadiance += lc * molten + vec3(1.0, 0.32, 0.06) * (edge * 0.25 + crack * 0.45);` : abyss ? `
      vec2 cq = vWP.xz * 0.5; float ct = uT * 0.9;
      float cw = abs(sin(cq.x * 1.3 + sin(cq.y * 0.9 + ct) * 1.4 + ct * 0.7) + sin(cq.y * 1.1 + sin(cq.x * 0.8 - ct * 0.9) * 1.6 - ct * 0.5));
      float cau = 1.0 - smoothstep(0.0, 0.16, cw);
      totalEmissiveRadiance += vec3(0.25, 0.75, 0.85) * cau * 0.16;` : '',
  });
  const floor = new THREE.Mesh(PR ? new THREE.CircleGeometry(PR, 180).rotateX(-Math.PI / 2) : new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), floorMat);
  floor.receiveShadow = true; group.add(floor);
  if (PR) {
    const skirtM = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.6, metalness: 0.6 });
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(PR, PR * 0.9, 9, 120, 1, true).translate(0, -4.5, 0), skirtM));
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(PR * 0.9, PR * 0.35, 26, 120, 1, true).translate(0, -22, 0), skirtM));
    const ribs = [];
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; ribs.push(new THREE.BoxGeometry(2.2, 30, PR * 0.62).translate(0, -20, PR * 0.62).rotateY(a)); }
    const rb = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(ribs), skirtM); group.add(rb);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(PR - 0.6, PR - 0.6, 3.2, 180, 1, true).translate(0, 1.6, 0), new THREE.MeshBasicMaterial({ color: 0x58d8ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    group.add(rail);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(PR - 0.6, 0.12, 6, 180).rotateX(Math.PI / 2).translate(0, 3.2, 0), new THREE.MeshBasicMaterial({ color: 0x9fe8ff })); group.add(lip);
  }

  // ---- buildings (merged box geometry)
  const bldMat = panelMaterial(0x4a5260, {
    rough: 0.7, metal: 0.25, frag: `
      vec3 n = abs(vWN);
      float hl = gridLine(vWP.y, 3.5, 0.12);
      float vl = n.x > 0.5 ? gridLine(vWP.z, 4.0, 0.1) : (n.z > 0.5 ? gridLine(vWP.x, 4.0, 0.1) : max(gridLine(vWP.x, 4.0, 0.1), gridLine(vWP.z, 4.0, 0.1)));
      float tone = 0.85 + 0.2 * h21(floor(vWP.xz / 6.0) + floor(vWP.y / 3.5));
      diffuseColor.rgb *= tone * (1.0 - 0.35 * max(hl, vl));
      if (n.y < 0.5) { float win = step(0.62, fract(vWP.y / 3.5)) * step(fract(vWP.y / 3.5), 0.82);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.2, 0.26), win * 0.8); }${abyss ? `
      diffuseColor.rgb *= vec3(0.5, 0.68, 0.7);
      if (vWN.y > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.3, 0.22), 0.55 + 0.3 * h21(floor(vWP.xz / 1.5)));
      else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.3, 0.24), smoothstep(2.5, 0.0, vWP.y) * 0.7);` : ''}${cyber ? `
      diffuseColor.rgb *= 0.3;` : ''}${toxic ? `
      diffuseColor.rgb *= vec3(0.78, 0.74, 0.62);
      float rs = smoothstep(0.55, 0.85, vn2(vec2(vWP.x + vWP.z, vWP.y * 2.0) / 1.8));
      if (vWN.y < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.4, 0.26, 0.14), max(rs * 0.5, smoothstep(2.0, 0.0, vWP.y) * 0.55));` : ''}${jungle ? `
      diffuseColor.rgb *= vec3(0.74, 0.74, 0.64);
      float mo = smoothstep(0.5, 0.8, vn2(vec2(vWP.x + vWP.z, vWP.y) / 2.5));
      if (vWN.y > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.32, 0.12), 0.75);
      else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.32, 0.14), max(smoothstep(4.0, 0.0, vWP.y) * 0.8, mo * 0.4));` : ''}${snow ? `
      if (vWN.y > 0.5) diffuseColor.rgb = vec3(0.84, 0.88, 0.93) * (0.92 + 0.08 * h21(floor(vWP.xz / 2.0)));
      else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.85, 0.9), step(0.5, fract(vWP.y / 3.5 + 0.38)) * step(fract(vWP.y / 3.5 + 0.38), 0.53) * 0.75);` : ''}`,
    emit: night ? `
      if (abs(vWN.y) < 0.5) {
        float fy = fract(vWP.y / 3.5); float wn = step(0.62, fy) * step(fy, 0.82);
        float hx = fract((vWP.x + vWP.z) / 2.0); wn *= step(0.18, hx) * step(hx, 0.82);
        vec2 cid = vec2(floor((vWP.x + vWP.z) / 2.0), floor(vWP.y / 3.5));
        float lit = step(0.6, h21(cid));
        vec3 wc = mix(vec3(1.0, 0.72, 0.38), vec3(0.55, 0.82, 1.0), step(0.55, h21(cid + 7.3)));
        totalEmissiveRadiance += wc * wn * lit * (0.35 + 0.55 * h21(cid + 3.1));
      }` : cyber ? `
      vec3 cn2 = abs(vWN);
      float ch2 = gridLine(vWP.y, 3.5, 0.07);
      float cv2 = cn2.x > 0.5 ? gridLine(vWP.z, 4.0, 0.06) : (cn2.z > 0.5 ? gridLine(vWP.x, 4.0, 0.06) : 0.0);
      vec2 ccid = vec2(floor((vWP.x + vWP.z) / 4.0), floor(vWP.y / 3.5));
      vec3 clc = mix(vec3(0.1, 0.7, 1.0), vec3(1.0, 0.2, 0.8), step(0.72, h21(ccid)));
      totalEmissiveRadiance += clc * max(ch2, cv2) * (0.12 + 0.45 * step(0.55, h21(ccid + 2.0)));` : '',
  });
  const boxes = [];
  const free = (x, z, r) => {
    if (PR && Math.hypot(x, z) > PR - 16 - r) return false;
    if (Math.hypot(x, z - 120) < 28 || Math.hypot(x, z) < 26) return false;   // spawn + centre plaza
    if (road && roadD(x, z) < 11 + r) return false;
    if (forge && lavaD(x, z) < 9 + r) return false;
    for (const q of relaySites) if (Math.hypot(x - q.x, z - q.z) < 18 + r) return false;
    for (const s of solids) {
      if (x + r > s.min.x - 6 && x - r < s.max.x + 6 && z + r > s.min.z - 6 && z - r < s.max.z + 6) return false;
    }
    return true;
  };
  let tries = 0;
  while (boxes.length < 30 && tries++ < 2000) {
    const w = 10 + Math.floor(rnd() * 4) * 4, d = 10 + Math.floor(rnd() * 4) * 4;
    const h = 7 + Math.floor(rnd() * 6) * 3.5;
    const x = Math.round(((rnd() * 2 - 1) * (ARENA - 25)) / 4) * 4, z = Math.round(((rnd() * 2 - 1) * (ARENA - 25)) / 4) * 4;
    if (!free(x, z, Math.max(w, d) / 2)) continue;
    boxes.push([x, z, w, d, h]); addSolid(x, z, w, d, h, 0, 'building');
    if (rnd() < 0.35) {   // roof block
      const w2 = w * 0.5, d2 = d * 0.5, h2 = 3.5 + rnd() * 4;
      boxes.push([x, z, w2, d2, h2, h]); addSolid(x, z, w2, d2, h2, h, 'building');
    }
  }
  // perimeter wall + far skyline (not playable)
  const wallH = 14;
  if (!PR) for (const [x, z, w, d] of [[0, -ARENA - 2, ARENA * 2 + 8, 4], [0, ARENA + 2, ARENA * 2 + 8, 4], [-ARENA - 2, 0, 4, ARENA * 2 + 8], [ARENA + 2, 0, 4, ARENA * 2 + 8]]) {
    boxes.push([x, z, w, d, wallH]); addSolid(x, z, w, d, 60, 0, 'wall');
  }
  const skyline = [];
  for (let i = 0; i < (PR ? 0 : 90); i++) {
    const a = rnd() * Math.PI * 2, r = 260 + rnd() * 260;
    skyline.push([Math.cos(a) * r, Math.sin(a) * r, 14 + rnd() * 30, 14 + rnd() * 30, 10 + rnd() * 60]);
  }
  const geos = [];
  for (const b of [...boxes, ...skyline]) {
    const [x, z, w, d, h, y0 = 0] = b;
    geos.push(new THREE.BoxGeometry(w, h, d).translate(x, y0 + h / 2, z));
  }
  const merged = mergeBoxes(geos);
  const bld = new THREE.Mesh(merged, bldMat); bld.castShadow = true; bld.receiveShadow = true; group.add(bld);

  // ---- kit props (baked)
  const place = [];
  const M4 = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
  const scatter = (n, r, fn) => {
    let k = 0, t = 0;
    while (k < n && t++ < 3000) {
      const x = (rnd() * 2 - 1) * (ARENA - 12), z = (rnd() * 2 - 1) * (ARENA - 12);
      if (!free(x, z, r)) continue;
      fn(x, z); k++;
    }
  };
  scatter(16, 2, (x, z) => { place.push({ kit: 'P_Pillar', matrix: M4(x, 0, z) }); addSolid(x, z, 2, 2, 8, 0, 'pillar'); });
  scatter(18, 4, (x, z) => {
    const rot = rnd() < 0.5 ? 0 : Math.PI / 2, w = rot ? 2.5 : 5, d = rot ? 5 : 2.5;
    place.push({ kit: 'P_Crate', matrix: M4(x, 0, z, rot) }); addSolid(x, z, w, d, 2.5, 0, 'crate');
    if (rnd() < 0.4) { place.push({ kit: 'P_Crate', matrix: M4(x, 2.5, z, rot) }); addSolid(x, z, w, d, 2.5, 2.5, 'crate'); }
  });
  scatter(22, 2.5, (x, z) => {
    const rot = rnd() < 0.5 ? 0 : Math.PI / 2;
    place.push({ kit: 'P_Barrier', matrix: M4(x, 0, z, rot) }); addSolid(x, z, rot ? 0.9 : 3, rot ? 3 : 0.9, 1.1, 0, 'barrier');
  });
  if (toxic) {   // chemical works: storage tanks (solid) and drum stacks
    scatter(16, 5, (x, z) => { place.push({ kit: 'P_Tank', matrix: M4(x, 0, z, rnd() * 6.28, 0.9 + rnd() * 0.25) }); addSolid(x, z, 6.2, 6.2, 8, 0, 'tank'); });
    scatter(30, 2, (x, z) => { place.push({ kit: 'P_Drums', matrix: M4(x, 0, z, rnd() * 6.28, 1) }); addSolid(x, z, 2.2, 2.2, 1.2, 0, 'drums'); });
  }
  if (jungle) {   // rainforest: big trees (solid trunks), ferns underneath
    scatter(44, 3, (x, z) => { place.push({ kit: 'P_JTree', matrix: M4(x, 0, z, rnd() * 6.28, 1.0 + rnd() * 0.35) }); addSolid(x, z, 2.6, 2.6, 15, 0, 'tree'); });
    scatter(36, 2.5, (x, z) => { place.push({ kit: 'P_JTree2', matrix: M4(x, 0, z, rnd() * 6.28, 0.9 + rnd() * 0.3) }); addSolid(x, z, 2.0, 2.0, 10, 0, 'tree'); });
    scatter(70, 1.5, (x, z) => { place.push({ kit: 'P_Fern', matrix: M4(x, 0, z, rnd() * 6.28, 0.8 + rnd() * 0.8) }); });
  }
  // a few set pieces round the centre plaza (the original's yellow-striped blocks)
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 34, z = Math.sin(a) * 34;
    place.push({ kit: 'P_Pillar', matrix: M4(x, 0, z, a) }); addSolid(x, z, 2.4, 2.4, 8, 0, 'pillar');
  }
  group.add(bakeStatic(place));
  if (road && road.rail) {   // rail loop: gravel ballast bed, timber sleepers, two steel rails
    const bal = [], slp = [], rl = [];
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1], L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, px = Math.cos(yaw), pz = -Math.sin(yaw);
      bal.push(new THREE.BoxGeometry(5.2, 0.22, L + 0.6).rotateY(yaw).translate(cx, 0.08, cz));
      for (const sd of [-0.75, 0.75]) rl.push(new THREE.BoxGeometry(0.16, 0.2, L + 0.12).rotateY(yaw).translate(cx + px * sd, 0.36, cz + pz * sd));
      for (let d = 0.4; d < L; d += 1.25) slp.push(new THREE.BoxGeometry(2.7, 0.14, 0.32).rotateY(yaw).translate(ax + (bx - ax) * d / L, 0.24, az + (bz - az) * d / L));
    }
    const bm = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(bal), new THREE.MeshStandardMaterial({ color: 0x6a645c, roughness: 1 })); bm.receiveShadow = true; group.add(bm);
    const sm = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(slp), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 })); sm.receiveShadow = true; group.add(sm);
    const rm = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(rl), new THREE.MeshStandardMaterial({ color: 0x9a9ca0, roughness: 0.35, metalness: 0.85 })); rm.castShadow = true; group.add(rm);
  } else if (road) {   // asphalt strip + dashed centre line, laid just above the floor
    const geos = [], dash = [];
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1], L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      geos.push(new THREE.PlaneGeometry(10, L + 10).rotateX(-Math.PI / 2).rotateY(yaw).translate((ax + bx) / 2, 0.03 + i * 0.002, (az + bz) / 2));
      for (let d = 4; d < L - 2; d += 9) dash.push(new THREE.PlaneGeometry(0.4, 4).rotateX(-Math.PI / 2).rotateY(yaw).translate(ax + (bx - ax) * d / L, 0.06, az + (bz - az) * d / L));
    }
    const rm = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: desert ? 0x5a5048 : 0x3a3c40, roughness: 0.95 }));
    rm.receiveShadow = true; group.add(rm);
    group.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(dash), new THREE.MeshStandardMaterial({ color: 0xd8c070, roughness: 0.8 })));
  }
  // explosive barrels (dynamic)
  scatter(14, 2, (x, z) => {
    const o = cloneKit('P_Barrel'); o.position.set(x, 0, z); o.rotation.y = rnd() * 6; group.add(o);
    const s = addSolid(x + 0.45, z + 0.35, 2.2, 2.2, 1.4, 0, 'barrel');
    const b = { obj: o, pos: new THREE.Vector3(x + 0.45, 0.8, z + 0.35), hp: 40, solid: s, dead: false };
    s.ref = b; barrels.push(b);
  });
  return group;
}

function mergeBoxes(geos) {
  let n = 0, ni = 0;
  for (const g of geos) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    const I = g.index.array; for (let i = 0; i < I.length; i++) idx[oi + i] = I[i] + o;
    o += g.attributes.position.count; oi += I.length;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

export function removeSolid(s) { const i = solids.indexOf(s); if (i >= 0) solids.splice(i, 1); }

// highest walkable surface under (x,z) not above yRef + step
export function groundAt(x, z, yRef, r = 0) {
  let h = 0;
  for (const s of solids) {
    if (x + r * 0.5 < s.min.x || x - r * 0.5 > s.max.x || z + r * 0.5 < s.min.z || z - r * 0.5 > s.max.z) continue;
    if (s.max.y <= yRef + 0.7 && s.max.y > h) h = s.max.y;
  }
  return h;
}

// push a vertical cylinder (feet at p) out of solids; returns true if it touched something
export function collideCyl(p, r, height) {
  let hit = false;
  for (const s of solids) {
    if (p.y >= s.max.y - 0.7 || p.y + height <= s.min.y) continue;
    const cx = Math.max(s.min.x, Math.min(p.x, s.max.x)), cz = Math.max(s.min.z, Math.min(p.z, s.max.z));
    let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k;
    } else {   // centre inside: push out along the shallowest axis
      const ex = [p.x - s.min.x, s.max.x - p.x, p.z - s.min.z, s.max.z - p.z];
      const m = Math.min(...ex), i = ex.indexOf(m);
      if (i === 0) p.x = s.min.x - r; else if (i === 1) p.x = s.max.x + r; else if (i === 2) p.z = s.min.z - r; else p.z = s.max.z + r;
    }
  }
  return hit;
}

export function pointInSolid(p, pad = 0) {
  for (const s of solids) {
    if (p.x > s.min.x - pad && p.x < s.max.x + pad && p.y > s.min.y - pad && p.y < s.max.y + pad && p.z > s.min.z - pad && p.z < s.max.z + pad) return s;
  }
  return null;
}

// ray vs solids + floor; returns {t, solid}
export function raySolids(o, d, maxT, noFloor = false) {
  let best = maxT, bs = null;
  if (!noFloor && d.y < -1e-6) { const t = -o.y / d.y; if (t > 0 && t < best && (!PLAT.R || Math.hypot(o.x + d.x * t, o.z + d.z * t) < PLAT.R)) { best = t; bs = 'floor'; } }
  for (const s of solids) {
    let t0 = 0, t1 = best;
    for (const ax of ['x', 'y', 'z']) {
      const inv = 1 / (d[ax] || 1e-9);
      let a = (s.min[ax] - o[ax]) * inv, b = (s.max[ax] - o[ax]) * inv;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < best && t0 > 0) { best = t0; bs = s; }
  }
  return { t: best, solid: bs };
}

// line of sight between two points
export function clearLine(a, b) {
  const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); d.divideScalar(L);
  return raySolids(a, d, L - 0.5).solid === null;
}
