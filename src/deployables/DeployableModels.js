import * as THREE from '../lib/three.js';
import { part, mergeGeometries, jitterColors, worldBox } from '../core/GeometryUtils.js';
import { getTexture } from '../core/Textures.js';

// Visual models for deployables. Static parts are merged per model; animated parts
// (fire, furnace glow) are kept separate in group.userData.flame.

const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
let planks = null;
const geometryCache = {};

function cached(key, build) {
  geometryCache[key] ??= build();
  return geometryCache[key];
}

function flameGroup() {
  const g = new THREE.Group();
  const outer = new THREE.MeshBasicMaterial({ color: 0xff9a30, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const inner = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const big = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 7), outer);
  big.position.y = 0.32;
  const a = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 6), outer);
  a.position.set(0.12, 0.25, 0.05);
  const b = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 6), outer);
  b.position.set(-0.1, 0.23, -0.06);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), inner);
  core.position.y = 0.24;
  g.add(big, a, b, core);
  g.visible = false;
  return g;
}

const BUILDERS = {
  campfire() {
    const g = new THREE.Group();
    const geo = cached('campfire', () => {
      const parts = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        parts.push(part(new THREE.DodecahedronGeometry(0.14, 0), '#8a857d', { x: Math.cos(a) * 0.46, y: 0.07, z: Math.sin(a) * 0.46, sy: 0.7, ry: a }));
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        parts.push(part(new THREE.CylinderGeometry(0.05, 0.06, 0.75, 6), '#6b4a2b', { x: Math.cos(a) * 0.13, y: 0.24, z: Math.sin(a) * 0.13, rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6 }));
      }
      parts.push(part(new THREE.CylinderGeometry(0.3, 0.32, 0.04, 10), '#2a2420', { y: 0.02 }));
      return mergeGeometries(parts.map((p) => jitterColors(p, 0.08)));
    });
    g.add(new THREE.Mesh(geo, vc));
    const flame = flameGroup();
    g.add(flame);
    g.userData.flame = flame;
    return g;
  },

  furnace() {
    const g = new THREE.Group();
    const geo = cached('furnace', () => mergeGeometries([
      part(new THREE.CylinderGeometry(0.46, 0.6, 1.25, 8), '#8d8780', { y: 0.62 }),
      part(new THREE.CylinderGeometry(0.3, 0.46, 0.32, 8), '#7d776f', { y: 1.4 }),
      part(new THREE.CylinderGeometry(0.12, 0.13, 0.45, 6), '#5c5751', { y: 1.75 }),
      part(new THREE.BoxGeometry(0.44, 0.36, 0.12), '#1d1612', { y: 0.45, z: 0.52 }),
      part(new THREE.BoxGeometry(0.5, 0.06, 0.16), '#4c4844', { y: 0.66, z: 0.52 }),
    ].map((p) => jitterColors(p, 0.06))));
    g.add(new THREE.Mesh(geo, vc));
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.26, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xff7a22 }),
    );
    glow.position.set(0, 0.45, 0.585);
    glow.visible = false;
    g.add(glow);
    g.userData.flame = glow;
    return g;
  },

  wooden_box() {
    const g = new THREE.Group();
    planks ??= new THREE.MeshLambertMaterial({ map: getTexture('planks') });
    const body = new THREE.Mesh(cached('box', () => worldBox(1.0, 0.6, 0.62, 0, 0.3, 0, 0.7)), planks);
    const trim = new THREE.Mesh(cached('boxTrim', () => mergeGeometries([
      part(new THREE.BoxGeometry(1.03, 0.06, 0.65), '#3c3f42', { y: 0.58 }),
      part(new THREE.BoxGeometry(0.12, 0.1, 0.04), '#8d9398', { y: 0.5, z: 0.32 }),
    ])), vc);
    g.add(body, trim);
    return g;
  },

  sleeping_bag() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(cached('bag', () => mergeGeometries([
      part(new THREE.BoxGeometry(0.85, 0.14, 1.9), '#3f6b8c', { y: 0.07 }),
      part(new THREE.BoxGeometry(0.83, 0.05, 1.2), '#35607e', { y: 0.16, z: 0.32 }),
      part(new THREE.BoxGeometry(0.66, 0.12, 0.34), '#c9b48a', { y: 0.16, z: -0.72 }),
    ])), vc));
    return g;
  },

  workbench() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(cached('workbench', () => mergeGeometries([
      part(new THREE.BoxGeometry(2.0, 0.12, 1.0), '#9a6a3a', { y: 0.92 }),
      part(new THREE.BoxGeometry(0.1, 0.9, 0.1), '#6b4a2b', { x: -0.9, y: 0.45, z: -0.42 }),
      part(new THREE.BoxGeometry(0.1, 0.9, 0.1), '#6b4a2b', { x: 0.9, y: 0.45, z: -0.42 }),
      part(new THREE.BoxGeometry(0.1, 0.9, 0.1), '#6b4a2b', { x: -0.9, y: 0.45, z: 0.42 }),
      part(new THREE.BoxGeometry(0.1, 0.9, 0.1), '#6b4a2b', { x: 0.9, y: 0.45, z: 0.42 }),
      part(new THREE.BoxGeometry(1.8, 0.05, 0.8), '#7a5230', { y: 0.3 }),
      part(new THREE.BoxGeometry(0.22, 0.18, 0.2), '#4c5054', { x: -0.7, y: 1.06, z: 0.3 }),
      part(new THREE.BoxGeometry(0.3, 0.05, 0.08), '#6c7074', { x: -0.7, y: 1.12, z: 0.3 }),
      part(new THREE.BoxGeometry(0.5, 0.04, 0.12), '#8d9398', { x: 0.3, y: 1.0, z: -0.1, ry: 0.4 }),
      part(new THREE.BoxGeometry(0.06, 0.04, 0.3), '#6b4a2b', { x: 0.62, y: 1.0, z: 0.25 }),
      part(new THREE.BoxGeometry(0.16, 0.08, 0.08), '#4c5054', { x: 0.62, y: 1.02, z: 0.42 }),
      part(new THREE.BoxGeometry(1.9, 0.6, 0.05), '#7a5230', { y: 1.3, z: -0.47 }),
    ].map((p) => jitterColors(p, 0.05)))), vc));
    return g;
  },

  recycler() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(cached('recycler', () => mergeGeometries([
      part(new THREE.BoxGeometry(1.8, 1.15, 1.35), '#4f6b3a', { y: 0.58 }),
      part(new THREE.BoxGeometry(1.0, 0.5, 0.8), '#3c5230', { y: 1.4, z: -0.1 }),
      part(new THREE.BoxGeometry(1.2, 0.08, 1.0), '#2f3f26', { y: 1.66, z: -0.1 }),
      part(new THREE.BoxGeometry(1.82, 0.12, 1.37), '#c9a14a', { y: 0.95 }),
      part(new THREE.BoxGeometry(1.82, 0.12, 1.37), '#c9a14a', { y: 0.2 }),
      part(new THREE.BoxGeometry(0.7, 0.08, 0.5), '#3a3a36', { y: 0.5, z: 0.85 }),
      part(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), '#5c5751', { x: 0.7, y: 1.5, z: 0.4 }),
      part(new THREE.BoxGeometry(0.2, 0.12, 0.04), '#b8322a', { x: -0.5, y: 0.75, z: 0.69 }),
    ])), vc));
    return g;
  },
};

export function buildDeployableModel(type) {
  const g = BUILDERS[type]();
  g.traverse((o) => {
    if (o.isMesh && o.material.blending !== THREE.AdditiveBlending && o.material.isMeshLambertMaterial) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
