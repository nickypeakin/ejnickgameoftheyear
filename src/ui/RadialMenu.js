// Hold-right-mouse radial menu (building pieces, hammer upgrades). While open it
// consumes mouse movement: the direction of travel picks an option, releasing the
// right button confirms it.

const RADIUS = 118;
const DEADZONE = 22;

export class RadialMenu {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('radial');
    this.isOpen = false;
    this.options = [];
    this.index = -1;
    this.vx = 0;
    this.vy = 0;
  }

  open(title, options) {
    if (!options.length) return;
    this.isOpen = true;
    this.title = title;
    this.options = options;
    this.vx = 0;
    this.vy = 0;
    this.index = options.findIndex((o) => o.selected);
    const n = options.length;
    this.root.innerHTML = `
      <div class="radial-ring">
        ${options.map((o, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(a) * RADIUS;
          const y = Math.sin(a) * RADIUS;
          const cls = ['radial-opt', o.disabled ? 'disabled' : '', o.danger ? 'danger' : '', o.selected ? 'current' : ''].join(' ');
          return `<div class="${cls}" style="transform: translate(calc(${x}px - 50%), calc(${y}px - 50%))">
            ${o.icon ? `<img src="${o.icon}" alt="">` : ''}<span>${o.label}</span></div>`;
        }).join('')}
        <div class="radial-center"><strong></strong><span></span></div>
      </div>`;
    this.optEls = [...this.root.querySelectorAll('.radial-opt')];
    this.centerTitle = this.root.querySelector('.radial-center strong');
    this.centerSub = this.root.querySelector('.radial-center span');
    this.root.hidden = false;
    this.game.audio.play('ui_open');
    this.highlight();
  }

  feed({ dx, dy }) {
    if (!this.isOpen) return;
    this.vx += dx;
    this.vy += dy;
    const len = Math.hypot(this.vx, this.vy);
    if (len > 80) {
      this.vx = (this.vx / len) * 80;
      this.vy = (this.vy / len) * 80;
    }
    if (len > DEADZONE) {
      const n = this.options.length;
      let a = Math.atan2(this.vy, this.vx) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      const idx = Math.round((a / (Math.PI * 2)) * n) % n;
      if (idx !== this.index) {
        this.index = idx;
        this.game.audio.play('ui_click');
      }
    }
    this.highlight();
  }

  highlight() {
    this.optEls.forEach((el, i) => el.classList.toggle('hover', i === this.index));
    const o = this.options[this.index];
    this.centerTitle.textContent = o ? o.label : this.title;
    this.centerSub.textContent = o ? (o.disabled ? `${o.sub} · not enough` : o.sub ?? '') : 'Move the mouse to choose';
  }

  close(confirm = true) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    const o = this.options[this.index];
    this.options = [];
    if (confirm && o) {
      if (o.disabled) this.game.hud.flashHint(`Not enough resources for ${o.label}`);
      else o.action();
    }
  }
}
