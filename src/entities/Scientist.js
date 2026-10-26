import * as THREE from '../lib/three.js';
import { Creature, block, limb } from './Creature.js';
import { randRange, damp } from '../core/MathUtils.js';
import { rollLoot } from '../items/LootTables.js';

// Hostile armed NPC guarding a monument. States:
//   patrol  walk between the monument's waypoints
//   combat  hold range, strafe and fire bursts while the player is visible
//   search  move to where the player was last seen
//   return  walk home after losing the player or straying past the leash
const SIGHT = 45;
const LEASH = 70;

const materials = {};
const m = (key, color) => (materials[key] ??= new THREE.MeshLambertMaterial({ color }));

export class Scientist extends Creature {
  constructor(game, slot) {
    super(game, { x: slot.spawn.x, z: slot.spawn.z, radius: 0.38, height: 1.85, hp: 150, minGround: 0.8 });
    this.slot = slot;
    this.kind = 'npc';
    this.name = 'Scientist';
    this.state = 'patrol';
    this.stateTime = 0;
    this.perceiveTimer = Math.random() * 0.25;
    this.sees = false;
    this.lastSeen = null;
    this.lostTimer = 0;
    this.waypoint = null;
    this.pause = randRange(0, 2);
    this.fireTimer = 0;
    this.burstLeft = 0;
    this.burstPause = randRange(0.6, 1.4);
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.alerted = false;
    this.walkPhase = 0;
    this.deathT = 0;
    // Yaw outermost so the death fall tips the body backwards relative to its facing.
    this.group.rotation.order = 'YXZ';
    this.buildModel();
    this.syncCollider();
  }

  get label() {
    return this.name;
  }

  buildModel() {
    const suit = m('suit', '#2f6a8f');
    const dark = m('dark', '#1e2a33');
    const visor = m('visor', '#0d1418');
    const gun = m('gun', '#1b1c1e');
    const g = this.group;
    this.legs = [limb(0.18, 0.92, 0.2, suit, -0.12, 0.95, 0), limb(0.18, 0.92, 0.2, suit, 0.12, 0.95, 0)];
    for (const leg of this.legs) {
      leg.add(block(0.2, 0.14, 0.28, dark, 0, -0.86, 0.04));
      g.add(leg);
    }
    g.add(block(0.5, 0.68, 0.3, suit, 0, 1.3, 0));
    g.add(block(0.4, 0.4, 0.12, dark, 0, 1.36, -0.2));
    const head = block(0.3, 0.32, 0.3, suit, 0, 1.82, 0);
    head.add(block(0.24, 0.13, 0.04, visor, 0, 0.02, 0.15));
    g.add(head);
    const armR = limb(0.13, 0.58, 0.13, suit, 0.31, 1.58, 0);
    armR.rotation.x = -1.25;
    const armL = limb(0.13, 0.58, 0.13, suit, -0.31, 1.58, 0);
    armL.rotation.set(-1.4, 0, -0.45);
    g.add(armR, armL);
    const rifle = new THREE.Group();
    rifle.position.set(0.14, 1.42, 0.35);
    rifle.add(block(0.07, 0.12, 0.78, gun, 0, 0, 0.1));
    rifle.add(block(0.06, 0.18, 0.08, gun, 0, -0.13, 0.05));
    rifle.add(block(0.06, 0.1, 0.2, gun, 0, -0.02, -0.32));
    g.add(rifle);
    this.rifle = rifle;
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
    if (state === 'combat') {
      // Reaction time before the first burst.
      this.burstLeft = 0;
      this.burstPause = randRange(1.0, 1.6);
    }
  }

