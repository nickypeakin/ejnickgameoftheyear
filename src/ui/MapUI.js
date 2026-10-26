import * as THREE from '../lib/three.js';

// Full-screen island map with a lettered grid, monuments, sleeping bags, the
// player's last death backpack and the player's own position and heading.

const SIZE = 640;
const GRID = 10;

export class MapUI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('map');
    this.root.innerHTML = `
      <div class="map-frame panel">
        <div class="map-head"><h2 class="panel-title">Island map</h2><span class="map-coords"></span><span class="map-close">M or Esc to close</span></div>
        <div class="map-canvas-wrap"><canvas width="${SIZE}" height="${SIZE}" aria-label="Map of the island"></canvas></div>
        <ul class="map-legend">
          <li><i class="lg-player"></i>You</li>
          <li><i class="lg-monument"></i>Monument</li>
          <li><i class="lg-bag"></i>Sleeping bag</li>
          <li><i class="lg-death"></i>Your backpack</li>
        </ul>
      </div>`;
    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.coords = this.root.querySelector('.map-coords');
    this.base = null;
  }

  get isOpen() {
    return !this.root.hidden;
  }

  // Paint the terrain once per world with simple hill shading.
  buildBase() {
    const terrain = this.game.terrain;
    const RES = SIZE / 2;
    const raw = document.createElement('canvas');
    raw.width = RES;
    raw.height = RES;
    const rawCtx = raw.getContext('2d');
    const img = rawCtx.createImageData(RES, RES);
    const col = new THREE.Color();
    const light = new THREE.Vector3(-0.6, 0.7, -0.4).normalize();
    const n = new THREE.Vector3();
    for (let py = 0; py < RES; py++) {
      for (let px = 0; px < RES; px++) {
        const x = ((px + 0.5) / RES) * terrain.size - terrain.half;
        const z = ((py + 0.5) / RES) * terrain.size - terrain.half;
        const h = terrain.getHeight(x, z);
        let r;
        let g;
        let b;
        if (h < 0) {
          const t = Math.min(1, -h / 12);
          r = 58 - t * 30;
          g = 118 - t * 50;
          b = 140 - t * 40;
        } else {
          terrain.getNormal(x, z, n);
          terrain.colorFor(x, z, h, 1 - n.y, terrain.getForest(x, z), col);
          col.convertLinearToSRGB();
          const shade = 0.7 + Math.max(0, n.dot(light)) * 0.45;
          r = col.r * 255 * shade;
          g = col.g * 255 * shade;
          b = col.b * 255 * shade;
        }
        const i = (py * RES + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    rawCtx.putImageData(img, 0, 0);
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(raw, 0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(20,18,16,0.28)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(20,18,16,0.6)';
    ctx.font = '600 11px "Barlow Condensed", sans-serif';
    const step = SIZE / GRID;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step + 0.5, 0);
      ctx.lineTo(i * step + 0.5, SIZE);
      ctx.moveTo(0, i * step + 0.5);
      ctx.lineTo(SIZE, i * step + 0.5);
      ctx.stroke();
    }
    for (let gx = 0; gx < GRID; gx++) {
      for (let gy = 0; gy < GRID; gy++) ctx.fillText(`${String.fromCharCode(65 + gx)}${gy}`, gx * step + 4, gy * step + 13);
    }
    this.base = c;
  }

  toMap(x, z) {
    const t = this.game.terrain;
    return [((x + t.half) / t.size) * SIZE, ((z + t.half) / t.size) * SIZE];
  }

  gridRef(x, z) {
    const [px, py] = this.toMap(x, z);
    const step = SIZE / GRID;
    return `${String.fromCharCode(65 + Math.min(GRID - 1, Math.max(0, Math.floor(px / step))))}${Math.min(GRID - 1, Math.max(0, Math.floor(py / step)))}`;
  }

  open() {
    if (!this.base) this.buildBase();
    this.root.hidden = false;
    this.draw();
  }

  close() {
    this.root.hidden = true;
  }

  invalidate() {
    this.base = null;
  }

  marker(x, z, color, size, label) {
    const ctx = this.ctx;
    const [px, py] = this.toMap(x, z);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1b1916';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (label) {
      ctx.font = '700 13px "Barlow Condensed", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,18,16,0.85)';
      ctx.strokeText(label, px + size + 4, py + 4);
      ctx.fillStyle = '#f1ead9';
      ctx.fillText(label, px + size + 4, py + 4);
    }
  }

  draw() {
    if (!this.isOpen) return;
    const game = this.game;
    const ctx = this.ctx;
    ctx.drawImage(this.base, 0, 0);
    for (const site of game.monuments.sites) this.marker(site.x, site.z, '#d16a34', 6, site.name);
    for (const bag of game.deployables.sleepingBags()) this.marker(bag.x, bag.z, '#4c86b8', 4);
    if (game.deathMarker) this.marker(game.deathMarker.x, game.deathMarker.z, '#c23b2f', 5, 'Backpack');

    const p = game.player.position;
    const [px, py] = this.toMap(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-game.player.yaw);
    ctx.fillStyle = '#f5f0e2';
    ctx.strokeStyle = '#1b1916';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    this.coords.textContent = `Grid ${this.gridRef(p.x, p.z)}`;
  }
}
