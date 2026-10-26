// Collision world. Colliders live in a uniform 2D spatial hash and come in four
// shapes, all axis aligned:
//   box    { minX, minY, minZ, maxX, maxY, maxZ }
//   cyl    { x, z, r, y0, y1 }            vertical cylinder
//   sphere { x, y, z, r }
//   ramp   { minX..maxZ, axis: 'x'|'z', dir: 1|-1 }  wedge rising along an axis
// Every collider also carries layer, solid (blocks movement) and owner (the game
// object it belongs to; interaction and damage are routed through it).

import { clamp } from '../core/MathUtils.js';

const CELL = 8;
const OFFSET = 1024;

const cellKey = (cx, cz) => (cx + OFFSET) * 4096 + (cz + OFFSET);

// Walkable surface of a ramp; lowY (optional) lifts the low end above the base.
export function rampHeight(c, x, z) {
  let t = c.axis === 'x' ? (x - c.minX) / (c.maxX - c.minX) : (z - c.minZ) / (c.maxZ - c.minZ);
  if (c.dir < 0) t = 1 - t;
  const low = c.lowY ?? c.minY;
  return low + (c.maxY - low) * clamp(t, 0, 1);
}

function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, out) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis = -1;
  let sign = 0;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const mn = [minX, minY, minZ];
  const mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return -1;
      continue;
    }
    let t1 = (mn[i] - o[i]) / d[i];
    let t2 = (mx[i] - o[i]) / d[i];
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = i;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  out[0] = axis === 0 ? sign : 0;
  out[1] = axis === 1 ? sign : 0;
  out[2] = axis === 2 ? sign : 0;
  return tmin < 0 ? 0 : tmin;
}

function rayCyl(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1, out) {
  const px = ox - cx;
  const pz = oz - cz;
  const a = dx * dx + dz * dz;
  const c = px * px + pz * pz - r * r;
  let t = -1;
  if (c <= 0) {
    t = 0;
  } else if (a > 1e-9) {
    const b = 2 * (px * dx + pz * dz);
    const disc = b * b - 4 * a * c;
    if (disc >= 0) t = (-b - Math.sqrt(disc)) / (2 * a);
  }
  if (t >= 0) {
    const y = oy + dy * t;
    if (y >= y0 && y <= y1) {
      const hx = px + dx * t;
      const hz = pz + dz * t;
      const len = Math.hypot(hx, hz) || 1;
      out[0] = hx / len;
      out[1] = 0;
      out[2] = hz / len;
      return t;
    }
  }
  // Caps.
  if (Math.abs(dy) > 1e-9) {
    const capY = dy < 0 ? y1 : y0;
    const tc = (capY - oy) / dy;
    if (tc >= 0) {
      const hx = px + dx * tc;
      const hz = pz + dz * tc;
      if (hx * hx + hz * hz <= r * r) {
        out[0] = 0;
        out[1] = dy < 0 ? 1 : -1;
        out[2] = 0;
        return tc;
      }
    }
  }
  return -1;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, out) {
  const px = ox - cx;
  const py = oy - cy;
  const pz = oz - cz;
  const b = px * dx + py * dy + pz * dz;
  const c = px * px + py * py + pz * pz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  let t = -b - Math.sqrt(disc);
  if (t < 0) t = 0;
  out[0] = (px + dx * t) / r;
  out[1] = (py + dy * t) / r;
  out[2] = (pz + dz * t) / r;
  return t;
}

export class Physics {
  constructor(terrain) {
    this.terrain = terrain;
    this.cells = new Map();
    this.stamp = 1;
    this.normal = [0, 0, 0];
  }

  bounds(c) {
    if (c.shape === 'box' || c.shape === 'ramp') {
      c._x0 = c.minX;
      c._z0 = c.minZ;
      c._x1 = c.maxX;
      c._z1 = c.maxZ;
    } else {
      c._x0 = c.x - c.r;
      c._z0 = c.z - c.r;
      c._x1 = c.x + c.r;
      c._z1 = c.z + c.r;
    }
  }

  add(c) {
    this.bounds(c);
    c._cx0 = Math.floor(c._x0 / CELL);
    c._cz0 = Math.floor(c._z0 / CELL);
    c._cx1 = Math.floor(c._x1 / CELL);
    c._cz1 = Math.floor(c._z1 / CELL);
    for (let cx = c._cx0; cx <= c._cx1; cx++) {
      for (let cz = c._cz0; cz <= c._cz1; cz++) {
        const key = cellKey(cx, cz);
        let arr = this.cells.get(key);
        if (!arr) {
          arr = [];
          this.cells.set(key, arr);
        }
        arr.push(c);
      }
    }
    c._inWorld = true;
    return c;
  }

