// Kit loading, cloning, recolouring and static baking.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export const KIT = {};

// Surface wear for kit materials: object-space smudge noise (moves with the part), matching roughness breakup and a
// little ground dust on whatever sits near y = 0. Glow materials are left clean. Material.clone() drops
// onBeforeCompile, so recolour copies get it re-applied.
const WEAR_PARS = `varying vec3 vKO; varying float vKY;
  float kh(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float kn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(kh(i), kh(i + vec3(1,0,0)), f.x), mix(kh(i + vec3(0,1,0)), kh(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(kh(i + vec3(0,0,1)), kh(i + vec3(1,0,1)), f.x), mix(kh(i + vec3(0,1,1)), kh(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
// Mech armour (panel = true): plate seams on a metric grid in the part's own frame (vKL = local position times the
// part's world scale, so seams keep a constant size on stretched boxes and move with the part), per-plate tone
// variation and a few dark access hatches. Seam spacing ~0.46 x 0.36 m, staggered rows, some plates merged.
const PANEL_FRAG = `
        vec3 kpN = abs(normalize(vKN));
        vec2 kpU = kpN.x > kpN.y && kpN.x > kpN.z ? vKL.yz : (kpN.y > kpN.z ? vKL.xz : vKL.xy);
        kpU += vec2(kh(floor(vKS * 31.0)), kh(floor(vKS * 53.0) + 2.0)) * 0.37;
        vec2 kpG = kpU / vec2(0.46, 0.36);
        float kpR = floor(kpG.y);
        kpG.x += kh(vec3(kpR, 7.0, 3.0)) * 0.9;
        vec2 kpI = floor(kpG), kpF = fract(kpG);
        float kpH = kh(vec3(kpI, kpR * 0.37 + 1.7));
        vec2 kpD = min(kpF, 1.0 - kpF) * vec2(0.46, 0.36);
        float kpX = kh(vec3(kpI + vec2(0.5, 0.0), 9.1)) < 0.35 ? 1.0 : kpD.x;
        float kpE = min(kpX, kpD.y);
        float kpW = max(fwidth(kpU.x), fwidth(kpU.y));
        float kpL = 1.0 - smoothstep(0.004, 0.004 + kpW * 1.2, kpE);
        float kpB = (1.0 - smoothstep(0.0, 0.03 + kpW, kpE)) * 0.5;
        vec2 kpC = abs(kpF - vec2(0.5)) * vec2(0.46, 0.36);
        float kpV = kpH > 0.93 ? (1.0 - smoothstep(0.07, 0.075 + kpW, max(kpC.x, kpC.y * 1.6))) : 0.0;
        diffuseColor.rgb *= (0.955 + 0.09 * kpH) * (1.0 - 0.5 * kpL - 0.08 * kpB) * (1.0 - 0.45 * kpV);
        kpSeam = max(kpL, kpV);`;
// Camouflage over the primary armour (CAMO 1 digital, 2 tiger, 3 splinter, 4 hex) in the same per-part face frame
// as the seams. uCa = second tone (the palette's Armor2), uCb = dark tone; applied as a ratio to the base colour so
// the wear, seam and tone variation already multiplied into diffuseColor survive.
const CAMO_FRAG = `
        vec2 kcU = kpU; float kcA = 0.0, kcB = 0.0;
#if CAMO == 1
        vec2 kcP = floor(kcU / 0.1);
        float kcN = kn(vec3(kcP * 0.17, 1.3)) * 0.72 + kh(vec3(kcP, 4.1)) * 0.28;
        kcA = step(0.47, kcN); kcB = step(0.63, kcN);
#elif CAMO == 2
        float kcS = sin(dot(kcU, vec2(2.4, 6.2)) + kn(vec3(kcU * 1.3, 2.7)) * 6.0);
        float kcF = fwidth(kcS);
        kcB = smoothstep(0.45 - kcF, 0.45 + kcF, kcS) * step(0.3, kn(vec3(kcU * 0.9, 8.1)));
