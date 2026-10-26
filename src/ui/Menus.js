import { SaveManager } from '../core/SaveManager.js';
import { formatClock } from '../core/MathUtils.js';

// Main menu, pause menu, death screen, loading screen and the settings/controls
// dialogs. The markup lives in index.html; this wires it to the game.

const $ = (id) => document.getElementById(id);

function randomSeed() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'saved just now';
  if (mins < 60) return `saved ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `saved ${hours} h ago`;
  return `saved ${Math.round(hours / 24)} d ago`;
}

export class Menus {
  constructor(game) {
    this.game = game;
    this.screens = { menu: $('menu'), pause: $('pause'), death: $('death'), loading: $('loading') };
    this.seedInput = $('seed-input');
    this.seedInput.value = randomSeed();
    this.bind();
    this.bindSettings();
    this.refreshContinue();
  }

  bind() {
    const game = this.game;
    $('btn-reseed').addEventListener('click', () => {
      this.seedInput.value = randomSeed();
      game.audio.init();
    });
    $('btn-new').addEventListener('click', () => {
      game.audio.init();
      if (SaveManager.load()) this.openDialog('confirm-new');
      else this.startNew();
    });
    $('btn-confirm-new').addEventListener('click', () => {
      this.closeDialogs();
      this.startNew();
    });
    $('btn-continue').addEventListener('click', () => {
      game.audio.init();
      game.continueGame();
    });
    $('btn-resume').addEventListener('click', () => game.resume());
    $('btn-save').addEventListener('click', () => {
      const ok = game.save();
      $('save-status').textContent = ok ? `Saved at ${formatClock(game.sky.time)} on day ${game.sky.day}` : 'Could not save: browser storage is unavailable';
    });
    $('btn-quit').addEventListener('click', () => game.quitToMenu());
    $('btn-respawn-beach').addEventListener('click', () => game.respawn(null));
    $('respawn-bags').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bag]');
      if (btn && !btn.disabled) game.respawn(Number(btn.dataset.bag));
    });
    document.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => this.openDialog(`dialog-${btn.dataset.open}`));
    });
    document.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => this.closeDialogs()));
    document.querySelectorAll('.dialog').forEach((d) => {
      d.addEventListener('click', (e) => {
        if (e.target === d) this.closeDialogs();
      });
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.querySelector('.dialog:not([hidden])')) {
        e.stopPropagation();
        this.closeDialogs();
      }
    }, true);
    this.seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('btn-new').click();
    });
  }

  bindSettings() {
    const s = this.game.settings;
    const ranges = [
      ['set-sensitivity', 'sensitivity', (v) => `${v.toFixed(2)}×`],
      ['set-fov', 'fov', (v) => `${v}°`],
      ['set-volume', 'volume', (v) => `${Math.round(v * 100)}%`],
      ['set-view', 'viewDistance', (v) => `${v} m`],
    ];
    for (const [id, key, fmt] of ranges) {
      const input = $(id);
      const out = $(`${id}-out`);
      input.value = s.get(key);
      out.textContent = fmt(Number(input.value));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = fmt(v);
        s.set(key, v);
      });
    }
    for (const [id, key] of [['set-shadows', 'shadows'], ['set-invert', 'invertY']]) {
      const input = $(id);
      input.checked = Boolean(s.get(key));
      input.addEventListener('change', () => s.set(key, input.checked));
    }
  }

  startNew() {
    const raw = this.seedInput.value.trim();
    const seed = Number.parseInt(raw, 10);
    this.game.startNew(Number.isFinite(seed) ? Math.abs(seed) : randomSeed());
  }

  refreshContinue() {
    const summary = SaveManager.summary();
    const btn = $('btn-continue');
    btn.hidden = !summary;
    if (summary) $('continue-meta').textContent = `Island ${summary.seed} · Day ${summary.day} · ${timeAgo(summary.savedAt)}`;
  }

  show(name) {
    for (const [key, el] of Object.entries(this.screens)) el.hidden = key !== name;
    if (name === 'menu') {
      this.refreshContinue();
      this.seedInput.value = randomSeed();
    }
    if (name === 'pause') $('save-status').textContent = '';
  }

  hideAll() {
    for (const el of Object.values(this.screens)) el.hidden = true;
    this.closeDialogs();
  }

  setLoading(text, progress) {
    $('loading-text').textContent = text;
    if (progress !== undefined) $('loading-bar').style.width = `${Math.round(progress * 100)}%`;
  }

  openDialog(id) {
    this.closeDialogs();
    $(id).hidden = false;
    $(id).querySelector('button, input')?.focus();
  }

  closeDialogs() {
    document.querySelectorAll('.dialog').forEach((d) => {
      d.hidden = true;
    });
  }

  showDeath(cause, stats) {
    $('death-cause').textContent = cause;
    $('death-stats').innerHTML = `
      <div><dt>Survived</dt><dd>${stats.survived}</dd></div>
      <div><dt>Day</dt><dd>${stats.day}</dd></div>
      <div><dt>Kills</dt><dd>${stats.kills}</dd></div>`;
    this.show('death');
    this.updateBags();
  }

  updateBags() {
    const bags = this.game.deployables.sleepingBags();
    const list = $('respawn-bags');
    if (!bags.length) {
      list.innerHTML = '<p class="muted">Place a sleeping bag to respawn somewhere safer.</p>';
      return;
    }
    list.innerHTML = bags.map((bag, i) => {
      const grid = this.game.ui.map.gridRef(bag.x, bag.z);
      const cd = Math.ceil(bag.cooldown);
      return `<button type="button" class="btn${cd > 0 ? '' : ' btn-primary'}" data-bag="${bag.id}" ${cd > 0 ? 'disabled' : ''}>
        Sleeping bag ${i + 1} · ${grid}${cd > 0 ? ` · ready in ${cd}s` : ''}</button>`;
    }).join('');
  }
}
