import * as THREE from '../lib/three.js';
import { WATER_LEVEL } from './Terrain.js';

const DAY = new THREE.Color('#2f7ea0');
const NIGHT = new THREE.Color('#0b1a26');

// Sea level plane shared by the ocean and inland lakes.
export class Water {
  constructor(scene) {
    this.material = new THREE.MeshStandardMaterial({
      color: DAY.clone(),
      transparent: true,
      opacity: 0.84,
      roughness: 0.18,
      metalness: 0.05,
    });
    const geometry = new THREE.PlaneGeometry(2600, 2600, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.name = 'water';
    scene.add(this.mesh);
    this.t = 0;
  }

  update(dt, daylight) {
    this.t += dt;
    this.mesh.position.y = WATER_LEVEL + Math.sin(this.t * 0.6) * 0.04;
    this.material.color.copy(NIGHT).lerp(DAY, daylight);
  }
}
