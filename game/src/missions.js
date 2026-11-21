import { MISSIONS } from './config.js';

export function createMissions(onEvent) {
  let activeIndex = 0;
  let stage = 'idle';
  let jobsCleared = 0;
  let hasFailed = false;

  const current = () => MISSIONS[activeIndex] || null;

  function target() {
    const mission = current();
    if (!mission) return null;
    if (stage === 'pickup') return mission.pickup || mission.targetCar || null;
    return stage === 'deliver' ? mission.dropoff : null;
  }

  function objectiveText() {
    const mission = current();
    if (!mission) return '';
    if (stage === 'pickup') return mission.objective;
    return stage === 'deliver' ? mission.returnObjective : '';
  }

  function startMission(index, previousCount) {
    activeIndex = index;
    jobsCleared = previousCount || 0;
    hasFailed = false;
    const mission = current();
    if (!mission) {
      stage = 'done';
      return null;
    }
    stage = mission.pickup || mission.targetCar ? 'pickup' : 'deliver';
    onEvent({ type: 'briefing', mission });
    return mission;
  }

  function startNext() {
    if (activeIndex + 1 >= MISSIONS.length) {
      stage = 'done';
      onEvent({ type: 'story-done' });
      return null;
    }
    return startMission(activeIndex + 1, jobsCleared);
  }

  function arrive() {
    const mission = current();
    if (!mission || stage === 'idle' || stage === 'done') return null;
    if (stage === 'pickup') {
      stage = 'deliver';
      onEvent({ type: 'picked-up', mission });
      return { advanced: true };
    }
    jobsCleared += 1;
    onEvent({ type: 'delivered', mission, reward: mission.reward });
    return { delivered: true, reward: mission.reward };
  }

  function fail(reason) {
    if (hasFailed) return;
    hasFailed = true;
    onEvent({ type: 'failed', mission: current(), reason });
  }

  function resetFailed() {
    hasFailed = false;
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
    get phase() { return stage; },
    get index() { return activeIndex; },
    get completed() { return jobsCleared; },
    get failed() { return hasFailed; },
    get done() { return stage === 'done'; },
    setCompleted(value) { jobsCleared = value; },
  };
}
