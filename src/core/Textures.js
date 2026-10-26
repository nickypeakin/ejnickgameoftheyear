import * as THREE from '../lib/three.js';

// Procedurally painted canvas textures (no image assets). Each is built on first
// use and cached.

const cache = new Map();

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, { srgb = true, repeat = true } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function speckle(ctx, w, h, count, colors, size = [1, 3]) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    const s = size[0] + Math.random() * (size[1] - size[0]);
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

const BUILDERS = {
  // Brightness modulation applied over the terrain's vertex colors.
  terrainDetail() {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = 205 + Math.random() * 50;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    return finish(c, { srgb: false });
  },

  planks() {
    const c = canvas(256);
    const ctx = c.getContext('2d');
    const plankW = 256 / 5;
    for (let i = 0; i < 5; i++) {
      const base = 120 + Math.random() * 30;
      ctx.fillStyle = `rgb(${base + 25}, ${base - 15}, ${base - 60})`;
      ctx.fillRect(i * plankW, 0, plankW, 256);
      ctx.strokeStyle = 'rgba(60,35,15,0.35)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 7; g++) {
        const gx = i * plankW + 4 + Math.random() * (plankW - 8);
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.bezierCurveTo(gx + 4, 80, gx - 4, 170, gx + 2, 256);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,22,8,0.9)';
      ctx.fillRect(i * plankW, 0, 2, 256);
      ctx.fillStyle = '#3b3b3b';
      for (const ny of [18, 238]) {
        ctx.beginPath();
        ctx.arc(i * plankW + plankW / 2, ny, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(70,40,15,0.9)';
    ctx.fillRect(0, 124, 256, 8);
    return finish(c);
  },

  stoneBlocks() {
    const c = canvas(256);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#6f6b66';
    ctx.fillRect(0, 0, 256, 256);
    const rows = 4;
    const rh = 256 / rows;
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 ? 64 : 0;
      for (let b = -1; b < 3; b++) {
        const x = b * 128 + offset;
        const v = 135 + Math.random() * 35;
        ctx.fillStyle = `rgb(${v}, ${v - 4}, ${v - 10})`;
        ctx.fillRect(x + 3, r * rh + 3, 122, rh - 6);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x + 3, r * rh + 3, 122, 5);
      }
    }
    speckle(ctx, 256, 256, 900, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)']);
    return finish(c);
  },

  metalSheet() {
    const c = canvas(256);
    const ctx = c.getContext('2d');
    for (let x = 0; x < 256; x += 16) {
      const grad = ctx.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, '#5d6266');
      grad.addColorStop(0.5, '#8d9398');
      grad.addColorStop(1, '#565a5e');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 16, 256);
    }
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(${130 + Math.random() * 40}, ${60 + Math.random() * 20}, 25, ${0.25 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 14, 3 + Math.random() * 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3c3f42';
    for (const y of [10, 246]) for (let x = 8; x < 256; x += 32) ctx.fillRect(x, y, 4, 4);
    return finish(c);
  },

  twig() {
    const c = canvas(128);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.lineCap = 'round';
    const stick = (x0, y0, x1, y1, w) => {
      ctx.strokeStyle = `rgb(${150 + Math.random() * 30}, ${110 + Math.random() * 20}, ${60 + Math.random() * 15})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };
    stick(0, 4, 128, 4, 7);
    stick(0, 124, 128, 124, 7);
    stick(4, 0, 4, 128, 7);
    stick(124, 0, 124, 128, 7);
    stick(-10, 138, 138, -10, 5);
    stick(-10, -10, 138, 138, 5);
    stick(0, 64, 128, 64, 4);
    return finish(c);
  },

  concrete() {
    const c = canvas(256);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8f8b84';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 3000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.07)', 'rgba(60,50,40,0.1)'], [1, 2]);
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * 256;
      const grad = ctx.createLinearGradient(x, 0, x, 256);
      grad.addColorStop(0, 'rgba(80,60,40,0.25)');
      grad.addColorStop(1, 'rgba(80,60,40,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 6 + Math.random() * 10, 140 + Math.random() * 110);
    }
    ctx.strokeStyle = 'rgba(40,36,32,0.45)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      let x = Math.random() * 256;
      let y = Math.random() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (Math.random() - 0.5) * 40;
        y += Math.random() * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return finish(c);
  },

  // Neutral corrugated panel; materials tint it per shipping container.
  corrugated() {
    const c = canvas(256);
    const ctx = c.getContext('2d');
    for (let x = 0; x < 256; x += 12) {
      ctx.fillStyle = '#e6e6e6';
      ctx.fillRect(x, 0, 6, 256);
      ctx.fillStyle = '#b4b4b4';
      ctx.fillRect(x + 6, 0, 6, 256);
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(90,50,20,${0.15 + Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 10, 2 + Math.random() * 30);
    }
    return finish(c);
  },

  // Alpha-cut grass blades; vertex colors on the tuft supply the green.
  grassBlades() {
    const c = canvas(128);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 16; i++) {
      const x = 6 + Math.random() * 116;
      const lean = (Math.random() - 0.5) * 34;
      const h = 70 + Math.random() * 56;
      const w = 3 + Math.random() * 4;
      const v = 200 + Math.random() * 55;
      ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
      ctx.beginPath();
      ctx.moveTo(x - w, 128);
      ctx.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h);
      ctx.quadraticCurveTo(x + lean * 0.3 + w * 0.5, 128 - h * 0.5, x + w, 128);
      ctx.closePath();
      ctx.fill();
    }
    return finish(c, { repeat: false });
  },

  blueprint() {
    const c = canvas(256, 180);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1e5a9c';
    ctx.fillRect(0, 0, 256, 180);
    ctx.strokeStyle = 'rgba(200,225,255,0.35)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 256; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 180);
      ctx.stroke();
    }
    for (let y = 0; y < 180; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(235,245,255,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(60, 40, 136, 100);
    ctx.beginPath();
    ctx.moveTo(60, 40);
    ctx.lineTo(128, 12);
    ctx.lineTo(196, 40);
    ctx.stroke();
    ctx.strokeRect(112, 92, 32, 48);
    return finish(c, { repeat: false });
  },
};

export function getTexture(name) {
  if (!cache.has(name)) {
    const builder = BUILDERS[name];
    if (!builder) throw new Error(`Unknown texture: ${name}`);
    cache.set(name, builder());
  }
  return cache.get(name);
}
