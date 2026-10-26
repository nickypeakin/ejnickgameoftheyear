import * as THREE from './lib/three.js';
import { EventBus } from './core/EventBus.js';
import { Settings } from './core/Settings.js';
import { Input } from './core/Input.js';
import { AudioEngine } from './core/Audio.js';
import { SaveManager } from './core/SaveManager.js';
import { formatDuration } from './core/MathUtils.js';
import { generateWorld } from './world/WorldGen.js';
import { Physics } from './world/Physics.js';
import { Sky } from './world/Sky.js';
import { Water } from './world/Water.js';
import { Monuments } from './world/Monuments.js';
import { ResourceManager } from './world/ResourceManager.js';
import { Foliage } from './world/Foliage.js';
import { LootSpawner } from './world/LootSpawner.js';
import { Effects } from './combat/Effects.js';
import { Projectiles } from './combat/Projectiles.js';
import { EntityManager } from './entities/EntityManager.js';
import { DeployableManager } from './deployables/DeployableManager.js';
import { BuildingSystem } from './building/BuildingSystem.js';
import { Player } from './player/Player.js';
import { ViewModel } from './player/ViewModel.js';
import { ItemActions } from './player/ItemActions.js';
import { Interaction } from './player/Interaction.js';
import { CraftingSystem } from './inventory/CraftingSystem.js';
import { createItem } from './inventory/ItemContainer.js';
import { UIManager } from './ui/UIManager.js';

