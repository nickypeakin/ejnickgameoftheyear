import * as THREE from '../lib/three.js';
import { Creature, block, limb } from './Creature.js';
import { makeYields, harvest } from '../items/Harvest.js';
import { randRange } from '../core/MathUtils.js';

// Wildlife. Temperament decides behaviour:
//   passive     flees from the player (deer)
//   defensive   charges when you get close or hurt it (boar)
//   aggressive  hunts the player on sight, more so at night (wolf, bear)

const mats = new Map();
const mat = (color) => {
  if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color }));
  return mats.get(color);
};

function quadruped(g, o) {
  const body = mat(o.body);
  const dark = mat(o.dark ?? o.body);
  g.add(block(o.bw, o.bh, o.bl, body, 0, o.legLen + o.bh / 2, 0));
  const legs = [];
  const lx = o.bw / 2 - o.legW / 2;
  const lz = o.bl / 2 - o.legW;
  for (const [x, z] of [[-lx, lz], [lx, lz], [-lx, -lz], [lx, -lz]]) {
    const leg = limb(o.legW, o.legLen, o.legW, dark, x, o.legLen + 0.05, z);
    legs.push(leg);
    g.add(leg);
  }
  const head = new THREE.Group();
  head.position.set(0, o.headY, o.headZ);
  head.add(block(o.hw, o.hh, o.hl, body));
  g.add(head);
  return { legs, head, bodyY: o.legLen + o.bh / 2 };
}

const SPECIES = {
  deer: {
    name: 'Deer', hp: 120, walk: 2.2, run: 9, radius: 0.45, height: 1.6, temper: 'passive',
    yields: [['raw_meat', 8], ['leather', 30], ['bone_fragments', 20], ['animal_fat', 8]],
    build(g) {
      const parts = quadruped(g, { body: '#8b5e3c', dark: '#6a4529', bw: 0.42, bh: 0.5, bl: 1.15, legW: 0.1, legLen: 0.85, headY: 1.62, headZ: 0.78, hw: 0.22, hh: 0.24, hl: 0.42 });
      g.add(block(0.2, 0.55, 0.22, mat('#8b5e3c'), 0, 1.4, 0.55).rotateX(-0.5));
      g.add(block(0.14, 0.1, 0.06, mat('#efe7d6'), 0, 1.2, -0.6));
      if (Math.random() < 0.5) {
        const antler = mat('#d8c9a8');
        for (const s of [-1, 1]) {
          parts.head.add(block(0.04, 0.38, 0.04, antler, s * 0.08, 0.3, -0.05).rotateZ(-s * 0.35));
          parts.head.add(block(0.04, 0.2, 0.04, antler, s * 0.16, 0.42, 0.05).rotateX(0.6));
        }
      }
      for (const s of [-1, 1]) parts.head.add(block(0.05, 0.14, 0.1, mat('#6a4529'), s * 0.12, 0.14, -0.1));
      return parts;
    },
  },
  boar: {
    name: 'Boar', hp: 150, walk: 1.8, run: 6.6, radius: 0.5, height: 1.05, temper: 'defensive',
    damage: 12, attackRange: 1.7, attackRate: 1.1, bleed: 3,
    yields: [['raw_meat', 10], ['leather', 20], ['bone_fragments', 15], ['animal_fat', 15]],
    build(g) {
      const parts = quadruped(g, { body: '#4c3c31', dark: '#3a2d25', bw: 0.55, bh: 0.55, bl: 1.1, legW: 0.13, legLen: 0.35, headY: 0.62, headZ: 0.68, hw: 0.4, hh: 0.38, hl: 0.42 });
      parts.head.add(block(0.2, 0.16, 0.16, mat('#7a5a50'), 0, -0.07, 0.27));
      for (const s of [-1, 1]) parts.head.add(block(0.04, 0.12, 0.04, mat('#ece4d2'), s * 0.12, -0.1, 0.26).rotateX(-0.6));
      g.add(block(0.12, 0.14, 0.9, mat('#2f241d'), 0, 0.98, 0));
      return parts;
    },
  },
  wolf: {
    name: 'Wolf', hp: 100, walk: 2.6, run: 8.2, radius: 0.42, height: 1.0, temper: 'aggressive',
    damage: 9, attackRange: 1.8, attackRate: 1.25, bleed: 3, detect: 18, nightDetect: 32,
    yields: [['raw_meat', 6], ['leather', 25], ['bone_fragments', 20], ['animal_fat', 8]],
    build(g) {
      const parts = quadruped(g, { body: '#6f6a64', dark: '#55514c', bw: 0.32, bh: 0.36, bl: 1.0, legW: 0.1, legLen: 0.55, headY: 0.92, headZ: 0.62, hw: 0.26, hh: 0.26, hl: 0.38 });
      parts.head.add(block(0.14, 0.12, 0.22, mat('#4c4844'), 0, -0.05, 0.27));
      for (const s of [-1, 1]) parts.head.add(block(0.07, 0.14, 0.05, mat('#55514c'), s * 0.09, 0.18, -0.08));
      g.add(block(0.09, 0.09, 0.5, mat('#55514c'), 0, 0.78, -0.68).rotateX(0.6));
      return parts;
    },
  },
  bear: {
    name: 'Bear', hp: 400, walk: 2.0, run: 7.6, radius: 0.8, height: 1.8, temper: 'aggressive',
    damage: 20, attackRange: 2.4, attackRate: 1.6, bleed: 4, detect: 14, nightDetect: 20,
    yields: [['raw_meat', 25], ['leather', 60], ['bone_fragments', 40], ['animal_fat', 30]],
    build(g) {
      const parts = quadruped(g, { body: '#4a3426', dark: '#3a281d', bw: 0.9, bh: 0.9, bl: 1.7, legW: 0.3, legLen: 0.75, headY: 1.38, headZ: 1.05, hw: 0.55, hh: 0.5, hl: 0.55 });
      parts.head.add(block(0.3, 0.25, 0.3, mat('#3a281d'), 0, -0.08, 0.35));
      for (const s of [-1, 1]) parts.head.add(block(0.12, 0.12, 0.08, mat('#3a281d'), s * 0.2, 0.3, -0.1));
      g.add(block(0.7, 0.3, 0.6, mat('#4a3426'), 0, 1.8, 0.4));
      return parts;
    },
  },
};

