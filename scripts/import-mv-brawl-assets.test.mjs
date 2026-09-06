import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildReferenceBridge } from "./build-reference-asset-bridge.mjs";
import { crawlMvInventory } from "./import-mv-brawl-assets.mjs";

const bytes = (value) => Buffer.from(value);
const digest = (value) => createHash("sha256").update(value).digest("hex");

function page(displayName, model, texture, face = null, fastIdle = false) {
  const animations = {
    idle: [fastIdle ? "idle_120.glb" : "idle.glb", face ? "characters.sc" : null, face ?? null, "1", "29", "Idle Anim"],
    walking: ["walk.glb", face ? "characters.sc" : null, face ?? null, "1", "19", "Walking Anim"],
    weapon: ["attack.glb", face ? "characters.sc" : null, face ?? null, "", "20", "Attack Anim"],
    ulti: ["super.glb", face ? "characters.sc" : null, face ?? null, "", "29", "Ulti Anim"],
    lobby: ["win.glb", face ? "characters.sc" : null, face ? face.replace(/_face$/, "_happy") : null, "", "126", "Win Anim"],
    lose: ["lose.glb", face ? "characters.sc" : null, face ? face.replace(/_face$/, "_sad") : null, "", "80", "Lose Anim"],
  };
  const encoded = JSON.stringify(animations).replaceAll('"', "&#34;");
  return `<canvas id="glCanvas" data-model-name="${model}" data-animations="${encoded}" data-diffuse-texture-override="${texture}" data-specular-texture-override="${texture}" data-face-covers-whole-texture data-face-scaled-up-texture data-home-screen-scale="290" data-outline-shader></canvas>`;
}

