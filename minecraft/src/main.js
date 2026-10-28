import { Game } from './game.js';

// Entry point. The game is exposed on window for poking at from the console,
// e.g. game.player.inventory.add({ id: 'diamond', count: 64 }) or game.world.time = 13000.
window.game = new Game();
