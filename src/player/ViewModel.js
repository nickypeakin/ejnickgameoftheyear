import * as THREE from '../lib/three.js';
import { part, mergeGeometries } from '../core/GeometryUtils.js';
import { getTexture } from '../core/Textures.js';
import { damp, easeOutCubic, easeInOutQuad, lerp } from '../core/MathUtils.js';
import { ITEMS } from '../items/ItemDatabase.js';

// First-person held item, rendered in its own scene after the world so it never
// clips into walls. Every model is built with the grip at the origin.

const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
const SKIN = '#c99a74';
const SLEEVE = '#4b4237';

function handParts() {
  return [
    part(new THREE.BoxGeometry(0.06, 0.075, 0.085), SKIN, { y: -0.01 }),
    part(new THREE.BoxGeometry(0.07, 0.07, 0.34), SLEEVE, { x: 0.02, y: -0.07, z: 0.2, rx: -0.25 }),
  ];
}

function mesh(parts) {
  const m = new THREE.Mesh(mergeGeometries(parts), vc);
  return m;
}

function flame() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xff9a30, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const inner = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const a = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), mat);
  const b = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), inner);
  b.position.y = -0.02;
  g.add(a, b);
  return g;
}

const tool = (head) => [
  ...handParts(),
  part(new THREE.CylinderGeometry(0.016, 0.02, 0.55, 6), '#7a5230', { y: 0.14 }),
  ...head,
];

// Tools with a head are turned so the blade face shows instead of its edge.
const HEADED_POSE = { pos: [0.3, -0.34, -0.62], rot: [-0.18, 0.6, 0.12] };
const headed = (parts) => {
  const m = mesh(parts);
  m.userData.pose = HEADED_POSE;
  return m;
};

