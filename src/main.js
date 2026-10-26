import { Game } from './Game.js';

// Entry point. Exposes the game on window for the browser console, and hooks into
// the artifact viewer's hot-update bridge when present so a page update resumes the
// running island instead of dropping back to the menu.

function start(data = {}) {
  const game = new Game();
  window.game = game;
  const hot = window.claude?.hot;
  hot?.snapshot?.(() => (game.scene && game.state !== 'menu' && game.state !== 'loading' ? { save: game.serialize() } : null));
  if (data?.save?.v === 1) {
    game.loadWorld(data.save.seed, data.save).then(() => game.pause());
  }
}

function boot() {
  const hot = window.claude?.hot;
  if (hot?.ready) hot.ready(start);
  else start(hot?.data ?? {});
}

boot();
