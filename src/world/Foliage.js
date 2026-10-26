import * as THREE from '../lib/three.js';
import { part, mergeGeometries } from '../core/GeometryUtils.js';
import { getTexture } from '../core/Textures.js';

// Decorative grass tufts and shrubs. Purely visual: no colliders, no interaction.

// Three crossed quads, each duplicated with reversed winding so both faces are
// front faces with upward normals (DoubleSide would darken the back faces).
function grassTuft() {
  const positions = [];
  const uvs = [];
  const w = 0.42;
  const h = 0.6;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const dx = Math.cos(a) * w;
    const dz = Math.sin(a) * w;
    const quad = [
      [-dx, 0, -dz, 0, 0], [dx, 0, dz, 1, 0], [dx, h, dz, 1, 1],
      [-dx, 0, -dz, 0, 0], [dx, h, dz, 1, 1], [-dx, h, -dz, 0, 1],
    ];
    for (const order of [quad, [...quad].reverse()]) {
      for (const [x, y, z, u, v] of order) {
        positions.push(x, y, z);
        uvs.push(u, v);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const count = positions.length / 3;
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color('#3d5a22');
  const tip = new THREE.Color('#a4b85c');
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    normals[i * 3 + 1] = 1;
    c.copy(base).lerp(tip, positions[i * 3 + 1] / h);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function shrub() {
  return mergeGeometries([
    part(new THREE.IcosahedronGeometry(0.55, 0), '#3a5a26', { y: 0.35, sy: 0.7 }),
    part(new THREE.IcosahedronGeometry(0.4, 0), '#44672c', { x: 0.35, y: 0.3, z: 0.2, sy: 0.75 }),
    part(new THREE.IcosahedronGeometry(0.35, 0), '#35532a', { x: -0.3, y: 0.25, z: -0.2, sy: 0.75 }),
  ]);
}

export class Foliage {
  constructor(game, rng, isBlocked) {
    const terrain = game.terrain;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    const grassCount = 9000;
    const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: getTexture('grassBlades'), alphaTest: 0.45 });
    this.grass = new THREE.InstancedMesh(grassTuft(), grassMat, grassCount);
    let n = 0;
    for (let attempt = 0; attempt < grassCount * 4 && n < grassCount; attempt++) {
      const x = rng.range(-terrain.half + 10, terrain.half - 10);
      const z = rng.range(-terrain.half + 10, terrain.half - 10);
      const h = terrain.getHeight(x, z);
      if (h < 2.3 || h > 24 || terrain.getSlope(x, z) > 0.22 || isBlocked(x, z)) continue;
      dummy.position.set(x, h - 0.03, z);
      dummy.rotation.set(0, rng.range(0, Math.PI), 0);
      const s = rng.range(0.7, 1.35);
      dummy.scale.set(s, s * rng.range(0.8, 1.3), s);
      dummy.updateMatrix();
      this.grass.setMatrixAt(n, dummy.matrix);
      const forest = terrain.getForest(x, z);
      tint.setRGB(1 - forest * 0.25 + rng.range(-0.06, 0.06), 1 - forest * 0.15, 0.85 + rng.range(-0.05, 0.05));
      this.grass.setColorAt(n, tint);
      n++;
    }
    this.grass.count = n;
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = true;
    game.scene.add(this.grass);

    const shrubCount = 700;
    this.shrubs = new THREE.InstancedMesh(shrub(), new THREE.MeshLambertMaterial({ vertexColors: true }), shrubCount);
    n = 0;
    for (let attempt = 0; attempt < shrubCount * 5 && n < shrubCount; attempt++) {
      const x = rng.range(-terrain.half + 10, terrain.half - 10);
      const z = rng.range(-terrain.half + 10, terrain.half - 10);
      const h = terrain.getHeight(x, z);
      if (h < 2.5 || h > 26 || terrain.getSlope(x, z) > 0.3 || isBlocked(x, z)) continue;
      if (rng.next() > 0.25 + terrain.getForest(x, z) * 0.75) continue;
      dummy.position.set(x, h - 0.05, z);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.scale.setScalar(rng.range(0.7, 1.4));
      dummy.updateMatrix();
      this.shrubs.setMatrixAt(n++, dummy.matrix);
    }
    this.shrubs.count = n;
    this.shrubs.frustumCulled = false;
    this.shrubs.castShadow = true;
    this.shrubs.receiveShadow = true;
    game.scene.add(this.shrubs);
  }
}
