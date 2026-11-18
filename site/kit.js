// Kit loading, cloning, recolouring and static baking.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export const KIT = {};

export async function loadKit(url) {
  let buf;
  if (window.__MA_KIT_LOAD) {   // WeChat mini-game build: the host hands over the GLB bytes
    buf = await window.__MA_KIT_LOAD();
  } else if (window.__MA_KIT) {
    const b64 = window.__MA_KIT.split(',')[1];
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    buf = u8.buffer;
  } else {
    buf = await (await fetch(url)).arrayBuffer();
  }
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
    }
  });
  return KIT;
}

export function cloneKit(name) {
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

// Replace named materials with recoloured copies (cached per palette).
const recolorCache = new Map();
export function recolor(root, palette, key) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const base = o.material.userData.base || o.material;
    const col = palette[base.name];
    if (!col) return;
    const k = key + '|' + base.name;
    let m = recolorCache.get(k);
    if (!m) {
      m = base.clone(); m.userData.base = base;
      m.color.set(col);
      if (palette[base.name + 'Emit']) m.emissive.set(palette[base.name + 'Emit']);
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