function materialGlb(materials, primitives, asset = {}) {
  const json = { asset: { version: "2.0", ...asset }, materials, meshes: [{ primitives: primitives.map((material) => ({ material })) }] };
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const output = Buffer.alloc(12 + 8 + paddedJson.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedJson.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(output, 20);
  return output;
}

function sourceTables() {
  const characters = [
    { rowIndex: 0, Name: "ShotgunGirl", DefaultSkin: "BanditGirlDefault", Type: "Hero", Disabled: "" },
    { rowIndex: 1, Name: "Gunslinger", DefaultSkin: "GunSlingerDefault", Type: "Hero", Disabled: "" },
    { rowIndex: 2, Name: "Cactus", DefaultSkin: "CactusDefault", Type: "Hero", Disabled: "" },
    { rowIndex: 12, Name: "Crow", DefaultSkin: "CrowDefault", Type: "Hero", Disabled: "" },
  ];
  const confs = [
    { Name: "BanditGirlDefault", Character: "ShotgunGirl", Model: "shelly_redux_geo.glb" },
    { Name: "GunSlingerDefault", Character: "Gunslinger", Model: "colt_redux_geo.glb" },
    { Name: "CactusDefault", Character: "Cactus", Model: "spike_geo.glb" },
    { Name: "CrowDefault", Character: "Crow", Model: "crow_geo.glb" },
  ];
  const skins = [
    { Name: "BanditGirlDefault", Conf: "BanditGirlDefault", DiffuseTexture: "shelly_redux_tex.sctx" },
    { Name: "GunSlingerDefault", Conf: "GunSlingerDefault", DiffuseTexture: "colt_redux_tex.sctx" },
    { Name: "CactusDefault", Conf: "CactusDefault", DiffuseTexture: "spike_tex.sctx" },
    { Name: "CrowDefault", Conf: "CrowDefault", DiffuseTexture: "crow_tex.sctx" },
  ];
  return { characters, confs, skins };
}

test("crawls the canonical English inventory and mirrors Spike, Crow, Colt, and Shelly packages", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "mv-import-test-"));
  const outputDir = path.join(root, "assets");
  const tables = sourceTables();
  const pages = {
    "Spike_(Default)": page("Spike (Default)", "spike_geo.glb", "spike_tex.sctx"),
    "Crow_(Default)": page("Crow (Default)", "crow_geo.glb", "crow_tex.sctx", "crow_def_face"),
    "Colt_(Default)": page("Colt (Default)", "colt_redux_geo.glb", "colt_redux_tex.sctx", "colt_def_face", true),
    "Shelly_(Default)": page("Shelly (Default)", "shelly_redux_geo.glb", "shelly_redux_tex.sctx", "shelly_def_face"),
  };
  const inventoryHtml = `<div id="search-data" data-entries="${JSON.stringify([[true, "", false, "Spike (Default)"], [true, "", false, "Crow (Default)"], [true, "", false, "Colt (Default)"], [true, "", false, "Shelly (Default)"]]).replaceAll('"', "&#34;")}"></div>`;
  const urls = new Map();
  const requestHeaders = [];
  const add = (url, value) => urls.set(url, bytes(value));
  for (const [route, html] of Object.entries(pages)) {
    urls.set(`https://mv.brawlstars.top/skins/${encodeURIComponent(route)}`, bytes(html));
  }
  for (const value of ["spike_geo.glb", "crow_geo.glb", "colt_redux_geo.glb", "shelly_redux_geo.glb", "idle.glb", "idle_120.glb", "walk.glb", "attack.glb", "super.glb", "win.glb", "lose.glb"]) add(`https://cdn.brawlbox.com.cn/sc3d/${value}`, value);
  for (const value of ["spike_tex.png", "crow_tex.png", "colt_redux_tex.png", "shelly_redux_tex.png"]) add(`https://cdn.brawlbox.com.cn/sc3d/${value}`, value);
  for (const value of ["characters.sc.png"]) add(`https://cdn.brawlbox.com.cn/faces/${value}`, value);
  for (const value of ["crow_def_face", "crow_def_happy", "crow_def_sad", "colt_def_face", "colt_def_happy", "colt_def_sad", "shelly_def_face", "shelly_def_happy", "shelly_def_sad"]) add(`https://cdn.brawlbox.com.cn/faces/${value}`, value);
  for (const value of ["menu_metal_diffuse_lightmap.png", "menu_metal_specular_lightmap.png", "menu_diffuse_lightmap.png", "menu_specular_lightmap.png"]) add(`https://cdn.brawlbox.com.cn/sc3d/${value}`, value);
  add("https://cdn.brawlbox.com.cn/uber.vert.glsl", "vertex");
  add("https://cdn.brawlbox.com.cn/uber.frag.glsl", "fragment");
  const fetchImpl = async (url, init) => {
    requestHeaders.push(init?.headers ?? {});
    if (url === "https://mv.brawlstars.top/en/") return new Response(inventoryHtml, { status: 200 });
    const value = urls.get(url);
    return value ? new Response(value, { status: 200 }) : new Response("missing", { status: 404 });
  };
  try {
    const inventory = await crawlMvInventory({ inventoryUrl: "https://mv.brawlstars.top/en/", characters: tables.characters, skins: tables.skins, confs: tables.confs, fetchImpl, outputDir, stateFile: path.join(outputDir, ".state.json"), requestHeaders: { "X-Importer-Test": "enabled" } });
    assert.equal(inventory.routes.length, 4);
    assert.deepEqual(inventory.routes.map((entry) => entry.brawlerId), [16000002, 16000012, 16000001, 16000000]);
    assert.equal(inventory.routes[0].requiredRoles.includes("face"), false);
    assert.equal(inventory.routes[1].faceFlags.coversWholeTexture, false, "empty reference data attributes are false");
    const colt = inventory.routes.find((entry) => entry.skinId === "GunSlingerDefault");
    assert.deepEqual(colt?.animationMetadata.idle, { label: "Idle Anim", startFrame: 0, endFrame: 27, fps: 120, face: "face" });
    assert.equal(colt?.animationMetadata.weapon.face, "face");
    assert.equal(colt?.animationMetadata.ulti.face, "face");
    const spike = inventory.routes.find((entry) => entry.skinId === "CactusDefault");
    assert.equal(spike?.animationMetadata.idle.fps, 30);
    assert.equal(inventory.routes.every((entry) => entry.capabilities.outline.enabled === true), true, "outline is always available in the reference viewer");
    assert.equal(inventory.routes.every((entry) => entry.materialSlots.every((slot) => slot.stencilUvPolicy === "flip-y")), true, "reference stencil slots apply the offscreen render-target Y flip");
    assert.equal(inventory.routes[1].assets.geometry.url, undefined, "downloaded inventory must not retain runtime URLs");
    assert.equal(requestHeaders[0]["User-Agent"].includes("Chrome/151"), true);
    assert.equal(requestHeaders[0].Origin, "https://mv.brawlstars.top");
    assert.equal(requestHeaders[0].Referer, "https://mv.brawlstars.top/");
    assert.equal(requestHeaders[0]["Sec-Fetch-Mode"], "cors");
    assert.equal(requestHeaders[0]["Sec-Fetch-Site"], "cross-site");
    assert.equal(requestHeaders[0]["X-Importer-Test"], "enabled");
    const bridge = await buildReferenceBridge({ inventory, charactersRows: tables.characters, outputDir: path.join(root, "bridge"), publicPrefix: "/assets/brawlers/3d/reference-bridge", contentAddressed: true, storagePrefix: "reference-bridge" });
    assert.equal(bridge.coverage.coveredRoutes, 4);
    assert.equal(bridge.entries.every((entry) => JSON.stringify(entry).includes("https://") === false), true);
    assert.equal(bridge.entries.find((entry) => entry.skinId === "CrowDefault")?.assets.faceAtlas.kind, "ready");
    assert.equal(bridge.entries.find((entry) => entry.skinId === "CactusDefault")?.assets.faceAtlas, undefined);
    assert.equal(bridge.entries.find((entry) => entry.skinId === "CrowDefault")?.assets.specularTexture.kind, "ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserves every explicit face export bound to custom page animations", async () => {
  const animations = {
    idle: ["idle.glb", "characters.sc", "colt_face", "", "-1", "Idle"],
    taunt: ["taunt.glb", "characters.sc", "colt_taunt", "", "-1", "Taunt"],
  };
  const html = `<canvas id="glCanvas" data-model-name="colt_redux_geo.glb" data-diffuse-texture-override="colt_redux_tex.sctx" data-animations="${JSON.stringify(animations).replaceAll('"', "&#34;")}"></canvas>`;
  const inventoryHtml = `<div id="search-data" data-entries="${JSON.stringify([[true, "", false, "Colt (Default)"]]).replaceAll('"', "&#34;")}"></div>`;
  const fetchImpl = async (url) => new Response(url === "https://mv.brawlstars.top/en/" ? inventoryHtml : html, { status: 200 });
  const result = await crawlMvInventory({ ...sourceTables(), fetchImpl, requestDelayMs: 0 });
  const colt = result.routes[0];
  assert.equal(colt.animationMetadata.taunt.face, "colt_taunt");
  assert.equal(colt.assets.faces.colt_taunt.url, "https://cdn.brawlbox.com.cn/faces/colt_taunt");
  const mismatchedAtlas = html.replace("characters.sc", "other-characters.sc");
  const mixed = await crawlMvInventory({ ...sourceTables(), fetchImpl: async (url) => new Response(url === "https://mv.brawlstars.top/en/" ? inventoryHtml : mismatchedAtlas), requestDelayMs: 0 });
  assert.equal(mixed.routes[0].reason, "multiple face atlases require per-face atlas support");
});

test("resumes a completed route without requesting its page or CDN files", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "mv-import-resume-"));
  const tables = sourceTables();
  const html = page("Crow (Default)", "crow_geo.glb", "crow_tex.sctx", "crow_def_face");
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (url === "https://mv.brawlstars.top/en/") return new Response(`<div id="search-data" data-entries="[[true,&#34;&#34;,false,&#34;Crow (Default)&#34;]]"></div>`, { status: 200 });
    if (url.endsWith("Crow_(Default)")) return new Response(html, { status: 200 });
    return new Response(Buffer.from(url), { status: 200 });
  };
  try {
    const stateFile = path.join(root, "state.json");
    const outputDir = path.join(root, "assets");
    await crawlMvInventory({ inventoryUrl: "https://mv.brawlstars.top/en/", characters: tables.characters, skins: tables.skins, confs: tables.confs, fetchImpl, outputDir, stateFile });
    const firstCalls = calls;
    const resumed = await crawlMvInventory({ inventoryUrl: "https://mv.brawlstars.top/en/", characters: tables.characters, skins: tables.skins, confs: tables.confs, fetchImpl: async (url) => { if (url === "https://mv.brawlstars.top/en/") return new Response(`<div id="search-data" data-entries="[[true,&#34;&#34;,false,&#34;Crow (Default)&#34;]]"></div>`, { status: 200 }); throw new Error("resume requested a network asset"); }, outputDir, stateFile, resume: true });
    assert.equal(resumed.routes[0].skinId, "CrowDefault");
    assert.equal(calls, firstCalls);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retries rate-limited requests using Retry-After and caller headers", async () => {
  const tables = sourceTables();
  const html = page("Crow (Default)", "crow_geo.glb", "crow_tex.sctx");
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
    if (url === "https://mv.brawlstars.top/en/") return new Response(`<div id="search-data" data-entries="[[true,&#34;&#34;,false,&#34;Crow (Default)&#34;]]"></div>`, { status: 200 });
    if (calls.filter((call) => call.url === url).length === 1) return new Response("slow down", { status: 429, headers: { "Retry-After": "0" } });
    return new Response(html, { status: 200 });
  };
  const inventory = await crawlMvInventory({ inventoryUrl: "https://mv.brawlstars.top/en/", characters: tables.characters, skins: tables.skins, confs: tables.confs, fetchImpl, routes: ["Crow (Default)"], maxRetries: 1, retryDelayMs: 0, requestDelayMs: 0, requestHeaders: { "X-Importer-Test": "retry" } });
  assert.equal(inventory.routes[0].skinId, "CrowDefault");
  assert.equal(calls.length, 3);
  assert.equal(calls[1].headers["X-Importer-Test"], "retry");
});

