import * as THREE from '../lib/three.js';
import { createNoise2D, fbm, ridged } from '../core/Noise.js';
import { lerp, smoothstep } from '../core/MathUtils.js';
import { getTexture } from '../core/Textures.js';

export const WATER_LEVEL = 0;
export const SEA_FLOOR = -14;

const PALETTE = {
  seabed: new THREE.Color('#5f5a47'),
  wetSand: new THREE.Color('#a8956a'),
  sand: new THREE.Color('#d2c08f'),
  grass: new THREE.Color('#6e8c3b'),
  meadow: new THREE.Color('#8a9a45'),
  dryGrass: new THREE.Color('#9a8f55'),
  forest: new THREE.Color('#3d5a25'),
  rock: new THREE.Color('#7d776d'),
  snow: new THREE.Color('#e6eaee'),
};

// Heightmap island: a radial falloff carves the coastline, fractal noise shapes
// plains, ridged noise raises hills, and low inland basins flood into lakes.
export class Terrain {
  constructor(rng, { size = 640, segments = 256 } = {}) {
    this.size = size;
    this.segments = segments;
    this.half = size / 2;
    this.cell = size / segments;
    this.verts = segments + 1;
    this.heights = new Float32Array(this.verts * this.verts);
    this.forest = new Float32Array(this.verts * this.verts);
    this.noiseA = createNoise2D(rng.random);
    this.noiseB = createNoise2D(rng.random);
    this.noiseC = createNoise2D(rng.random);
    this.maxHeight = 0;
    this.mesh = null;
    this.generateHeights();
  }

  generateHeights() {
    const v = this.verts;
    for (let iz = 0; iz < v; iz++) {
      for (let ix = 0; ix < v; ix++) {
        const x = -this.half + ix * this.cell;
        const z = -this.half + iz * this.cell;
        const idx = iz * v + ix;
        const h = this.sampleBase(x, z);
        this.heights[idx] = h;
        this.forest[idx] = this.sampleForest(x, z);
        if (h > this.maxHeight) this.maxHeight = h;
      }
    }
  }

  sampleBase(x, z) {
    const nx = x / this.half;
    const nz = z / this.half;
    const wobble = fbm(this.noiseB, x * 0.006, z * 0.006, 3) * 0.16;
    const d = Math.sqrt(nx * nx + nz * nz) + wobble;
    const island = 1 - smoothstep(0.6, 0.9, d);
    const continental = fbm(this.noiseA, x * 0.0045, z * 0.0045, 4);
    const hills = ridged(this.noiseC, x * 0.009 + 40, z * 0.009 - 17, 4);
    const mountainMask = smoothstep(-0.1, 0.45, fbm(this.noiseB, x * 0.003 + 100, z * 0.003, 2));
    const detail = fbm(this.noiseA, x * 0.04, z * 0.04, 2) * 0.7;
    const h = 3.2 + continental * 6.5 + hills * hills * 34 * mountainMask + detail;
    return lerp(SEA_FLOOR, h, island);
  }

  sampleForest(x, z) {
    return smoothstep(-0.15, 0.35, fbm(this.noiseC, x * 0.011 + 31, z * 0.011 - 7, 3));
  }

