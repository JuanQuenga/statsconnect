#!/usr/bin/env node
/** Diagnostic-only render audit. All downloads and outputs stay outside the repo. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const THRESHOLDS = Object.freeze({ flicker: 0.01, white: 0.02, duplicate: 0.008, face: 0.15 });
export function shardIncludes(index, shard = '1/1') {
  const match = /^(\d+)\/(\d+)$/.exec(shard);
  if (!match || +match[1] < 1 || +match[1] > +match[2]) throw new Error('--shard must be i/n, with 1 <= i <= n');
  return index % +match[2] === +match[1] - 1;
}
export function sampleTimes(duration, count = 8) {
  if (!Number.isFinite(duration) || duration < 0 || !Number.isInteger(count) || count < 1) throw new Error('invalid sampling interval');
  return Array.from({ length: count }, (_, i) => duration * i / count);
}
export function signatureDistance(a, b) {
  if (!a.length || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (a.length * 255);
}
/** Alpha > 127 defines the silhouette; a one-pixel erosion excludes moving edges. */
export function analyzeRGBA(a, b = a) {
  const { width: w, height: h, data: d } = a;
  if (b.width !== w || b.height !== h || d.length !== w * h * 4 || b.data.length !== d.length) throw new Error('image dimensions differ');
  let minX = w, minY = h, maxX = -1, maxY = -1, silhouettePixels = 0, interiorPixels = 0, changedPixels = 0, whitePixels = 0;
  const inside = (x, y) => d[(y * w + x) * 4 + 3] > 127;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4;
    if (!inside(x, y)) continue;
    silhouettePixels++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    if (d[p] === 255 && d[p + 1] === 255 && d[p + 2] === 255) whitePixels++;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
    let eroded = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!inside(x + dx, y + dy) || b.data[((y + dy) * w + x + dx) * 4 + 3] <= 127) eroded = false;
    if (!eroded) continue;
    interiorPixels++;
    if ([0, 1, 2].some(c => Math.abs(d[p + c] - b.data[p + c]) > 64)) changedPixels++;
  }
  const signature = [];
  for (let sy = 0; sy < 32; sy++) for (let sx = 0; sx < 32; sx++) {
    const x0 = Math.floor(sx * w / 32), x1 = Math.floor((sx + 1) * w / 32), y0 = Math.floor(sy * h / 32), y1 = Math.floor((sy + 1) * h / 32);
    let alpha = 0, luma = 0, count = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = (y * w + x) * 4, coverage = d[p + 3] > 127 ? 1 : 0;
      alpha += coverage; luma += coverage * (d[p] * 0.2126 + d[p + 1] * 0.7152 + d[p + 2] * 0.0722); count++;
    }
    signature.push(Math.round(255 * alpha / Math.max(1, count)), Math.round(luma / Math.max(1, count)));
  }
  return { bbox: silhouettePixels ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    silhouettePixels, interiorPixels, changedPixels, flickerScore: changedPixels / Math.max(1, interiorPixels), whitePixels,
    whiteRatio: whitePixels / Math.max(1, silhouettePixels), signature };
}
export function duplicatePairs(options, tolerance = THRESHOLDS.duplicate) {
  const pairs = [];
  for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) {
    if (options[i].frames.length !== 8 || options[j].frames.length !== 8 || options[i].frames.some(f => !f.silhouettePixels) || options[j].frames.some(f => !f.silhouettePixels)) continue;
    const distances = options[i].frames.map((f, k) => signatureDistance(f.signature, options[j].frames[k].signature));
    const distance = distances.reduce((a, b) => a + b, 0) / 8;
    if (distance <= tolerance && Math.max(...distances) <= tolerance * 2) pairs.push({ a: options[i].key, b: options[j].key, distance, maxDistance: Math.max(...distances) });
  }
  return pairs;
}
export function referenceSample(skinId, seed) {
  // Stable pseudorandom 10% Bernoulli sample, independent of shard/resume/order.
  return parseInt(createHash('sha256').update(`${seed}:${skinId}`).digest('hex').slice(0, 8), 16) / 2 ** 32 < 0.1;
}
/** Reference primitives share buffers; only drawn indices belong to this mesh's bone palette. */
export function* referenceVertexIndices(geometry) {
  const position = geometry.attributes.position;
  if (!position) return;
  const index = geometry.index, count = index?.count ?? position.count;
  const start = Math.max(0, geometry.drawRange?.start ?? 0);
  const end = Math.min(count, start + (geometry.drawRange?.count ?? Infinity));
  const seen = new Set();
  for (let offset = start; offset < end; offset++) {
    const vertex = index ? index.getX(offset) : offset;
    if (!seen.has(vertex)) { seen.add(vertex); yield vertex; }
  }
}
const scriptPath = fileURLToPath(import.meta.url);
const repo = path.resolve(path.dirname(scriptPath), '../../..');
const DEFAULT_OUT = '/tmp/brawl-audit/render';
const CATALOG = 'https://bs.statsconnect.app/assets/brawlers/3d/catalog.json';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = value => createHash('sha256').update(value).digest('hex');
const safe = value => value.replace(/[^a-zA-Z0-9_.-]/g, '_');
async function atomic(file, value) { await fs.writeFile(`${file}.tmp`, value); await fs.rename(`${file}.tmp`, file); }
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }

