export const ACTION_INTERACT = 1;
export const ACTION_PUNCH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_RESTART = 8;
export const ACTION_MUTE = 16;
export const ACTION_FIRE = 32;

const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const HOLD_CODES = new Set([...MOVE_CODES, 'Space', 'ShiftLeft', 'ShiftRight']);
const EDGE_ACTIONS = new Map([
  ['KeyE', ACTION_INTERACT], ['KeyF', ACTION_PUNCH], ['KeyP', ACTION_PAUSE],
  ['Escape', ACTION_PAUSE], ['KeyR', ACTION_RESTART], ['KeyM', ACTION_MUTE],
]);

export function createInput(canvas) {
  const held = new Set();
  let pending = 0;
  let shooting = false;
  let cameraYaw = 0;
  let cameraPitch = 0.32;
  let dragging = false;
  let previousX = 0;
  let previousY = 0;
  let pointerLocked = false;

  function keyDown(event) {
    if (HOLD_CODES.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    }
    if (event.repeat) return;
    pending |= EDGE_ACTIONS.get(event.code) || 0;
  }

  function keyUp(event) {
    held.delete(event.code);
  }

  function loseFocus() {
    held.clear();
    shooting = false;
    dragging = false;
  }

  function pointerDown(event) {
    if (event.button !== 0) return;
    shooting = true;
    pending |= ACTION_FIRE;
    dragging = true;
    previousX = event.clientX;
    previousY = event.clientY;
    if (!pointerLocked && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch { /* Mouse dragging remains available. */ }
    }
  }

  function pointerUp(event) {
    if (event.button !== 0) return;
    shooting = false;
    dragging = false;
  }

  function pointerMove(event) {
    if (pointerLocked) {
      cameraYaw -= event.movementX * 0.0032;
      cameraPitch += event.movementY * 0.0026;
    } else if (dragging) {
      cameraYaw -= (event.clientX - previousX) * 0.005;
      cameraPitch += (event.clientY - previousY) * 0.004;
      previousX = event.clientX;
      previousY = event.clientY;
    }
    cameraPitch = Math.max(-0.15, Math.min(1.1, cameraPitch));
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', loseFocus);
  canvas.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointermove', pointerMove);
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });

  function movementAxes() {
    const forward = held.has('KeyW') || held.has('ArrowUp');
    const backward = held.has('KeyS') || held.has('ArrowDown');
    const left = held.has('KeyA') || held.has('ArrowLeft');
    const right = held.has('KeyD') || held.has('ArrowRight');
    return {
      x: Number(right) - Number(left),
      z: Number(forward) - Number(backward),
    };
  }

  return {
    get yaw() { return cameraYaw; },
    get pitch() { return cameraPitch; },
    setYaw(value) { cameraYaw = value; },
    setPitch(value) { cameraPitch = value; },
    isDown(code) { return held.has(code); },
    get sprint() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    get jump() { return held.has('Space'); },
    get fireHeld() { return shooting; },
    moveAxes: movementAxes,
    takeActions() {
      const snapshot = pending;
      pending = 0;
      return snapshot;
    },
    keys: held,
  };
}
