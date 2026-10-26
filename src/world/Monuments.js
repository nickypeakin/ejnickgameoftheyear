import * as THREE from '../lib/three.js';
import { worldBox, mergeGeometries } from '../core/GeometryUtils.js';
import { getTexture } from '../core/Textures.js';

// Hand-designed points of interest stamped onto flattened terrain. Layouts are in
// local metres around the monument centre; y is relative to the pad height.

function wall(boxes, x, z, w, d, h, mat = 'concrete', y = 0) {
  boxes.push({ x, y: y + h / 2, z, w, h, d, mat });
}

function outpostLayout(rng) {
  const boxes = [];
  boxes.push({ x: 0, y: -0.2, z: 0, w: 52, h: 0.5, d: 52, mat: 'concrete' });
  // Perimeter wall with an entrance in the middle of each side, some sections crumbled.
  const seg = (h) => (rng.chance(0.3) ? h * rng.range(0.35, 0.7) : h);
  for (const s of [-1, 1]) {
    wall(boxes, -15.5, s * 25.7, 21, 0.6, seg(3.2));
    wall(boxes, 15.5, s * 25.7, 21, 0.6, seg(3.2));
    wall(boxes, s * 25.7, -15.5, 0.6, 21, seg(3.2));
    wall(boxes, s * 25.7, 15.5, 0.6, 21, seg(3.2));
  }
  // Barracks: 12 x 10 with a doorway on the south side and a roof.
  wall(boxes, -10, -13, 12, 0.4, 3.6);
  wall(boxes, -16, -8, 0.4, 10, 3.6);
  wall(boxes, -4, -8, 0.4, 10, 3.6);
  wall(boxes, -13.5, -3, 5, 0.4, 3.6);
  wall(boxes, -6.5, -3, 5, 0.4, 3.6);
  boxes.push({ x: -10, y: 3.0, z: -3, w: 2, h: 1.2, d: 0.4, mat: 'concrete' });
  boxes.push({ x: -10, y: 3.75, z: -8, w: 12.4, h: 0.3, d: 10.4, mat: 'concrete' });
  // Shipping containers.
  boxes.push({ x: 13, y: 1.3, z: -15, w: 6.1, h: 2.6, d: 2.5, mat: 'containerRed' });
  boxes.push({ x: 13, y: 1.3, z: -11.8, w: 6.1, h: 2.6, d: 2.5, mat: 'containerBlue' });
  boxes.push({ x: 13, y: 3.9, z: -15, w: 6.1, h: 2.6, d: 2.5, mat: 'containerGreen' });
  boxes.push({ x: 16, y: 1.3, z: 11, w: 2.5, h: 2.6, d: 6.1, mat: 'containerBlue' });
  // Jersey barriers at the entrances.
  for (const [x, z, w, d] of [[-3.5, 22, 2.2, 0.7], [3.8, 21, 2.2, 0.7], [22, 3, 0.7, 2.2], [-21.5, -2.5, 0.7, 2.2]]) {
    boxes.push({ x, y: 0.5, z, w, h: 1, d, mat: 'concrete' });
  }
  // Watchtower.
  for (const [x, z] of [[-19, 17], [-16, 17], [-19, 20], [-16, 20]]) boxes.push({ x, y: 2.6, z, w: 0.3, h: 5.2, d: 0.3, mat: 'rust' });
  boxes.push({ x: -17.5, y: 5.3, z: 18.5, w: 3.6, h: 0.25, d: 3.6, mat: 'rust' });
  boxes.push({ x: -17.5, y: 6.0, z: 20.25, w: 3.6, h: 1.1, d: 0.1, mat: 'rust' });

  return {
    boxes,
    crates: [
      { x: -13.5, z: -10.5, table: 'military_crate' },
      { x: -6.8, z: -11.2, table: 'military_crate' },
      { x: 8.5, z: 6, table: 'crate' },
      { x: -20, z: 9, table: 'crate' },
      { x: 18.5, z: -6, table: 'military_crate' },
    ],
    barrels: [[4, -18], [5.2, -18.6], [-21, -18], [20, 19], [0, 12], [-8, 15], [21, -20]],
    recycler: { x: 3, z: 3, rot: 0 },
    npcs: [[0, -19], [19, 2], [-19, 4], [6, 18]],
    waypoints: [[-18, -18], [0, -19], [18, -18], [19, 2], [18, 18], [0, 17], [-18, 18], [-19, 4], [0, 0]],
  };
}

