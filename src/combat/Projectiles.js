import * as THREE from '../lib/three.js';
import { part, mergeGeometries } from '../core/GeometryUtils.js';
import { createItem } from '../inventory/ItemContainer.js';

// Physical arrows: gravity-affected, swept against the collision world each frame.
// Arrows that hit the ground or a wall stick there and can sometimes be recovered.

const arrowGeometry = mergeGeometries([
  part(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 5), '#a07848', { rx: Math.PI / 2 }),
  part(new THREE.ConeGeometry(0.03, 0.09, 5), '#8f8a82', { z: 0.41, rx: Math.PI / 2 }),
  part(new THREE.BoxGeometry(0.003, 0.05, 0.12), '#c4545a', { z: -0.32 }),
  part(new THREE.BoxGeometry(0.05, 0.003, 0.12), '#c4545a', { z: -0.32 }),
]);
const arrowMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const projectileFilter = (c) => c.layer !== 'pickup' && c.layer !== 'drop' && c.layer !== 'corpse';

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.tmp = new THREE.Vector3();
  }

  fireArrow(origin, dir, speed, damage) {
    const mesh = new THREE.Mesh(arrowGeometry, arrowMaterial);
    mesh.position.copy(origin);
    this.game.scene.add(mesh);
    this.list.push({
      mesh,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(speed),
      damage,
      life: 8,
      stuck: false,
    });
  }

  update(dt) {
    const game = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.life -= dt;
      if (a.life <= 0) {
        game.scene.remove(a.mesh);
        this.list.splice(i, 1);
        continue;
      }
      if (a.stuck) continue;
      a.vel.y -= 9.81 * 0.55 * dt;
      const step = this.tmp.copy(a.vel).multiplyScalar(dt);
      const len = step.length();
      const hit = game.physics.raycast(a.pos.x, a.pos.y, a.pos.z, step.x / len, step.y / len, step.z / len, len, {
        ignore: game.player.collider,
        filter: projectileFilter,
      });
      if (hit) {
        a.pos.set(hit.x, hit.y, hit.z);
        a.mesh.position.copy(a.pos);
        game.audio.play('arrow_hit', { x: hit.x, y: hit.y, z: hit.z });
        const target = hit.owner;
        if (target?.takeDamage && !target.dead) {
          const result = target.takeDamage({ damage: a.damage, point: hit, attacker: game.player });
          game.hud.hitmarker(result?.killed, result?.headshot);
          game.scene.remove(a.mesh);
          this.list.splice(i, 1);
          continue;
        }
        a.stuck = true;
        a.life = 20;
        game.effects.burst(hit.x, hit.y, hit.z, { count: 3, color: 0x9a8a70, speed: 1.5, size: 0.04, life: 0.4 });
        if (Math.random() < 0.5) {
          game.scene.remove(a.mesh);
          this.list.splice(i, 1);
          game.entities.dropItem(createItem('wooden_arrow', 1), { x: hit.x, y: hit.y + 0.1, z: hit.z }, { x: 0, y: 0, z: 0 });
        }
        continue;
      }
      a.pos.add(step);
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.x + a.vel.x, a.pos.y + a.vel.y, a.pos.z + a.vel.z);
      if (a.pos.y < -2) a.life = Math.min(a.life, 0.5);
    }
  }
}