test("derives every used material slot and mirrors override texture variables", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "mv-material-import-"));
  const tables = sourceTables();
  const materials = materialGlb([
    { name: "character_hair", constants: ["DIFFUSE", "EMISSION"], shader: "uber", variables: { booleans: { enableStencilTex: false }, textures: { diffuseTex2D: "sc3d/crow_hair.sctx#repeat", emissionTex2D: "sc3d/crow_hair_emit.sctx#repeat" } } },
    { name: "character_skin", constants: ["DIFFUSE", "SPECULAR", "LIGHTMAP", "COLORIZE"], shader: "uber", variables: { booleans: { enableStencilTex: true }, textures: { diffuseTex2D: "sc3d/crow_skin.sctx#repeat", specularTex2D: "sc3d/crow_skin.sctx#repeat", lightmapTex2D: "sc3d/diffuse_lightmap.png#repeat", colorizeTex2D: "sc3d/crow_color.sctx#repeat" } } },
    { name: "unused_material", constants: ["DIFFUSE"], variables: { textures: { diffuseTex2D: "sc3d/unused.sctx" } } },
  ], [0, 1, 1], { generator: "COLLADA2GLTF" });
  const animations = JSON.stringify({ idle: ["idle.glb", "characters.sc", "crow_def_face", "1", "10", "Idle Anim"] }).replaceAll('"', "&#34;");
  const html = `<canvas id="glCanvas" data-model-name="crow_geo.glb" data-animations="${animations}" data-diffuse-texture-override="crow_tex.sctx" data-specular-texture-override="crow_tex.sctx" data-materials-file-override="materials_override.glb"></canvas>`;
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url === "https://mv.brawlstars.top/en/") return new Response(`<div id="search-data" data-entries="[[true,&#34;&#34;,false,&#34;Crow (Default)&#34;]]"></div>`, { status: 200 });
    if (url.endsWith("Crow_(Default)")) return new Response(html, { status: 200 });
    if (url.endsWith("materials_override.glb") || url.endsWith("crow_geo.glb")) return new Response(materials, { status: 200 });
    return new Response(Buffer.from(url), { status: 200 });
  };
  try {
    const inventory = await crawlMvInventory({ inventoryUrl: "https://mv.brawlstars.top/en/", characters: tables.characters, skins: tables.skins, confs: tables.confs, fetchImpl, outputDir: path.join(root, "assets"), requestDelayMs: 0 });
    const entry = inventory.routes[0];
    assert.deepEqual(entry.materialSlots.map((slot) => slot.materialName), ["character_hair", "character_skin"]);
    const hair = entry.materialSlots[0];
    const skin = entry.materialSlots[1];
    assert.equal(hair.emissionTexture.startsWith("material:character_hair-emissionTexture"), true);
    assert.equal(skin.colorizeTexture.startsWith("material:character_skin-colorizeTexture"), true);
    assert.equal(skin.specularTexture.startsWith("material:character_skin-specularTexture"), true);
    assert.equal(skin.stencil, true);
    assert.equal(entry.geometryMetadata.uvSource, "COLLADA2GLTF");
    assert.equal(hair.uvSource, "COLLADA2GLTF");
    assert.equal(skin.uvSource, "COLLADA2GLTF");
    assert.equal(hair.sc3d_material_stencil, true);
    assert.equal(skin.sc3d_material_stencil, true);
    assert.deepEqual(hair.scConstants, ["DIFFUSE", "EMISSION"]);
    assert.equal(Object.keys(entry.assets.materials).length, 7);
    assert.equal(requested.some((url) => url.endsWith("/sc3d/crow_hair_emit.png")), true);
    assert.equal(requested.some((url) => url.endsWith("/sc3d/crow_color.png")), true);
    assert.equal(requested.some((url) => url.endsWith("/sc3d/menu_diffuse_lightmap.png")), true);
    assert.equal(requested.some((url) => url.endsWith("/sc3d/menu_specular_lightmap.png")), true);
    assert.equal(requested.some((url) => url.endsWith("/sc3d/diffuse_lightmap.png")), false);
    assert.equal(requested.some((url) => url.endsWith("/sc3d/unused.png")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