function ruinsLayout(rng) {
  const boxes = [];
  boxes.push({ x: 0, y: -0.2, z: 0, w: 20, h: 0.5, d: 16, mat: 'concrete' });
  wall(boxes, -4, -7.7, 12, 0.4, 3.2);
  wall(boxes, -9.8, -3, 0.4, 9.5, rng.range(1.8, 3.2));
  wall(boxes, 6.5, -7.7, 5, 0.4, rng.range(1.2, 2.2));
  wall(boxes, 9.8, 2, 0.4, 7, rng.range(1.2, 2.8));
  boxes.push({ x: -4, y: 3.3, z: -5, w: 12, h: 0.25, d: 5.6, mat: 'concrete' });
  boxes.push({ x: 4, y: 1.3, z: 4.5, w: 6.1, h: 2.6, d: 2.5, mat: rng.pick(['containerRed', 'containerBlue', 'containerGreen']) });
  boxes.push({ x: -2, y: 0.5, z: 6.5, w: 2.2, h: 1, d: 0.7, mat: 'concrete' });
  return {
    boxes,
    crates: [{ x: -7.5, z: -5.5, table: 'crate' }],
    barrels: [[-8, 2], [-7, 3], [8, -4], [1, -2], [-5.2, 6.2]],
    recycler: { x: 2.5, z: -4.5, rot: 0 },
    npcs: [],
    waypoints: [],
  };
}

export const MONUMENT_TYPES = {
  outpost: { name: 'Abandoned Outpost', radius: 30, layout: outpostLayout },
  ruins: { name: 'Roadside Ruins', radius: 15, layout: ruinsLayout },
};

const MATERIALS = {
  concrete: () => new THREE.MeshLambertMaterial({ map: getTexture('concrete') }),
  containerRed: () => new THREE.MeshLambertMaterial({ map: getTexture('corrugated'), color: '#9c3a2c' }),
  containerBlue: () => new THREE.MeshLambertMaterial({ map: getTexture('corrugated'), color: '#2f5a86' }),
  containerGreen: () => new THREE.MeshLambertMaterial({ map: getTexture('corrugated'), color: '#4c6b3a' }),
  rust: () => new THREE.MeshLambertMaterial({ map: getTexture('metalSheet'), color: '#b0896a' }),
};

export class Monuments {
  constructor(game) {
    this.game = game;
    this.sites = [];
    this.materials = {};
  }

  // sites: [{ type, x, z, y }] chosen and flattened by WorldGen.
  build(sites, rng) {
    for (const site of sites) {
      const type = MONUMENT_TYPES[site.type];
      const layout = type.layout(rng);
      const byMat = {};
      for (const b of layout.boxes) {
        const wx = site.x + b.x;
        const wz = site.z + b.z;
        const wy = site.y + b.y;
        (byMat[b.mat] ??= []).push(worldBox(b.w, b.h, b.d, wx, wy, wz, b.mat === 'concrete' ? 2.5 : 3));
        this.game.physics.add({
          shape: 'box',
          minX: wx - b.w / 2,
          minY: wy - b.h / 2,
          minZ: wz - b.d / 2,
          maxX: wx + b.w / 2,
          maxY: wy + b.h / 2,
          maxZ: wz + b.d / 2,
          layer: 'static',
          solid: true,
          owner: null,
        });
      }
      for (const [mat, geoms] of Object.entries(byMat)) {
        this.materials[mat] ??= MATERIALS[mat]();
        const mesh = new THREE.Mesh(mergeGeometries(geoms), this.materials[mat]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.game.scene.add(mesh);
      }
      const toWorld = ([x, z]) => ({ x: site.x + x, z: site.z + z });
      this.sites.push({
        type: site.type,
        name: type.name,
        x: site.x,
        z: site.z,
        y: site.y,
        radius: type.radius,
        crates: layout.crates.map((c) => ({ ...toWorld([c.x, c.z]), table: c.table, y: site.y + 0.05 })),
        barrels: layout.barrels.map((b) => ({ ...toWorld(b), y: site.y + 0.05 })),
        recycler: layout.recycler && { ...toWorld([layout.recycler.x, layout.recycler.z]), y: site.y + 0.05, rot: layout.recycler.rot },
        npcs: layout.npcs.map(toWorld),
        waypoints: layout.waypoints.map(toWorld),
      });
    }
  }

  siteAt(x, z, margin = 0) {
    for (const s of this.sites) if (Math.hypot(x - s.x, z - s.z) < s.radius + margin) return s;
    return null;
  }
}