/** Disk cache bounds RAM. A single global queue serializes reference AND CDN requests. */
function networkCache(out, roots = []) {
  let queue = Promise.resolve(), lastRequest = 0;
  const dir = path.join(out, 'cache/http');
  async function get(url) {
    const parsed = new URL(url);
    if (process.env.BRAWL_3D_ASSET_DIR && parsed.hostname === 'bs.statsconnect.app') {
      const relative = decodeURIComponent(parsed.pathname.replace(/^\/assets\/brawlers\/3d\//, ''));
      const root = path.resolve(process.env.BRAWL_3D_ASSET_DIR), file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) throw Error('asset path outside staged directory');
      const body = await fs.readFile(file);
      return { status: 200, finalUrl: url, headers: { 'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream' }, sha256: digest(body), body };
    }
    const cdn = new URL(url).hostname === 'cdn.brawlbox.com.cn';
    const key = digest(url + (cdn ? '|referer=mv.brawlstars.top' : '')), metadata = path.join(dir, `${key}.json`), bodyFile = path.join(dir, `${key}.body`);
    if (await exists(metadata) && await exists(bodyFile)) return { ...JSON.parse(await fs.readFile(metadata, 'utf8')), body: await fs.readFile(bodyFile) };
    for (const root of roots) {
      const m = path.join(root, `${key}.json`), b = path.join(root, `${key}.body`);
      if (await exists(m) && await exists(b)) return { ...JSON.parse(await fs.readFile(m, 'utf8')), body: await fs.readFile(b) };
    }
    const polite = /(^|\.)(mv\.brawlstars\.top|brawlbox\.com\.cn)$/.test(new URL(url).hostname);
    const download = async () => {
      // Check again after taking the queue, since multiple materials share URLs.
      if (await exists(metadata) && await exists(bodyFile)) return { ...JSON.parse(await fs.readFile(metadata, 'utf8')), body: await fs.readFile(bodyFile) };
      for (let attempt = 0; attempt < 5; attempt++) {
        if (polite) await delay(Math.max(0, 500 - (Date.now() - lastRequest)));
        lastRequest = Date.now();
        const response = await fetch(url, { redirect: 'follow', headers: cdn ? { Referer: 'https://mv.brawlstars.top/', Origin: 'https://mv.brawlstars.top' } : {}, signal: AbortSignal.timeout(90000) });
        const body = Buffer.from(await response.arrayBuffer());
        if ([429, 503].includes(response.status)) {
          const retry = response.headers.get('retry-after');
          const retryMs = retry && /^\d+$/.test(retry) ? +retry * 1000 : retry ? Math.max(0, Date.parse(retry) - Date.now()) : 1000 * 2 ** attempt;
          await delay(Math.max(500, retryMs || 1000)); continue;
        }
        const result = { status: response.status, finalUrl: response.url, headers: { 'content-type': response.headers.get('content-type') || 'application/octet-stream' }, sha256: digest(body) };
        await fs.mkdir(dir, { recursive: true }); await atomic(bodyFile, body); await atomic(metadata, JSON.stringify(result));
        return { ...result, body };
      }
      throw new Error(`retry budget exhausted: ${url}`);
    };
    if (!polite) return download();
    const pending = queue.then(download); queue = pending.catch(() => {}); return pending;
  }
  return get;
}
async function catalogSnapshot(out, get) {
  const file = path.join(out, 'catalog-snapshot.json');
  if (await exists(file)) return JSON.parse(await fs.readFile(file, 'utf8'));
  const response = await get(CATALOG);
  if (response.status !== 200) throw new Error(`catalog HTTP ${response.status}`);
  const index = JSON.parse(response.body), shards = [], bySkin = new Map();
  const urls = index.kind === 'index' ? index.brawlers.map(b => new URL(b.shard, CATALOG).href) : [];
  for (const url of urls) {
    const result = await get(url); if (result.status !== 200) throw new Error(`shard HTTP ${result.status}: ${url}`);
    shards.push({ url, sha256: result.sha256 });
    const catalog = JSON.parse(result.body);
    for (const entry of [...(catalog.defaults || []), ...(catalog.releasedSkins || []), ...(catalog.skins || [])]) {
      const previous = bySkin.get(entry.skinId);
      if (!previous || (previous.baseModel.kind !== 'ready' && entry.baseModel.kind === 'ready')) bySkin.set(entry.skinId, entry);
    }
  }
  if (!urls.length) for (const entry of [...(index.defaults || []), ...(index.releasedSkins || []), ...(index.skins || [])]) bySkin.set(entry.skinId, entry);
  const snapshot = { capturedAt: new Date().toISOString(), url: CATALOG, finalUrl: response.finalUrl, sha256: response.sha256, shards, entries: [...bySkin.values()].sort((a, b) => a.skinId.localeCompare(b.skinId)) };
  await atomic(file, JSON.stringify(snapshot)); return snapshot;
}
function harnessSource() {
  const lib = path.join(repo, 'apps/brawlstats/src/lib');
  return `
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {BrawlerViewerRuntime,centerModelForFraming,fitPerspectiveCameraDistance} from ${JSON.stringify(path.join(lib, 'brawler-viewer-runtime.ts'))};
import {parseBrawlerAssetCatalog,catalogEntryToViewerManifest,catalogAnimationOptions} from ${JSON.stringify(path.join(lib, 'brawler-asset-catalog.ts'))};
import {createOutlineCompositeMaterial} from ${JSON.stringify(path.join(lib, 'brawler-viewer-contract.ts'))};
const analyzeRGBA=${analyzeRGBA.toString()};
const canvas=document.getElementById('canvas');
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.setClearAlpha(0); renderer.setPixelRatio(1); renderer.setSize(512,512,false);
const copy=document.createElement('canvas');copy.width=copy.height=512;const ctx=copy.getContext('2d',{willReadFrequently:true});
const crop=document.createElement('canvas');crop.width=crop.height=128;const cropCtx=crop.getContext('2d');
const outlineScene=new THREE.Scene(),outlineCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),outlineMaterial=createOutlineCompositeMaterial();
outlineScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),outlineMaterial));
let runtime,entry,manifest,scene,camera,wrapper,elapsed=0,key;
const direction=new THREE.Vector3(.18,.05,1.18).normalize();
const gltf=new GLTFLoader();
const reset=()=>{runtime?.dispose();runtime=undefined;scene?.clear();renderer.renderLists.dispose();entry=undefined;key=undefined;};
function draw(jitter=0){camera.position.applyAxisAngle(new THREE.Vector3(0,1,0),jitter*Math.PI/180);camera.lookAt(0,0,0);
 if(runtime.getState().faceEnabled)runtime.renderFace(renderer);
 if(runtime.getState().outlineEnabled){outlineMaterial.uniforms.tDiffuse.value=runtime.renderOutline(renderer,camera,scene);renderer.render(outlineScene,outlineCamera);}else renderer.render(scene,camera);
 camera.position.applyAxisAngle(new THREE.Vector3(0,1,0),-jitter*Math.PI/180);camera.lookAt(0,0,0);
 ctx.clearRect(0,0,512,512);ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,512,512);
}
window.audit={
 options(raw){return catalogAnimationOptions(parseBrawlerAssetCatalog({schemaVersion:1,skins:[raw]}).skins[0]);},
 async loadSkin(raw){reset();entry=parseBrawlerAssetCatalog({schemaVersion:1,skins:[raw]}).skins[0];manifest=catalogEntryToViewerManifest(entry);if(!manifest)throw Error('catalog has no complete viewer manifest');
 runtime=new BrawlerViewerRuntime(manifest,{loadModel:async url=>{const v=await gltf.loadAsync(url);return {scene:v.scene,animations:v.animations};},loadTexture:url=>new THREE.TextureLoader().loadAsync(url),loadBinary:async url=>{const r=await fetch(url);if(!r.ok)throw Error('face HTTP '+r.status+' '+url);return r.arrayBuffer();}});
 await runtime.loadBase();return catalogAnimationOptions(entry);},
 async selectAnimation(animationKey){if(!runtime)throw Error('skin not loaded');if(wrapper){wrapper.remove(runtime.root);runtime.root.position.set(0,0,0);}await runtime.selectAnimation(animationKey);key=animationKey;elapsed=0;
 const a=manifest.animations[key];runtime.setFaceEnabled(a?.[1].kind==='ready'&&a?.[2].kind==='ready');runtime.setOutlineEnabled(manifest.outline.kind==='available');
 const framed=centerModelForFraming(runtime.root,runtime.getFramingBounds());wrapper=framed.wrapper;scene=new THREE.Scene();scene.add(wrapper);
 const light=new THREE.DirectionalLight(0xffffff,.9);light.position.set(3,5,4);scene.add(light);const fill=new THREE.DirectionalLight(0xb8d5ff,.35);fill.position.set(-4,2,1);scene.add(fill);scene.add(new THREE.HemisphereLight(0xffffff,0x26364a,.55));
 camera=new THREE.PerspectiveCamera(20,1,framed.largestDimension*.05,framed.largestDimension*20);
 const scale=THREE.MathUtils.clamp((manifest.cameraScale??290)/290,.72,1.05);
 camera.position.copy(direction).multiplyScalar(fitPerspectiveCameraDistance(camera,framed.bounds,direction)/scale);camera.lookAt(0,0,0);
 // TS-private data is read only for duration metadata; animation is advanced exclusively with public update().
 this.framing={bounds:[...framed.bounds.min.toArray(),...framed.bounds.max.toArray()],distance:camera.position.length(),near:camera.near,far:camera.far};
 return {duration:runtime.hasAnimationClip()?runtime.animationDuration/(a[8]??1):0,hasClip:runtime.hasAnimationClip(),framing:this.framing};},
 async renderFrame({skinId,animationKey,time,jitter=.05}){if(skinId!==entry?.skinId)throw Error('loadSkin before renderFrame');if(key!==animationKey||time<elapsed-1e-9)await this.selectAnimation(animationKey);
 const delta=1/60;while(elapsed+delta<time-1e-9){runtime.update(delta);elapsed+=delta;}runtime.update(Math.max(0,time-elapsed));elapsed=time;
 const first=draw(),png=canvas.toDataURL('image/png');const second=draw(jitter),metrics=analyzeRGBA(first,second);
 cropCtx.clearRect(0,0,128,128);cropCtx.drawImage(canvas,0,0,512,512,0,0,128,128);const jitterThumb=crop.toDataURL('image/png');ctx.putImageData(first,0,0);
 cropCtx.clearRect(0,0,128,128);cropCtx.drawImage(copy,0,0,512,512,0,0,128,128);const thumb=crop.toDataURL('image/png');
 cropCtx.clearRect(0,0,128,128);if(metrics.bbox){const b=metrics.bbox;cropCtx.drawImage(copy,b.x,b.y,b.width,Math.max(1,Math.ceil(b.height*.35)),0,0,128,128);}const face=crop.toDataURL('image/png');
 let meshes=0,missingTextures=[];runtime.root.traverseVisible(o=>{if(!o.isMesh)return;meshes++;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.map&&!m.map.image)missingTextures.push(m.name+':map');for(const [name,u] of Object.entries(m.uniforms??{}))if(u.value?.isTexture&&!u.value.image&&!u.value.isRenderTargetTexture)missingTextures.push(m.name+':'+name);}});
 return {png,thumb,jitterThumb,face,...metrics,meshes,missingTextures,state:runtime.getState(),renderer:renderer.info.render};},
 dispose:reset,
 smoke(){reset();const s=new THREE.Scene(),c=new THREE.PerspectiveCamera(40,1,.1,10);c.position.z=3;s.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0x22bb77})));renderer.render(s,c);ctx.clearRect(0,0,512,512);ctx.drawImage(canvas,0,0);return {png:canvas.toDataURL('image/png'),metrics:analyzeRGBA(ctx.getImageData(0,0,512,512)),renderer:renderer.getContext().getParameter(renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)};}
};`;
}

// Adapter to the cached 2026-10 reference module. Fail explicitly if its lexical API changes.
function instrumentReference(source) {
  for (const token of ['async function a_(e)', 'Rg&&Rg.goToFrame', 'const Xg=await', 'dg=new Ar(20']) if (!source.includes(token)) throw new Error(`reference adapter unsupported: missing ${token}`);
  return source + `\n;const referenceVertexIndices=${referenceVertexIndices.toString()};__=false;window.referenceAudit={
 async select(label){const pair=Object.entries(eg).find(([k,v])=>v[5]===label);if(!pair)throw Error('reference animation missing: '+label);await a_(pair[1]);__=false;return {duration:Kg,label:Qg};},
 render(time){__=false;g_=Math.max(0,time);qg.setTime($g/e_+g_);t_();if(Rg)Rg.goToFrame(Math.round(30*g_));for(const m of Jg)if(m.uniforms?.u_time)m.uniforms.u_time.value=g_;mg.render();return Yf.toDataURL('image/png');},
 frame(f){ug.setPixelRatio(1);ug.setSize(512,512,false);mg.setPixelRatio(1);mg.setSize(512,512);dg.clearViewOffset();dg.aspect=1;dg.fov=20;dg.near=f.near;dg.far=f.far;dg.position.set(.18,.05,1.18).normalize().multiplyScalar(f.distance);dg.lookAt(0,0,0);dg.updateProjectionMatrix();Xg.scene.scale.setScalar(1);Xg.scene.updateMatrixWorld(true);
 // Runtime/reference geometries use different origins. Center the reference's current visible pose.
 let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];Xg.scene.traverseVisible(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;if(!p)return;for(const i of referenceVertexIndices(o.geometry)){const v=new dg.position.constructor();if(o.getVertexPosition)o.getVertexPosition(i,v);else v.fromBufferAttribute(p,i);v.applyMatrix4(o.matrixWorld);for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],v.getComponent(j));hi[j]=Math.max(hi[j],v.getComponent(j));}}});
 const center=lo.map((v,i)=>(v+hi[i])/2);dg.position.add(new dg.position.constructor(...center));dg.lookAt(...center);dg.updateMatrixWorld(true);return {center,lo,hi};}
};`;
}
async function readRows(file, includeFrames = false) {
  if (!await exists(file)) return [];
  const rows = [], lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { console.warn('Ignoring interrupted JSONL record', file, lineNumber); continue; }
    if (!includeFrames && row.kind === 'frame') continue;
    delete row.signature; delete row.signatureBase64;
    if(row.kind==='frame'){const {skinId,animationKey,index,flickerScore,whiteRatio,whitePixels,silhouettePixels,interiorPixels,changedPixels,meshes,missingTextures,contactSheet}=row;rows.push({kind:'frame',skinId,animationKey,index,flickerScore,whiteRatio,whitePixels,silhouettePixels,meshes,missingTextures,contactSheet});}
    else rows.push(row);
  }
  return rows;
}
async function main() {
  const { values } = parseArgs({ options: { shard: { type: 'string', default: '1/1' }, limit: { type: 'string' }, skins: { type: 'string' }, resume: { type: 'boolean' }, out: { type: 'string', default: DEFAULT_OUT }, toolchain: { type: 'string', default: `${DEFAULT_OUT}/toolchain` }, phase: { type: 'string', default: 'all' }, 'faces-stage': { type: 'string', default: 'all' }, 'retry-local': { type: 'boolean' }, 'cache-roots': { type: 'string' }, 'face-pairs': { type: 'string' }, 'harness-cache': { type: 'string' }, smoke: { type: 'boolean' }, 'report-only': { type: 'boolean' }, 'reference-all': { type: 'boolean' }, 'retry-reference-failures': { type: 'boolean' }, seed: { type: 'string', default: 'brawl-render-2026-10-07' } } });
  shardIncludes(0, values.shard);
  if (values.phase === 'faces') return facesMain(values);
  if (!['all', 'render', 'reference'].includes(values.phase)) throw new Error('--phase must be all, render, or reference');
  if (values.limit && (!/^\d+$/.test(values.limit) || +values.limit < 1)) throw new Error('--limit must be positive');
  const out = path.resolve(values.out), tag = values.shard.replace('/', '-');
  await fs.mkdir(out, { recursive: true });
  const toolImport = name => import(pathToFileURL(path.join(path.resolve(values.toolchain), 'node_modules', name, name === 'playwright' ? 'index.mjs' : name === 'pngjs' ? 'lib/png.js' : 'lib/main.js')).href);
  const [{ chromium }, { default: pngjs }, esbuild] = await Promise.all([toolImport('playwright'), toolImport('pngjs'), toolImport('esbuild')]);
  const { PNG } = pngjs;
  const decode = value => PNG.sync.read(Buffer.from(value.split(',')[1], 'base64'));
  const pngBytes = value => Buffer.from(value.split(',')[1], 'base64');
  const get = networkCache(out);
  const resultsFile = path.join(out, `results-${tag}.jsonl`), stateFile = path.join(out, `state-${tag}.json`);
  const allRows = async () => (await Promise.all((await fs.readdir(out)).filter(f => /^results-.*\.jsonl$/.test(f)).map(f => readRows(path.join(out, f), true)))).flat();
  async function append(row) { await fs.appendFile(resultsFile, JSON.stringify({ recordedAt: new Date().toISOString(), ...row }) + '\n'); }
  function contact(images, columns = 8) {
    const sheet = new PNG({ width: columns * 128, height: Math.max(1, Math.ceil(images.length / columns)) * 128 }); sheet.data.fill(0);
    images.forEach((image, i) => PNG.bitblt(image, sheet, 0, 0, image.width, image.height, (i % columns) * 128, Math.floor(i / columns) * 128));
    return PNG.sync.write(sheet);
  }
  async function report() {
    const rows = await allRows(), frames = rows.filter(r => r.kind === 'frame'), summaries = new Map(rows.filter(r => r.kind === 'skin').map(r => [r.skinId, r]));
    const options = new Map(rows.filter(r => r.kind === 'option').map(r => [`${r.skinId}/${r.animationKey}`, r]));
    const failureAttempts = rows.filter(r => r.kind === 'failure'), refs = [...new Map(rows.filter(r => r.kind === 'reference').map(r=>[r.skinId+'/'+r.animationKey,r])).values()];
    const failures = [...new Map(failureAttempts.map(r=>[r.phase+'/'+r.skinId+'/'+r.animationKey,r])).values()].filter(r=> !(r.phase==='reference'&&refs.some(ref=>ref.skinId===r.skinId&&ref.animationKey===r.animationKey)) && !(r.phase==='render'&&options.has(r.skinId+'/'+r.animationKey)));
    const duplicates = [...summaries.values()].flatMap(r => r.duplicates.map(p => ({ skinId: r.skinId, ...p, contactSheet: options.get(`${r.skinId}/${p.a}`)?.contactSheet })));
    const snapshot = await exists(path.join(out, 'catalog-snapshot.json')) ? JSON.parse(await fs.readFile(path.join(out, 'catalog-snapshot.json'), 'utf8')) : undefined;
    const uniqueFrames = new Map(frames.map(r => [`${r.skinId}/${r.animationKey}/${r.index}`, r]));
    const ranked = field => [...uniqueFrames.values()].filter(r => r[field] > 0).sort((a, b) => b[field] - a[field]).slice(0, 50);
    const table = (items, columns) => '| ' + columns.map(c => c[0]).join(' | ') + ' |\n| ' + columns.map(() => '---').join(' | ') + ' |\n' + items.map(r => '| ' + columns.map(c => String(c[1](r) ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')).join(' | ') + ' |').join('\n') + '\n';
    const columns = field => [['skinId', r => r.skinId], ['animation', r => r.animationKey], ['metric', r => Number(r[field]).toFixed(6)], ['pixels', r => field==='flickerScore'?r.changedPixels+'/'+r.interiorPixels:r.whitePixels+'/'+r.silhouettePixels], ['frame', r => r.index], ['contact sheet', r => r.contactSheet]];
    const counts = { catalogSkins: snapshot?.entries.length, completedSkins: summaries.size, options: options.size, frames: uniqueFrames.size, flaggedSkins: [...summaries.values()].filter(r => r.flagged).length, duplicatePairs: duplicates.length, failures: failures.length, failureAttempts: failureAttempts.length, zeroMeshFrames: frames.filter(r => !r.meshes || !r.silhouettePixels).length, missingTextureFrames: frames.filter(r => r.missingTextures.length).length, referenceOptions: refs.length, referenceFrames: refs.reduce((n, r) => n + r.frames.length, 0), faceMismatches: refs.filter(r => r.difference > THRESHOLDS.face).length };
    await atomic(path.join(out, 'REPORT.md'), `# Brawl render audit\n\nUpdated ${new Date().toISOString()}. Machine: linux/${process.arch}. Snapshot: ${snapshot?.sha256 ?? 'none'}.\n\n${Object.entries(counts).map(([k,v]) => `- ${k}: ${v}`).join('\n')}\n\nCoverage is complete only when completedSkins equals catalogSkins and every flagged/sample option has either a reference row or a reference failure. Frame counts exclude duplicate retry records. See docs/BRAWL_RENDER_AUDIT.md for thresholds and limitations.\n\n## Top 50 flicker frames\n\n${table(ranked('flickerScore'), columns('flickerScore'))}\n## Top 50 pure-white offenders\n\n${table(ranked('whiteRatio'), columns('whiteRatio'))}\n## Motion duplicates surviving catalog dedupe\n\n${table(duplicates, [['skinId',r=>r.skinId],['animation A',r=>r.a],['animation B',r=>r.b],['distance',r=>r.distance],['contact sheet',r=>r.contactSheet]])}\n## Face differences versus reference\n\n${table(refs.sort((a,b)=>b.difference-a.difference), [['skinId',r=>r.skinId],['animation',r=>r.animationKey],['difference',r=>r.difference],['contact sheet',r=>r.contactSheet]])}\n## Load/render/reference failures\n\n${table(failures, [['skinId',r=>r.skinId],['animation',r=>r.animationKey],['phase',r=>r.phase],['error',r=>r.error],['contact sheet',r=>r.contactSheet]])}`);
    await atomic(path.join(out, 'totals.json'), JSON.stringify(counts, null, 2)); return counts;
  }
  if (values['report-only']) { console.log(await report()); return; }
  if (!values.resume && await exists(resultsFile)) throw new Error(`results already exist; use --resume or a fresh --out: ${resultsFile}`);
  // Finish an interrupted final line before appending; never rewrite earlier records.
  if (await exists(resultsFile)) { const bytes = await fs.readFile(resultsFile); if (bytes.length && bytes.at(-1) !== 10) { await fs.appendFile(resultsFile, '\n'); console.warn('Preserved interrupted final JSONL record; retrying its skin'); } }
  const build = await esbuild.build({ stdin: { contents: harnessSource(), resolveDir: path.join(repo, 'apps/brawlstats'), sourcefile: 'audit-harness.ts', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env.BASE_URL': '"/"' }, logLevel: 'warning' });
  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === '/harness.js') { response.setHeader('content-type', 'text/javascript'); response.end(build.outputFiles[0].contents); return; }
      if (request.url.startsWith('/assets/')) { const cached = await get(new URL(request.url, CATALOG).href); response.writeHead(cached.status, cached.headers); response.end(cached.body); return; }
      response.setHeader('content-type', 'text/html'); response.end('<!doctype html><style>html,body{margin:0}canvas{width:512px;height:512px}</style><canvas id="canvas" width="512" height="512"></canvas><script type="module" src="/harness.js"></script>');
    } catch (error) { response.writeHead(502); response.end(String(error)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, page, stopping = false;
  const url = `http://127.0.0.1:${server.address().port}`;
  process.on('SIGTERM', () => { stopping = true; }); process.on('SIGINT', () => { stopping = true; });
  const messages = [];
  async function localPage() {
    await page.goto(url); await page.waitForFunction(() => Boolean(window.audit)); messages.length = 0;
  }
  try {
    // SwiftShader works everywhere (Linux ARM64 has no GPU path); set
    // AUDIT_ANGLE=metal on macOS to render on the GPU, which is far faster.
    const angle = process.env.AUDIT_ANGLE || 'swiftshader';
    const glArgs = angle === 'swiftshader'
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : ['--use-gl=angle', `--use-angle=${angle}`];
    browser = await chromium.launch({ headless: true, args: [...glArgs, '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    page = await context.newPage(); page.setDefaultTimeout(120000);
    page.on('pageerror', error => { console.error('page exception:',String(error));if(messages.length<100) messages.push(String(error)); }); page.on('console', msg => { if (msg.type() === 'error' && messages.length<100) messages.push(msg.text()); });
    page.on('requestfailed', request => messages.length<100 && messages.push(`${request.url()}: ${request.failure()?.errorText}`));
    await localPage();
    const smoke = await page.evaluate(() => window.audit.smoke());
    if (!smoke.metrics.silhouettePixels || !smoke.metrics.signature.some(v => v > 0)) throw new Error('WebGL smoke render is empty');
    await fs.writeFile(path.join(out, 'webgl-smoke.png'), pngBytes(smoke.png)); await atomic(path.join(out, 'webgl-smoke.json'), JSON.stringify({ renderer: smoke.renderer, silhouettePixels: smoke.metrics.silhouettePixels }));
    console.log('WebGL smoke:', smoke.renderer, smoke.metrics.silhouettePixels);
    if (values.smoke) return;
    const snapshot = await catalogSnapshot(out, get);
    const selected = snapshot.entries.filter((entry, index) => shardIncludes(index, values.shard) && (!values.skins || values.skins.split(',').includes(entry.skinId))).slice(0, values.limit ? +values.limit : Infinity);
    const config = { snapshot: snapshot.sha256, shard: values.shard, seed: values.seed, thresholds: THRESHOLDS, frameCount: 8, size: 512, delta: 1/60, cameraJitterDegrees: .05 };
    if (await exists(stateFile)) { const state = JSON.parse(await fs.readFile(stateFile, 'utf8')); if (JSON.stringify(state.config) !== JSON.stringify(config)) throw new Error('resume configuration differs from saved state; use a fresh --out'); }
    await atomic(stateFile, JSON.stringify({ config, pid: process.pid, phase: values.phase, startedAt: new Date().toISOString(), status: 'running' }));
    let existing = await readRows(resultsFile), completed = new Set(existing.filter(r => r.kind === 'skin').map(r => r.skinId));
    if (values.phase !== 'reference') for (const entry of selected) {
      if (stopping) break;
      if (completed.has(entry.skinId)) continue;
      const started = Date.now(), optionRecords = [], errors = []; messages.length = 0;
      const folder = path.join(out, 'skins', safe(entry.skinId)); await fs.mkdir(folder, { recursive: true });
      try {
        const options = await page.evaluate(entry => window.audit.loadSkin(entry), entry);
        if (!options.length) throw new Error('catalogAnimationOptions returned zero options');
        for (const option of options) {
          if (stopping) break;
          const images = [], faces = [], jitters = [], frames = [];
          const contactSheet = path.join(folder, `${safe(option.key)}-contact.png`);
          try {
            const metadata = await page.evaluate(key => window.audit.selectAnimation(key), option.key);
            const times = sampleTimes(metadata.duration);
            for (const [index, time] of times.entries()) {
              const render = await page.evaluate(args => window.audit.renderFrame(args), { skinId: entry.skinId, animationKey: option.key, time });
              const { png, thumb, face, jitterThumb, signature, ...metrics } = render;
              // PNG output is validated even though only bounded thumbnails/crops are retained.
              if (pngBytes(png).readUInt32BE(16) !== 512 || pngBytes(png).readUInt32BE(20) !== 512) throw new Error('renderFrame did not return a 512px PNG');
              const facePath = path.join(folder, `${safe(option.key)}-${index}-face.png`); await fs.writeFile(facePath, pngBytes(face));
              images.push(decode(thumb)); faces.push(decode(face)); jitters.push(decode(jitterThumb));
              const row = { kind: 'frame', skinId: entry.skinId, animationKey: option.key, index, time, ...metrics, poseHash: digest(Buffer.from(signature)), signatureBase64: Buffer.from(signature).toString('base64'), facePath, contactSheet };
              await append(row); frames.push({ ...row, signature });
            }
            await fs.writeFile(contactSheet, contact([...images, ...faces, ...jitters]));
            const record = { kind: 'option', skinId: entry.skinId, animationKey: option.key, label: option.label, ...metadata, times, contactSheet, frames: frames.map(({signature,signatureBase64,...r})=>r) };
            await append(record); optionRecords.push({ key: option.key, frames });
          } catch (error) {
            if (images.length) await fs.writeFile(contactSheet, contact([...images, ...faces, ...jitters]));
            else await fs.writeFile(contactSheet, contact([]));
            const failure = { kind: 'failure', phase: 'render', skinId: entry.skinId, animationKey: option.key, error: String(error), contactSheet }; await append(failure); errors.push(failure);
          }
        }
      } catch (error) {
        const contactSheet = path.join(folder, 'failure-contact.png'); await fs.writeFile(contactSheet, contact([]));
        const failure = { kind: 'failure', phase: 'load', skinId: entry.skinId, error: String(error), contactSheet }; await append(failure); errors.push(failure);
      } finally { await page.evaluate(() => window.audit.dispose()).catch(() => {}); }
      if (stopping) break;
      for (const error of new Set(messages)) await append({kind:'failure',phase:'exception',skinId:entry.skinId,error,contactSheet:optionRecords[0]?.frames[0]?.contactSheet});
      const duplicates = duplicatePairs(optionRecords), allFrames = optionRecords.flatMap(o => o.frames);
      const flagged = errors.length > 0 || messages.length > 0 || duplicates.length > 0 || allFrames.some(f => f.flickerScore > THRESHOLDS.flicker || f.whiteRatio > THRESHOLDS.white || !f.meshes || !f.silhouettePixels || f.missingTextures.length);
      await append({ kind: 'skin', skinId: entry.skinId, options: optionRecords.length, frames: allFrames.length, duplicates, flagged, errors: errors.length, exceptions: [...new Set(messages)], elapsedMs: Date.now() - started }); completed.add(entry.skinId);
      await atomic(stateFile, JSON.stringify({ config, pid: process.pid, phase: 'render', status: 'running', completedSkins: completed.size, lastSkin: entry.skinId, updatedAt: new Date().toISOString() }));
      console.log(`render ${completed.size}/${selected.length} ${entry.skinId}: ${optionRecords.length} options, ${allFrames.length} frames, ${duplicates.length} duplicate pairs, ${errors.length} failures (${((Date.now()-started)/1000).toFixed(1)}s)`);
      if (completed.size % 10 === 0) await report();
    }
    if (values.phase !== 'render' && !stopping) {
      await page.evaluate(() => window.audit.dispose());
      // Abort analytics and challenges. Cache original bytes, instrument only a local response copy.
      await context.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await context.route('**/*', async route => {
        const requested = route.request().url();
        if (requested.startsWith(url)) return route.continue();
        if (!/^(mv\.brawlstars\.top|cdn\.brawlbox\.com\.cn)$/.test(new URL(requested).hostname) || /cdn-cgi|beacon/.test(requested)) return route.abort();
        try {
          const cached = await get(requested.split('#')[0]); let body = cached.body;
          if (cached.headers['content-type'].includes('text/html')) {
            // Restore standard module types in cached Cloudflare Rocket Loader HTML.
            let html = body.toString().replace(/type="[^"]*-module"/g, 'type="module"').replace(/<script\b[^>]*src="[^\"]*(?:rocket-loader|beacon)[^\"]*"[^>]*>[^<]*<\/script>/g, '');
            html += '<style>#glCanvas{width:512px!important;height:512px!important}#canvas-container{width:512px!important;height:512px!important}</style>'; body = Buffer.from(html);
          } else if (new URL(requested).pathname.includes('sc3dWebGLContext')) body = Buffer.from(instrumentReference(body.toString()));
          await route.fulfill({ status: cached.status, headers: { ...cached.headers, 'access-control-allow-origin': '*' }, body });
        } catch (error) { console.error('reference request:', requested, String(error)); await route.abort(); }
      });
      existing = await readRows(resultsFile);
      const summaries = new Map(existing.filter(r => r.kind === 'skin').map(r => [r.skinId, r]));
      const referenceDone = new Set(existing.filter(r => r.kind === 'reference' || (!values['retry-reference-failures'] && r.kind === 'failure' && r.phase === 'reference')).map(r => `${r.skinId}/${r.animationKey}`));
      for (const entry of selected) {
        if (stopping) break;
        if (!values['reference-all'] && !summaries.get(entry.skinId)?.flagged && !referenceSample(entry.skinId, values.seed)) continue;
        const options = existing.filter(r => r.kind === 'option' && r.skinId === entry.skinId);
        // Failed local options still need an explicit reference attempt.
        const optionMap = new Map(options.map(o => [o.animationKey, o]));
        for (const failure of existing.filter(r => r.kind === 'failure' && ['load','render'].includes(r.phase) && r.skinId === entry.skinId)) {
          const keys = failure.animationKey ? [failure.animationKey] : Object.keys(entry.animations);
          for (const key of keys) if (!optionMap.has(key)) optionMap.set(key, { animationKey:key, label:entry.animations[key]?.label, frames:[] });
        }
        const pending = [...optionMap.values()].filter(o => !referenceDone.has(`${entry.skinId}/${o.animationKey}`));
        if (!pending.length) continue;
        const slug = (entry.displayName || entry.skinId).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
        let loadError; messages.length=0;
        try {
          const firstLabel = entry.animations[pending[0].animationKey]?.label;
          await page.goto(`https://mv.brawlstars.top/skins/${encodeURIComponent(slug)}#${encodeURIComponent(firstLabel?.replaceAll(' ','') ?? '')}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
          await page.waitForFunction(() => Boolean(window.referenceAudit), null, { timeout: 120000, polling: 100 });
        } catch (error) { loadError = error; }
        for (const option of pending) {
          if (stopping) break;
          const contactSheet = path.join(out, 'skins', safe(entry.skinId), `${safe(option.animationKey)}-reference-contact.png`);
          const frames = [], images = [];
          try {
            if (loadError) throw loadError;
            const label = entry.animations[option.animationKey]?.label;
            const metadata = await page.evaluate(label => window.referenceAudit.select(label), label);
            if (option.framing) await page.evaluate(framing => window.referenceAudit.frame(framing), option.framing);
            const times = option.times || sampleTimes(metadata.duration);
            for (const [index,time] of times.entries()) {
              const data = await page.evaluate(time => window.referenceAudit.render(time), time);
              const image = decode(data), metrics = analyzeRGBA(image);
              if (!metrics.silhouettePixels) throw new Error('reference render has empty silhouette');
              const b = metrics.bbox, face = new PNG({width:128,height:128});
              for (let y=0;y<128;y++) for(let x=0;x<128;x++) {
                const px=Math.min(image.width-1,b.x+Math.floor(x*b.width/128)),py=Math.min(image.height-1,b.y+Math.floor(y*Math.max(1,Math.ceil(b.height*.35))/128));
                image.data.copy(face.data,(y*128+x)*4,(py*image.width+px)*4,(py*image.width+px)*4+4);
              }
              const local = option.frames[index]?.facePath ? PNG.sync.read(await fs.readFile(option.frames[index].facePath)) : new PNG({width:128,height:128});
              // Area-averaged luma+coverage descriptor normalizes crop size and suppresses high-frequency sampling noise.
              const difference = option.frames[index] ? signatureDistance(analyzeRGBA(local).signature, analyzeRGBA(face).signature) : null;
              const referenceFacePath=path.join(path.dirname(contactSheet),`${safe(option.animationKey)}-${index}-reference-face.png`);
              await fs.writeFile(referenceFacePath,PNG.sync.write(face));images.push(local,face);frames.push({index,time,difference,referenceFacePath});
            }
            await fs.writeFile(contactSheet,contact(images,8));
            const differences=frames.map(f=>f.difference).filter(v=>v!==null);
            await append({kind:'reference',skinId:entry.skinId,animationKey:option.animationKey,referenceUrl:page.url(),frames,difference:differences.length?differences.reduce((a,b)=>a+b,0)/differences.length:null,contactSheet,sampled:referenceSample(entry.skinId,values.seed)});
            console.log(`reference ${entry.skinId}/${option.animationKey}: ${frames.length} frames`);
          } catch(error) {await fs.writeFile(contactSheet,contact(images));await append({kind:'failure',phase:'reference',skinId:entry.skinId,animationKey:option.animationKey,error:String(error),exceptions:[...new Set(messages)],contactSheet}); console.log(`reference failure ${entry.skinId}/${option.animationKey}: ${String(error).slice(0,200)}`);}
        }
        await report();
      }
    }
    const totals = await report(); await atomic(stateFile, JSON.stringify({config,pid:process.pid,status:stopping?'interrupted':'complete',phase:values.phase,totals,updatedAt:new Date().toISOString()})); console.log(totals);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}

export const FACE_THRESHOLDS = Object.freeze({ ssim: .72, edgeIoU: .56, noiseRatio: 1.65, noiseDelta: .008, temporalFace: .24, temporalBody: .025 });
export function faceOptions(entry) {
  return Object.entries(entry.animations || {}).filter(([key, a]) => {
    if (!/^(IdleAnim|HappyAnim|HeroScreenAnim)$/.test(key) || a.exported?.kind !== 'ready') return false;
    const field = a.faceField || ({ IdleAnim: 'IdleFace', HappyAnim: 'HappyFace', HeroScreenAnim: 'HeroScreenFace' })[key];
    const f = entry.faces?.[field];
    return f?.atlas?.kind === 'ready' && f?.binary?.kind === 'ready';
  }).map(([key, a]) => ({ key, label: a.label }));
}
export function faceLuma(image) {
  const a = new Float32Array(image.width * image.height);
  for (let i = 0; i < a.length; i++) {
    const p = i * 4, alpha = image.data[p + 3] / 255;
    a[i] = ((image.data[p] * .2126 + image.data[p + 1] * .7152 + image.data[p + 2] * .0722) * alpha + 127 * (1 - alpha)) / 255;
  }
  return a;
}
function resampleLuma(a, width, height, size, transform = { dx: 0, dy: 0, scale: 1 }) {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = ((x + .5) / size - .5) * width / transform.scale + width / 2 + transform.dx - .5;
    const py = ((y + .5) / size - .5) * height / transform.scale + height / 2 + transform.dy - .5;
    const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
    const at = (xx, yy) => a[Math.max(0, Math.min(height - 1, yy)) * width + Math.max(0, Math.min(width - 1, xx))];
    out[y * size + x] = at(ix, iy) * (1-fx)*(1-fy) + at(ix+1, iy)*fx*(1-fy) + at(ix,iy+1)*(1-fx)*fy + at(ix+1,iy+1)*fx*fy;
  }
  return out;
}
/** Mean local-window SSIM, C1=(.01)^2 and C2=(.03)^2 on normalized luma. */
export function lumaSSIM(a, b, width, tile = 8) {
  if (a.length !== b.length || a.length % width) throw new Error('invalid SSIM dimensions');
  let sum = 0, tiles = 0;
  for (let y = 0; y < a.length/width; y += tile) for (let x = 0; x < width; x += tile) {
    let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0;
    for (let yy=y; yy<Math.min(y+tile,a.length/width); yy++) for(let xx=x;xx<Math.min(x+tile,width);xx++) {
      const p=yy*width+xx, av=a[p],bv=b[p];sa+=av;sb+=bv;saa+=av*av;sbb+=bv*bv;sab+=av*bv;n++;
    }
    const ma=sa/n,mb=sb/n,va=Math.max(0,saa/n-ma*ma),vb=Math.max(0,sbb/n-mb*mb),cov=sab/n-ma*mb;
    sum+=((2*ma*mb+.0001)*(2*cov+.0009))/((ma*ma+mb*mb+.0001)*(va+vb+.0009));tiles++;
  }
  return sum/tiles;
}
export function sobelEdges(a, w) {
  const out=new Uint8Array(a.length);
  for(let y=1;y<a.length/w-1;y++)for(let x=1;x<w-1;x++) {
    const p=y*w+x, gx=-a[p-w-1]+a[p-w+1]-2*a[p-1]+2*a[p+1]-a[p+w-1]+a[p+w+1];
    const gy=-a[p-w-1]-2*a[p-w]-a[p-w+1]+a[p+w-1]+2*a[p+w]+a[p+w+1];
    out[p]=Math.hypot(gx,gy)>.28?1:0;
  }
  return out;
}
export function edgeIoU(a,b) {let intersection=0,union=0;for(let i=0;i<a.length;i++){intersection+=a[i]&&b[i]?1:0;union+=a[i]||b[i]?1:0;}return union?intersection/union:1;}
/** Dark Laplacian energy inside the central eye band, independent of exposure. */
export function strokeNoise(a,w) {
  let sum=0,n=0;
  for(let y=Math.floor(w*.2);y<Math.floor(w*.65);y++)for(let x=Math.floor(w*.15);x<Math.floor(w*.85);x++){
    const p=y*w+x, mean=(a[p-1]+a[p+1]+a[p-w]+a[p+w])/4;
    sum+=Math.max(0,mean-a[p])*(1-a[p]);n++;
  }
  return sum/Math.max(1,n);
}
function eyeLuma(a, width, transform = {dx:0,dy:0,scale:1}) {
  const out=new Float32Array(128*128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const px=Math.round((x/128*.65+.175-.5)*width/transform.scale+width/2+transform.dx);
    const py=Math.round((y/128*.35+.4-.5)*width/transform.scale+width/2+transform.dy);
    out[y*128+x]=a[Math.min(width-1,Math.max(0,py))*width+Math.min(width-1,Math.max(0,px))];
  }
  return out;
}
export function compareFaces(local, reference) {
  if(local.width!==local.height||reference.width!==reference.height)throw new Error('face crops must be square');
  const l=faceLuma(local),r=faceLuma(reference),le=eyeLuma(l,local.width);
  let best=-Infinity,alignment,re;
  for(const scale of [1,.94,1.06])for(const dx of [0,-4,4,-8,8])for(const dy of [0,-4,4,-8,8]){
    const t={dx,dy,scale},candidate=eyeLuma(r,reference.width,t),score=lumaSSIM(le,candidate,128,16);
    if(score>best){best=score;alignment=t;re=candidate;}
  }
  const ll=resampleLuma(l,local.width,local.height,256),rr=resampleLuma(r,reference.width,reference.height,256,alignment);
  const localNoise=strokeNoise(le,128),referenceNoise=strokeNoise(re,128);
  const ssim=lumaSSIM(ll,rr,256),iou=edgeIoU(sobelEdges(ll,256),sobelEdges(rr,256));
  const eyeEdgeIoU=edgeIoU(sobelEdges(le,128),sobelEdges(re,128)),noiseRatio=(localNoise+.001)/(referenceNoise+.001),noiseDelta=localNoise-referenceNoise;
  return {ssim,edgeIoU:iou,eyeSSIM:best,eyeEdgeIoU,localNoise,referenceNoise,noiseRatio,noiseDelta,alignment,
    flagged:(best<FACE_THRESHOLDS.ssim&&eyeEdgeIoU<FACE_THRESHOLDS.edgeIoU)||(noiseRatio>FACE_THRESHOLDS.noiseRatio&&noiseDelta>FACE_THRESHOLDS.noiseDelta)};
}
export function bodyMotionDifference(previous, current) {
  const a=analyzeRGBA(previous),b=analyzeRGBA(current),raw=signatureDistance(a.signature,b.signature);
  const coverage=(a.silhouettePixels+b.silhouettePixels)/(2*previous.width*previous.height);
  return {raw,coverage,difference:raw/Math.max(1/(previous.width*previous.height),coverage)};
}
export function faceTemporal(previous, current, bodyDifference) {
  const difference=1-lumaSSIM(faceLuma(previous),faceLuma(current),previous.width);
  return {difference,bodyDifference,flagged:difference>FACE_THRESHOLDS.temporalFace&&bodyDifference<FACE_THRESHOLDS.temporalBody};
}
/** Project actual skinned vertices. Head weights restrict a stencil mesh that also contains the body. */
export function projectedFaceBounds(root,camera,size,indices=referenceVertexIndices) {
  root.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const pools={face:[],head:[]},names=[];
  root.traverseVisible(o=>{
    if(!o.isMesh||!o.geometry?.attributes.position)return;
    if(o.skeleton)o.skeleton.update();
    const geometry=o.geometry,materials=Array.isArray(o.material)?o.material:[o.material];
    if(materials.every(m=>m?.visible===false))return;
    const facePattern=/(^|[|_: ])(?:face(?:geo|mesh)?|eyes?(?:geo|mesh)?|stencil)([|_: ]|$)/i;
    const bones=o.skeleton?.bones||[],headBones=new Set();
    bones.forEach((b,i)=>{if(/^(head(?:_fixed|_no_turn|_joint|_special)?|upper_head|lower_head|skull|face)(?:_s|_bone|bone)?(?:_hc|_transform)?$/i.test(b.name))headBones.add(i);});
    // Meg's palette contains both rider head_s and mech head_s_hc. Her face
    // belongs to the rider; including both makes the crop cover the whole rig.
    const primary=[...headBones].filter(i=>!/_hc$/i.test(bones[i].name));
    if(primary.length){headBones.clear();for(const i of primary)headBones.add(i);}
    // A material called "face" can cover an entire body primitive. Named
    // geometry is explicit; material names are a fallback only without a head.
    const faceName=facePattern.test(o.name)||(!headBones.size&&facePattern.test(materials.map(m=>m.name).join(' ')));
    const si=geometry.attributes.skinIndex,sw=geometry.attributes.skinWeight;
    if(!faceName&&!headBones.size)return;
    const v=camera.position.clone();let used=0;
    for(const index of indices(geometry)){
      let weight=0;
      if(si&&sw)for(let j=0;j<4;j++)if(headBones.has(si.getComponent(index,j)))weight+=sw.getComponent(index,j);
      if(!faceName&&weight<.35)continue;
      try{if(o.getVertexPosition)o.getVertexPosition(index,v);else v.fromBufferAttribute(geometry.attributes.position,index);}catch{continue;}
      v.applyMatrix4(o.matrixWorld).project(camera);
      if(!Number.isFinite(v.x)||v.z < -1 || v.z > 1)continue;
      pools[faceName?'face':'head'].push([(v.x+1)*size/2,(1-v.y)*size/2]);used++;
    }
    if(used)names.push({mesh:o.name,headBones:[...headBones].map(i=>bones[i].name),vertices:used});
  });
  const points=pools.face.length?pools.face:pools.head;
  if(points.length<3)return {valid:false,source:'unlocated',meshes:names};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [x,y]of points){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  const side=Math.max(maxX-minX,maxY-minY)*1.12,cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  return {valid:side>0&&side<=size*1.5,x:cx-side/2,y:cy-side/2,width:side,height:side,source:pools.face.length?'face-mesh':'head-bone-vertices',meshes:names};
}
// Robots may have no head bone or named face mesh. Locate only triangles whose
// stencil UVs overlap the alpha footprint actually rendered by the face player.
export function referenceSkinSlug(entry) {
  const name=entry.displayName||(entry.skinId.endsWith('Default')&&entry.publicCharacter?`${entry.publicCharacter} (Default)`:entry.skinId);
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_');
}
export function projectedStencilBounds(root,camera,size,renderer,target) {
  if(!target?.width||!target?.height)return {valid:false,source:'unlocated'};
  const pixels=new Uint8Array(target.width*target.height*4);
  renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
  let u0=1,v0=1,u1=0,v1=0;
  for(let y=0;y<target.height;y+=2)for(let x=0;x<target.width;x+=2)if(pixels[(y*target.width+x)*4+3]>32){
    u0=Math.min(u0,x/target.width);u1=Math.max(u1,(x+2)/target.width);
    v0=Math.min(v0,y/target.height);v1=Math.max(v1,(y+2)/target.height);
  }
  if(u1<=u0||v1<=v0)return {valid:false,source:'empty-stencil'};
  const points=[],names=[];root.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  root.traverseVisible(o=>{
    const g=o.geometry,uv=g?.attributes.uv;if(!o.isMesh||!uv)return;
    if(o.skeleton)o.skeleton.update();
    const materials=Array.isArray(o.material)?o.material:[o.material];
    const count=g.index?.count??g.attributes.position.count,start=g.drawRange?.start??0,end=Math.min(count,start+(g.drawRange?.count??Infinity));
    const vertex=camera.position.clone();let used=0;
    for(let offset=start;offset+2<end;offset+=3){
      const group=g.groups.find(p=>offset>=p.start&&offset<p.start+p.count),m=materials[group?.materialIndex??0];
      if(m?.visible===false||!(m?.defines?.USE_STENCIL||m?.defines?.sc3d_material_stencil))continue;
      let t=m.uniforms?.stencilUvTransform?.value;
      if(!t){const d=m.uniforms?.u_diffuseUVTransform?.value,s=m.uniforms?.u_stencilScaleOffset?.value;if(!d||!s)continue;t={x:d.x*s.x,y:d.y*s.y,z:d.z*s.x+s.z,w:d.w*s.y+s.w};}
      const ids=[0,1,2].map(j=>g.index?g.index.getX(offset+j):offset+j);
      const coords=ids.map(i=>[uv.getX(i)*t.x+t.z,uv.getY(i)*t.y+t.w]);
      if(Math.max(...coords.map(p=>p[0]))<u0||Math.min(...coords.map(p=>p[0]))>u1||Math.max(...coords.map(p=>p[1]))<v0||Math.min(...coords.map(p=>p[1]))>v1)continue;
      for(const i of ids){if(o.getVertexPosition)o.getVertexPosition(i,vertex);else vertex.fromBufferAttribute(g.attributes.position,i);vertex.applyMatrix4(o.matrixWorld).project(camera);if(Number.isFinite(vertex.x)&&vertex.z>=-1&&vertex.z<=1){points.push([(vertex.x+1)*size/2,(1-vertex.y)*size/2]);used++;}}
    }
    if(used)names.push({mesh:o.name,vertices:used});
  });
  if(points.length<3)return {valid:false,source:'unlocated-stencil',stencilUV:[u0,v0,u1,v1]};
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y]of points){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  const side=Math.max(x1-x0,y1-y0)*1.3;
  return {valid:side>0&&side<=size*1.5,x:(x0+x1-side)/2,y:(y0+y1-side)/2,width:side,height:side,source:'stencil-uv-triangles',meshes:names,stencilUV:[u0,v0,u1,v1]};
}
function faceHarnessSource() {
  let source=harnessSource().replaceAll('512','1024');
  const extra=`
const referenceVertexIndices=${referenceVertexIndices.toString()};
const projectedFaceBounds=${projectedFaceBounds.toString()};
const projectedStencilBounds=${projectedStencilBounds.toString()};
const locateFace=()=>{const b=projectedFaceBounds(runtime.root,camera,1024);return b.valid?b:projectedStencilBounds(runtime.root,camera,1024,renderer,runtime.faceTarget);};
window.audit.faceFrame=async function(args){
 const {skinId,animationKey,time}=args;
 if(skinId!==entry?.skinId)throw Error('loadSkin before faceFrame');
 if(key!==animationKey||time<elapsed-1e-9)await this.selectAnimation(animationKey);
 const delta=1/60;while(elapsed+delta<time-1e-9){runtime.update(delta);elapsed+=delta;}runtime.update(Math.max(0,time-elapsed));elapsed=time;
 draw();
 let bounds=locateFace();
 // Use the reference adapter's head anchor when animation framing parks the
 // rider/head outside the body fit. A view offset alone changes viewing angle.
 if(bounds.valid&&!(bounds.x+bounds.width>0&&bounds.x<1024&&bounds.y+bounds.height>0&&bounds.y<1024)){
  let head;runtime.root.traverse(o=>{if(!head&&/^(head|head_s|skull|skull_s)$/i.test(o.name))head=o;});
  if(head){const center=head.getWorldPosition(camera.position.clone());camera.position.set(.18,.05,1.18).normalize().multiplyScalar(window.audit.framing.distance).add(center);camera.lookAt(center);camera.updateMatrixWorld(true);draw();bounds=locateFace();}
 }
 const faceCanvas=document.createElement('canvas');faceCanvas.width=faceCanvas.height=256;const fc=faceCanvas.getContext('2d');

 const bodyCanvas=document.createElement('canvas');bodyCanvas.width=bodyCanvas.height=64;const bc=bodyCanvas.getContext('2d');
 bc.drawImage(canvas,0,0,64,64);if(bounds.valid)bc.clearRect(bounds.x/16,bounds.y/16,bounds.width/16,bounds.height/16);
 let captureBounds=bounds;
 if(bounds.valid){const zoom=Math.min(12,320/bounds.width);camera.zoom=zoom;camera.setViewOffset(1024,1024,(bounds.x+bounds.width/2-512)*zoom,(bounds.y+bounds.height/2-512)*zoom,1024,1024);camera.updateProjectionMatrix();draw();
 captureBounds=locateFace();fc.drawImage(canvas,captureBounds.x,captureBounds.y,captureBounds.width,captureBounds.height,0,0,256,256);
 camera.zoom=1;camera.clearViewOffset();camera.updateProjectionMatrix();}
 return {face:faceCanvas.toDataURL(),body:bodyCanvas.toDataURL(),bounds,captureBounds,state:runtime.getState(),full:bounds.valid?undefined:canvas.toDataURL()};
};`;
  return source+extra;
}
/** Binary frame drawn by the reference's first live body cycle, not its seek clamp. */
export function referenceLiveFaceFrame(time, count) {
  if (!Number.isFinite(time) || time < 0 || !Number.isInteger(count) || count < 1) throw Error('invalid reference face clock');
  const ticks = Math.floor(time * 30 + 1e-9);
  return ticks < count ? Math.max(0, ticks - 1) : ticks % count;
}
function faceReferenceSource(source) {
  return instrumentReference(source).replace('await a_(pair[1]);',"const previousClip=Yg;await a_(pair[1]);if(Yg===previousClip||Qg!==label)throw Error('reference has no clip: '+label);").replace('if(Rg)Rg.goToFrame(Math.round(30*g_));', `if(Rg){const frame=referenceLiveFaceFrame(g_,Rg.frameCount);if(frame===Rg.frameCount-1&&Rg.frameCount>1){Rg.setBuffer(Rg.arrayBuffer);for(let i=0;i<2*Rg.frameCount-1;i++)Rg.newFrame(1/30);}else Rg.goToFrame(frame+1);}`).replace('Xg.scene.scale.setScalar(1);Xg.scene.updateMatrixWorld(true);', 'Xg.scene.scale.setScalar(1);t_();Xg.scene.updateMatrixWorld(true);Xg.scene.traverse(o=>{if(o.skeleton)o.skeleton.update();});')+`\nconst referenceLiveFaceFrame=${referenceLiveFaceFrame.toString()};\nconst projectedFaceBounds=${projectedFaceBounds.toString()};
const projectedStencilBounds=${projectedStencilBounds.toString()};
const locateFace=()=>{const b=projectedFaceBounds(Xg.scene,dg,1024);return b.valid?b:projectedStencilBounds(Xg.scene,dg,1024,ug,Rg?.renderTarget);};
window.referenceAudit.faceFrame=function(time){
 const png=this.render(time),bounds=locateFace();
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
 let captureBounds=bounds;
 if(bounds.valid){const zoom=Math.min(12,320/bounds.width);dg.zoom=zoom;dg.setViewOffset(1024,1024,(bounds.x+bounds.width/2-512)*zoom,(bounds.y+bounds.height/2-512)*zoom,1024,1024);dg.updateProjectionMatrix();mg.render();
 captureBounds=locateFace();ctx.drawImage(Yf,captureBounds.x,captureBounds.y,captureBounds.width,captureBounds.height,0,0,256,256);
 dg.zoom=1;dg.clearViewOffset();dg.updateProjectionMatrix();}
 return {face:c.toDataURL(),bounds,captureBounds,faceState:Rg?{counter:Rg.frameIndex,count:Rg.frameCount,positions:Array.from(Rg.geometry.attributes.a_pos.array.slice(0,8)),uvs:Array.from(Rg.geometry.attributes.a_uv.array.slice(0,8))}:null,full:bounds.valid?undefined:png};};
const originalFrame=window.referenceAudit.frame;
window.referenceAudit.frame=function(f){
 const r=originalFrame(f);ug.setSize(1024,1024,false);mg.setSize(1024,1024);
 // Center on the actual head bone, avoiding shared-buffer/accessory framing extremes.
 const bounds=projectedFaceBounds(Xg.scene,dg,1024);
 if(bounds.valid&&bounds.x+bounds.width>0&&bounds.x<1024&&bounds.y+bounds.height>0&&bounds.y<1024)return r;
 let head;Xg.scene.traverse(o=>{if(!head&&/^(head|head_s|skull|skull_s)$/i.test(o.name))head=o;});
 if(head){const center=head.getWorldPosition(dg.position.clone());dg.position.set(.18,.05,1.18).normalize().multiplyScalar(f.distance).add(center);dg.lookAt(center);dg.updateMatrixWorld(true);return {...r,source:'head-bone-anchor',center:center.toArray()};}
 return r;
};`;
}
async function facesMain(values) {
  const out=path.resolve(values.out===DEFAULT_OUT?'/tmp/brawl-audit/faces':values.out),stage=values['faces-stage'];
  if(!['all','local','reference','report'].includes(stage))throw Error('--faces-stage must be all, local, reference, or report');
  shardIncludes(0,values.shard);await fs.mkdir(out,{recursive:true});
  const toolImport=name=>import(pathToFileURL(path.join(path.resolve(values.toolchain),'node_modules',name,name==='playwright'?'index.mjs':name==='pngjs'?'lib/png.js':'lib/main.js')).href);
  const [{chromium},{default:{PNG}},esbuild]=await Promise.all([toolImport('playwright'),toolImport('pngjs'),toolImport('esbuild')]);
  const png=data=>Buffer.from(data.split(',')[1],'base64'),decode=data=>PNG.sync.read(png(data));
  const get=networkCache(out,(values['cache-roots']||'').split(',').filter(Boolean));
  const pairs=values['face-pairs'] ? new Set(JSON.parse(await fs.readFile(values['face-pairs'],'utf8')).map(p=>p.skinId+'/'+p.animationKey)) : undefined;
  const optionsFor=entry=>faceOptions(entry).filter(o=>!pairs||pairs.has(entry.skinId+'/'+o.key));
  const snapshot=await catalogSnapshot(out,get),all=snapshot.entries.filter(e=>optionsFor(e).length);
  if(pairs){const available=new Set(all.flatMap(e=>optionsFor(e).map(o=>e.skinId+'/'+o.key)));for(const pair of pairs)if(!available.has(pair))throw Error('requested face option unavailable: '+pair);}
  const selected=all.filter((e,i)=>shardIncludes(i,values.shard)&&(!values.skins||values.skins.split(',').includes(e.skinId))).slice(0,values.limit?+values.limit:Infinity);
  const tag=values.shard.replace('/','-'),resultFile=path.join(out,`faces-${tag}.jsonl`),adapterHash=digest(faceReferenceSource.toString());
  const rowCache=new Map();
  const readAll=async()=>{
    for(const file of(await fs.readdir(out)).filter(f=>/^faces-.*\.jsonl$/.test(f))){
      const full=path.join(out,file),stat=await fs.stat(full);let cached=rowCache.get(file);
      if(!cached||stat.size<cached.offset){cached={offset:0,rows:[]};rowCache.set(file,cached);}
      if(stat.size===cached.offset)continue;
      const handle=await fs.open(full,'r'),bytes=Buffer.alloc(stat.size-cached.offset);
      try{const {bytesRead}=await handle.read(bytes,0,bytes.length,cached.offset),complete=bytes.subarray(0,bytesRead).lastIndexOf(10)+1;
        if(!complete)continue;
        for(const line of bytes.subarray(0,complete).toString().split('\n').filter(Boolean)){
          try{cached.rows.push(JSON.parse(line));}catch{console.warn('Ignoring interrupted face JSONL record',file);}
        }
        cached.offset+=complete;
      }finally{await handle.close();}
    }
    return [...rowCache.values()].flatMap(c=>c.rows);
  };
  let appendPrepared=false;
  const append=async row=>{
    if(!appendPrepared){const stat=await fs.stat(resultFile).catch(()=>null);if(stat?.size){const handle=await fs.open(resultFile,'r');try{const byte=Buffer.alloc(1);await handle.read(byte,0,1,stat.size-1);if(byte[0]!==10)await fs.appendFile(resultFile,'\n');}finally{await handle.close();}}appendPrepared=true;}
    await fs.appendFile(resultFile,JSON.stringify({recordedAt:new Date().toISOString(),...row})+'\n');
  };
  const sheet=async(images,file)=>{const s=new PNG({width:256*8,height:Math.max(1,Math.ceil(images.length/8))*256});images.forEach((im,i)=>PNG.bitblt(im,s,0,0,256,256,i%8*256,Math.floor(i/8)*256));await fs.writeFile(file,PNG.sync.write(s));};
  const report=async()=>{
    const rows=await readAll(),local=[...new Map(rows.filter(r=>r.kind==='face-local').map(r=>[r.skinId+'/'+r.animationKey,r])).values()],refs=[...new Map(rows.filter(r=>r.kind==='face-reference').map(r=>[r.skinId+'/'+r.animationKey,r])).values()];
    const refKeys=new Set(refs.map(r=>r.skinId+'/'+r.animationKey)),localKeys=new Set(local.map(r=>r.skinId+'/'+r.animationKey));
    const failureAttempts=rows.filter(r=>r.kind==='face-failure');
    const failures=[...new Map(failureAttempts.map(r=>[r.stage+'/'+r.skinId+'/'+r.animationKey,r])).values()].filter(r=>r.stage==='reference'?!refKeys.has(r.skinId+'/'+r.animationKey):r.stage==='local'?!localKeys.has(r.skinId+'/'+r.animationKey):!local.some(l=>l.skinId===r.skinId));
    const attemptedReference=new Set([...refKeys,...failures.filter(r=>r.stage==='reference').map(r=>r.skinId+'/'+r.animationKey)]);
    const attemptedSkins=all.filter(e=>optionsFor(e).every(o=>attemptedReference.has(e.skinId+'/'+o.key))).length;
    const totals={eligibleSkins:all.length,eligibleOptions:all.reduce((n,e)=>n+optionsFor(e).length,0),localSkins:new Set(local.map(r=>r.skinId)).size,localOptions:local.length,localFrames:local.reduce((n,r)=>n+r.frames.length,0),referenceSkins:new Set(refs.map(r=>r.skinId)).size,referenceOptions:refs.length,referenceFrames:refs.reduce((n,r)=>n+r.frames.length,0),flaggedSkins:new Set(refs.filter(r=>r.flagged).map(r=>r.skinId)).size,flaggedOptions:refs.filter(r=>r.flagged).length,temporalOptions:local.filter(r=>r.temporal.some(t=>t.flagged)).length,pendingReference:local.filter(r=>!refKeys.has(r.skinId+'/'+r.animationKey)).length,failures:failures.length,failureAttempts:failureAttempts.length,attemptedReferenceOptions:attemptedReference.size,attemptedReferenceSkins:attemptedSkins,unlocatedLocalFrames:local.reduce((n,r)=>n+r.frames.filter(f=>!f.bounds.valid).length,0),unlocatedReferenceFrames:refs.reduce((n,r)=>n+r.frames.filter(f=>f.unlocated).length,0)};
    await atomic(path.join(out,'face-totals.json'),JSON.stringify(totals,null,2));
    await atomic(path.join(out,'flagged.json'),JSON.stringify(refs.filter(r=>r.flagged),null,2));
    return totals;
  };
  if(stage==='report'||values['report-only']){console.log(await report());return;}
  if(!values.resume&&!values.skins&&await exists(resultFile))throw Error('face results exist; use --resume, or --skins for a selected recapture');
  const bundleFile=values['harness-cache']||path.join(out,'face-harness.js');
  if(!await exists(bundleFile)){
    const build=await esbuild.build({stdin:{contents:faceHarnessSource(),resolveDir:path.join(repo,'apps/brawlstats'),sourcefile:'face-audit.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'warning'});
    await atomic(bundleFile,build.outputFiles[0].contents);
    const files=['brawler-viewer-runtime.ts','brawler-viewer-contract.ts','sc-material.ts','brawler-asset-catalog.ts'];
    await atomic(bundleFile+'.json',JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),createdAt:new Date().toISOString(),bundleSha256:digest(build.outputFiles[0].contents),sources:Object.fromEntries(await Promise.all(files.map(async f=>[f,digest(await fs.readFile(path.join(repo,'apps/brawlstats/src/lib',f)))])))},null,2));
  }
  const bundle=await fs.readFile(bundleFile);
  const server=http.createServer(async(req,res)=>{try{
    if(req.url==='/harness.js'){res.setHeader('content-type','text/javascript');res.end(bundle);return;}
    if(req.url.startsWith('/assets/')){const r=await get(new URL(req.url,CATALOG).href);res.writeHead(r.status,r.headers);res.end(r.body);return;}
    res.setHeader('content-type','text/html');res.end('<canvas id="canvas" width="1024" height="1024"></canvas><script type="module" src="/harness.js"></script>');
  }catch(e){res.writeHead(502);res.end(String(e));}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`,angle=process.env.AUDIT_ANGLE||'swiftshader';
  let browser,lock,stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
  try{
    browser=await chromium.launch({headless:true,handleSIGTERM:false,handleSIGINT:false,args:['--use-gl=angle',`--use-angle=${angle}`,...(angle==='swiftshader'?['--enable-unsafe-swiftshader']:[])]});
    const context=await browser.newContext({viewport:{width:1024,height:1024},deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(90000);
    await page.goto(url);await page.waitForFunction(()=>Boolean(window.audit?.faceFrame));
    const smoke=await page.evaluate(()=>window.audit.smoke());await atomic(path.join(out,`face-gpu-${tag}.json`),JSON.stringify({renderer:smoke.renderer,bundleSha256:digest(bundle)}));
    console.log('face GPU',smoke.renderer);
    let rows=await readAll(),localDone=new Set(rows.filter(r=>r.kind==='face-local').map(r=>r.skinId+'/'+r.animationKey));
    if(stage==='all'||stage==='local')for(const entry of selected){
      if(stopping)break;const options=optionsFor(entry).filter(o=>values['retry-local']||!localDone.has(entry.skinId+'/'+o.key));if(!options.length)continue;
      const folder=path.join(out,'skins',safe(entry.skinId));await fs.mkdir(folder,{recursive:true});
      try{
        await page.evaluate(e=>window.audit.loadSkin(e),entry);
        for(const option of options){
          if(stopping)break;
          try{
            const meta=await page.evaluate(key=>window.audit.selectAnimation(key),option.key),times=sampleTimes(meta.duration),frames=[],images=[],temporal=[];let prev;
            for(const [index,time]of times.entries()){
              const f=await page.evaluate(args=>window.audit.faceFrame(args),{skinId:entry.skinId,animationKey:option.key,time});
              const face=decode(f.face),body=decode(f.body),facePath=path.join(folder,`${option.key}-${index}-local.png`);
              await fs.writeFile(facePath,png(f.face));
              if(!f.bounds.valid)await fs.writeFile(path.join(folder,`${option.key}-${index}-unlocated.png`),png(f.full));
              if(prev){const motion=bodyMotionDifference(prev.body,body);temporal.push({index,...faceTemporal(prev.face,face,motion.difference),bodyDifferenceRaw:motion.raw,bodyCoverage:motion.coverage});}
              frames.push({index,time,facePath,bounds:f.bounds,captureBounds:f.captureBounds,state:f.state,noise:strokeNoise(faceLuma(face),256)});images.push(face);prev={face,body};
            }
            const contactSheet=path.join(folder,`${option.key}-local-contact.png`);await sheet(images,contactSheet);
            await append({kind:'face-local',skinId:entry.skinId,animationKey:option.key,label:option.label,...meta,times,frames,temporal,contactSheet,bundleSha256:digest(bundle)});
            console.log(`face local ${entry.skinId}/${option.key}`);
          }catch(e){await append({kind:'face-failure',stage:'local',skinId:entry.skinId,animationKey:option.key,error:String(e)});console.log('face failure',entry.skinId,option.key,String(e));}
        }
      }catch(e){await append({kind:'face-failure',stage:'load',skinId:entry.skinId,error:String(e)});}
      finally{await page.evaluate(()=>window.audit.dispose()).catch(()=>{});}
    }
    if((stage==='all'||stage==='reference')&&!stopping){
      // A machine-wide lock rejects a second reference worker, including shards using another --out.
      const lockPath='/tmp/brawl-audit/faces-reference.lock';
      try{lock=await fs.open(lockPath,'wx');await lock.writeFile(String(process.pid));}catch{throw Error(`another reference worker owns ${lockPath}`);}
      await context.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.__faceReferenceError=null;window.addEventListener('error',e=>{if(e.message)window.__faceReferenceError=e.message;});window.addEventListener('unhandledrejection',e=>{window.__faceReferenceError=String(e.reason);});});
      await context.route('**/*',async route=>{
        const requested=route.request().url();if(requested.startsWith(url))return route.continue();
        if(!/^(mv\.brawlstars\.top|cdn\.brawlbox\.com\.cn)$/.test(new URL(requested).hostname)||/cdn-cgi|beacon/.test(requested))return route.abort();
        try{const cached=await get(requested.split('#')[0]);let body=cached.body;
          if(cached.headers['content-type'].includes('text/html'))body=Buffer.from(body.toString().replace(/type="[^"]*-module"/g,'type="module"').replace(/<script\b[^>]*src="[^\"]*(?:rocket-loader|beacon)[^\"]*"[^>]*>[^<]*<\/script>/g,'')+'<style>#glCanvas,#canvas-container{width:1024px!important;height:1024px!important}</style>');
          else if(new URL(requested).pathname.includes('sc3dWebGLContext'))body=Buffer.from(faceReferenceSource(body.toString()));
          await route.fulfill({status:cached.status,headers:{...cached.headers,'access-control-allow-origin':'*'},body});
        }catch(e){console.error('reference route',requested,String(e));await route.abort();}
      });
      rows=await readAll();let locals=new Map(rows.filter(r=>r.kind==='face-local').map(r=>[r.skinId+'/'+r.animationKey,r]));
      // The stencil fallback changes only unlocated captures; valid captures
      // from the previous adapter retain identical framing, times and metrics.
      const compatible=new Set([adapterHash,'0803735c7781789085263dc3661382b3fd6982e9207e06cf05e7a21d1cad32ec']);
      const done=new Set((values.resume?rows:[]).filter(r=>(r.kind==='face-reference'&&compatible.has(r.adapterHash)&&!r.frames.some(f=>f.unlocated))||(!values['retry-reference-failures']&&r.kind==='face-failure'&&r.stage==='reference')).map(r=>r.skinId+'/'+r.animationKey));
      let referenceSkinCount=0;
      for(const entry of selected){
        if(stopping)break;rows=await readAll();locals=new Map(rows.filter(r=>r.kind==='face-local').map(r=>[r.skinId+'/'+r.animationKey,r]));
        const pending=optionsFor(entry).map(o=>locals.get(entry.skinId+'/'+o.key)).filter(o=>o&&!done.has(o.skinId+'/'+o.animationKey));if(!pending.length)continue;
        let loadError;const slug=referenceSkinSlug(entry);
        try{const response=await page.goto(`https://mv.brawlstars.top/skins/${encodeURIComponent(slug)}#${encodeURIComponent(pending[0].label.replaceAll(' ',''))}`,{waitUntil:'domcontentloaded',timeout:90000});if(response?.status()>=400)throw Error('reference page HTTP '+response.status());await page.waitForFunction(()=>Boolean(window.referenceAudit?.faceFrame||window.__faceReferenceError),null,{timeout:90000,polling:100});const startupError=await page.evaluate(()=>window.__faceReferenceError);if(startupError)throw Error('reference startup: '+startupError);}catch(e){loadError=e;await page.goto('about:blank',{timeout:10000}).catch(()=>{});}
        for(const option of pending){
          if(stopping)break;
          try{
            if(loadError)throw loadError;
            const referenceLabel=option.animationKey==='HeroScreenAnim'?'Win Anim':option.label;
            await page.evaluate(label=>window.referenceAudit.select(label),referenceLabel);const referenceFraming=await page.evaluate(f=>window.referenceAudit.frame(f),option.framing);
            const frames=[],images=[],folder=path.join(out,'skins',safe(entry.skinId));
            for(const [index,time]of option.times.entries()){
              const f=await page.evaluate(t=>window.referenceAudit.faceFrame(t),time),ref=decode(f.face),local=PNG.sync.read(await fs.readFile(option.frames[index].facePath));
              const referenceFacePath=path.join(folder,`${option.animationKey}-${index}-reference.png`);await fs.writeFile(referenceFacePath,png(f.face));if(f.full)await fs.writeFile(path.join(folder,`${option.animationKey}-${index}-reference-full.png`),png(f.full));
              const valid=f.bounds.valid&&option.frames[index].bounds.valid,metrics=valid?compareFaces(local,ref):{flagged:false,unlocated:true};
              frames.push({index,time,...metrics,localFacePath:option.frames[index].facePath,referenceFacePath,bounds:f.bounds,captureBounds:f.captureBounds,faceState:f.faceState});images.push(local,ref);
            }
            const contactSheet=path.join(folder,`${option.animationKey}-comparison.png`);await sheet(images,contactSheet);
            await append({kind:'face-reference',skinId:entry.skinId,animationKey:option.animationKey,referenceUrl:page.url(),referenceLabel,referenceFraming,adapterHash,thresholds:FACE_THRESHOLDS,frames,flagged:frames.some(f=>f.flagged),contactSheet});
            console.log(`face reference ${entry.skinId}/${option.animationKey}: ${frames.filter(f=>f.flagged).length}/8 flagged`);
          }catch(e){await append({kind:'face-failure',stage:'reference',skinId:entry.skinId,animationKey:option.animationKey,error:String(e)});console.log('reference failure',entry.skinId,option.animationKey,String(e));}
        }
        if(++referenceSkinCount%10===0)await report();
      }
    }
    console.log(await report());
  }finally{if(lock){await lock.close();await fs.unlink('/tmp/brawl-audit/faces-reference.lock');}await browser?.close();await new Promise(r=>server.close(r));}
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) main().catch(error => { console.error(error); process.exitCode = 1; });