  update(dt) {
    if (this.dead) {
      this.deathT += dt;
      this.group.rotation.x = -Math.min(1, this.deathT * 2.2) * (Math.PI / 2);
      if (this.deathT > 60) this.game.entities.removeNPC(this);
      return;
    }
    this.stateTime += dt;
    const player = this.game.player;
    const p = player.position;
    const dist = this.distanceToPlayer();

    this.perceiveTimer -= dt;
    if (this.perceiveTimer <= 0) {
      this.perceiveTimer = 0.25;
      this.sees = !player.dead && dist < SIGHT && this.canSeePlayer(SIGHT);
      if (this.sees) {
        this.lastSeen = { x: p.x, z: p.z };
        this.lostTimer = 0;
        if (this.state !== 'combat') {
          if (!this.alerted) this.game.audio.play('npc_alert', { x: this.pos.x, y: this.pos.y, z: this.pos.z });
          this.alerted = true;
          this.setState('combat');
        }
      }
    }

    const home = this.slot.home;
    const homeDist = Math.hypot(this.pos.x - home.x, this.pos.z - home.z);
    if (homeDist > LEASH && this.state !== 'return') this.setState('return');

    switch (this.state) {
      case 'patrol':
        this.patrol(dt);
        break;
      case 'combat':
        this.combat(dt, dist);
        break;
      case 'search': {
        if (!this.lastSeen) {
          this.setState('return');
          break;
        }
        const dx = this.lastSeen.x - this.pos.x;
        const dz = this.lastSeen.z - this.pos.z;
        if (Math.hypot(dx, dz) < 2 || this.stateTime > 10) this.setState('return');
        else this.move(dx, dz, 3.6, dt, 6);
        break;
      }
      case 'return': {
        const dx = home.x - this.pos.x;
        const dz = home.z - this.pos.z;
        if (Math.hypot(dx, dz) < 5) {
          this.alerted = false;
          this.setState('patrol');
        } else this.move(dx, dz, 3.2, dt, 5);
        if (this.sees && homeDist < LEASH - 10) this.setState('combat');
        break;
      }
      default:
        break;
    }
    this.applyGravity(dt);
    this.syncCollider();
    this.walkPhase += dt * this.speed * 2.6;
    const amp = Math.min(0.7, this.speed * 0.18);
    this.legs[0].rotation.x = Math.sin(this.walkPhase) * amp;
    this.legs[1].rotation.x = -Math.sin(this.walkPhase) * amp;
    this.rifle.position.z = damp(this.rifle.position.z, 0.35, 12, dt);
  }

  patrol(dt) {
    const points = this.slot.waypoints;
    if (!points.length) return;
    if (this.pause > 0) {
      this.pause -= dt;
      this.move(0, 0, 0, dt);
      return;
    }
    if (!this.waypoint) this.waypoint = points[Math.floor(Math.random() * points.length)];
    const dx = this.waypoint.x - this.pos.x;
    const dz = this.waypoint.z - this.pos.z;
    if (Math.hypot(dx, dz) < 1.5 || this.stateTime > 25) {
      this.waypoint = null;
      this.pause = randRange(1.5, 4);
      this.stateTime = 0;
    } else {
      this.move(dx, dz, 2.0, dt, 4);
    }
  }

  combat(dt, dist) {
    const p = this.game.player.position;
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    if (!this.sees) {
      this.lostTimer += dt;
      if (this.lostTimer > 1.5) this.setState('search');
      this.move(dx, dz, 2.5, dt, 6);
      return;
    }
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = randRange(1, 2.2);
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }
    if (dist > 24) this.move(dx, dz, 4.2, dt, 8, false);
    else if (dist < 8) this.move(-dx, -dz, 3, dt, 8, false);
    else this.move(-dz * this.strafeDir, dx * this.strafeDir, 1.8, dt, 8, false);
    // Always face the target while fighting.
    this.yaw = Math.atan2(dx, dz);

