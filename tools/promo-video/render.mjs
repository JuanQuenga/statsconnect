#!/usr/bin/env node
// Renders scenes/*.html frame by frame with headless Chromium, then muxes music + SFX with ffmpeg.
//
//   node render.mjs                      full video → out/statsconnect-promo.mp4
//   node render.mjs --scene 03           one scene (with its music slice + SFX) → out/03-*.mp4
//   node render.mjs --scene 03 --contact one frame per half beat, tiled → out/03-*-contact.png
//   --fps 30                             faster preview renders (default 60)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname);
const OUT = join(ROOT, "out");
const BEAT = 0.4644;
const MUSIC = join(ROOT, "assets/audio/music.ogg");
const MUSIC_OFFSET = 0.488; // first downbeat of the track
const W = 1080, H = 1920;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const fps = Number(opt("fps", 60));
const only = opt("scene");

const run = (cmd, argv, input) => new Promise((ok, fail) => {
  const p = spawn(cmd, argv, { stdio: [input ? "pipe" : "ignore", "inherit", "inherit"] });
  p.on("error", fail);
  p.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}`))));
  if (input) input(p.stdin);
});

async function loadScenes(browser) {
  const files = (await readdir(join(ROOT, "scenes"))).filter((f) => f.endsWith(".html")).sort();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const scenes = [];
  let start = 0;
  for (const file of files) {
    await page.goto(pathToFileURL(join(ROOT, "scenes", file)).href);
    const meta = await page.evaluate(() => ({ beats: window.SCENE?.beats ?? 8, sfx: window.SCENE?.sfx ?? [] }));
    const duration = meta.beats * BEAT;
    scenes.push({ file, name: file.replace(/\.html$/, ""), start, duration, sfx: meta.sfx });
    start += duration;
  }
  await page.close();
  return scenes;
}

async function capture(browser, scene, times, onFrame, label) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(pathToFileURL(join(ROOT, "scenes", scene.file)).href);
  await page.evaluate(() => window.Stage.ready);
  if (label) await page.evaluate(() => document.body.insertAdjacentHTML("beforeend",
    '<div id="__label" style="position:fixed;left:16px;top:16px;z-index:99999;padding:6px 18px;background:#000c;color:#fff;font:700 56px system-ui;border-radius:12px"></div>'));
  for (const t of times) {
    await page.evaluate((t) => window.seek(t), t);
    if (label) await page.evaluate((s) => (document.getElementById("__label").textContent = s), label(t));
    onFrame(await page.screenshot({ type: "jpeg", quality: 92 }));
  }
  await page.close();
  if (errors.length) console.warn(`⚠ ${scene.file}:\n  ${[...new Set(errors)].join("\n  ")}`);
}

// Encodes frames for the given scenes to a silent H.264 file.
async function encodeVideo(browser, scenes, path) {
  await run("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", path], async (stdin) => {
    for (const scene of scenes) {
      const n = Math.round(scene.duration * fps);
      const times = Array.from({ length: n }, (_, i) => i / fps);
      process.stdout.write(`▸ ${scene.name} (${n} frames)\n`);
      await capture(browser, scene, times, (buf) => stdin.write(buf));
    }
    stdin.end();
  });
}

// Music slice + every scene's SFX cue, mixed and loudness-normalised.
async function mux(video, scenes, path) {
  const start = scenes[0].start, total = scenes.reduce((s, x) => s + x.duration, 0);
  const cues = scenes.flatMap((s) => s.sfx.map((c) => ({ ...c, at: s.start - start + c.beat * BEAT })));
  const inputs = ["-i", video, "-ss", String(MUSIC_OFFSET + start), "-t", String(total), "-i", MUSIC];
  const filters = [`[1:a]volume=0.7,afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, total - 1.6)}:d=1.6[m]`];
  cues.forEach((c, i) => {
    inputs.push("-i", join(ROOT, "assets/audio/sfx", `${c.name}.ogg`));
    const ms = Math.max(0, Math.round(c.at * 1000));
    filters.push(`[${i + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${c.gain ?? 0.6},adelay=${ms}|${ms}[s${i}]`);
  });
  const mixIn = ["[m]", ...cues.map((_, i) => `[s${i}]`)].join("");
  filters.push(`${mixIn}amix=inputs=${cues.length + 1}:normalize=0:duration=first,alimiter=limit=0.9,loudnorm=I=-14:TP=-1.5:LRA=11[a]`);
  await run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filters.join(";"),
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", path]);
}

async function contact(browser, scene) {
  const dir = join(OUT, `${scene.name}-frames`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const n = Math.round(scene.duration / (BEAT / 2));
  const times = Array.from({ length: n }, (_, i) => i * (BEAT / 2) + 0.05);
  let i = 0;
  const writes = [];
  await capture(browser, scene, times, (buf) => writes.push(writeFile(join(dir, `${String(i++).padStart(3, "0")}.jpg`), buf)),
    (t) => `beat ${((t - 0.05) / BEAT).toFixed(1)}`);
  await Promise.all(writes);
  const cols = 8, rows = Math.ceil(n / cols);
  const out = join(OUT, `${scene.name}-contact.png`);
  await run("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", join(dir, "%03d.jpg"),
    "-vf", `scale=270:480,tile=${cols}x${rows}:padding=6:color=white`,
    "-frames:v", "1", out]);
  console.log(`✓ ${out}  `);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const all = await loadScenes(browser);
  const scenes = only ? all.filter((s) => s.name.startsWith(only)) : all;
  if (!scenes.length) throw new Error(`No scene matches "${only}"`);
  if (flag("contact")) {
    for (const s of scenes) await contact(browser, s);
  } else {
    const name = only ? scenes[0].name : "statsconnect-promo";
    const silent = join(OUT, `${name}.silent.mp4`);
    await encodeVideo(browser, scenes, silent);
    await mux(silent, scenes, join(OUT, `${name}.mp4`));
    await rm(silent);
    console.log(`✓ ${join(OUT, `${name}.mp4`)}`);
  }
} finally {
  await browser.close();
}