export const ANIMAL_SPECIES = SPECIES;

export class Animal extends Creature {
  constructor(game, species, x, z) {
    const spec = SPECIES[species];
    super(game, { x, z, radius: spec.radius, height: spec.height, hp: spec.hp, minGround: 0.6 });
    this.species = species;
    this.spec = spec;
    this.kind = 'animal';
    this.name = spec.name;
    this.parts = spec.build(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.state = 'wander';
    this.stateTime = 0;
    this.thinkTimer = Math.random() * 0.3;
    this.target = null;
    this.attackCooldown = 0;
    this.aggro = 0;
    this.ignorePlayer = 0;
    this.unreachable = 0;
    this.sinceAttack = 0;
    this.walkPhase = Math.random() * 10;
    this.lunge = 0;
    this.yields = null;
    this.corpseTime = 0;
    this.pickWanderTarget();
    this.syncCollider();
  }

  get label() {
    return this.dead ? `${this.name} Corpse` : this.name;
  }

  pickWanderTarget() {
    const terrain = this.game.terrain;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = randRange(8, 26);
      const x = this.pos.x + Math.cos(a) * r;
      const z = this.pos.z + Math.sin(a) * r;
      if (terrain.getHeight(x, z) > 1.2) {
        this.target = { x, z };
        return;
      }
    }
    this.target = null;
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
    if (state === 'wander') this.pickWanderTarget();
    if (state === 'chase') {
      this.sinceAttack = 0;
      const sound = this.species === 'bear' ? 'bear_roar' : this.species === 'wolf' ? 'wolf_growl' : 'animal_hurt';
      this.game.audio.play(sound, { x: this.pos.x, y: this.pos.y, z: this.pos.z, volume: 0.9 });
    }
  }

  think() {
    const player = this.game.player;
    const dist = this.distanceToPlayer();
    const spec = this.spec;
    const night = this.game.sky.isNight();
    if (player.dead || this.ignorePlayer > 0) {
      if (this.state === 'chase') this.setState('wander');
      return;
    }
    const lowHp = this.hp < this.maxHp * 0.25 && this.species !== 'bear';
    if (lowHp && dist < 40) {
      this.setState('flee');
      return;
    }
    if (spec.temper === 'passive') {
      const scare = player.sprinting ? 24 : player.crouching ? 7 : 13;
      if (dist < scare || this.aggro > 0) this.setState('flee');
      else if (this.state === 'flee' && this.stateTime > 6) this.setState('wander');
      return;
    }
    if (spec.temper === 'defensive') {
      if (this.aggro > 0 || dist < 6) {
        if (this.state !== 'chase') this.aggro = Math.max(this.aggro, 10);
        this.setState('chase');
      } else if (this.state === 'chase') this.setState('wander');
      return;
    }
    const detect = (night ? spec.nightDetect : spec.detect) * (player.crouching ? 0.6 : 1);
    if (this.state === 'chase') {
      if (dist > detect * 2.4 && this.aggro <= 0) this.setState('wander');
    } else if (this.aggro > 0 || (dist < detect && this.canSeePlayer(detect))) {
      this.setState('chase');
    }
  }

  update(dt) {
    if (this.dead) {
      this.corpseTime -= dt;
      if (this.corpseTime <= 0) this.game.entities.removeAnimal(this);
      return;
    }
    this.stateTime += dt;
    this.attackCooldown -= dt;
    this.aggro -= dt;
    this.ignorePlayer -= dt;
    this.lunge = Math.max(0, this.lunge - dt * 3);
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.3;
      this.think();
    }

