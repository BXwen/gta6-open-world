// Synthesized sound only: every effect is built from oscillators and noise
// at runtime, so the game ships no audio files at all.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let sirenTimer = 0;
  let sirenHigh = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Siren: one square wave that flips between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freqFrom, freqTo, duration, type, volume) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqFrom, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  function noiseHit(duration, volume, filterFreq) {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.stop(ctx.currentTime + duration + 0.02);
  }

  return {
    unlock() { ensure(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    click() { blip(660, 520, 0.07, 'square', 0.12); },
    pickup() { blip(880, 1320, 0.16, 'sine', 0.25); },
    coin() { blip(1180, 1760, 0.12, 'sine', 0.2); },
    thud() { blip(140, 45, 0.22, 'sine', 0.5); noiseHit(0.15, 0.3, 500); },
    punch() { noiseHit(0.12, 0.35, 2600); },
    gunshot() { noiseHit(0.14, 0.6, 3200); blip(220, 60, 0.1, 'square', 0.25); },
    crash() { noiseHit(0.3, 0.55, 800); blip(90, 35, 0.3, 'sine', 0.4); },
    success() {
      blip(523, 523, 0.12, 'sine', 0.25);
      setTimeout(() => blip(659, 659, 0.12, 'sine', 0.25), 120);
      setTimeout(() => blip(784, 784, 0.22, 'sine', 0.28), 240);
    },
    fail() { blip(320, 140, 0.5, 'sawtooth', 0.2); },
    engine(speed01, throttle) {
      if (!ctx || !engineGain) return;
      const target = throttle ? 0.05 + speed01 * 0.075 : 0.015;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      const freq = 52 + speed01 * 165 + (throttle ? 14 : 0);
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.06);
      engineOsc2.frequency.setTargetAtTime(freq * 0.5, ctx.currentTime, 0.06);
      engineFilter.frequency.setTargetAtTime(380 + speed01 * 1400, ctx.currentTime, 0.1);
    },
    siren(dt, nearestPoliceDist) {
      if (!ctx || !sirenGain) return;
      sirenTimer += dt;
      if (sirenTimer > 0.42) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 950 : 700;
      }
      const target = nearestPoliceDist < 90 ? Math.max(0, 0.05 * (1 - nearestPoliceDist / 90)) : 0;
      sirenGain.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
    },
  };
}
