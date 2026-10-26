import { ITEMS } from './ItemDatabase.js';

// Paints item icons with the 2D canvas API on a 64x64 grid and caches them as
// data URLs. Each item's `icon` field is [shape, ...colors].

const SIZE = 96;
const cache = new Map();

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function poly(ctx, pts, fill, stroke = 'rgba(0,0,0,0.45)') {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function circle(ctx, x, y, r, fill, stroke = 'rgba(0,0,0,0.45)') {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function rect(ctx, x, y, w, h, fill, stroke = 'rgba(0,0,0,0.45)', rot = 0) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rot);
  ctx.fillStyle = fill;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

function line(ctx, x0, y0, x1, y1, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function handle(ctx, x0, y0, x1, y1) {
  line(ctx, x0, y0, x1, y1, '#3a2614', 7);
  line(ctx, x0, y0, x1, y1, '#8a6238', 4.5);
}

const SHAPES = {
  logs(ctx) {
    for (const [x, y] of [[10, 30], [24, 38], [16, 18]]) {
      rect(ctx, x, y, 38, 13, '#8a5c34', 'rgba(0,0,0,0.5)', -0.25);
      ctx.save();
      ctx.translate(x + 38, y + 1);
      circle(ctx, 0, 6, 6.5, '#d9b27a');
      circle(ctx, 0, 6, 3, '#b48a55', null);
      ctx.restore();
    }
  },
  stones(ctx, c) {
    poly(ctx, [10, 44, 16, 30, 30, 26, 36, 36, 30, 48, 16, 50], c);
    poly(ctx, [30, 46, 36, 32, 50, 28, 56, 42, 48, 52, 36, 52], shade(c, -20));
    poly(ctx, [22, 30, 28, 18, 40, 16, 44, 26, 36, 32], shade(c, 15));
  },
  ore(ctx, base, speck) {
    poly(ctx, [8, 46, 14, 26, 30, 14, 48, 18, 58, 36, 50, 52, 24, 54], base);
    ctx.fillStyle = speck;
    for (const [x, y, r] of [[24, 28, 4], [38, 24, 3], [44, 40, 5], [22, 44, 3], [32, 38, 3.5]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  frags(ctx, c) {
    poly(ctx, [8, 40, 22, 30, 28, 44, 14, 50], c);
    poly(ctx, [26, 28, 42, 18, 46, 34, 32, 38], shade(c, 20));
    poly(ctx, [34, 44, 52, 38, 56, 52, 40, 56], shade(c, -15));
    poly(ctx, [16, 20, 26, 12, 30, 22], shade(c, 10));
  },
  powder(ctx, c) {
    poly(ctx, [6, 52, 20, 30, 32, 22, 44, 30, 58, 52], c);
    ctx.fillStyle = shade(c, 30);
    for (let i = 0; i < 14; i++) ctx.fillRect(14 + Math.random() * 36, 32 + Math.random() * 18, 2, 2);
  },
  chunks(ctx, c) {
    poly(ctx, [10, 40, 20, 30, 30, 36, 26, 50, 12, 50], c);
    poly(ctx, [28, 30, 40, 22, 50, 30, 46, 44, 32, 42], shade(c, 18));
    poly(ctx, [36, 46, 50, 42, 56, 54, 40, 56], shade(c, 8));
  },
  cloth(ctx, c) {
    rect(ctx, 10, 18, 44, 30, c);
    rect(ctx, 14, 24, 44, 26, shade(c, -20));
    ctx.setLineDash([3, 3]);
    line(ctx, 18, 30, 54, 30, 'rgba(60,40,20,0.6)', 1.5);
    ctx.setLineDash([]);
  },
  hide(ctx, c) {
    poly(ctx, [12, 18, 24, 22, 32, 14, 40, 22, 52, 18, 50, 34, 56, 48, 40, 46, 32, 54, 24, 46, 8, 48, 14, 34], c);
  },
  bone(ctx, c) {
    for (const [x, y, rot] of [[14, 30, -0.5], [22, 22, 0.4]]) {
      ctx.save();
      ctx.translate(x + 14, y + 6);
      ctx.rotate(rot);
      rect(ctx, -14, -3, 28, 7, c);
      circle(ctx, -15, -3, 4.5, c);
      circle(ctx, -15, 4, 4.5, c);
      circle(ctx, 15, -3, 4.5, c);
      circle(ctx, 15, 4, 4.5, c);
      ctx.restore();
    }
  },
  blob(ctx, c) {
    poly(ctx, [14, 44, 12, 30, 24, 20, 40, 20, 52, 30, 50, 44, 34, 50], c);
    circle(ctx, 28, 30, 4, shade(c, 18), null);
  },
  jerrycan(ctx, c) {
    rect(ctx, 14, 16, 34, 40, c);
    rect(ctx, 20, 10, 14, 8, '#333');
    line(ctx, 18, 22, 44, 50, shade(c, -40), 3);
    line(ctx, 44, 22, 18, 50, shade(c, -40), 3);
  },
  scrap(ctx, c) {
    rect(ctx, 10, 32, 24, 18, c, undefined, -0.3);
    circle(ctx, 42, 36, 10, shade(c, -15));
    circle(ctx, 42, 36, 4, '#3a3a33', null);
    rect(ctx, 24, 14, 20, 12, shade(c, 20), undefined, 0.4);
  },
  rope(ctx, c) {
    ctx.lineWidth = 5;
    for (const r of [20, 14, 8]) {
      ctx.strokeStyle = r === 14 ? shade(c, -25) : c;
      ctx.beginPath();
      ctx.arc(32, 34, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  pipe(ctx, c) {
    rect(ctx, 6, 26, 52, 12, c, undefined, -0.35);
    ctx.save();
    ctx.translate(52, 22);
    circle(ctx, 0, 0, 6.5, shade(c, -25));
    circle(ctx, 0, 0, 3.5, '#222', null);
    ctx.restore();
  },
  spring(ctx, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const x = 12 + i * 5;
      const y = i % 2 ? 20 : 44;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
  gear(ctx, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 18 : 24;
      ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.stroke();
    circle(ctx, 32, 32, 7, '#222', null);
  },
  rock(ctx) {
    poly(ctx, [12, 40, 18, 22, 34, 14, 50, 22, 54, 40, 42, 52, 22, 52], '#8d8780');
    poly(ctx, [20, 26, 32, 18, 44, 24, 34, 30], '#a9a39b', null);
  },
  torch(ctx) {
    handle(ctx, 18, 56, 40, 20);
    rect(ctx, 34, 14, 12, 12, '#c9b48a', undefined, 0.5);
    poly(ctx, [36, 14, 44, 2, 50, 12, 46, 18], '#ffb13b', null);
    poly(ctx, [40, 12, 44, 6, 46, 14], '#ffe9a0', null);
  },
  hatchet(ctx, c) {
    handle(ctx, 16, 58, 44, 10);
    poly(ctx, [38, 10, 56, 4, 60, 26, 42, 22], c);
    line(ctx, 40, 14, 46, 16, '#5c3a1c', 4);
  },
  pickaxe(ctx, c) {
    handle(ctx, 16, 58, 40, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    poly(ctx, [10, 18, 36, 8, 62, 16, 60, 20, 36, 14, 12, 24], c);
  },
  hammer(ctx) {
    handle(ctx, 18, 58, 40, 18);
    rect(ctx, 26, 6, 30, 14, '#6c6f73', undefined, 0.5);
  },
  plan(ctx) {
    rect(ctx, 8, 14, 48, 36, '#1e5a9c', 'rgba(0,0,0,0.5)', -0.08);
    ctx.strokeStyle = 'rgba(220,235,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 26, 24, 16);
    ctx.beginPath();
    ctx.moveTo(18, 26);
    ctx.lineTo(32, 18);
    ctx.lineTo(46, 26);
    ctx.stroke();
  },
  spear(ctx) {
    handle(ctx, 8, 58, 50, 14);
    poly(ctx, [48, 18, 60, 4, 54, 20], '#c9a874');
  },
  knife(ctx) {
    rect(ctx, 12, 40, 18, 8, '#7a5230', undefined, -0.7);
    poly(ctx, [26, 36, 54, 10, 50, 22, 30, 42], '#e6dcc4');
  },
  bow(ctx) {
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(10, 32, 36, -0.95, 0.95);
    ctx.stroke();
    line(ctx, 31, 3, 31, 61, '#e8e0cc', 1.5);
    rect(ctx, 40, 28, 8, 10, '#c9b48a');
  },
  arrow(ctx) {
    line(ctx, 10, 54, 52, 12, '#a07848', 3.5);
    poly(ctx, [50, 8, 60, 4, 56, 14], '#9a958d');
    poly(ctx, [8, 50, 4, 60, 14, 56, 14, 52], '#c4545a', null);
  },
  revolver(ctx) {
    rect(ctx, 22, 18, 36, 9, '#5c6064');
    rect(ctx, 20, 20, 14, 16, '#4b4f53');
    poly(ctx, [18, 30, 30, 32, 24, 56, 12, 54], '#6b4a2b');
    line(ctx, 26, 36, 30, 42, '#333', 2);
  },
  shotgun(ctx) {
    rect(ctx, 22, 18, 40, 7, '#6d7277', undefined, 0.15);
    poly(ctx, [4, 36, 22, 22, 32, 26, 14, 46], '#7a5230');
    rect(ctx, 22, 24, 10, 8, '#444');
  },
  bullets(ctx, c) {
    for (const x of [16, 28, 40]) {
      rect(ctx, x, 26, 9, 24, c);
      poly(ctx, [x, 26, x + 4.5, 14, x + 9, 26], '#b07a3a');
    }
  },
  shells(ctx, c) {
    for (const x of [16, 34]) {
      rect(ctx, x, 18, 14, 26, c);
      rect(ctx, x, 42, 14, 8, '#c9a14a');
    }
  },
  bandage(ctx) {
    circle(ctx, 30, 34, 18, '#ece6da');
    circle(ctx, 30, 34, 8, '#d6cfc0');
    rect(ctx, 30, 16, 26, 14, '#ece6da');
    rect(ctx, 36, 20, 10, 6, '#c44', null);
  },
  syringe(ctx) {
    rect(ctx, 14, 26, 32, 12, '#d8eef4', undefined, -0.6);
    rect(ctx, 18, 28, 16, 8, '#c4545a', null, -0.6);
    line(ctx, 40, 18, 54, 8, '#aaa', 2);
    line(ctx, 10, 46, 4, 52, '#666', 5);
  },
  meat(ctx, c) {
    poly(ctx, [10, 36, 18, 18, 38, 14, 52, 24, 50, 42, 30, 50], c);
    poly(ctx, [18, 30, 26, 22, 38, 22, 42, 32, 30, 38], shade(c, 25), null);
    line(ctx, 48, 40, 58, 52, '#e8e0cc', 5);
  },
  mushroom(ctx) {
    rect(ctx, 26, 30, 12, 22, '#e8e0cc');
    poly(ctx, [10, 34, 18, 16, 32, 10, 46, 16, 54, 34], '#b8322a');
    circle(ctx, 24, 22, 3, '#f4ede0', null);
    circle(ctx, 38, 20, 3.5, '#f4ede0', null);
    circle(ctx, 32, 28, 2.5, '#f4ede0', null);
  },
  berries(ctx) {
    for (const [x, y] of [[22, 30], [34, 26], [30, 40], [42, 38], [20, 44], [44, 50], [32, 52]]) circle(ctx, x, y, 7, '#3a4f9c');
    poly(ctx, [30, 14, 40, 8, 38, 20], '#5b8a3a');
  },
  can(ctx, c) {
    rect(ctx, 16, 14, 32, 40, c);
    rect(ctx, 16, 24, 32, 18, '#b8322a', null);
    ctx.fillStyle = '#f4ede0';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('BEANS', 18, 37);
  },
  campfire(ctx) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      circle(ctx, 32 + Math.cos(a) * 20, 48 + Math.sin(a) * 6, 5, '#8d8780');
    }
    line(ctx, 18, 50, 44, 40, '#7a5230', 6);
    line(ctx, 46, 50, 20, 40, '#7a5230', 6);
    poly(ctx, [22, 42, 30, 14, 36, 26, 40, 18, 44, 42], '#ff9a3b', null);
    poly(ctx, [28, 42, 32, 26, 38, 42], '#ffe39a', null);
  },
  furnace(ctx) {
    poly(ctx, [12, 56, 16, 18, 32, 8, 48, 18, 52, 56], '#8d8780');
    rect(ctx, 24, 36, 16, 14, '#2a1a10');
    rect(ctx, 27, 40, 10, 8, '#ff8a2b', null);
    rect(ctx, 28, 4, 8, 8, '#6c6760');
  },
  box(ctx) {
    rect(ctx, 8, 22, 48, 30, '#9a6a3a');
    rect(ctx, 8, 16, 48, 10, '#b07a45');
    line(ctx, 8, 36, 56, 36, '#5c3a1c', 2);
    rect(ctx, 28, 24, 8, 8, '#6c6f73');
  },
  sleeping_bag(ctx) {
    rect(ctx, 8, 20, 50, 26, '#3f6b8c');
    rect(ctx, 8, 20, 14, 26, '#c9b48a');
    line(ctx, 22, 33, 56, 33, '#2c4f6a', 2);
  },
  workbench(ctx) {
    rect(ctx, 6, 22, 52, 10, '#9a6a3a');
    rect(ctx, 10, 32, 6, 22, '#6b4a2b');
    rect(ctx, 48, 32, 6, 22, '#6b4a2b');
    rect(ctx, 20, 14, 18, 8, '#6c6f73');
    rect(ctx, 16, 42, 32, 4, '#7a5230', null);
  },
  door(ctx) {
    rect(ctx, 16, 6, 32, 52, '#9a6a3a');
    line(ctx, 26, 6, 26, 58, '#6b4a2b', 2);
    line(ctx, 38, 6, 38, 58, '#6b4a2b', 2);
    circle(ctx, 42, 34, 3, '#c9a14a');
  },
  helmet(ctx, c) {
    ctx.beginPath();
    ctx.arc(32, 38, 22, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.stroke();
    for (const x of [16, 26, 38, 48]) line(ctx, x, 38, x - 2, 48, c, 4);
  },
  vest(ctx, c) {
    poly(ctx, [16, 10, 26, 14, 38, 14, 48, 10, 56, 24, 50, 56, 14, 56, 8, 24], c);
    line(ctx, 32, 16, 32, 56, shade(c, -35), 2);
  },
  pants(ctx, c) {
    poly(ctx, [16, 8, 48, 8, 50, 58, 36, 58, 32, 24, 28, 58, 14, 58], c);
    line(ctx, 16, 14, 48, 14, shade(c, -35), 2);
  },
};

export function getIcon(id) {
  if (cache.has(id)) return cache.get(id);
  const def = ITEMS[id];
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');
  ctx.scale(SIZE / 64, SIZE / 64);
  const [shape, ...colors] = def?.icon ?? ['stones', '#888888'];
  const draw = SHAPES[shape];
  if (draw) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1.5;
    draw(ctx, ...colors);
  }
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}
