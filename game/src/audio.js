export function createAudio() {
  let context;
  let master;
  let motorTone;
  let motorOvertone;
  let motorLevel;
  let motorLowPass;
  let policeTone;
  let policeLevel;
  let muted = false;
  let sirenElapsed = 0;
  let sirenUpper = false;

  function activate() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);

      motorTone = context.createOscillator();
      motorTone.type = 'sawtooth';
      motorTone.frequency.value = 55;
      motorOvertone = context.createOscillator();
      motorOvertone.type = 'square';
      motorOvertone.frequency.value = 28;
      motorLowPass = context.createBiquadFilter();
      motorLowPass.type = 'lowpass';
      motorLowPass.frequency.value = 420;
      motorLevel = context.createGain();
      motorLevel.gain.value = 0;
      motorTone.connect(motorLowPass);
      motorOvertone.connect(motorLowPass);
      motorLowPass.connect(motorLevel);
      motorLevel.connect(master);
      motorTone.start();
      motorOvertone.start();

      policeTone = context.createOscillator();
      policeTone.type = 'square';
      policeTone.frequency.value = 720;
      policeLevel = context.createGain();
      policeLevel.gain.value = 0;
      policeTone.connect(policeLevel);
      policeLevel.connect(master);
      policeTone.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function whiteNoise(seconds) {
    const frames = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let frame = 0; frame < frames; frame += 1) samples[frame] = Math.random() * 2 - 1;
    return buffer;
  }

  function toneSweep(start, finish, seconds, shape, loudness) {
    if (!activate()) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;
    oscillator.type = shape || 'sine';
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, finish), now + seconds);
    envelope.gain.setValueAtTime(loudness, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(now);
    oscillator.stop(now + seconds + 0.02);
  }

  function noiseBurst(seconds, loudness, cutoff) {
    if (!activate()) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const now = context.currentTime;
    source.buffer = whiteNoise(seconds);
    filter.type = 'lowpass';
    filter.frequency.value = cutoff || 1200;
    envelope.gain.setValueAtTime(loudness, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(now);
    source.stop(now + seconds + 0.02);
  }

  function pickup() { toneSweep(880, 1320, 0.16, 'sine', 0.25); }

  return {
    unlock() { activate(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    click() { toneSweep(660, 520, 0.07, 'square', 0.12); },
    pickup,
    coin() { toneSweep(1180, 1760, 0.12, 'sine', 0.2); },
    thud() {
      toneSweep(140, 45, 0.22, 'sine', 0.5);
      noiseBurst(0.15, 0.3, 500);
    },
    punch() { noiseBurst(0.12, 0.35, 2600); },
    gunshot() {
      noiseBurst(0.14, 0.6, 3200);
      toneSweep(220, 60, 0.1, 'square', 0.25);
    },
    crash() {
      noiseBurst(0.3, 0.55, 800);
      toneSweep(90, 35, 0.3, 'sine', 0.4);
    },
    success() {
      toneSweep(523, 523, 0.12, 'sine', 0.25);
      setTimeout(() => toneSweep(659, 659, 0.12, 'sine', 0.25), 120);
      setTimeout(() => toneSweep(784, 784, 0.22, 'sine', 0.28), 240);
    },
    fail() { toneSweep(320, 140, 0.5, 'sawtooth', 0.2); },
    engine(speed, throttle) {
      if (!context || !motorLevel) return;
      const now = context.currentTime;
      const volume = throttle ? 0.05 + speed * 0.075 : 0.015;
      const baseFrequency = 52 + speed * 165 + (throttle ? 14 : 0);
      motorLevel.gain.setTargetAtTime(volume, now, 0.08);
      motorTone.frequency.setTargetAtTime(baseFrequency, now, 0.06);
      motorOvertone.frequency.setTargetAtTime(baseFrequency * 0.5, now, 0.06);
      motorLowPass.frequency.setTargetAtTime(380 + speed * 1400, now, 0.1);
    },
    siren(dt, nearestPoliceDist) {
      if (!context || !policeLevel) return;
      sirenElapsed += dt;
      if (sirenElapsed > 0.42) {
        sirenElapsed = 0;
        sirenUpper = !sirenUpper;
        policeTone.frequency.value = sirenUpper ? 950 : 700;
      }
      const audible = nearestPoliceDist < 90 ? Math.max(0, 0.05 * (1 - nearestPoliceDist / 90)) : 0;
      policeLevel.gain.setTargetAtTime(audible, context.currentTime, 0.15);
    },
  };
}
