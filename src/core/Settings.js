// Player preferences, remembered in this browser between sessions.

const KEY = 'rustbound.settings.v1';

const DEFAULTS = {
  sensitivity: 1,
  fov: 75,
  volume: 0.7,
  shadows: true,
  viewDistance: 280,
  invertY: false,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch {
      // Storage can be blocked (private mode, sandboxed frames); defaults still work.
    }
    this.listeners = new Set();
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    this.values[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // Ignore persistence failures.
    }
    for (const fn of this.listeners) fn(key, value);
  }

  onChange(fn) {
    this.listeners.add(fn);
  }
}
