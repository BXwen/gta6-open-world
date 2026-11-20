// Missions: Vera Kline's three jobs. Each has a briefing, a pickup leg and
// a return leg, an objective marker, a reward and a fail state. The machine
// is deliberately small: go to the beacon, press E, go to the next beacon.

import { MISSIONS } from './config.js';

export function createMissions(onEvent) {
  let index = 0; // 0-based into MISSIONS
  let phase = 'idle'; // idle | pickup | deliver | done
  let completed = 0;
  let failed = false;

  function current() {
    return MISSIONS[index] || null;
  }

  function target() {
    const m = current();
    if (!m) return null;
    if (phase === 'pickup') return m.pickup || m.targetCar || null;
    if (phase === 'deliver') return m.dropoff;
    return null;
  }

  function objectiveText() {
    const m = current();
    if (!m) return '';
    if (phase === 'pickup') return m.objective;
    if (phase === 'deliver') return m.returnObjective;
    return '';
  }

  function startMission(i, saved) {
    index = i;
    completed = saved || 0;
    failed = false;
    const m = current();
    if (!m) {
      phase = 'done';
      return null;
    }
    phase = m.pickup || m.targetCar ? 'pickup' : 'deliver';
    onEvent({ type: 'briefing', mission: m });
    return m;
  }

  function startNext() {
    if (index + 1 >= MISSIONS.length) {
      phase = 'done';
      onEvent({ type: 'story-done' });
      return null;
    }
    return startMission(index + 1, completed);
  }

  // The player reached the current beacon and pressed E.
  function arrive() {
    const m = current();
    if (!m || phase === 'idle' || phase === 'done') return null;
    if (phase === 'pickup') {
      phase = 'deliver';
      onEvent({ type: 'picked-up', mission: m });
      return { advanced: true };
    }
    // Delivered: pay out and move on.
    completed += 1;
    onEvent({ type: 'delivered', mission: m, reward: m.reward });
    return { delivered: true, reward: m.reward };
  }

  function fail(reason) {
    if (failed) return;
    failed = true;
    onEvent({ type: 'failed', mission: current(), reason });
  }

  function resetFailed() {
    failed = false;
  }

  return {
    startMission,
    startNext,
    arrive,
    fail,
    resetFailed,
    current,
    target,
    objectiveText,
    get phase() { return phase; },
    get index() { return index; },
    get completed() { return completed; },
    get failed() { return failed; },
    get done() { return phase === 'done'; },
    setCompleted(n) { completed = n; },
  };
}
