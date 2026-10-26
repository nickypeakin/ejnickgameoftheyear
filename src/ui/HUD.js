import { ITEMS, itemName } from '../items/ItemDatabase.js';
import { getIcon } from '../items/IconRenderer.js';
import { MAX_VITALS } from '../player/Vitals.js';
import { formatClock } from '../core/MathUtils.js';
import { renderSlot } from './SlotView.js';

// In-game overlay: vitals, hotbar, compass, clock, interaction prompt, crafting
// queue, pickup feed, status chips, hit markers and damage feedback.

const ICONS = {
  health: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 1h4v5h5v4h-5v5H6v-5H1V6h5z"/></svg>',
  calories: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4c-2-3-7-2-7 3 0 4 3 8 7 8s7-4 7-8c0-5-5-6-7-3zm.5-1.5C9 1 10.5 0 12 .5 11 1.5 10 2.5 8.5 2.5z"/></svg>',
  hydration: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .5S2.5 7 2.5 10.5a5.5 5.5 0 0 0 11 0C13.5 7 8 .5 8 .5z"/></svg>',
};

const TIPS = [
  'Hit trees and rocks with your rock to gather wood and stone.',
  'Press Tab for your inventory and Q to craft. A stone hatchet and pickaxe come first.',
  'Press E to pick up hemp for cloth, then craft a building plan and a hammer.',
  'Wolves hunt at night. Build walls and a door, and place a sleeping bag inside.',
  'Furnaces smelt ore. Monuments hold crates, a recycler and armed scientists.',
];

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const PX_PER_DEG = 3;

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.root.innerHTML = `
      <div class="hud-clock"><span class="hud-sun"></span><span class="hud-time">09:00</span><span class="hud-day">Day 1</span></div>
      <div class="hud-compass" aria-hidden="true"><div class="compass-track"></div><div class="compass-mark"></div></div>
      <div class="crosshair"></div>
      <div class="hitmarker"></div>
      <div class="interact" hidden><kbd>E</kbd><span class="interact-label"></span></div>
      <div class="look-label" hidden></div>
      <div class="hint" hidden></div>
      <div class="controls-hint" hidden></div>
      <div class="pickups"></div>
      <div class="craft-queue"></div>
      <div class="vitals">
        <div class="status"></div>
        ${['health', 'calories', 'hydration'].map((v) => `
          <div class="vital vital-${v}">
            <span class="vital-icon">${ICONS[v]}</span>
            <div class="vital-bar"><i></i></div>
            <b class="vital-value">0</b>
          </div>`).join('')}
      </div>
      <div class="belt">${Array.from({ length: 6 }, (_, i) => `<div class="slot belt-slot" data-key="${i + 1}"></div>`).join('')}</div>
      <div class="ammo" hidden></div>
      <div class="vignette"></div>
      <div class="underwater"></div>
      <div class="click-to-play" hidden><strong>Click to play</strong><span>Mouse look needs the pointer. Press Esc to pause.</span></div>
      <div class="fallback-hint" hidden>Pointer lock is unavailable here: hold the right mouse button and drag to look around.</div>
      <div class="tips" hidden></div>
    `;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      time: q('.hud-time'),
      day: q('.hud-day'),
      sun: q('.hud-sun'),
      compassTrack: q('.compass-track'),
      crosshair: q('.crosshair'),
      hitmarker: q('.hitmarker'),
      interact: q('.interact'),
      interactLabel: q('.interact-label'),
      interactKey: q('.interact kbd'),
      look: q('.look-label'),
      hint: q('.hint'),
      controls: q('.controls-hint'),
      pickups: q('.pickups'),
      queue: q('.craft-queue'),
      status: q('.status'),
      belt: [...this.root.querySelectorAll('.belt-slot')],
      ammo: q('.ammo'),
      vignette: q('.vignette'),
      underwater: q('.underwater'),
      clickToPlay: q('.click-to-play'),
      fallback: q('.fallback-hint'),
      tips: q('.tips'),
    };
    this.vitals = {};
    for (const v of ['health', 'calories', 'hydration']) {
      this.vitals[v] = { fill: q(`.vital-${v} i`), value: q(`.vital-${v} .vital-value`), row: q(`.vital-${v}`) };
    }
    this.buildCompass();
    this.hintTimer = 0;
    this.hitTimer = 0;
    this.damageLevel = 0;
    this.pickupRows = new Map();
    this.tipIndex = 0;
    this.tipTimer = 0;
    this.tipsActive = false;
    this.cache = {};
    game.events.on('itemGained', ({ id, qty }) => this.pickup(id, qty));
    game.events.on('craftQueueChanged', () => this.renderQueue());
  }

  buildCompass() {
    let html = '';
    for (let rep = -1; rep <= 1; rep++) {
      for (let deg = 0; deg < 360; deg += 15) {
        const x = (deg + rep * 360) * PX_PER_DEG;
        const major = deg % 45 === 0;
        html += `<span class="tick${major ? ' major' : ''}" style="left:${x}px">${major ? COMPASS[deg / 45] : ''}</span>`;
      }
    }
    this.el.compassTrack.innerHTML = html;
  }

  show() {
    this.root.hidden = false;
    this.renderQueue();
  }

  hide() {
    this.root.hidden = true;
  }

  startTips() {
    this.tipsActive = true;
    this.tipIndex = 0;
    this.tipTimer = 0;
  }

  toggleTips() {
    this.tipsActive = !this.tipsActive;
    this.tipTimer = 0;
    if (!this.tipsActive) this.el.tips.hidden = true;
  }

  flashHint(text, seconds = 2.5) {
    this.el.hint.textContent = text;
    this.el.hint.hidden = false;
    this.hintTimer = seconds;
  }

  hitmarker(killed = false, headshot = false) {
    const h = this.el.hitmarker;
    h.classList.remove('show', 'kill', 'head');
    void h.offsetWidth;
    h.classList.add('show');
    if (killed) h.classList.add('kill');
    if (headshot) h.classList.add('head');
    this.game.audio.play('hitmarker');
  }

  damage(amount) {
    this.damageLevel = Math.min(1, this.damageLevel + amount / 30 + 0.15);
  }

  pickup(id, qty) {
    const now = performance.now();
    let row = this.pickupRows.get(id);
    if (row && now - row.time < 2500) {
      row.qty += qty;
    } else {
      if (row) row.el.remove();
      const el = document.createElement('div');
      el.className = 'pickup';
      el.innerHTML = `<img src="${getIcon(id)}" alt=""><span class="pickup-qty"></span><span class="pickup-name">${itemName(id)}</span>`;
      this.el.pickups.prepend(el);
      row = { el, qty, time: now };
      this.pickupRows.set(id, row);
      while (this.el.pickups.children.length > 6) this.el.pickups.lastElementChild.remove();
    }
    row.time = now;
    row.el.querySelector('.pickup-qty').textContent = `+${row.qty}`;
    row.el.classList.remove('fade');
  }

  renderQueue() {
    const crafting = this.game.crafting;
    if (!crafting) return;
    const q = crafting.queue;
    if (!q.length) {
      this.el.queue.innerHTML = '';
      return;
    }
    this.el.queue.innerHTML = q.map((job, i) => `
      <div class="queue-item${i === 0 ? ' active' : ''}">
        <img src="${getIcon(job.recipe.out)}" alt="">
        <span class="queue-count">${job.remaining * job.recipe.amount}</span>
        ${i === 0 ? '<span class="queue-time"></span>' : ''}
      </div>`).join('');
    this.queueTime = this.el.queue.querySelector('.queue-time');
  }

  setClickToPlay(visible) {
    this.el.clickToPlay.hidden = !visible;
  }

  setText(key, el, text) {
    if (this.cache[key] === text) return;
    this.cache[key] = text;
    el.textContent = text;
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    const v = player.vitals;
    for (const key of ['health', 'calories', 'hydration']) {
      const value = v[key];
      const pct = (value / MAX_VITALS[key]) * 100;
      const row = this.vitals[key];
      const rounded = Math.ceil(value);
      if (this.cache[key] !== rounded) {
        this.cache[key] = rounded;
        row.value.textContent = rounded;
        row.fill.style.width = `${pct}%`;
        row.row.classList.toggle('low', pct < 20);
      }
    }

    const statuses = [];
    if (v.bleeding > 0) statuses.push(['bleed', 'Bleeding']);
    if (v.freezing) statuses.push(['cold', 'Freezing']);
    else if (v.cold) statuses.push(['cold', 'Cold']);
    if (v.comfort > 2) statuses.push(['warm', 'Warm']);
    if (v.wet > 0) statuses.push(['wet', 'Wet']);
    if (v.calories <= 0) statuses.push(['bleed', 'Starving']);
    if (v.hydration <= 0) statuses.push(['bleed', 'Dehydrated']);
    if (v.healPool > 0) statuses.push(['heal', 'Healing']);
    const wb = game.deployables.workbenchLevelAt(player.position);
    if (wb) statuses.push(['craft', `Workbench ${wb}`]);
    const statusKey = statuses.map((s) => s[1]).join('|') + Math.round(v.temperature);
    if (this.cache.status !== statusKey) {
      this.cache.status = statusKey;
      this.el.status.innerHTML = `<span class="chip chip-temp">${Math.round(v.temperature)}°C</span>` + statuses.map(([cls, text]) => `<span class="chip chip-${cls}">${text}</span>`).join('');
    }

    const belt = player.inventory.belt;
    this.el.belt.forEach((el, i) => {
      renderSlot(el, belt.get(i));
      el.classList.toggle('active', i === player.activeSlot);
    });

    const item = player.activeItem;
    const def = item ? ITEMS[item.id] : null;
    let ammoText = '';
    if (def?.type === 'gun') ammoText = game.itemActions.reloading > 0 ? 'Reloading…' : `${item.ammo} / ${player.inventory.count(def.gun.ammo)}`;
    else if (def?.type === 'bow') ammoText = `${player.inventory.count(def.bow.ammo)} arrows`;
    this.setText('ammo', this.el.ammo, ammoText);
    this.el.ammo.hidden = !ammoText;

    const sky = game.sky;
    this.setText('time', this.el.time, formatClock(sky.time));
    this.setText('day', this.el.day, `Day ${sky.day}`);
    this.el.sun.classList.toggle('night', sky.isNight());

    const heading = ((-player.yaw * 180) / Math.PI % 360 + 360) % 360;
    this.el.compassTrack.style.transform = `translateX(${-heading * PX_PER_DEG}px)`;

    const inter = game.interaction.current;
    if (inter && !player.dead) {
      this.el.interact.hidden = false;
      this.el.interactKey.hidden = !inter.action;
      this.setText('inter', this.el.interactLabel, inter.sub ? `${inter.label} · ${inter.sub}` : inter.label);
    } else {
      this.el.interact.hidden = true;
    }
    const look = !inter ? game.interaction.describe : '';
    this.el.look.hidden = !look;
    if (look) this.setText('look', this.el.look, look);

    const placement = game.building.placement ?? game.deployables.placement;
    const controls = game.itemActions.controlsHint();
    const placeError = placement?.error && (game.building.ghost.visible || game.deployables.activeGhost?.visible) ? placement.error : '';
    const controlsText = [placeError, controls].filter(Boolean).join(' · ');
    this.el.controls.hidden = !controlsText;
    this.el.controls.classList.toggle('error', Boolean(placeError));
    this.setText('controls', this.el.controls, controlsText);

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.hidden = true;
    }

    this.el.crosshair.classList.toggle('hidden', game.itemActions.aiming && def?.type === 'gun');
    this.damageLevel = Math.max(0, this.damageLevel - dt * 0.9);
    const lowHealth = v.health < 25 ? 0.25 + Math.sin(performance.now() * 0.006) * 0.1 : 0;
    this.el.vignette.style.opacity = Math.max(this.damageLevel, lowHealth).toFixed(3);
    this.el.underwater.style.opacity = player.underwater ? '1' : '0';

    if (this.queueTime && game.crafting.queue[0]) {
      this.setText('qt', this.queueTime, `${Math.ceil(game.crafting.queue[0].timeLeft)}s`);
    }

    const now = performance.now();
    for (const [id, row] of this.pickupRows) {
      const age = now - row.time;
      if (age > 3000 && !row.el.classList.contains('fade')) row.el.classList.add('fade');
      if (age > 3600) {
        row.el.remove();
        this.pickupRows.delete(id);
      }
    }

    if (this.tipsActive) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) {
        if (this.tipIndex >= TIPS.length) {
          this.tipsActive = false;
          this.el.tips.hidden = true;
        } else {
          this.el.tips.innerHTML = `<span class="tips-label">Survival tip ${this.tipIndex + 1}/${TIPS.length}</span>${TIPS[this.tipIndex]}<span class="tips-key">H hides tips</span>`;
          this.el.tips.hidden = false;
          this.tipIndex++;
          this.tipTimer = 14;
        }
      }
    }
    this.el.fallback.hidden = !game.input.lockUnavailable;
  }
}
