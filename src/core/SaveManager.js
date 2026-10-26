// Single-slot save game stored in localStorage. Every read and write is guarded
// because storage can be unavailable or full.

const KEY = 'rustbound.save.v1';

export const SaveManager = {
  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.v === 1 ? data : null;
    } catch {
      return null;
    }
  },

  summary() {
    const data = this.load();
    if (!data) return null;
    return { seed: data.seed, day: data.day, time: data.time, savedAt: data.savedAt };
  },

  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  },
};