  // Pull terrain toward a flat pad, used under monuments before the mesh is built.
  flatten(cx, cz, radius, target, falloff = 14) {
    const v = this.verts;
    const outer = radius + falloff;
    const ix0 = Math.max(0, Math.floor((cx - outer + this.half) / this.cell));
    const ix1 = Math.min(v - 1, Math.ceil((cx + outer + this.half) / this.cell));
    const iz0 = Math.max(0, Math.floor((cz - outer + this.half) / this.cell));
    const iz1 = Math.min(v - 1, Math.ceil((cz + outer + this.half) / this.cell));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = -this.half + ix * this.cell;
        const z = -this.half + iz * this.cell;
        const d = Math.hypot(x - cx, z - cz);
        if (d > outer) continue;
        const t = 1 - smoothstep(radius, outer, d);
        const idx = iz * v + ix;
        this.heights[idx] = lerp(this.heights[idx], target, t);
      }
    }
  }

  buildMesh() {
    const v = this.verts;
    const count = v * v;
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    for (let iz = 0; iz < v; iz++) {
      for (let ix = 0; ix < v; ix++) {
        const idx = iz * v + ix;
        const x = -this.half + ix * this.cell;
        const z = -this.half + iz * this.cell;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = this.heights[idx];
        positions[idx * 3 + 2] = z;
        uvs[idx * 2] = x / 7;
        uvs[idx * 2 + 1] = z / 7;
      }
    }
    const s = this.segments;
    const indices = new Uint32Array(s * s * 6);
    let p = 0;
    for (let iz = 0; iz < s; iz++) {
      for (let ix = 0; ix < s; ix++) {
        const a = iz * v + ix;
        const b = a + 1;
        const c = a + v + 1;
        const d = a + v;
        // Split along the (0,0)-(1,1) diagonal; getHeight() interpolates the same way.
        indices[p++] = a;
        indices[p++] = c;
        indices[p++] = b;
        indices[p++] = a;
        indices[p++] = d;
        indices[p++] = c;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    const normals = geometry.attributes.normal.array;
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let idx = 0; idx < count; idx++) {
      const x = positions[idx * 3];
      const z = positions[idx * 3 + 2];
      this.colorFor(x, z, this.heights[idx], 1 - normals[idx * 3 + 1], this.forest[idx], c);
      colors[idx * 3] = c.r;
      colors[idx * 3 + 1] = c.g;
      colors[idx * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();

    const material = new THREE.MeshLambertMaterial({ vertexColors: true, map: getTexture('terrainDetail') });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    return this.mesh;
  }

  colorFor(x, z, h, slope, forest, out) {
    if (h < 0.5) {
      out.copy(PALETTE.seabed).lerp(PALETTE.wetSand, smoothstep(-5, 0.5, h));
    } else {
      out.copy(PALETTE.grass);
      out.lerp(PALETTE.meadow, smoothstep(0.2, 0.8, this.noiseB(x * 0.02, z * 0.02) * 0.5 + 0.5) * 0.5);
      out.lerp(PALETTE.forest, forest * 0.85);
      out.lerp(PALETTE.dryGrass, smoothstep(14, 26, h) * 0.6);
      out.lerp(PALETTE.sand, 1 - smoothstep(1.4, 2.6, h));
      out.lerp(PALETTE.rock, Math.max(smoothstep(0.16, 0.3, slope), smoothstep(28, 36, h)));
      out.lerp(PALETTE.snow, smoothstep(40, 46, h) * (1 - smoothstep(0.3, 0.5, slope)));
    }
    const n = 1 + this.noiseA(x * 0.09, z * 0.09) * 0.05;
    out.r *= n;
    out.g *= n;
    out.b *= n;
    return out;
  }

  inBounds(x, z) {
    return x > -this.half && x < this.half && z > -this.half && z < this.half;
  }

  getHeight(x, z) {
    const fx = (x + this.half) / this.cell;
    const fz = (z + this.half) / this.cell;
    if (fx < 0 || fz < 0 || fx >= this.segments || fz >= this.segments) return SEA_FLOOR;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const v = this.verts;
    const H = this.heights;
    const h00 = H[iz * v + ix];
    const h10 = H[iz * v + ix + 1];
    const h01 = H[(iz + 1) * v + ix];
    const h11 = H[(iz + 1) * v + ix + 1];
    if (tx > tz) return h00 + (h10 - h00) * tx + (h11 - h10) * tz;
    return h00 + (h11 - h01) * tx + (h01 - h00) * tz;
  }

  getForest(x, z) {
    const fx = (x + this.half) / this.cell;
    const fz = (z + this.half) / this.cell;
    if (fx < 0 || fz < 0 || fx >= this.segments || fz >= this.segments) return 0;
    return this.forest[Math.round(fz) * this.verts + Math.round(fx)];
  }

  getNormal(x, z, out = new THREE.Vector3()) {
    const e = 0.75;
    out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e));
    return out.normalize();
  }

  getSlope(x, z) {
    const e = 0.75;
    const nx = this.getHeight(x - e, z) - this.getHeight(x + e, z);
    const nz = this.getHeight(x, z - e) - this.getHeight(x, z + e);
    const ny = 2 * e;
    return 1 - ny / Math.hypot(nx, ny, nz);
  }

  // March along the ray, then bisect the crossing for a precise hit.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    if (oy > this.maxHeight + 1 && dy >= 0) return null;
    let prevT = 0;
    if (oy - this.getHeight(ox, oz) < 0) return { dist: 0, x: ox, y: oy, z: oz, nx: 0, ny: 1, nz: 0 };
    const step = 0.6;
    for (let t = step; ; t += step) {
      const tt = Math.min(t, maxDist);
      const y = oy + dy * tt;
      if (y - this.getHeight(ox + dx * tt, oz + dz * tt) < 0) {
        let lo = prevT;
        let hi = tt;
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          if (oy + dy * mid - this.getHeight(ox + dx * mid, oz + dz * mid) < 0) hi = mid;
          else lo = mid;
        }
        const hx = ox + dx * hi;
        const hz = oz + dz * hi;
        const n = this.getNormal(hx, hz);
        return { dist: hi, x: hx, y: oy + dy * hi, z: hz, nx: n.x, ny: n.y, nz: n.z };
      }
      prevT = tt;
      if (tt >= maxDist) return null;
      if (y > this.maxHeight + 1 && dy >= 0) return null;
    }
  }
}
