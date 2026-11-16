// Arena: floor, buildings, props, AABB collision and ray queries.
import * as THREE from 'three';
import { cloneKit, bakeStatic } from './kit.js';

export const ARENA = 170;          // playable half-size (m)
export const solids = [];          // {min: V3, max: V3, kind, ref}
export const barrels = [];         // explosive props {obj, pos, hp, solid}

export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function addSolid(cx, cz, w, d, h, y0 = 0, kind = 'block', ref = null) {
  const s = { min: new THREE.Vector3(cx - w / 2, y0, cz - d / 2), max: new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2), kind, ref };
  solids.push(s);
  return s;
}

// world-space panel shader for buildings / floor
function panelMaterial(color, opts) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP; varying vec3 vWN;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gridLine(float x, float s, float w){ float f = abs(fract(x / s + 0.5) - 0.5) * s; return 1.0 - smoothstep(w * 0.5, w, f); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${opts.frag}`);
  };
  return m;
}

export function buildArena(scene, seed = 3) {
  const rnd = mulberry32(seed);
  solids.length = 0; barrels.length = 0;
  const group = new THREE.Group(); scene.add(group);

  // ---- floor: 4 m concrete tiles with per-tile tone + seams, 16 m darker lane lines
  const floorMat = panelMaterial(0x80848a, {
    rough: 0.92, frag: `
      vec2 cell = floor(vWP.xz / 4.0);
      float tone = 0.9 + 0.12 * h21(cell) + 0.03 * h21(floor(vWP.xz / 1.0));
      diffuseColor.rgb *= tone;
      float seam = max(gridLine(vWP.x, 4.0, 0.08), gridLine(vWP.z, 4.0, 0.08));
      diffuseColor.rgb *= 1.0 - 0.28 * seam;
      float lane = max(gridLine(vWP.x, 32.0, 0.35), gridLine(vWP.z, 32.0, 0.35));
      diffuseColor.rgb *= 1.0 - 0.12 * lane;
      float ed = max(abs(vWP.x), abs(vWP.z));
      float stripe = step(${ARENA.toFixed(1)} - 3.0, ed) * step(ed, ${ARENA.toFixed(1)} - 1.6) * step(0.5, fract((vWP.x + vWP.z) / 4.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.62, 0.08), stripe * 0.9);`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), floorMat);
  floor.receiveShadow = true; group.add(floor);

  // ---- buildings (merged box geometry)
  const bldMat = panelMaterial(0x4a5260, {
    rough: 0.7, metal: 0.25, frag: `
      vec3 n = abs(vWN);
      float hl = gridLine(vWP.y, 3.5, 0.12);
      float vl = n.x > 0.5 ? gridLine(vWP.z, 4.0, 0.1) : (n.z > 0.5 ? gridLine(vWP.x, 4.0, 0.1) : max(gridLine(vWP.x, 4.0, 0.1), gridLine(vWP.z, 4.0, 0.1)));
      float tone = 0.85 + 0.2 * h21(floor(vWP.xz / 6.0) + floor(vWP.y / 3.5));
      diffuseColor.rgb *= tone * (1.0 - 0.35 * max(hl, vl));
      if (n.y < 0.5) { float win = step(0.62, fract(vWP.y / 3.5)) * step(fract(vWP.y / 3.5), 0.82);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.2, 0.26), win * 0.8); }`,
  });
  const boxes = [];
  const free = (x, z, r) => {
    if (Math.hypot(x, z - 120) < 28 || Math.hypot(x, z) < 26) return false;   // spawn + centre plaza
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
  for (const [x, z, w, d] of [[0, -ARENA - 2, ARENA * 2 + 8, 4], [0, ARENA + 2, ARENA * 2 + 8, 4], [-ARENA - 2, 0, 4, ARENA * 2 + 8], [ARENA + 2, 0, 4, ARENA * 2 + 8]]) {
    boxes.push([x, z, w, d, wallH]); addSolid(x, z, w, d, 60, 0, 'wall');
  }
  const skyline = [];
  for (let i = 0; i < 90; i++) {
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
  // a few set pieces round the centre plaza (the original's yellow-striped blocks)
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 34, z = Math.sin(a) * 34;
    place.push({ kit: 'P_Pillar', matrix: M4(x, 0, z, a) }); addSolid(x, z, 2.4, 2.4, 8, 0, 'pillar');
  }
  group.add(bakeStatic(place));
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
  if (!noFloor && d.y < -1e-6) { const t = -o.y / d.y; if (t > 0 && t < best) { best = t; bs = 'floor'; } }
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
