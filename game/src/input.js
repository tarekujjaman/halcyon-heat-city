// Keyboard and mouse: held keys, one-frame presses, pointer lock with a drag-to-look and
// edge-turn fallback when the browser refuses it, the click that recaptures the mouse after a
// menu (never a shot), the lock-lost signal the pause menu listens for, mouse wheel for weapons,
// and the settings (sensitivity, invert Y) the camera reads. Nothing here knows what the keys do.

export const KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft', jump: 'Space',
  enter: 'KeyF', interact: 'KeyE', radio: 'KeyR', map: 'KeyM', pause: 'Escape', horn: 'KeyH',
  handbrake: 'Space', lookLeft: 'ArrowLeft', lookRight: 'ArrowRight', lookUp: 'ArrowUp', lookDown: 'ArrowDown',
  weapon1: 'Digit1', weapon2: 'Digit2', weapon3: 'Digit3', weapon4: 'Digit4',
  reload: 'KeyR', save: 'F5', camera: 'KeyV', punch: 'KeyG', dialogueSkip: 'Enter',
};

/** Default look speed in radians per pixel of mouse travel (the settings slider shows it x1000). */
export const DEFAULT_SENSITIVITY = 0.0025;

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const released = new Set();
  const lockLostHandlers = [];
  const state = {
    down, pressed,
    mouseDX: 0, mouseDY: 0, wheel: 0,
    buttons: 0, clicked: false, rightClicked: false,
    locked: false, lockRefused: false, wantLock: false,
    // needClick: the game resumed and waits for a click on the canvas to take the mouse again.
    // captureClick: that click is being held; it must not fire a weapon.
    needClick: false, captureClick: false,
    cursorX: 0, cursorY: 0, cursorInside: false,
    lastClientX: null, lastClientY: null,
    settings: { sensitivity: DEFAULT_SENSITIVITY, invertY: false },
    enabled: true,
    lastMouseMoveAt: -Infinity,
    now: 0,
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) || e.code.startsWith('F') && e.code.length <= 3) e.preventDefault();
  }
  function onKeyUp(e) {
    down.delete(e.code);
    released.add(e.code);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    down.clear();
    state.buttons = 0;
    state.captureClick = false;
  });

  function onMouseMove(e) {
    if (typeof e.buttons === 'number') state.buttons = e.buttons;
    state.cursorX = e.clientX;
    state.cursorY = e.clientY;
    state.cursorInside = true;
    if (state.locked) {
      state.mouseDX += e.movementX || 0;
      state.mouseDY += e.movementY || 0;
      state.lastMouseMoveAt = state.now;
    } else if ((state.buttons & 2) !== 0 || ((state.buttons & 1) !== 0 && state.lockRefused)) {
      // Drag to look when the pointer could not be captured.
      if (state.lastClientX !== null) {
        state.mouseDX += e.clientX - state.lastClientX;
        state.mouseDY += e.clientY - state.lastClientY;
        state.lastMouseMoveAt = state.now;
      }
    }
    state.lastClientX = e.clientX;
    state.lastClientY = e.clientY;
  }
  function onMouseDown(e) {
    state.lastClientX = e.clientX;
    state.lastClientY = e.clientY;
    // Clicks on menus and the map are theirs; only the game canvas shoots or captures.
    if (!(e.target === canvas || canvas.contains(e.target))) return;
    if (e.button === 0 && state.wantLock && !state.locked) {
      // The click that asks for the mouse back is swallowed: it never fires a weapon. Once the
      // browser has refused the lock, later clicks shoot (and quietly ask again).
      const swallow = state.needClick || !state.lockRefused;
      state.needClick = false;
      requestLock();
      if (swallow) {
        state.captureClick = true;
        return;
      }
    }
    state.buttons = e.buttons || (e.button === 2 ? 2 : e.button === 1 ? 4 : 1);
    if (e.button === 0) state.clicked = true;
    if (e.button === 2) state.rightClicked = true;
  }
  function onMouseUp(e) {
    state.buttons = e.buttons || 0;
    state.captureClick = false;
  }
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mouseleave', () => { state.cursorInside = false; });
  document.addEventListener('mouseleave', () => { state.cursorInside = false; });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => { state.wheel += Math.sign(e.deltaY); }, { passive: true });

  document.addEventListener('pointerlockchange', () => {
    const was = state.locked;
    state.locked = document.pointerLockElement === canvas;
    if (state.locked) {
      state.lockRefused = false;
      state.lockPendingSince = undefined;
    } else if (was && state.wantLock) {
      // The browser took the lock away (Esc, alt-tab) while the game still wanted it: the
      // Escape key itself is often not delivered, so this is the pause signal.
      state.needClick = true;
      for (const fn of lockLostHandlers) fn();
    }
  });
  document.addEventListener('pointerlockerror', () => {
    state.locked = false;
    state.lockRefused = true;
    state.lockPendingSince = undefined;
  });

  function requestLock() {
    if (state.locked || !canvas.requestPointerLock) {
      if (!canvas.requestPointerLock) state.lockRefused = true;
      return;
    }
    state.lockPendingSince = state.now;
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { state.lockRefused = true; });
    } catch {
      try {
        const p2 = canvas.requestPointerLock();
        if (p2 && p2.catch) p2.catch(() => { state.lockRefused = true; });
      } catch {
        state.lockRefused = true;
      }
    }
  }
  function exitLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  return {
    state,
    isDown: (code) => state.enabled && down.has(code),
    wasPressed: (code) => state.enabled && state.edgesEnabled !== false && pressed.has(code),
    wasReleased: (code) => released.has(code),
    anyPressed: () => pressed.size > 0,
    /** Horizontal and vertical look deltas this frame, in pixels, already sign-corrected for invert Y. */
    takeLook() {
      const dx = state.mouseDX;
      const dy = state.mouseDY * (state.settings.invertY ? -1 : 1);
      state.mouseDX = 0;
      state.mouseDY = 0;
      return { dx, dy };
    },
    takeWheel() {
      const w = state.wheel;
      state.wheel = 0;
      return w;
    },
    fireHeld: () => state.enabled && !state.captureClick && (state.buttons & 1) !== 0,
    clicked: () => state.clicked && !state.captureClick,
    /** -1, 0 or 1: the cursor at the window's left or right edge while the pointer is not captured. */
    edgeTurn(width, zone) {
      if (state.locked || !state.cursorInside) return 0;
      if (state.cursorX <= zone) return -1;
      if (state.cursorX >= width - zone) return 1;
      return 0;
    },
    get locked() {
      return state.locked;
    },
    get lockRefused() {
      return state.lockRefused;
    },
    /** True while the game waits for the click that takes the mouse back ("Click to resume"). */
    get needsClick() {
      return state.needClick && !state.locked;
    },
    /** Ask for the pointer now (inside a click or key gesture, such as the New Game button). */
    captureMouse() {
      state.wantLock = true;
      state.needClick = false;
      requestLock();
    },
    /** Want the pointer, but wait for the player's click to take it (resuming from a menu). */
    askCapture() {
      state.wantLock = true;
      state.needClick = !state.locked;
    },
    releaseMouse() {
      state.wantLock = false;
      state.needClick = false;
      state.captureClick = false;
      exitLock();
    },
    /** Called when the browser drops the lock while the game still wants it. */
    onLockLost(fn) {
      lockLostHandlers.push(fn);
    },
    setEnabled(v) {
      state.enabled = v;
      if (!v) down.clear();
    },
    /** Called once at the end of every frame. */
    endFrame(now) {
      pressed.clear();
      released.clear();
      state.clicked = false;
      state.rightClicked = false;
      state.now = now;
      // A capture request that never answers counts as refused: the fallbacks take over.
      if (state.wantLock && !state.locked && state.lockPendingSince !== undefined && now - state.lockPendingSince > 0.8) {
        state.lockRefused = true;
        state.lockPendingSince = undefined;
      }
    },
    /** Injects a look delta (the playtest and the screenshot scenes use it). */
    injectLook(dx, dy) {
      state.mouseDX += dx;
      state.mouseDY += dy;
      state.lastMouseMoveAt = state.now;
    },
    pressKey(code) {
      if (!down.has(code)) pressed.add(code);
      down.add(code);
    },
    releaseKey(code) {
      down.delete(code);
      released.add(code);
    },
  };
}
