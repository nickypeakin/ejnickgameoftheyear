// Keyboard and mouse state, polled once per frame by the game loop.
// Mouse look uses pointer lock; when the browser refuses it, the player can
// hold the right mouse button and drag to look instead.

const GAME_KEYS = new Set([
  'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyQ', 'KeyE', 'KeyR', 'KeyM', 'ControlLeft', 'ShiftLeft',
]);

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.buttons = [false, false, false];
    this.buttonsPressed = [false, false, false];
    this.buttonsReleased = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.lockUnavailable = false;
    this.captureKeys = false;
    this.lockListeners = new Set();
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      if (this.captureKeys && (GAME_KEYS.has(e.code) || e.code.startsWith('Digit'))) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.reset());

    document.addEventListener('mousedown', (e) => {
      if (e.button > 2 || !this.isGameMouse(e)) return;
      this.buttons[e.button] = true;
      this.buttonsPressed[e.button] = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button > 2) return;
      if (this.buttons[e.button]) {
        this.buttons[e.button] = false;
        this.buttonsReleased[e.button] = true;
      }
    });
    document.addEventListener('mousemove', (e) => {
      const lookDrag = this.lockUnavailable && this.buttons[2];
      if (!this.locked && !lookDrag) return;
      // Some browsers report a huge spike on the first event after locking.
      const mx = Math.max(-250, Math.min(250, e.movementX || 0));
      const my = Math.max(-250, Math.min(250, e.movementY || 0));
      this.dx += mx;
      this.dy += my;
    });
    document.addEventListener('wheel', (e) => {
      if (this.locked || (this.lockUnavailable && e.target === this.canvas)) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('contextmenu', (e) => {
      if (this.locked || e.target === this.canvas) e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.releaseButtons();
      for (const fn of this.lockListeners) fn(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.markLockUnavailable());
  }

  isGameMouse(e) {
    return this.locked || (this.lockUnavailable && e.target === this.canvas);
  }

  markLockUnavailable() {
    if (this.lockUnavailable) return;
    this.lockUnavailable = true;
    for (const fn of this.lockListeners) fn(false);
  }

  onLockChange(fn) {
    this.lockListeners.add(fn);
  }

  requestLock() {
    if (this.locked || !this.canvas.requestPointerLock) {
      if (!this.canvas.requestPointerLock) this.markLockUnavailable();
      return;
    }
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => this.markLockUnavailable());
    } catch {
      this.markLockUnavailable();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  get hasLook() {
    return this.locked || this.lockUnavailable;
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasReleased(code) {
    return this.released.has(code);
  }

  mouseDown(button = 0) {
    return this.buttons[button];
  }

  mousePressed(button = 0) {
    return this.buttonsPressed[button];
  }

  mouseReleased(button = 0) {
    return this.buttonsReleased[button];
  }

  consumeLook() {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }

  releaseButtons() {
    for (let i = 0; i < 3; i++) {
      if (this.buttons[i]) this.buttonsReleased[i] = true;
      this.buttons[i] = false;
    }
  }

  reset() {
    this.down.clear();
    this.releaseButtons();
    this.dx = 0;
    this.dy = 0;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.buttonsPressed.fill(false);
    this.buttonsReleased.fill(false);
    this.wheel = 0;
  }
}