    this.fireTimer -= dt;
    if (this.burstLeft <= 0) {
      this.burstPause -= dt;
      if (this.burstPause <= 0) {
        // At most two scientists fire at once so a group stays survivable.
        const firing = this.game.entities.npcs.filter((n) => n !== this && !n.dead && n.burstLeft > 0).length;
        if (firing >= 2) {
          this.burstPause = randRange(0.4, 0.9);
          return;
        }
        this.burstLeft = Math.floor(randRange(2, 5));
        this.burstPause = randRange(1.6, 2.8);
      }
      return;
    }
    if (this.fireTimer <= 0) {
      this.fireTimer = 0.16;
      this.burstLeft -= 1;
      this.shoot(dist);
    }
  }

  shoot(dist) {
    const game = this.game;
    const player = game.player;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const ox = this.pos.x + fx * 0.7 + Math.cos(this.yaw) * 0.14;
    const oy = this.pos.y + 1.45;
    const oz = this.pos.z + fz * 0.7 - Math.sin(this.yaw) * 0.14;
    const tx = player.position.x;
    const ty = player.position.y + player.eyeHeight - 0.45;
    const tz = player.position.z;
    let dx = tx - ox;
    let dy = ty - oy;
    let dz = tz - oz;
    const len = Math.hypot(dx, dy, dz);
    dx /= len;
    dy /= len;
    dz /= len;
    const moving = Math.hypot(player.velocity.x, player.velocity.z) > 1;
    const spread = 0.05 + dist * 0.0015 + (moving ? 0.035 : 0) - (player.crouching ? 0.01 : 0);
    dx += (Math.random() * 2 - 1) * spread;
    dy += (Math.random() * 2 - 1) * spread;
    dz += (Math.random() * 2 - 1) * spread;
    const n = Math.hypot(dx, dy, dz);
    dx /= n;
    dy /= n;
    dz /= n;
    const hit = game.physics.raycast(ox, oy, oz, dx, dy, dz, 90, {
      ignore: this.collider,
      filter: (c) => c.layer !== 'pickup' && c.layer !== 'drop',
    });
    const end = hit ?? { x: ox + dx * 90, y: oy + dy * 90, z: oz + dz * 90 };
    game.effects.tracer(ox, oy, oz, end.x, end.y, end.z);
    game.effects.muzzleFlash(ox, oy, oz);
    game.audio.play('rifle', { x: ox, y: oy, z: oz, volume: 0.8 });
    this.rifle.position.z = 0.27;
    if (!hit) return;
    if (hit.owner === player) {
      const head = hit.y > player.position.y + player.eyeHeight - 0.2;
      player.takeDamage(head ? 8 : 5, { cause: 'Shot by a scientist', bleed: 1.5, from: this.pos });
    } else if (hit.owner?.takeDamage && hit.owner !== this) {
      hit.owner.takeDamage({ damage: 5, point: hit, attacker: this });
    } else {
      game.effects.burst(hit.x, hit.y, hit.z, { count: 4, color: 0xb0a890, speed: 2, size: 0.04, life: 0.4 });
    }
  }

  takeDamage(ctx) {
    if (this.dead) return { killed: false };
    let damage = ctx.damage;
    if (ctx.point && ctx.point.y > this.pos.y + 1.62) damage *= 1.6;
    this.hp -= damage;
    if (ctx.point) this.game.effects.burst(ctx.point.x, ctx.point.y, ctx.point.z, { count: 8, color: 0x8a1c1c, speed: 2.5, size: 0.05 });
    this.game.audio.play('hurt', { x: this.pos.x, y: this.pos.y, z: this.pos.z, volume: 0.6 });
    if (ctx.attacker === this.game.player || ctx.attacker === undefined) {
      const p = this.game.player.position;
      this.lastSeen = { x: p.x, z: p.z };
      if (this.state !== 'combat') this.setState('search');
    }
    if (this.hp <= 0) {
      this.die();
      return { killed: true, headshot: damage !== ctx.damage };
    }
    return { killed: false, headshot: damage !== ctx.damage };
  }

  onMeleeHit(ctx) {
    if (this.dead) return { material: 'flesh' };
    const result = this.takeDamage({ damage: ctx.tool.melee.damage, point: ctx.point, attacker: ctx.player });
    return { material: 'flesh', damaged: true, killed: result.killed };
  }

  die() {
    this.dead = true;
    this.kind = 'corpse';
    this.game.physics.remove(this.collider);
    this.game.stats.kills += 1;
    this.slot.timer = 300;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.game.entities.spawnContainer({
      name: 'Scientist Loot',
      model: 'bag',
      items: rollLoot('scientist'),
      x: this.pos.x - fx * 0.9,
      y: this.pos.y + 0.5,
      z: this.pos.z - fz * 0.9,
      lifetime: 300,
    });
  }
}