  remove(c) {
    if (!c || !c._inWorld) return;
    for (let cx = c._cx0; cx <= c._cx1; cx++) {
      for (let cz = c._cz0; cz <= c._cz1; cz++) {
        const arr = this.cells.get(cellKey(cx, cz));
        if (!arr) continue;
        const i = arr.indexOf(c);
        if (i >= 0) {
          arr[i] = arr[arr.length - 1];
          arr.pop();
        }
      }
    }
    c._inWorld = false;
  }

  // Re-index a collider after its position changed (moving creatures, doors).
  move(c) {
    if (!c._inWorld) return;
    this.bounds(c);
    if (
      Math.floor(c._x0 / CELL) === c._cx0 && Math.floor(c._z0 / CELL) === c._cz0 &&
      Math.floor(c._x1 / CELL) === c._cx1 && Math.floor(c._z1 / CELL) === c._cz1
    ) return;
    this.remove(c);
    this.add(c);
  }

  query(x0, z0, x1, z1, out = []) {
    const stamp = ++this.stamp;
    const cx0 = Math.floor(x0 / CELL);
    const cz0 = Math.floor(z0 / CELL);
    const cx1 = Math.floor(x1 / CELL);
    const cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const arr = this.cells.get(cellKey(cx, cz));
        if (!arr) continue;
        for (const c of arr) {
          if (c._stamp === stamp) continue;
          c._stamp = stamp;
          if (c._x1 < x0 || c._x0 > x1 || c._z1 < z0 || c._z0 > z1) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  // Highest walkable surface under (x, z) that is no more than stepUp above feetY.
  getGroundHeight(x, z, feetY, stepUp = 0.5, radius = 0.3) {
    let ground = this.terrain.getHeight(x, z);
    const r = radius * 0.55;
    const list = this.query(x - r, z - r, x + r, z + r);
    const limit = feetY + stepUp + 0.001;
    for (const c of list) {
      if (!c.solid || c.noGround) continue;
      let top = -Infinity;
      if (c.shape === 'box') {
        if (x + r < c.minX || x - r > c.maxX || z + r < c.minZ || z - r > c.maxZ) continue;
        top = c.maxY;
      } else if (c.shape === 'ramp') {
        if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
        top = rampHeight(c, x, z);
      } else if (c.shape === 'sphere') {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d > c.r * 0.7) continue;
        top = c.y + Math.sqrt(c.r * c.r - d * d);
      } else {
        continue;
      }
      if (top <= limit && top > ground) ground = top;
    }
    return ground;
  }

  // Lowest solid underside above the given height (stops jumps into ceilings).
  getCeiling(x, z, aboveY, radius = 0.3) {
    let ceiling = Infinity;
    const r = radius * 0.6;
    for (const c of this.query(x - r, z - r, x + r, z + r)) {
      if (!c.solid || c.shape !== 'box') continue;
      if (x + r < c.minX || x - r > c.maxX || z + r < c.minZ || z - r > c.maxZ) continue;
      if (c.minY > aboveY && c.minY < ceiling) ceiling = c.minY;
    }
    return ceiling;
  }

  // Push a vertical capsule (feet at pos.y) out of solid colliders in the XZ plane.
  resolveCircle(pos, radius, height, stepUp, ignore = null) {
    let collided = false;
    const list = [];
    for (let iter = 0; iter < 3; iter++) {
      list.length = 0;
      this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, list);
      let moved = false;
      const feet = pos.y + stepUp;
      const head = pos.y + height;
      for (const c of list) {
        if (!c.solid || c === ignore || (ignore && c.owner === ignore)) continue;
        if (c.shape === 'box' || c.shape === 'ramp') {
          const cx = clamp(pos.x, c.minX, c.maxX);
          const cz = clamp(pos.z, c.minZ, c.maxZ);
          const top = c.shape === 'ramp' ? rampHeight(c, cx, cz) : c.maxY;
          if (top <= feet || c.minY >= head) continue;
          const dx = pos.x - cx;
          const dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= radius * radius) continue;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            pos.x += (dx / d) * (radius - d);
            pos.z += (dz / d) * (radius - d);
          } else {
            const left = pos.x - c.minX;
            const right = c.maxX - pos.x;
            const back = pos.z - c.minZ;
            const front = c.maxZ - pos.z;
            const m = Math.min(left, right, back, front);
            if (m === left) pos.x = c.minX - radius;
            else if (m === right) pos.x = c.maxX + radius;
            else if (m === back) pos.z = c.minZ - radius;
            else pos.z = c.maxZ + radius;
          }
          moved = collided = true;
        } else {
          let y0;
          let y1;
          let r;
          if (c.shape === 'cyl') {
            y0 = c.y0;
            y1 = c.y1;
            r = c.r;
          } else {
            y0 = c.y - c.r * 0.8;
            y1 = c.y + c.r * 0.8;
            r = c.r * 0.9;
          }
          if (y1 <= feet || y0 >= head) continue;
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const min = r + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2);
          if (d > 1e-6) {
            pos.x += (dx / d) * (min - d);
            pos.z += (dz / d) * (min - d);
          } else {
            pos.x += min;
          }
          moved = collided = true;
        }
      }
      if (!moved) break;
    }
    return collided;
  }

  // True when the box overlaps any solid collider that passes the filter.
  boxBlocked(minX, minY, minZ, maxX, maxY, maxZ, filter = null) {
    for (const c of this.query(minX, minZ, maxX, maxZ)) {
      if (!c.solid) continue;
      if (filter && !filter(c)) continue;
      if (c.shape === 'box' || c.shape === 'ramp') {
        if (c.maxX <= minX || c.minX >= maxX || c.maxZ <= minZ || c.minZ >= maxZ) continue;
        if (c.maxY <= minY || c.minY >= maxY) continue;
        return c;
      }
      let y0;
      let y1;
      if (c.shape === 'cyl') {
        y0 = c.y0;
        y1 = c.y1;
      } else {
        y0 = c.y - c.r;
        y1 = c.y + c.r;
      }
      if (y1 <= minY || y0 >= maxY) continue;
      const px = clamp(c.x, minX, maxX);
      const pz = clamp(c.z, minZ, maxZ);
      if ((px - c.x) ** 2 + (pz - c.z) ** 2 < c.r * c.r) return c;
    }
    return null;
  }

  testCollider(c, ox, oy, oz, dx, dy, dz, inflate) {
    const n = this.normal;
    if (c.shape === 'box' || c.shape === 'ramp') {
      return rayBox(ox, oy, oz, dx, dy, dz, c.minX - inflate, c.minY - inflate, c.minZ - inflate, c.maxX + inflate, c.maxY + inflate, c.maxZ + inflate, n);
    }
    if (c.shape === 'cyl') return rayCyl(ox, oy, oz, dx, dy, dz, c.x, c.z, c.r + inflate, c.y0, c.y1, n);
    return raySphere(ox, oy, oz, dx, dy, dz, c.x, c.y, c.z, c.r + inflate, n);
  }

  // Ray query through the hash with a 2D DDA walk, then against the terrain.
  // options: ignore (collider or owner), filter(c) => bool, terrain, inflate.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, { ignore = null, filter = null, terrain = true, inflate = 0 } = {}) {
    let best = maxDist;
    let hit = null;
    const stamp = ++this.stamp;
    let cx = Math.floor(ox / CELL);
    let cz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) > 1e-9 ? Math.abs(CELL / dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-9 ? Math.abs(CELL / dz) : Infinity;
    let tMaxX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz)) : Infinity;
    const spread = inflate > 0 ? 1 : 0;

    for (let guard = 0; guard < 512; guard++) {
      for (let ax = -spread; ax <= spread; ax++) {
        for (let az = -spread; az <= spread; az++) {
          const arr = this.cells.get(cellKey(cx + ax, cz + az));
          if (!arr) continue;
          for (const c of arr) {
            if (c._stamp === stamp) continue;
            c._stamp = stamp;
            if (c.noRay) continue;
            if (ignore && (c === ignore || c.owner === ignore)) continue;
            if (filter && !filter(c)) continue;
            const t = this.testCollider(c, ox, oy, oz, dx, dy, dz, inflate);
            if (t >= 0 && t < best) {
              best = t;
              hit = {
                dist: t,
                x: ox + dx * t,
                y: oy + dy * t,
                z: oz + dz * t,
                nx: this.normal[0],
                ny: this.normal[1],
                nz: this.normal[2],
                collider: c,
                owner: c.owner,
                layer: c.layer,
              };
            }
          }
        }
      }
      const next = Math.min(tMaxX, tMaxZ);
      if (next > best || next > maxDist) break;
      if (tMaxX < tMaxZ) {
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
    }

    if (terrain) {
      const th = this.terrain.raycast(ox, oy, oz, dx, dy, dz, best);
      if (th && th.dist < best) {
        hit = { ...th, collider: null, owner: null, layer: 'terrain' };
      }
    }
    return hit;
  }
}
