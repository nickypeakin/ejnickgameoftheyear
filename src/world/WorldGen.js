import { Rng, smoothstep } from '../core/MathUtils.js';
import { Terrain } from './Terrain.js';
import { MONUMENT_TYPES } from './Monuments.js';

// Seeded island generation. The same seed always produces the same terrain,
// monuments, resource layout and loot spots, which is what lets save games store
// only what changed.

function findSites(terrain, rng) {
  const wanted = ['outpost', 'ruins', 'ruins'];
  const sites = [];
  const candidates = [];
  const limit = terrain.half * 0.62;
  for (let x = -limit; x <= limit; x += 14) {
    for (let z = -limit; z <= limit; z += 14) candidates.push([x, z]);
  }
  rng.shuffle(candidates);
  for (const type of wanted) {
    const radius = MONUMENT_TYPES[type].radius;
    for (const [x, z] of candidates) {
      if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < 150)) continue;
      const samples = [terrain.getHeight(x, z)];
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        for (const r of [radius * 0.5, radius + 4]) samples.push(terrain.getHeight(x + Math.cos(ang) * r, z + Math.sin(ang) * r));
      }
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      if (min < 2.2 || max > 22 || max - min > 8) continue;
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      sites.push({ type, x, z, y: Math.max(2.5, avg) });
      break;
    }
  }
  return sites;
}

class SpacingGrid {
  constructor(cell = 4) {
    this.cell = cell;
    this.map = new Map();
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  ok(x, z, minDist) {
    const r = Math.ceil(minDist / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        for (const p of this.map.get(this.key(cx + i, cz + j)) ?? []) {
          if (Math.hypot(p.x - x, p.z - z) < Math.max(minDist, p.r)) return false;
        }
      }
    }
    return true;
  }

  add(x, z, r) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push({ x, z, r });
  }
}

export function generateWorld(seed, onProgress = () => {}) {
  const rng = new Rng(seed);
  onProgress('Shaping the island');
  const terrain = new Terrain(rng);
  const sites = findSites(terrain, rng);
  for (const s of sites) terrain.flatten(s.x, s.z, MONUMENT_TYPES[s.type].radius, s.y, 16);

  const inMonument = (x, z, margin = 6) => sites.some((s) => Math.hypot(x - s.x, z - s.z) < MONUMENT_TYPES[s.type].radius + margin);
  const grid = new SpacingGrid(4);
  const specs = [];
  const half = terrain.half - 8;

  onProgress('Growing forests');
  const scatter = (count, attempts, test, choose, spacing) => {
    let placed = 0;
    for (let i = 0; i < attempts && placed < count; i++) {
      const x = rng.range(-half, half);
      const z = rng.range(-half, half);
      const h = terrain.getHeight(x, z);
      if (inMonument(x, z)) continue;
      const slope = terrain.getSlope(x, z);
      const forest = terrain.getForest(x, z);
      if (!test(h, slope, forest, x, z)) continue;
      if (!grid.ok(x, z, spacing)) continue;
      const type = choose(h, forest);
      grid.add(x, z, spacing);
      specs.push({ type, x, z, rot: rng.range(0, Math.PI * 2), scale: rng.range(0.85, 1.2) });
      placed++;
    }
  };

  scatter(
    1300, 20000,
    (h, slope, forest) => h > 2.4 && h < 34 && slope < 0.3 && rng.next() < 0.05 + forest * 0.95,
    (h, forest) => {
      if (h > 20) return rng.chance(0.85) ? 'pine' : 'birch';
      const r = rng.next();
      if (forest > 0.6) return r < 0.45 ? 'pine' : r < 0.85 ? 'oak' : 'birch';
      return r < 0.3 ? 'pine' : r < 0.6 ? 'oak' : 'birch';
    },
    3.6,
  );

  onProgress('Seeding ore');
  scatter(
    240, 9000,
    (h, slope) => h > 2.6 && h < 42 && rng.next() < 0.25 + smoothstep(0.08, 0.3, slope) + smoothstep(12, 26, h),
    () => {
      const r = rng.next();
      return r < 0.5 ? 'stone_node' : r < 0.8 ? 'metal_node' : 'sulfur_node';
    },
    6,
  );

  onProgress('Scattering plants and salvage');
  scatter(200, 6000, (h, slope, forest) => h > 2.4 && h < 20 && slope < 0.25 && forest < 0.7, () => 'hemp', 3);
  scatter(110, 4000, (h, slope) => h > 1.2 && h < 30 && slope < 0.35, () => 'loose_stone', 3);
  scatter(90, 4000, (h, slope, forest) => h > 2.4 && h < 26 && forest > 0.3, () => 'wood_pile', 3);
  scatter(45, 4000, (h) => h > 6 && h < 36, () => 'metal_pickup', 4);
  scatter(40, 4000, (h) => h > 6 && h < 36, () => 'sulfur_pickup', 4);
  scatter(110, 5000, (h, slope, forest) => h > 2.4 && h < 24 && forest > 0.45, () => 'mushroom', 2.5);
  scatter(80, 5000, (h, slope, forest) => h > 2.4 && h < 20 && slope < 0.25 && forest > 0.15 && forest < 0.85, () => 'berry_bush', 4);

  // Loose loot spots outside monuments.
  const barrelSpots = [];
  const crateSpots = [];
  for (let i = 0; i < 4000 && barrelSpots.length < 34; i++) {
    const x = rng.range(-half, half);
    const z = rng.range(-half, half);
    const h = terrain.getHeight(x, z);
    if (h < 1.4 || h > 20 || terrain.getSlope(x, z) > 0.2 || inMonument(x, z, 10) || !grid.ok(x, z, 3)) continue;
    grid.add(x, z, 2);
    // Barrels sit in small clusters.
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) barrelSpots.push({ x: x + k * 1.1, z: z + (k % 2) * 0.9 });
  }
  for (let i = 0; i < 3000 && crateSpots.length < 12; i++) {
    const x = rng.range(-half, half);
    const z = rng.range(-half, half);
    const h = terrain.getHeight(x, z);
    if (h < 1.4 || h > 24 || terrain.getSlope(x, z) > 0.2 || inMonument(x, z, 10) || !grid.ok(x, z, 4)) continue;
    grid.add(x, z, 2);
    crateSpots.push({ x, z, table: 'crate' });
  }

  // Beach spawn points.
  const spawnPoints = [];
  for (let i = 0; i < 6000 && spawnPoints.length < 40; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(terrain.half * 0.5, terrain.half * 0.95);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = terrain.getHeight(x, z);
    if (h > 0.7 && h < 2.4 && terrain.getSlope(x, z) < 0.15) spawnPoints.push({ x, z });
  }
  if (!spawnPoints.length) {
    for (let i = 0; i < 4000 && spawnPoints.length < 10; i++) {
      const x = rng.range(-half, half);
      const z = rng.range(-half, half);
      if (terrain.getHeight(x, z) > 1) spawnPoints.push({ x, z });
    }
  }

  return { rng, terrain, sites, specs, barrelSpots, crateSpots, spawnPoints, inMonument };
}