const AUTOSAVE_SECONDS = 60;
const BAG_COOLDOWN = 120;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// Top-level game: owns the renderer and every world system, runs the loop, and
// moves between the menu, loading, playing, paused and dead states.
export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.events = new EventBus();
    this.settings = new Settings();
    this.input = new Input(this.canvas);
    this.audio = new AudioEngine(this.settings);
    this.state = 'menu';
    this.scene = null;
    this.stats = this.freshStats();
    this.deathMarker = null;
    this.autosaveTimer = AUTOSAVE_SECONDS;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = this.settings.get('shadows');
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = false;
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), 1, 0.05, 1400);
    this.camera.rotation.order = 'YXZ';
    this.viewModel = new ViewModel();

    this.ui = new UIManager(this);
    this.hud = this.ui.hud;
    this.menus = this.ui.menus;

    this.settings.onChange((key, value) => this.applySetting(key, value));
    this.input.onLockChange((locked) => this.onLockChange(locked));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.ui.isModalOpen && !this.player?.dead) {
        this.audio.init();
        this.input.requestLock();
      }
    });
    this.resize();
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  freshStats() {
    return { kills: 0, crafted: 0, built: 0, barrels: 0, deaths: 0, lifeStart: 0, playTime: 0 };
  }

  applySetting(key, value) {
    if (key === 'fov') {
      this.camera.fov = value;
      this.camera.updateProjectionMatrix();
    } else if (key === 'volume') {
      this.audio.setVolume(value);
    } else if (key === 'shadows') {
      this.renderer.shadowMap.enabled = value;
      if (this.scene) this.scene.traverse((o) => {
        if (o.material) o.material.needsUpdate = true;
      });
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewModel.resize(w / h);
  }

  // ---- world lifecycle -----------------------------------------------------------

  async startNew(seed) {
    await this.loadWorld(Number(seed), null);
  }

  async continueGame() {
    const save = SaveManager.load();
    if (!save) {
      this.menus.show('menu');
      return;
    }
    await this.loadWorld(save.seed, save);
  }

  async loadWorld(seed, save) {
    this.state = 'loading';
    this.menus.show('loading');
    this.menus.setLoading('Shaping the island', 0.05);
    await nextFrame();
    this.disposeWorld();
    this.scene = new THREE.Scene();
    this.seed = seed;

    const gen = generateWorld(seed, (text) => this.menus.setLoading(text));
    this.terrain = gen.terrain;
    this.scene.add(this.terrain.buildMesh());
    this.physics = new Physics(this.terrain);
    this.sky = new Sky(this.scene);
    this.water = new Water(this.scene);
    this.effects = new Effects(this);
    this.menus.setLoading('Raising monuments', 0.35);
    await nextFrame();

    this.monuments = new Monuments(this);
    this.monuments.build(gen.sites, gen.rng);
    this.resources = new ResourceManager(this);
    this.resources.build(gen.specs);
    this.menus.setLoading('Growing grass', 0.55);
    await nextFrame();
    this.foliage = new Foliage(this, gen.rng, (x, z) => gen.inMonument(x, z, 2));

    this.player = new Player(this);
    this.entities = new EntityManager(this);
    this.deployables = new DeployableManager(this);
    this.building = new BuildingSystem(this);
    this.projectiles = new Projectiles(this);
    this.loot = new LootSpawner(this);
    this.crafting = new CraftingSystem(this);
    this.itemActions = new ItemActions(this);
    this.interaction = new Interaction(this);
    this.spawnPoints = gen.spawnPoints;
    this.ui.map.invalidate();
    for (const site of this.monuments.sites) {
      if (site.recycler) this.deployables.spawn('recycler', site.recycler.x, site.recycler.y, site.recycler.z, site.recycler.rot);
    }

    this.menus.setLoading('Waking up', 0.8);
    await nextFrame();
    if (save) this.applySave(save);
    else this.freshStart();
    this.loot.init(gen.barrelSpots, gen.crateSpots, this.monuments.sites);
    this.entities.setupNPCs(this.monuments.sites);

    this.player.updateCamera(this.camera, 0);
    this.sky.update(0, this.camera, this.player.position, this.settings.get('viewDistance'));
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.viewModel.scene, this.viewModel.camera);
    this.menus.setLoading('Ready', 1);
    await nextFrame();

    this.menus.hideAll();
    this.hud.show();
    this.autosaveTimer = AUTOSAVE_SECONDS;
    if (this.player.dead) {
      this.state = 'dead';
      this.showDeathScreen(this.lastDeathCause ?? 'You died');
    } else {
      this.state = 'playing';
      this.input.captureKeys = true;
      this.audio.init();
      this.input.requestLock();
      if (!save) this.hud.startTips();
    }
  }

  freshStart() {
    this.stats = this.freshStats();
    this.deathMarker = null;
    this.sky.time = 8.5;
    this.sky.day = 1;
    this.spawnOnBeach();
    this.giveStarterKit();
  }

  giveStarterKit() {
    const inv = this.player.inventory;
    inv.belt.set(0, createItem('rock'));
    inv.belt.set(1, createItem('torch'));
    this.player.activeSlot = 0;
  }

  spawnOnBeach() {
    const p = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)] ?? { x: 0, z: 0 };
    // Face inland.
    const yaw = Math.atan2(p.x, p.z);
    this.player.spawnAt(p.x, p.z, yaw);
  }

  disposeWorld() {
    this.ui.closeAll({ relock: false });
    this.ui.radial.close(false);
    if (!this.scene) return;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.scene = null;
    this.renderer.clear();
  }

  applySave(save) {
    this.stats = { ...this.freshStats(), ...save.stats };
    this.sky.time = save.time ?? 9;
    this.sky.day = save.day ?? 1;
    this.deathMarker = save.deathMarker ?? null;
    this.lastDeathCause = save.deathCause ?? null;
    this.player.load(save.player);
    this.player.dead = Boolean(save.player?.dead);
    this.building.load(save.building);
    this.deployables.load(save.deployables);
    this.resources.load(save.resources);
    this.entities.load(save.entities);
    this.crafting.load(save.crafting);
    this.player.syncCollider();
  }

  serialize() {
    return {
      v: 1,
      seed: this.seed,
      savedAt: Date.now(),
      time: this.sky.time,
      day: this.sky.day,
      stats: this.stats,
      deathMarker: this.deathMarker,
      deathCause: this.player.dead ? this.lastDeathCause : null,
      player: this.player.serialize(),
      building: this.building.serialize(),
      deployables: this.deployables.serialize(),
      resources: this.resources.serialize(),
      entities: this.entities.serialize(),
      crafting: this.crafting.serialize(),
    };
  }

  save() {
    if (!this.scene || this.state === 'loading' || this.state === 'menu') return false;
    return SaveManager.save(this.serialize());
  }

  async quitToMenu() {
    this.save();
    this.disposeWorld();
    this.state = 'menu';
    this.input.captureKeys = false;
    this.input.exitLock();
    this.hud.hide();
    this.menus.show('menu');
  }

  // ---- state changes -------------------------------------------------------------

  onLockChange(locked) {
    const playing = this.state === 'playing' && !this.ui.isModalOpen && !this.player?.dead;
    if (!locked && playing && !this.input.lockUnavailable) this.pause();
    this.hud.setClickToPlay(false);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.radial.close(false);
    this.ui.closeAll({ relock: false });
    this.input.captureKeys = false;
    this.input.exitLock();
    this.hud.setClickToPlay(false);
    this.menus.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.menus.hideAll();
    this.input.captureKeys = true;
    this.audio.init();
    this.input.requestLock();
  }

  onPlayerDeath(cause) {
    const player = this.player;
    if (player.dead) return;
    player.dead = true;
    this.lastDeathCause = cause;
    this.crafting.refundAll();
    this.ui.radial.close(false);
    this.ui.closeAll({ relock: false });
    const items = player.inventory.allItems();
    if (items.length) {
      const p = player.position;
      this.entities.spawnContainer({ name: 'Your Backpack', model: 'backpack', size: Math.max(12, items.length), items, x: p.x, y: p.y + 0.5, z: p.z, lifetime: 1800, persist: true });
      this.deathMarker = { x: p.x, z: p.z };
    }
    player.inventory.clear();
    player.vitals.bleeding = 0;
    this.stats.deaths += 1;
    this.audio.play('death');
    this.state = 'dead';
    this.input.captureKeys = false;
    this.input.exitLock();
    this.showDeathScreen(cause);
  }

  showDeathScreen(cause) {
    const lived = this.stats.playTime - this.stats.lifeStart;
    this.menus.showDeath(cause, { survived: formatDuration(lived), day: this.sky.day, kills: this.stats.kills });
  }

  respawn(bagId) {
    if (this.state !== 'dead') return;
    const player = this.player;
    const bag = bagId !== null ? this.deployables.list.find((d) => d.id === bagId && d.type === 'sleeping_bag') : null;
    if (bag && bag.cooldown > 0) return;
    player.vitals.reset();
    if (bag) {
      player.spawnAt(bag.x, bag.z, bag.rot * (Math.PI / 2));
      player.position.y = this.physics.getGroundHeight(bag.x, bag.z, bag.y + 0.5, 1, 0.3);
      player.syncCollider();
      bag.cooldown = BAG_COOLDOWN;
    } else {
      this.spawnOnBeach();
    }
    this.giveStarterKit();
    this.stats.lifeStart = this.stats.playTime;
    this.state = 'playing';
    this.menus.hideAll();
    this.input.captureKeys = true;
    this.input.requestLock();
  }

  // ---- loop ------------------------------------------------------------------------

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    try {
      this.update(dt);
      this.render();
    } catch (err) {
      console.error(err);
    }
    this.input.endFrame();
  }

  update(dt) {
    if (!this.scene) return;
    if (this.state === 'playing') {
      this.handleKeys();
      this.simulate(dt, true);
    } else if (this.state === 'dead') {
      this.simulate(dt, false);
      this.deathRefresh = (this.deathRefresh ?? 0) - dt;
      if (this.deathRefresh <= 0) {
        this.deathRefresh = 1;
        this.menus.updateBags();
      }
    }
  }

  handleKeys() {
    const input = this.input;
    const ui = this.ui;
    if (input.wasPressed('Tab')) ui.toggleInventory('craft');
    if (input.wasPressed('KeyQ')) {
      if (ui.modal === 'inventory') ui.closeAll();
      else ui.openInventory('craft');
    }
    if (input.wasPressed('KeyM') || input.wasPressed('KeyG')) ui.toggleMap();
    if (input.wasPressed('Escape')) {
      if (ui.radial.isOpen) ui.radial.close(false);
      else if (ui.isModalOpen) ui.closeAll();
      else if (input.lockUnavailable) this.pause();
    }
    if (input.wasPressed('KeyH')) this.hud.toggleTips();
    if (!ui.isModalOpen && !this.player.dead) {
      for (let i = 0; i < 6; i++) if (input.wasPressed(`Digit${i + 1}`)) this.player.activeSlot = i;
      if (input.wheel) this.player.activeSlot = (this.player.activeSlot + input.wheel + 6) % 6;
    }
    this.hud.setClickToPlay(!input.hasLook && !ui.isModalOpen);
  }

  simulate(dt, playerActive) {
    const input = this.input;
    const ui = this.ui;
    const player = this.player;
    const alive = playerActive && !player.dead;
    const controls = alive && !ui.isModalOpen && input.hasLook;
    this.stats.playTime += dt;

    if (ui.radial.isOpen) {
      ui.radial.feed(input.consumeLook());
      if (!input.mouseDown(2)) ui.radial.close(true);
    } else if (controls) {
      const zoom = this.itemActions.aiming ? 0.6 : 1;
      player.look(input, dt, zoom);
    } else {
      input.consumeLook();
    }

    if (alive) player.update(dt, input, controls && !ui.radial.isOpen);
    const targetFov = this.settings.get('fov') * (this.itemActions.aiming ? 0.72 : 1);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
    }
    player.updateCamera(this.camera, dt);
    this.itemActions.update(dt, input, controls);
    this.interaction.update(dt, input, controls && !ui.radial.isOpen);

    this.crafting.update(dt);
    this.deployables.update(dt);
    this.entities.update(dt);
    this.projectiles.update(dt);
    this.resources.update(dt);
    this.loot.update(dt);
    this.effects.update(dt);
    this.sky.update(dt, this.camera, player.position, this.settings.get('viewDistance'));
    this.water.update(dt, this.sky.daylight);

    this.viewModel.update(dt, {
      aiming: this.itemActions.aiming,
      sprinting: player.sprinting,
      bobPhase: player.bobPhase,
      bobAmount: player.bobAmount,
      lightColor: this.sky.lightColor,
      lightIntensity: this.sky.lightIntensity,
      hemiIntensity: this.sky.hemi.intensity,
      torchOn: player.activeItem?.id === 'torch',
    });
    this.audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, player.yaw);
    this.audio.update(dt, { night: this.sky.isNight(), underwater: player.underwater });
    this.hud.update(dt);
    ui.tick();

    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = AUTOSAVE_SECONDS;
      this.save();
    }
  }

  render() {
    if (!this.scene) {
      this.renderer.clear();
      return;
    }
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if ((this.state === 'playing' || this.state === 'paused') && !this.player.dead) {
      this.renderer.clearDepth();
      this.renderer.render(this.viewModel.scene, this.viewModel.camera);
    }
  }
}
