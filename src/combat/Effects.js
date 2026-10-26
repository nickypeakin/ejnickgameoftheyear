import * as THREE from '../lib/three.js';

// Particles (one instanced mesh), bullet tracers, muzzle flashes and the fixed pool
// of point lights. The light count never changes after start-up, so materials
// never need to recompile mid-game.

const MAX_PARTICLES = 700;
const FIRE_LIGHTS = 4;

export class Effects {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.particles = [];
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();

    this.tracers = [];
    for (let i = 0; i < 16; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, fog: false }));
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerIndex = 0;

    this.flashLight = new THREE.PointLight(0xffc070, 0, 16, 1.6);
    this.flashTimer = 0;
    this.torchLight = new THREE.PointLight(0xffa04a, 0, 22, 1.4);
    this.fireLights = [];
    for (let i = 0; i < FIRE_LIGHTS; i++) {
      const light = new THREE.PointLight(0xff8a3a, 0, 18, 1.5);
      this.fireLights.push(light);
      scene.add(light);
    }
    scene.add(this.flashLight, this.torchLight);
  }

  burst(x, y, z, { count = 8, color = 0xffffff, speed = 3, size = 0.06, life = 0.6, gravity = 14, normal = null } = {}) {
    this.color.set(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      let vx = (Math.random() * 2 - 1) * speed;
      let vy = Math.random() * speed * 1.2;
      let vz = (Math.random() * 2 - 1) * speed;
      if (normal) {
        vx += normal.x * speed;
        vy += normal.y * speed;
        vz += normal.z * speed;
      }
      const shade = 0.75 + Math.random() * 0.5;
      this.particles.push({
        x, y, z, vx, vy, vz,
        life: life * (0.6 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.8),
        gravity,
        r: this.color.r * shade,
        g: this.color.g * shade,
        b: this.color.b * shade,
        rot: Math.random() * 3,
      });
    }
  }

  tracer(x0, y0, z0, x1, y1, z1) {
    const t = this.tracers[this.tracerIndex];
    this.tracerIndex = (this.tracerIndex + 1) % this.tracers.length;
    const pos = t.line.geometry.attributes.position;
    // Start a little in front of the muzzle so the line reads as a streak.
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz) || 1;
    const s = Math.min(1.5, len * 0.5) / len;
    pos.setXYZ(0, x0 + dx * s, y0 + dy * s, z0 + dz * s);
    pos.setXYZ(1, x1, y1, z1);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.85;
    t.life = 0.07;
  }

  muzzleFlash(x, y, z) {
    this.flashLight.position.set(x, y, z);
    this.flashLight.intensity = 30;
    this.flashTimer = 0.05;
    this.burst(x, y, z, { count: 3, color: 0xffd27a, speed: 1.2, size: 0.05, life: 0.08, gravity: 0 });
  }

  update(dt) {
    let n = 0;
    const d = this.dummy;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += dt * 6;
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.rot, p.rot * 0.7, 0);
      d.scale.setScalar(p.size * Math.min(1, p.life * 4));
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.color.setRGB(p.r, p.g, p.b);
      this.mesh.setColorAt(n, this.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
      if (t.life <= 0) t.line.visible = false;
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashLight.intensity = 0;
    }
  }
}