#elif CAMO == 3
        vec2 kr1 = mat2(0.8, 0.6, -0.6, 0.8) * kcU / 0.5, kr2 = mat2(0.34, -0.94, 0.94, 0.34) * kcU / 0.37;
        float kcN = kh(vec3(floor(kr1), 5.0)) * 0.62 + kh(vec3(floor(kr2), 6.0)) * 0.38;
        kcA = step(0.42, kcN); kcB = step(0.7, kcN);
#elif CAMO == 4
        vec2 kq = kcU / 0.16, kr = vec2(1.0, 1.7320508), kh2 = kr * 0.5;
        vec2 ka = mod(kq, kr) - kh2, kb = mod(kq - kh2, kr) - kh2;
        vec2 kg = dot(ka, ka) < dot(kb, kb) ? ka : kb, kag = abs(kg);
        float ke = 0.5 - max(dot(kag, vec2(0.5, 0.8660254)), kag.x), kfw = fwidth(kq.x) * 1.2;
        kcA = step(0.62, kh(vec3(floor((kq - kg) * 2.0 + 0.5), 7.0)));
        kcB = (1.0 - smoothstep(0.035, 0.035 + kfw, ke)) * 0.85;
#endif
        vec3 kcBase = max(diffuse, vec3(0.012));
        vec3 kcT = mix(vec3(1.0), uCa / kcBase, kcA);
        diffuseColor.rgb *= mix(kcT, uCb / kcBase, kcB);`;
export function addWear(m, panel = false, camo = 0, cols = null) {
  if (!m || !m.isMeshStandardMaterial || m.userData.glow || m.userData.wear) return m;
  m.userData.wear = true;
  if (!panel) camo = 0;
  m.customProgramCacheKey = () => (panel ? 'kitwearP' + (camo || '') : 'kitwear');
  const PV = ' varying vec3 vKL; varying vec3 vKN; varying vec3 vKS;';
  m.onBeforeCompile = (sh) => {
    if (camo) { sh.uniforms.uCa = { value: cols.a }; sh.uniforms.uCb = { value: cols.b }; }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKO; varying float vKY;' + (panel ? PV : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\nvKO = transformed; vKY = (modelMatrix * vec4(transformed, 1.0)).y;' +
        (panel ? ' vKS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)); vKL = transformed * vKS; vKN = objectNormal;' : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WEAR_PARS + (panel ? PV : '') + (camo ? `\n#define CAMO ${camo}\nuniform vec3 uCa; uniform vec3 uCb;` : ''))
      .replace('#include <color_fragment>', `#include <color_fragment>
        float kwA = kn(vKO * 2.3) * 0.55 + kn(vKO * 7.1 + 11.0) * 0.3 + kn(vKO * 19.0 + 5.0) * 0.15;
        float kwL = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
        diffuseColor.rgb *= 1.0 - (0.04 + 0.06 * kwL) * smoothstep(0.35, 0.8, kwA);
        float kwD = (1.0 - smoothstep(0.0, 0.8, vKY)) * (0.55 + 0.45 * kn(vKO * 4.0 + 3.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.3, 0.27) * (0.6 + 0.4 * kwL), kwD * 0.22);
        float kpSeam = 0.0;` + (panel ? PANEL_FRAG : '') + (camo ? CAMO_FRAG : ''))
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.8 + 0.45 * kwA) + kwD * 0.2 + kpSeam * 0.3, 0.04, 1.0);`);
  };
  m.needsUpdate = true;
  return m;
}

// Single-file builds embed the GLBs gzip-compressed (kit.glb 9.4 MB -> 0.8 MB): data:application/gzip URIs are
// inflated with DecompressionStream, plain data:model/gltf-binary URIs are used as they are.
async function uriBytes(uri) {
  const bin = atob(uri.split(',')[1]); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  if (!uri.startsWith('data:application/gzip')) return u8.buffer;
  return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

export async function loadKit(url) {
  let buf;
  if (window.__MA_KIT_LOAD) {   // WeChat mini-game build: the host hands over the GLB bytes
    buf = await window.__MA_KIT_LOAD();
  } else if (window.__MA_KIT) {
    buf = await uriBytes(window.__MA_KIT);
  } else {
    buf = await (await fetch(url)).arrayBuffer();
  }
  return parseKit(buf);
}

// Swappable mech parts (parts.glb, built by build_parts.py): same Kit_ contract, loaded on top of the main kit.
// Optional: the WeChat build has no parts file and just keeps the standard parts.
export async function loadParts(url) {
  try {
    let buf;
    if (window.__MA_PARTS) buf = await uriBytes(window.__MA_PARTS);
    else if (window.__MA_KIT_LOAD) return KIT;
    else buf = await (await fetch(url)).arrayBuffer();
    return await parseKit(buf);
  } catch (e) { console.warn('parts not loaded', e); return KIT; }
}

async function parseKit(buf) {
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  for (const o of gltf.scene.children) {
    if (o.name.startsWith('Kit_')) KIT[o.name.slice(4)] = o;
  }
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material;
      if (m.emissive && m.emissive.getHex() !== 0) { o.castShadow = false; m.userData.glow = true; m.toneMapped = false; }
      m.envMapIntensity = 0.9;
      addWear(m);
    }
  });
  return KIT;
}

export function cloneKit(name) {
  if (!KIT[name]) throw new Error('kit missing: ' + name);
  const c = KIT[name].clone(true);
  c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
  c.userData.kit = name;
  return c;
}

export function find(root, prefix) {
  let r = null;
  root.traverse((o) => { if (!r && o.name.startsWith(prefix)) r = o; });
  return r;
}

export function nodes(root) {
  const n = {};
  root.traverse((o) => { if (!o.isMesh) n[o.name.replace(/\.\d+$/, '').replace(/_\d+$/, '')] = n[o.name.replace(/\.\d+$/, '').replace(/_\d+$/, '')] || o; });
  return n;
}

// Replace named materials with recoloured copies (cached per palette). mech = true (player / AI mechs and their
// weapons) also copies the unpainted materials so armour gets panel seams and the glow strips are dimmed: at the
// kit strengths (Visor 6, NozzleGlow 4) they sit far above the bloom threshold and read as white neon tubes.
const recolorCache = new Map();
const PANEL_MATS = new Set(['Armor', 'Armor2', 'Accent']);
const MECH_GLOW = { Visor: 0.28, NozzleGlow: 0.5 };
export function recolor(root, palette, key, mech = false, camo = 0) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const base = o.material.userData.base || o.material;
    const col = palette[base.name];
    if (!col && !mech) return;
    const cm = mech && camo && base.name === 'Armor' ? camo : 0;
    const k = key + '|' + base.name + (mech ? '|m' : '') + (cm ? '|c' + cm : '');
    let m = recolorCache.get(k);
    if (!m) {
      m = base.clone(); m.userData.base = base;
      if (col) m.color.set(col);
      if (palette[base.name + 'Emit']) m.emissive.set(palette[base.name + 'Emit']);
      if (mech && base.userData.glow && MECH_GLOW[base.name]) m.emissiveIntensity = base.emissiveIntensity * MECH_GLOW[base.name];
      const cols = cm ? { a: new THREE.Color(palette.Armor2 || '#888888'), b: new THREE.Color(palette.Armor || '#888888').multiplyScalar(0.2) } : null;
      m.userData.wear = false; addWear(m, mech && PANEL_MATS.has(base.name), cm, cols);
      recolorCache.set(k, m);
    }
    o.material = m;
  });
}

// Bake a list of {kit, matrix} placements into one merged mesh per material.
export function bakeStatic(placements) {
  const byMat = new Map();
  for (const p of placements) {
    const c = cloneKit(p.kit);
    c.updateMatrixWorld(true);
    c.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(p.matrix, o.matrixWorld));
      const m = o.material;
      if (!byMat.has(m)) byMat.set(m, []);
      byMat.get(m).push(g);
    });
  }
  const group = new THREE.Group();
  for (const [m, gs] of byMat) {
    const mesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(gs), m);
    mesh.castShadow = !m.userData.glow; mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
