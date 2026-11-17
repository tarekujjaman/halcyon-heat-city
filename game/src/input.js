// Keyboard and mouse: held keys, one-frame presses, pointer lock with a drag-to-look and
// edge-turn fallback when the browser refuses it, mouse wheel for weapons, and the settings
// (sensitivity, invert Y) the camera reads. Nothing here knows what the keys do.

export const KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft', jump: 'Space',
  enter: 'KeyF', interact: 'KeyE', radio: 'KeyR', map: 'KeyM', pause: 'Escape', horn: 'KeyH',
  handbrake: 'Space', lookLeft: 'ArrowLeft', lookRight: 'ArrowRight', lookUp: 'ArrowUp', lookDown: 'ArrowDown',
  turnLeft: 'KeyQ', turnRight: 'KeyE', weapon1: 'Digit1', weapon2: 'Digit2', weapon3: 'Digit3', weapon4: 'Digit4',
  reload: 'KeyR', save: 'F5', camera: 'KeyV', punch: 'KeyG', dialogueSkip: 'Enter',
};

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const released = new Set();
  const state = {
    down, pressed,
    mouseDX: 0, mouseDY: 0, wheel: 0,
    buttons: 0, clicked: false, rightClicked: false,
    locked: false, lockRefused: false, wantLock: false,
    cursorX: 0, cursorY: 0, cursorInside: false,
    lastClientX: null, lastClientY: null,
    settings: { sensitivity: 0.004, invertY: false },
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
  });

  function onMouseMove(e) {
    state.cursorX = e.clientX;
    state.cursorY = e.clientY;
    state.cursorInside = true;
    if (state.locked) {
      state.mouseDX += e.movementX || 0;
      state.mouseDY += e.movementY || 0;
      state.lastMouseMoveAt = state.now;
    } else if (state.buttons & 2 || state.buttons & 1 && state.lockRefused) {
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
    state.buttons |= 1 << e.button;
    state.lastClientX = e.clientX;
    state.lastClientY = e.clientY;
    if (e.button === 0) state.clicked = true;
    if (e.button === 2) state.rightClicked = true;
    if (e.target === canvas || canvas.contains(e.target)) {
      if (state.wantLock && !state.locked) requestLock();
    }
  }
  function onMouseUp(e) {
    state.buttons &= ~(1 << e.button);
  }
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mouseleave', () => { state.cursorInside = false; });
  document.addEventListener('mouseleave', () => { state.cursorInside = false; });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => { state.wheel += Math.sign(e.deltaY); }, { passive: true });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (state.locked) state.lockRefused = false;
  });
  document.addEventListener('pointerlockerror', () => {
    state.locked = false;
    state.lockRefused = true;
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
    fireHeld: () => state.enabled && (state.buttons & 1) !== 0,
    clicked: () => state.clicked,
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
    /** Ask for the pointer while playing; the next click asks again if the browser declined. */
    captureMouse() {
      state.wantLock = true;
      requestLock();
    },
    releaseMouse() {
      state.wantLock = false;
      exitLock();
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
