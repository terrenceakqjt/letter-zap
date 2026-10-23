/* audio.js — tiny synthesized sound effects via WebAudio. No asset files
 * needed, works offline, and is easy on little ears (short, soft sounds). */

const SFX = (() => {
  let ctx = null;
  let enabled = true;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq = 440, duration = 0.12, type = 'sine', gain = 0.18, sweepTo = null, delay = 0 }) {
    if (!enabled) return;
    const c = getCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    const t0 = c.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== null) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  return {
    setEnabled(v) { enabled = v; },
    isEnabled() { return enabled; },

    zap() {
      tone({ freq: 900, sweepTo: 220, duration: 0.1, type: 'sawtooth', gain: 0.12 });
    },
    miss() {
      tone({ freq: 180, sweepTo: 90, duration: 0.18, type: 'square', gain: 0.08 });
    },
    escape() {
      tone({ freq: 260, sweepTo: 140, duration: 0.22, type: 'triangle', gain: 0.07 });
    },
    click() {
      tone({ freq: 500, duration: 0.05, type: 'sine', gain: 0.1 });
    },
    levelUp() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, duration: 0.18, type: 'sine', gain: 0.14, delay: i * 0.09 }));
    },
    wordComplete() {
      [660, 880].forEach((f, i) => tone({ freq: f, duration: 0.12, type: 'sine', gain: 0.13, delay: i * 0.07 }));
    },
    wither() {
      tone({ freq: 320, sweepTo: 140, duration: 0.35, type: 'triangle', gain: 0.09 });
    },
    bloomFull() {
      [523, 659, 784, 988, 1318].forEach((f, i) => tone({ freq: f, duration: 0.22, type: 'sine', gain: 0.13, delay: i * 0.08 }));
    },
  };
})();