const BUILDERS = {
  rock: () => mesh([...handParts(), part(new THREE.DodecahedronGeometry(0.08, 0), '#8d8780', { y: 0.06, z: -0.03, sy: 0.85 })]),
  torch() {
    const g = new THREE.Group();
    g.add(mesh([
      ...handParts(),
      part(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 6), '#6b4a2b', { y: 0.13 }),
      part(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 7), '#c9b48a', { y: 0.38 }),
    ]));
    const f = flame();
    f.position.y = 0.48;
    g.add(f);
    g.userData.flame = f;
    return g;
  },
  stone_hatchet: () => headed(tool([part(new THREE.BoxGeometry(0.03, 0.09, 0.15), '#8f8a82', { y: 0.36, z: -0.08 }), part(new THREE.BoxGeometry(0.04, 0.05, 0.05), '#a07848', { y: 0.37 })])),
  metal_hatchet: () => headed(tool([part(new THREE.BoxGeometry(0.02, 0.11, 0.16), '#b9bec3', { y: 0.36, z: -0.08 }), part(new THREE.BoxGeometry(0.04, 0.06, 0.05), '#5c6064', { y: 0.37 })])),
  stone_pickaxe: () => headed(tool([part(new THREE.BoxGeometry(0.03, 0.05, 0.42), '#8f8a82', { y: 0.38, rx: 0.12 })])),
  metal_pickaxe: () => headed(tool([part(new THREE.BoxGeometry(0.025, 0.045, 0.46), '#b9bec3', { y: 0.38, rx: 0.12 })])),
  hammer: () => headed(tool([part(new THREE.BoxGeometry(0.05, 0.06, 0.17), '#6c6f73', { y: 0.38, z: -0.02 })])),
  wooden_spear() {
    const m = mesh([
      ...handParts(),
      part(new THREE.CylinderGeometry(0.016, 0.018, 1.7, 6), '#8a6238', { z: -0.45, rx: Math.PI / 2 }),
      part(new THREE.ConeGeometry(0.03, 0.16, 6), '#c9a874', { z: -1.37, rx: -Math.PI / 2 }),
    ]);
    m.userData.thrust = true;
    return m;
  },
  bone_knife: () => mesh([...handParts(), part(new THREE.BoxGeometry(0.03, 0.04, 0.1), '#7a5230', { y: 0.03 }), part(new THREE.BoxGeometry(0.012, 0.2, 0.035), '#e6dcc4', { y: 0.16, z: -0.01 })]),
  building_plan() {
    const g = new THREE.Group();
    g.add(mesh(handParts()));
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), new THREE.MeshLambertMaterial({ map: getTexture('blueprint'), side: THREE.DoubleSide }));
    sheet.position.set(-0.05, 0.07, -0.02);
    sheet.rotation.set(-0.95, 0.35, 0.1);
    g.add(sheet);
    g.userData.pose = { pos: [0.26, -0.3, -0.62], rot: [0, 0, 0] };
    return g;
  },
  hunting_bow() {
    // Modelled in the XY plane with the grip at the origin and +X pointing back at
    // the shooter once posed; the string is pulled toward +X.
    const g = new THREE.Group();
    const limbs = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 5, 18, Math.PI * 0.7), new THREE.MeshLambertMaterial({ color: '#7a5230' }));
    limbs.rotation.z = Math.PI * 0.65;
    limbs.position.x = 0.42;
    g.add(limbs);
    g.add(mesh([
      part(new THREE.BoxGeometry(0.05, 0.13, 0.05), '#c9b48a'),
      part(new THREE.BoxGeometry(0.3, 0.085, 0.085), SLEEVE, { x: 0.18, y: -0.06 }),
    ]));
    const stringGeo = new THREE.BufferGeometry();
    stringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: '#e8e0cc' }));
    string.frustumCulled = false;
    g.add(string);
    const arrow = mesh([
      part(new THREE.CylinderGeometry(0.008, 0.008, 0.72, 5), '#a07848', { x: -0.36, rz: Math.PI / 2 }),
      part(new THREE.ConeGeometry(0.018, 0.06, 5), '#8f8a82', { x: -0.75, rz: Math.PI / 2 }),
    ]);
    g.add(arrow);
    g.userData = {
      bow: { string, arrow },
      pose: { pos: [-0.1, -0.1, -0.5], rot: [0, -1.45, 0.1] },
      ads: { pos: [-0.03, -0.06, -0.45], rot: [0, -1.52, 0.02] },
    };
    return g;
  },
  revolver() {
    const m = mesh([
      ...handParts(),
      part(new THREE.BoxGeometry(0.035, 0.1, 0.05), '#6b4a2b', { y: 0.01, rx: 0.25 }),
      part(new THREE.BoxGeometry(0.035, 0.05, 0.12), '#4b4f53', { y: 0.07, z: -0.04 }),
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), '#5c6064', { y: 0.07, z: -0.05, rx: Math.PI / 2 }),
      part(new THREE.CylinderGeometry(0.011, 0.011, 0.16, 6), '#3c3f42', { y: 0.085, z: -0.17, rx: Math.PI / 2 }),
    ]);
    m.userData.pose = { pos: [0.2, -0.2, -0.42], rot: [0, 0.04, 0] };
    m.userData.ads = { pos: [0, -0.115, -0.36], rot: [0, 0, 0] };
    m.userData.muzzle = new THREE.Vector3(0, 0.085, -0.26);
    return m;
  },
  pipe_shotgun() {
    const m = mesh([
      ...handParts(),
      part(new THREE.BoxGeometry(0.04, 0.1, 0.05), '#6b4a2b', { y: 0.01, rx: 0.3 }),
      part(new THREE.BoxGeometry(0.045, 0.06, 0.32), '#7a5230', { y: 0.03, z: 0.12, rx: -0.1 }),
      part(new THREE.BoxGeometry(0.05, 0.06, 0.08), '#444', { y: 0.07, z: -0.04 }),
      part(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8), '#6d7277', { y: 0.085, z: -0.34, rx: Math.PI / 2 }),
    ]);
    m.userData.pose = { pos: [0.2, -0.22, -0.4], rot: [0, 0.04, 0] };
    m.userData.ads = { pos: [0, -0.13, -0.32], rot: [0, 0, 0] };
    return m;
  },
  food(color, shape) {
    const parts = [...handParts()];
    if (shape === 'meat') parts.push(part(new THREE.DodecahedronGeometry(0.06, 0), color, { y: 0.07, sx: 1.4, sy: 0.7 }));
    else if (shape === 'can') parts.push(part(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 10), color, { y: 0.08 }));
    else if (shape === 'mushroom') parts.push(part(new THREE.CylinderGeometry(0.015, 0.02, 0.06, 6), '#ece4d2', { y: 0.06 }), part(new THREE.SphereGeometry(0.045, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#b8322a', { y: 0.085 }));
    else if (shape === 'berries') for (const [x, z] of [[0, 0], [0.03, 0.02], [-0.02, 0.03], [0.01, -0.03]]) parts.push(part(new THREE.SphereGeometry(0.022, 6, 4), '#3a4f9c', { x, y: 0.07, z }));
    else if (shape === 'bandage') parts.push(part(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10), '#ece6da', { y: 0.07, rz: Math.PI / 2 }));
    else if (shape === 'syringe') parts.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), '#d8eef4', { y: 0.1 }), part(new THREE.CylinderGeometry(0.003, 0.003, 0.05, 4), '#aaaaaa', { y: 0.19 }));
    return mesh(parts);
  },
  hands: () => mesh(handParts()),
};