    const spec = this.spec;
    const p = this.game.player.position;
    switch (this.state) {
      case 'idle':
        this.move(0, 0, 0, dt);
        if (this.stateTime > 4 + Math.random() * 4) this.setState('wander');
        break;
      case 'wander': {
        if (!this.target) {
          this.setState('idle');
          break;
        }
        const dx = this.target.x - this.pos.x;
        const dz = this.target.z - this.pos.z;
        if (Math.hypot(dx, dz) < 1.5 || this.stateTime > 14) this.setState('idle');
        else this.move(dx, dz, spec.walk, dt, 3);
        break;
      }
      case 'flee': {
        const dx = this.pos.x - p.x;
        const dz = this.pos.z - p.z;
        this.move(dx, dz, spec.run, dt, 6);
        if (this.stateTime > 10 && this.distanceToPlayer() > 40) this.setState('wander');
        break;
      }
      case 'chase': {
        const dx = p.x - this.pos.x;
        const dz = p.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        const dy = p.y - this.pos.y;
        if (dist > spec.attackRange * 0.8) this.move(dx, dz, spec.run, dt, 7);
        else {
          this.move(0, 0, 0, dt);
          this.yaw = Math.atan2(dx, dz);
        }
        this.sinceAttack += dt;
        // Bites need a clear line to the player, so walls and doors keep you safe.
        if (dist < spec.attackRange && Math.abs(dy) < 1.6 && this.attackCooldown <= 0 && !this.game.player.dead && this.canSeePlayer(spec.attackRange + 1.5)) {
          this.attackCooldown = spec.attackRate;
          this.sinceAttack = 0;
          this.lunge = 1;
          this.game.player.takeDamage(spec.damage, { cause: `Killed by a ${spec.name.toLowerCase()}`, bleed: spec.bleed, from: this.pos });
          this.game.audio.play('hit_flesh', { x: this.pos.x, y: this.pos.y, z: this.pos.z });
        }
        // Give up on prey it cannot reach, such as a player standing on a foundation.
        if (dist < 4 && dy > 1.7) this.unreachable += dt;
        else this.unreachable = Math.max(0, this.unreachable - dt);
        if (this.unreachable > 4 || (this.sinceAttack > 12 && dist < 10)) {
          this.unreachable = 0;
          this.sinceAttack = 0;
          this.ignorePlayer = 15;
          this.aggro = 0;
          this.setState('wander');
        }
        break;
      }
      default:
        break;
    }
    this.applyGravity(dt);
    this.syncCollider();
    this.animate(dt);
  }

  animate(dt) {
    const speed = this.speed;
    this.walkPhase += dt * speed * (this.species === 'bear' ? 2.2 : 3.2);
    const amp = Math.min(0.75, speed * 0.12);
    this.parts.legs.forEach((leg, i) => {
      const phase = i === 0 || i === 3 ? 0 : Math.PI;
      leg.rotation.x = Math.sin(this.walkPhase + phase) * amp;
    });
    const head = this.parts.head;
    head.rotation.x = this.state === 'idle' ? 0.5 + Math.sin(this.stateTime * 1.3) * 0.1 : -this.lunge * 0.5;
  }

  takeDamage(ctx) {
    if (this.dead) return { killed: false };
    this.hp -= ctx.damage;
    this.aggro = 12;
    this.ignorePlayer = 0;
    this.game.audio.play('animal_hurt', { x: this.pos.x, y: this.pos.y, z: this.pos.z });
    if (ctx.point) this.game.effects.burst(ctx.point.x, ctx.point.y, ctx.point.z, { count: 8, color: 0x8a1c1c, speed: 2.5, size: 0.05 });
    if (this.hp <= 0) {
      this.die();
      return { killed: true };
    }
    this.thinkTimer = 0;
    return { killed: false };
  }

  die() {
    this.dead = true;
    this.kind = 'corpse';
    this.collider.layer = 'corpse';
    this.collider.solid = false;
    this.speed = 0;
    // Topple onto its side and move the collider to where the body now lies.
    this.group.rotation.z = Math.PI / 2;
    this.group.position.y += this.spec.radius * 0.5;
    const center = new THREE.Vector3(0, this.parts.bodyY, 0).applyEuler(this.group.rotation);
    Object.assign(this.collider, {
      x: this.pos.x + center.x,
      z: this.pos.z + center.z,
      r: Math.max(0.6, this.spec.radius * 1.2),
      y0: this.pos.y - 0.2,
      y1: this.pos.y + this.spec.radius * 1.6,
    });
    this.game.physics.move(this.collider);
    this.yields = makeYields(this.spec.yields);
    this.corpseTime = 300;
    this.game.stats.kills += 1;
  }

  onMeleeHit(ctx) {
    if (!this.dead) {
      const result = this.takeDamage({ damage: ctx.tool.melee.damage, point: ctx.point, attacker: ctx.player });
      return { material: 'flesh', damaged: true, killed: result.killed };
    }
    const power = ctx.tool.melee.gather?.flesh ?? 0;
    this.game.effects.burst(ctx.point.x, ctx.point.y, ctx.point.z, { count: 6, color: 0x8a1c1c, speed: 2, size: 0.05 });
    if (power > 0) {
      const inv = this.game.player.inventory;
      const done = harvest(this.yields, power, (id, n) => inv.give(id, n));
      if (done) this.game.entities.removeAnimal(this);
    }
    return { material: 'flesh' };
  }
}
