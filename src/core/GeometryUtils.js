import * as THREE from '../lib/three.js';

// Helpers for assembling low-poly models out of primitives. Parts are baked with
// vertex colors and merged so one model costs one draw call.

const tmpColor = new THREE.Color();

export function colorize(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  tmpColor.set(color);
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = tmpColor.r;
    arr[i * 3 + 1] = tmpColor.g;
    arr[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function transform(geometry, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  geometry.applyMatrix4(m);
  return geometry;
}

// A colored, positioned primitive ready for merging.
export function part(geometry, color, t) {
  return colorize(transform(geometry, t), color);
}

// Shade a part's vertices with slight random variation, which reads as surface detail.
export function jitterColors(geometry, amount = 0.08) {
  const c = geometry.attributes.color;
  if (!c) return geometry;
  for (let i = 0; i < c.count; i += 3) {
    const k = 1 + (Math.random() * 2 - 1) * amount;
    for (let v = 0; v < 3 && i + v < c.count; v++) {
      c.setXYZ(i + v, c.getX(i + v) * k, c.getY(i + v) * k, c.getZ(i + v) * k);
    }
  }
  return geometry;
}

export function mergeGeometries(list) {
  const geoms = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal', 'color', 'uv'].filter((name) => geoms.every((g) => g.attributes[name]));
  const merged = new THREE.BufferGeometry();
  for (const name of names) {
    const itemSize = geoms[0].attributes[name].itemSize;
    let total = 0;
    for (const g of geoms) total += g.attributes[name].count * itemSize;
    const arr = new Float32Array(total);
    let offset = 0;
    for (const g of geoms) {
      arr.set(g.attributes[name].array, offset);
      offset += g.attributes[name].count * itemSize;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  if (!merged.attributes.normal) merged.computeVertexNormals();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

// Box whose UVs are scaled to world units, so tiling textures keep a constant
// texel density whatever the box dimensions.
export function worldBox(w, h, d, x = 0, y = 0, z = 0, texSize = 1.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // Face order: +x, -x, +y, -y, +z, -z; four vertices per face.
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = dims[face];
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, (uv.getX(i) * su) / texSize, (uv.getY(i) * sv) / texSize);
    }
  }
  g.translate(x, y, z);
  return g;
}
