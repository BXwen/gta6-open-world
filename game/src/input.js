// Keyboard and pointer input. Held keys are read every frame; one-shot
// presses (interact, punch, pause, restart, mute) are queued as flags and
// taken once by the loop, so a press between two frames is never lost and
// never counted twice. The camera orbits with mouse drag, or pointer lock
// once the player clicks the canvas.

export const ACTION_INTERACT = 1;
export const ACTION_PUNCH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_RESTART = 8;
export const ACTION_MUTE = 16;
export const ACTION_FIRE = 32;

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let fireHeld = false;
  let yaw = 0;
  let pitch = 0.32;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let locked = false;

  function onKeyDown(event) {
    if (MOVE_KEYS.has(event.code) || event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      keys.add(event.code);
      event.preventDefault();
    }
    if (event.repeat) return;
    if (event.code === 'KeyE') actions |= ACTION_INTERACT;
    else if (event.code === 'KeyF') actions |= ACTION_PUNCH;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyR') actions |= ACTION_RESTART;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    keys.clear();
    fireHeld = false;
    dragging = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      fireHeld = true;
      actions |= ACTION_FIRE;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      if (!locked && canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch { /* drag still works */ }
      }
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) {
      fireHeld = false;
      dragging = false;
    }
  });
  window.addEventListener('pointermove', (event) => {
    if (locked) {
      yaw -= event.movementX * 0.0032;
      pitch += event.movementY * 0.0026;
    } else if (dragging) {
      yaw -= (event.clientX - lastX) * 0.005;
      pitch += (event.clientY - lastY) * 0.004;
      lastX = event.clientX;
      lastY = event.clientY;
    }
    pitch = Math.max(-0.15, Math.min(1.1, pitch));
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });

  return {
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    setYaw(value) { yaw = value; },
    setPitch(value) { pitch = value; },
    isDown(code) { return keys.has(code); },
    get sprint() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    get jump() { return keys.has('Space'); },
    get fireHeld() { return fireHeld; },
    moveAxes() {
      let x = 0;
      let z = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      return { x, z };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    // Expose the held-key set so the car can read throttle/brake directly.
    keys,
  };
}