const FOOD_SHAPES = {
  raw_meat: ['#c4545a', 'meat'],
  cooked_meat: ['#7a4a2a', 'meat'],
  can_of_beans: ['#c9a14a', 'can'],
  mushroom: ['#b8322a', 'mushroom'],
  blueberries: ['#3a4f9c', 'berries'],
  bandage: ['#ece6da', 'bandage'],
  medical_syringe: ['#d8eef4', 'syringe'],
};

function buildModel(id) {
  if (BUILDERS[id]) return BUILDERS[id]();
  if (FOOD_SHAPES[id]) return BUILDERS.food(...FOOD_SHAPES[id]);
  const type = ITEMS[id]?.type;
  if (type === 'deployable' || type === 'door') return null;
  return BUILDERS.hands();
}

const DEFAULT_POSE = { pos: [0.3, -0.34, -0.62], rot: [-0.18, 0.1, 0.12] };
const MODEL_SCALE = 0.78;

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xc3dbf2, 0x5d5037, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.position.set(-0.5, 1, 0.6);
    this.torchLight = new THREE.PointLight(0xffa04a, 0, 3, 1.5);
    this.torchLight.position.set(0.3, -0.05, -0.5);
    this.scene.add(this.hemi, this.sun, this.torchLight);
    this.root = new THREE.Group();
    this.root.scale.setScalar(MODEL_SCALE);
    this.scene.add(this.root);
    this.models = new Map();
    this.current = null;
    this.currentId = null;
    this.t = 0;
    this.equipT = 1;
    this.swingT = -1;
    this.swingDur = 1;
    this.recoilT = 0;
    this.draw = 0;
    this.aimT = 0;
    this.useT = -1;
    this.useDur = 1;
    this.reloadT = 0;
    this.sprintT = 0;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setItem(id) {
    if (id === this.currentId) return;
    if (this.current) this.root.remove(this.current);
    this.currentId = id;
    this.current = null;
    if (id) {
      if (!this.models.has(id)) this.models.set(id, buildModel(id));
      this.current = this.models.get(id);
      if (this.current) this.root.add(this.current);
    }
    this.equipT = 0;
    this.swingT = -1;
    this.useT = -1;
    this.draw = 0;
  }

  swing(duration) {
    this.swingT = 0;
    this.swingDur = duration;
  }

  recoil(amount = 1) {
    this.recoilT = Math.min(1.5, this.recoilT + amount);
  }

  setDraw(v) {
    this.draw = v;
  }

  use(duration) {
    this.useT = 0;
    this.useDur = duration;
  }

  reload(duration) {
    this.reloadT = duration;
    this.reloadDur = duration;
  }

  update(dt, { aiming, sprinting, bobPhase, bobAmount, lightColor, lightIntensity, hemiIntensity, torchOn }) {
    this.t += dt;
    this.hemi.intensity = hemiIntensity;
    this.sun.color.copy(lightColor);
    this.sun.intensity = lightIntensity * 0.75 + 0.15;
    this.torchLight.intensity = torchOn ? 2.2 + Math.sin(this.t * 19) * 0.2 : 0;
    const m = this.current;
    if (!m) return;
    const ud = m.userData;
    const pose = ud.pose ?? DEFAULT_POSE;
    const ads = ud.ads;
    this.aimT = damp(this.aimT, aiming && ads ? 1 : 0, 14, dt);
    this.sprintT = damp(this.sprintT, sprinting ? 1 : 0, 8, dt);
    this.equipT = Math.min(1, this.equipT + dt * 3.5);

    const pos = new THREE.Vector3(...pose.pos);
    const rot = new THREE.Vector3(...pose.rot);
    if (ads) {
      pos.lerp(new THREE.Vector3(...ads.pos), this.aimT);
      rot.lerp(new THREE.Vector3(...ads.rot), this.aimT);
    }
    const e = 1 - easeOutCubic(this.equipT);
    pos.y -= e * 0.35;
    rot.x -= e * 0.7;
    pos.y -= this.sprintT * 0.05;
    rot.x -= this.sprintT * 0.3;
    rot.y += this.sprintT * 0.35;
    const bobScale = 1 - this.aimT * 0.85;
    pos.x += Math.sin(bobPhase) * 0.012 * bobAmount * bobScale;
    pos.y += Math.abs(Math.cos(bobPhase)) * 0.014 * bobAmount * bobScale;
    pos.y += Math.sin(this.t * 1.6) * 0.003 * bobScale;

    if (this.swingT >= 0) {
      this.swingT += dt;
      const s = this.swingT / this.swingDur;
      if (s >= 1) this.swingT = -1;
      else if (ud.thrust) {
        if (s < 0.3) pos.z += 0.1 * easeOutCubic(s / 0.3);
        else if (s < 0.5) pos.z += 0.1 - 0.42 * ((s - 0.3) / 0.2);
        else pos.z -= 0.32 * (1 - easeInOutQuad((s - 0.5) / 0.5));
      } else if (s < 0.3) {
        const k = easeOutCubic(s / 0.3);
        rot.x += 0.75 * k;
        rot.z -= 0.2 * k;
        pos.y += 0.04 * k;
        pos.x += 0.03 * k;
      } else if (s < 0.5) {
        const k = (s - 0.3) / 0.2;
        rot.x += lerp(0.75, -1.4, k);
        rot.z += lerp(-0.2, 0.3, k);
        pos.z -= 0.12 * k;
        pos.y += lerp(0.04, -0.08, k);
        pos.x -= 0.08 * k;
      } else {
        const k = 1 - easeInOutQuad((s - 0.5) / 0.5);
        rot.x += -1.4 * k;
        rot.z += 0.3 * k;
        pos.z -= 0.12 * k;
        pos.y -= 0.08 * k;
        pos.x -= 0.08 * k;
      }
    }

    if (this.useT >= 0) {
      this.useT += dt;
      const u = Math.min(1, this.useT / this.useDur);
      const k = Math.sin(u * Math.PI);
      pos.y += 0.12 * k;
      pos.x -= 0.12 * k;
      rot.x += 0.6 * k;
      if (u >= 1) this.useT = -1;
    }

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      const k = Math.sin(Math.min(1, 1 - this.reloadT / this.reloadDur) * Math.PI);
      pos.y -= 0.08 * k;
      rot.x -= 0.5 * k;
      rot.z += 0.5 * k;
    }

    this.recoilT = damp(this.recoilT, 0, 14, dt);
    pos.z += 0.06 * this.recoilT;
    rot.x += 0.16 * this.recoilT;

    if (ud.bow) this.updateBow(ud.bow);
    if (ud.flame) ud.flame.scale.set(1, 0.85 + Math.sin(this.t * 21) * 0.12 + Math.random() * 0.06, 1);

    this.root.position.copy(pos);
    this.root.rotation.set(rot.x, rot.y, rot.z);
  }

  updateBow(bow) {
    const tipX = 0.229;
    const tipY = 0.374;
    const nockX = tipX + this.draw * 0.3;
    const arr = bow.string.geometry.attributes.position;
    arr.setXYZ(0, tipX, tipY, 0);
    arr.setXYZ(1, nockX, 0, 0);
    arr.setXYZ(2, tipX, -tipY, 0);
    arr.needsUpdate = true;
    bow.arrow.visible = this.draw > 0.02;
    bow.arrow.position.set(nockX, 0, 0);
  }
}
