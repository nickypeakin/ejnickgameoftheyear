import * as THREE from '../lib/three.js';
import { smoothstep, lerp, clamp } from '../core/MathUtils.js';

const C = (hex) => new THREE.Color(hex);

const COLORS = {
  topDay: C('#3f7cc8'),
  topDusk: C('#3a4277'),
  topNight: C('#060a16'),
  horizonDay: C('#b4cfe2'),
  horizonDusk: C('#e38b52'),
  horizonNight: C('#0e1526'),
  bottomDay: C('#71899a'),
  bottomNight: C('#05070b'),
  sunDay: C('#fff1dc'),
  sunDusk: C('#ff9550'),
  moon: C('#8ea8dc'),
  hemiSkyDay: C('#c3dbf2'),
  hemiSkyNight: C('#26365a'),
  hemiGroundDay: C('#5d5037'),
  hemiGroundNight: C('#0d0d12'),
};

const DOME_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DOME_FRAGMENT = `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 bottomColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float sunGlow;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 col = h > 0.0
    ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55))
    : mix(horizonColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.35));
  float s = max(dot(dir, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 48.0) * 0.45 + pow(s, 6.0) * 0.18) * sunGlow;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Day/night cycle: moves the sun and moon, drives every light and the sky colors,
// and reports ambient temperature.
export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = 9;
    this.day = 1;
    this.secondsPerHour = 45;
    this.nightSpeedup = 3;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.daylight = 1;
    this.lightColor = new THREE.Color();
    this.lightIntensity = 1;

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -55;
    sc.right = 55;
    sc.top = 55;
    sc.bottom = -55;
    sc.near = 1;
    sc.far = 320;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xc3dbf2, 0x5d5037, 1);
    scene.add(this.hemi);

    this.uniforms = {
      topColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
      bottomColor: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunGlow: { value: 1 },
    };
    this.group = new THREE.Group();
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: DOME_VERTEX,
        fragmentShader: DOME_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const starCount = 1400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(Math.random() * 0.95);
      starPos[i * 3] = Math.sin(v) * Math.cos(u) * 850;
      starPos[i * 3 + 1] = Math.cos(v) * 850;
      starPos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 850;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(starGeo, this.starMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.group.add(this.stars);

    this.moonMesh = new THREE.Mesh(
      new THREE.CircleGeometry(22, 24),
      new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false, transparent: true, depthWrite: false }),
    );
    this.moonMesh.renderOrder = -8;
    this.group.add(this.moonMesh);
    scene.add(this.group);

    scene.fog = new THREE.Fog(0xb4cfe2, 40, 280);
    this.fogColor = scene.fog.color;
  }

  isNight() {
    return this.time >= 20 || this.time < 6;
  }

  // Sun is above the horizon from 06:00 to 20:00; night runs faster.
  computeDirections() {
    const t = this.time;
    let a;
    if (t >= 6 && t < 20) a = ((t - 6) / 14) * Math.PI;
    else a = Math.PI + (((t >= 20 ? t - 20 : t + 4)) / 10) * Math.PI;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.38).normalize();
    this.moonDir.set(-Math.cos(a), -Math.sin(a), -0.3).normalize();
  }

  update(dt, camera, focus, viewDistance) {
    this.time += dt / this.secondsPerHour * (this.isNight() ? this.nightSpeedup : 1);
    if (this.time >= 24) {
      this.time -= 24;
      this.day += 1;
    }
    this.computeDirections();
    const e = this.sunDir.y;
    const day = smoothstep(-0.08, 0.3, e);
    const dusk = 1 - smoothstep(0, 0.32, Math.abs(e + 0.02));
    this.daylight = day;

    const u = this.uniforms;
    u.topColor.value.copy(COLORS.topNight).lerp(COLORS.topDay, day).lerp(COLORS.topDusk, dusk * 0.6);
    u.horizonColor.value.copy(COLORS.horizonNight).lerp(COLORS.horizonDay, day).lerp(COLORS.horizonDusk, dusk * 0.75);
    u.bottomColor.value.copy(COLORS.bottomNight).lerp(COLORS.bottomDay, day);
    u.sunColor.value.copy(COLORS.sunDay).lerp(COLORS.sunDusk, dusk);
    u.sunDir.value.copy(this.sunDir);
    u.sunGlow.value = smoothstep(-0.12, 0.05, e);

    const sunStrength = 2.7 * smoothstep(-0.04, 0.18, e);
    const moonStrength = 0.42 * smoothstep(-0.02, 0.25, -e);
    const useSun = sunStrength >= moonStrength;
    const dir = useSun ? this.sunDir : this.moonDir;
    this.lightIntensity = useSun ? sunStrength : moonStrength;
    this.lightColor.copy(useSun ? COLORS.sunDay : COLORS.moon);
    if (useSun) this.lightColor.lerp(COLORS.sunDusk, dusk * 0.8);
    this.sun.color.copy(this.lightColor);
    this.sun.intensity = this.lightIntensity;

    // Snap the shadow focus to whole metres to keep shadow edges from shimmering.
    const fx = Math.round(focus.x);
    const fz = Math.round(focus.z);
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + dir.x * 150, focus.y + dir.y * 150, fz + dir.z * 150);

    this.hemi.color.copy(COLORS.hemiSkyNight).lerp(COLORS.hemiSkyDay, day);
    this.hemi.groundColor.copy(COLORS.hemiGroundNight).lerp(COLORS.hemiGroundDay, day);
    this.hemi.intensity = lerp(0.32, 1.05, day);

    this.fogColor.copy(u.horizonColor.value);
    this.scene.fog.near = 30;
    this.scene.fog.far = lerp(viewDistance * 0.55, viewDistance, day);

    this.starMaterial.opacity = clamp(1 - smoothstep(-0.25, 0.02, e), 0, 1) * 0.9;
    this.group.position.copy(camera.position);
    this.group.updateMatrixWorld();
    this.moonMesh.position.copy(this.moonDir).multiplyScalar(780);
    this.moonMesh.lookAt(camera.position);
    this.moonMesh.material.opacity = smoothstep(-0.05, 0.15, this.moonDir.y);
  }

  temperatureAt(y) {
    const base = lerp(5, 22, this.daylight);
    return base - Math.max(0, y - 15) * 0.25;
  }
}
