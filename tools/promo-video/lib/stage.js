// Shared timing and motion helpers. Every scene is a pure function of t (seconds).
// Music: "High-Energy Adventure Theme" (CC0), 129.2 BPM. Scenes are 8 beats long.
(() => {
  const BEAT = 0.4644;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  // 0 → 1 progress of t across [start, end] seconds, clamped.
  const range = (t, start, end) => clamp((t - start) / (end - start));
  const beats = (n) => n * BEAT;

  const ease = {
    linear: (p) => p,
    outCubic: (p) => 1 - (1 - p) ** 3,
    inCubic: (p) => p ** 3,
    inOutCubic: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
    outQuint: (p) => 1 - (1 - p) ** 5,
    outExpo: (p) => (p === 1 ? 1 : 1 - 2 ** (-10 * p)),
    // Overshoots past 1 then settles: chunky "pop in".
    outBack: (p, s = 2.2) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2,
    // Damped spring that lands at 1.
    spring: (p, bounces = 3, damp = 5) => 1 - Math.cos(p * Math.PI * (0.5 + bounces)) * Math.exp(-damp * p),
  };

  // Pop-in helper: scale from 0 → 1 with overshoot over `dur` seconds starting at `start`.
  const pop = (t, start, dur = BEAT * 0.6) => {
    const p = range(t, start, start + dur);
    return p <= 0 ? 0 : ease.outBack(p);
  };

  // Impact pulse: 1 at the hit, decays to 0 over `dur`. Use for flashes, shakes, scale kicks.
  const hit = (t, at, dur = BEAT * 0.5) => (t < at ? 0 : Math.exp((-(t - at) / dur) * 4));

  // Deterministic pseudo-random generator (mulberry32). Never use Math.random.
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  // Deterministic camera shake offset {x, y} with amplitude `amp` px.
  const shake = (t, amp) => ({ x: Math.sin(t * 91.7) * amp, y: Math.cos(t * 73.3) * amp });

  // Integer count-up from `from` to `to` across [start, end].
  const count = (t, from, to, start, end, e = ease.outCubic) => Math.round(lerp(from, to, e(range(t, start, end))));
  const fmt = (n) => n.toLocaleString("en-US");

  // Resolves once fonts and every <img> are decoded. The renderer awaits this.
  const ready = (async () => {
    await new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r)));
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  })();

  window.Stage = { BEAT, beats, clamp, lerp, range, ease, pop, hit, rng, shake, count, fmt, ready };
})();
