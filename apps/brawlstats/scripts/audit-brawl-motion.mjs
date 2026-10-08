#!/usr/bin/env node
/** Reference motion audit; generated adapters, downloads, frames and reports stay in /tmp. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { analyzeRGBA, sampleTimes, signatureDistance, referenceVertexIndices } from './audit-brawl-render.mjs';

export const FRAME_COUNT = 16;
export const THRESHOLDS = Object.freeze({ mean: .04, max: .12, durationRatio: .05, durationSeconds: .1, static: .0005, moving: .003 });
const hash = value => createHash('sha256').update(value).digest('hex');
export function latestTerminalResults(records) {
  return [...new Map(records.filter(r => ['option', 'unavailable'].includes(r.kind)).map(r => [`${r.skinId}/${r.key}`, r])).values()];
}
/** Detached staged pixels must not make a tiny body appear well framed. */
export function largestSilhouetteComponent({width, height, data}) {
  const seen=new Uint8Array(width*height);let best=null;
  for(let seed=0;seed<seen.length;seed++){
    if(seen[seed]||data[seed*4+3]<=127)continue;
    seen[seed]=1;const stack=[seed];let pixels=0,x0=width,y0=height,x1=-1,y1=-1;
    while(stack.length){const p=stack.pop(),x=p%width,y=Math.floor(p/width);pixels++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const q=ny*width+nx;
        if(!seen[q]&&data[q*4+3]>127){seen[q]=1;stack.push(q);}
      }
    }
    if(!best||pixels>best.pixels)best={x:x0,y:y0,width:x1-x0+1,height:y1-y0+1,pixels};
  }
  return best;
}
export function selectionReasons(entry, seed = 'brawl-motion-2026-10-08') {
  const reasons = [];
  const animations = Object.entries(entry.animations ?? {});
  if (animations.some(([, a]) => (a.fps ?? 30) !== 30)) reasons.push('fps');
  if (animations.some(([, a]) => a.endFrame - a.startFrame + 1 > 300)) reasons.push('long-window');
  if (animations.some(([key]) => /HeroScreen/.test(key))) reasons.push('hero-screen');
  if (parseInt(hash(`${seed}:${entry.skinId}`).slice(0, 8), 16) / 2 ** 32 < .15) reasons.push('sample');
  return reasons;
}
export function interpolatedDistance(signature, frames, normalizedTime) {
  const index = ((normalizedTime % 1 + 1) % 1) * frames.length;
  const low = Math.floor(index) % frames.length, high = (low + 1) % frames.length, fraction = index - Math.floor(index);
  let sum = 0;
  for (let i = 0; i < signature.length; i++) sum += Math.abs(signature[i] - (frames[low][i] * (1 - fraction) + frames[high][i] * fraction));
  return sum / (signature.length * 255);
}
export function compareMotion(local, reference, localDuration, referenceDuration) {
  const length=reference[0]?.length;
  if (local.length !== FRAME_COUNT || reference.length !== FRAME_COUNT || !length || [...local,...reference].some(s => s?.length !== length || !Array.from(s).every(Number.isFinite))) throw Error('expected sixteen finite matching descriptors');
  if(![localDuration,referenceDuration].every(d=>Number.isFinite(d)&&d>=0))throw Error('invalid loop duration');
  const differences = local.map((frame, i) => signatureDistance(frame, reference[i]));
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  // Mapping: reference seconds = local seconds * speed + phase * referenceDuration.
  const durationScale=localDuration>0&&referenceDuration>0?localDuration/referenceDuration:1;
  const initial=local.map((frame,i)=>interpolatedDistance(frame,reference,i/FRAME_COUNT*durationScale));
  let best = { scale: 1, phase: 0, mean: mean(initial), max: Math.max(...initial) };
  const scales = [...new Set([.25, .5, 1, 2, 4, ...Array.from({ length: 31 }, (_, i) => .25 + i / 8)])];
  for (const scale of scales) for (let p = 0; p < 64; p++) {
    const distances = local.map((frame, i) => interpolatedDistance(frame, reference, i / FRAME_COUNT * scale * durationScale + p / 64));
    const score = mean(distances);
    if (score < best.mean - 1e-10) best = { scale, phase: p / 64, mean: score, max: Math.max(...distances) };
  }
  const transitions = local.map((s, i) => ({ frame: i, next: (i + 1) % FRAME_COUNT, local: signatureDistance(s, local[(i + 1) % FRAME_COUNT]), reference: signatureDistance(reference[i], reference[(i + 1) % FRAME_COUNT]) }));
  const staticLocal = transitions.filter(t => t.local < THRESHOLDS.static && t.reference > THRESHOLDS.moving).map(t => t.frame);
  const staticReference = transitions.filter(t => t.reference < THRESHOLDS.static && t.local > THRESHOLDS.moving).map(t => t.frame);
  const durationRatio = referenceDuration > 0 ? localDuration / referenceDuration : null;
  const flags = [];
  if (mean(differences) > THRESHOLDS.mean || Math.max(...differences) > THRESHOLDS.max) flags.push('pose');
  if (durationRatio !== null && Math.abs(durationRatio - 1) > THRESHOLDS.durationRatio && Math.abs(localDuration - referenceDuration) > THRESHOLDS.durationSeconds + 1e-6) flags.push('duration');
  if (staticLocal.length >= 3) flags.push('local-static');
  if (staticReference.length >= 3) flags.push('reference-static');
  return { mean: mean(differences), max: Math.max(...differences), differences, alignment: { ...best, normalizedScale:best.scale*durationScale, phaseSeconds: best.phase * referenceDuration, physicalSpeed: localDuration>0&&referenceDuration>0?best.scale:null }, localDuration, referenceDuration, durationRatio, transitions, staticLocal, staticReference, flags };
}
/** Some reference primitives have GPU-valid geometry but non-finite CPU skinning. */
export function referencePoseVertex(mesh, index, vector, onFallback) {
  const position=mesh.geometry.attributes.position;
  try { if(mesh.getVertexPosition)mesh.getVertexPosition(index,vector);else vector.fromBufferAttribute(position,index);vector.applyMatrix4(mesh.matrixWorld); }
  catch { vector.set(NaN,NaN,NaN); }
  const finite=()=>Number.isFinite(vector.x)&&Number.isFinite(vector.y)&&Number.isFinite(vector.z);
  if(!finite()){onFallback?.();vector.fromBufferAttribute(position,index).applyMatrix4(mesh.matrixWorld);}
  return finite()?vector:null;
}
/** Collapsed staged triangles do not draw and must not determine the camera fit. */
export function* nonDegeneratePoseVertices(geometry, vertex) {
  const index=geometry.index,count=index?.count??geometry.attributes.position.count;
  const start=Math.max(0,geometry.drawRange?.start??0),end=Math.min(count,start+(geometry.drawRange?.count??Infinity));
  const cache=new Map(),seen=new Set();
  const get=i=>{if(!cache.has(i))cache.set(i,vertex(i));return cache.get(i);};
  for(let offset=start;offset+2<end;offset+=3){
    const ids=[0,1,2].map(k=>index?index.getX(offset+k):offset+k),[a,b,c]=ids.map(get);
    if(!a||!b||!c)continue;
    const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
    const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,area=x*x+y*y+z*z;
    if(!Number.isFinite(area)||area<=1e-12)continue;
    for(const id of ids)if(!seen.has(id)){seen.add(id);yield get(id);}
  }
}
const script = fileURLToPath(import.meta.url), repo = path.resolve(path.dirname(script), '../../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
const atomic = async (file, value) => { await fs.writeFile(`${file}.tmp`, value); await fs.rename(`${file}.tmp`, file); };
const safe = s => s.replace(/[^\w.-]/g, '_');

/** Cache-compatible with the render audit. Cache hits never issue an HTTP request. */
function networkCache(out, shared) {
  let queue = Promise.resolve(), last = 0;
  return url => {
    const run = async () => {
      const cdn = new URL(url).hostname === 'cdn.brawlbox.com.cn';
      const key = hash(url + (cdn ? '|referer=mv.brawlstars.top' : ''));
      for (const root of [out, '/tmp/brawl-audit/motion', shared]) {
        const file = path.join(root, 'cache/http', key);
        if (await exists(`${file}.json`)) {
          if (await exists(`${file}.body`)) return { ...JSON.parse(await fs.readFile(`${file}.json`, 'utf8')), body: await fs.readFile(`${file}.body`) };
          if (await exists(`${file}.body.gz`)) return { ...JSON.parse(await fs.readFile(`${file}.json`, 'utf8')), body: gunzipSync(await fs.readFile(`${file}.body.gz`)) };
        }
      }
      let requestUrl=url, redirects=0;
      for (let attempt = 0; attempt < 5; attempt++) {
        await sleep(Math.max(0, 500 - (Date.now() - last))); last = Date.now();
        let r, body;
        try {
          r = await fetch(requestUrl, { redirect:'manual', headers: cdn ? { Referer: 'https://mv.brawlstars.top/', Origin: 'https://mv.brawlstars.top' } : {}, signal: AbortSignal.timeout(90000) });
          body = Buffer.from(await r.arrayBuffer());
        } catch (error) {
          if (attempt === 4) throw error;
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        if (r.status>=300 && r.status<400 && r.headers.get('location')) { if(++redirects>10)throw Error('too many redirects');requestUrl=new URL(r.headers.get('location'),requestUrl).href;attempt--;continue; }
        if ([429, 503].includes(r.status)) {
          const retry = r.headers.get('retry-after');
          await sleep(Math.max(500, /^\d+$/.test(retry ?? '') ? +retry * 1000 : Date.parse(retry) - Date.now() || 1000 * 2 ** attempt)); continue;
        }
        const metadata = { status: r.status, finalUrl: r.url, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream' }, sha256: hash(body) };
        const file = path.join('/tmp/brawl-audit/motion', 'cache/http', key); await fs.mkdir(path.dirname(file), { recursive: true });
        await atomic(`${file}.body.gz`, gzipSync(body)); await atomic(`${file}.json`, JSON.stringify(metadata));
        return { ...metadata, body };
      }
      throw Error(`retry budget exhausted: ${url}`);
    };
    const pending = queue.then(run); queue = pending.catch(() => {}); return pending;
  };
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: 'string', default: '/tmp/brawl-audit/motion' }, toolchain: { type: 'string', default: '/tmp/brawl-audit/render/toolchain' }, 'shared-cache': { type: 'string', default: '/tmp/brawl-audit/render' }, seed: { type: 'string', default: 'brawl-motion-2026-10-08' }, skins: { type: 'string' }, limit: { type: 'string' }, resume: { type: 'boolean' }, size: { type: 'string', default: '256' }, 'report-only': { type: 'boolean' }, 'recompute-alignment': { type:'boolean' } } });
  const out = path.resolve(values.out), size = +values.size;
  if (!Number.isInteger(size) || size < 128) throw Error('--size must be an integer >=128');
  if (out === repo || out.startsWith(repo + path.sep)) throw Error('output must be outside repository');
  await fs.mkdir(out, { recursive: true });
  const resultFile = path.join(out, 'results.jsonl'), stateFile = path.join(out, 'state.json');
  const rows = async () => (await exists(resultFile) ? await fs.readFile(resultFile, 'utf8') : '').split('\n').flatMap(line => { try { return line ? [JSON.parse(line)] : []; } catch { return []; } });
  const append = row => fs.appendFile(resultFile, JSON.stringify({ recordedAt: new Date().toISOString(), ...row }) + '\n');
  async function report() {
    const records = await rows();
    const terminal = latestTerminalResults(records);
    const options = terminal.filter(r => r.kind === 'option'), unavailable = terminal.filter(r => r.kind === 'unavailable');
    const pendingFailures = [...new Map(records.filter(r => r.kind === 'failure').map(r => [`${r.skinId}/${r.key}`, r])).values()].filter(r => !records.some(s => s.kind === 'skin' && s.skinId === r.skinId) && !terminal.some(o => o.skinId === r.skinId && o.key === r.key));
    const failures = pendingFailures.filter(r=>r.key!==undefined||!pendingFailures.some(s=>s.skinId===r.skinId&&s.key!==undefined));
    const skins = new Set(records.filter(r => r.kind === 'skin').map(r => r.skinId));
    const failedLocalFrames = failures.filter(o=>o.localFrameCount===16).length*16;
    const normalizedFrames = options.length * 32 + unavailable.filter(o=>o.localFrameCount===16).length*16 + failedLocalFrames;
    const extraReferenceFrames = options.filter(o=>o.physicalComparison).length * 16;
    const totals = { completedSkins: skins.size, options: options.length, unavailableOptions: unavailable.length, failedSkins: new Set(failures.map(r=>r.skinId)).size, failedLocalFrames, normalizedFrames, extraReferenceFrames, frames: normalizedFrames + extraReferenceFrames, flaggedOptions: options.filter(o => o.flags.length).length, failures: failures.length, flags: Object.fromEntries(['pose', 'duration', 'local-static', 'reference-static'].map(f => [f, options.filter(o => o.flags.includes(f)).length])) };
    await atomic(path.join(out, 'totals.json'), JSON.stringify(totals, null, 2));
    await atomic(path.join(out, 'FLAGS.md'), '# Motion candidates (require visual review)\n\n' + JSON.stringify(totals) + '\n\n|Skin|Option|Mean|Max|Duration local/ref|Scale/phase|Flags|Sheet|\n|---|---|---|---|---|---|---|---|\n' + options.filter(o => o.flags.length).sort((a, b) => b.mean - a.mean).map(o => `|${o.skinId}|${o.key}|${o.mean.toFixed(5)}|${o.max.toFixed(5)}|${o.localDuration.toFixed(3)}/${o.referenceDuration.toFixed(3)}|${o.alignment.scale}/${o.alignment.phase}|${o.flags.join(',')}|${o.contactSheet}|`).join('\n'));
    return totals;
  }
  if (values['report-only']) { console.log(await report()); return; }
  if(values['recompute-alignment']){
    if(await exists(stateFile)){const state=JSON.parse(await fs.readFile(stateFile,'utf8'));if(state.status==='running'){try{process.kill(state.pid,0);throw Error('capture is still running; recompute after it finishes');}catch(e){if(e.code!=='ESRCH')throw e;}}}
    const records=latestTerminalResults(await rows()).filter(r=>r.kind==='option');
    const provenance={method:'reference seconds = local seconds * scale + phaseSeconds',helperSha256:hash(compareMotion.toString()),scriptSha256:hash(await fs.readFile(script)),head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),at:new Date().toISOString()};
    for(const record of records){const file=path.join(path.dirname(record.contactSheet),`${safe(record.key)}-descriptors.json`);const descriptors=JSON.parse(await exists(file)?await fs.readFile(file,'utf8'):gunzipSync(await fs.readFile(file+'.gz')).toString());await append({...record,...compareMotion(descriptors.local,descriptors.reference,record.localDuration,record.referenceDuration),alignmentProvenance:provenance});}
    await atomic(path.join(out,'alignment-provenance.json'),JSON.stringify(provenance,null,2));console.log(await report());return;
  }
  if (!values.resume && await exists(resultFile)) throw Error('use --resume or a fresh --out');
  if (await exists(resultFile)) { const b = await fs.readFile(resultFile); if (b.length && b.at(-1) !== 10) await fs.appendFile(resultFile, '\n'); }
  // The render owner has not exported its browser factories. Re-export them from
  // an exact source copy in /tmp; never modify the owned repository file.
  const harnessFile = path.join(repo, 'apps/brawlstats/scripts/audit-brawl-render.mjs');
  const source = await fs.readFile(harnessFile, 'utf8');
  const adapterFile = path.join(out, 'render-adapter.mjs');
  await fs.writeFile(adapterFile, source.replace("const repo = path.resolve(path.dirname(scriptPath), '../../..');", `const repo = ${JSON.stringify(repo)};`) + '\nexport {harnessSource,instrumentReference,catalogSnapshot};\n');
  const { harnessSource, instrumentReference, catalogSnapshot } = await import(pathToFileURL(adapterFile));
  const toolImport = name => import(pathToFileURL(path.join(values.toolchain, 'node_modules', name, name === 'playwright' ? 'index.mjs' : name === 'pngjs' ? 'lib/png.js' : 'lib/main.js')));
  const [{ chromium }, { default: { PNG } }, esbuild] = await Promise.all([toolImport('playwright'), toolImport('pngjs'), toolImport('esbuild')]);
  const lockFile = '/tmp/brawl-audit/reference-motion.lock';
  try { await fs.writeFile(lockFile, String(process.pid), { flag: 'wx' }); }
  catch { const pid = +(await fs.readFile(lockFile, 'utf8')); try { process.kill(pid, 0); throw Error(`reference capture already running, PID ${pid}`); } catch (error) { if (error.code !== 'ESRCH') throw error; } await fs.writeFile(lockFile, String(process.pid)); }
  let browser, server, stopping = false;
  process.on('SIGTERM', () => { stopping = true; }); process.on('SIGINT', () => { stopping = true; });
  const get = networkCache(out, values['shared-cache']);
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    const catalogNonce=new Date().toISOString();
    // Shard URLs can retain their old names when additive enrichment changes.
    // Refresh our own app's catalog once per output; reference pages remain cached.
    const snapshot = await catalogSnapshot(out, url=>get(url+(url.includes('?')?'&':'?')+'motion-audit='+encodeURIComponent(catalogNonce)));
    const priority=['GeishaDefault','BanditGirlDefault','BullGuyDefault','CactusDefault'];
    const selected = snapshot.entries.filter(e => values.skins ? values.skins.split(',').includes(e.skinId) : selectionReasons(e, values.seed).length).sort((a,b)=>(priority.includes(a.skinId)?priority.indexOf(a.skinId):priority.length)-(priority.includes(b.skinId)?priority.indexOf(b.skinId):priority.length)||a.skinId.localeCompare(b.skinId)).slice(0, values.limit ? +values.limit : Infinity);
    const config = { head, scriptSha256:hash(await fs.readFile(script)), contractSha256:hash(await fs.readFile(path.join(repo,'apps/brawlstats/src/lib/brawler-viewer-contract.ts'))), catalogSourceSha256:hash(await fs.readFile(path.join(repo,'apps/brawlstats/src/lib/brawler-asset-catalog.ts'))), materialSha256:hash(await fs.readFile(path.join(repo,'apps/brawlstats/src/lib/sc-material.ts'))), snapshot: snapshot.sha256, harnessSha256: hash(source), runtimeSha256: hash(await fs.readFile(path.join(repo, 'apps/brawlstats/src/lib/brawler-viewer-runtime.ts'))), size, frames: FRAME_COUNT, seed: values.seed, skins: values.skins ?? null, limit: values.limit ?? null, thresholds: THRESHOLDS };
    if (await exists(stateFile)) { const previous = JSON.parse(await fs.readFile(stateFile, 'utf8')); const {head:oldHead,executionHead:oldExecutionHead,...oldConfig}=previous.config;const {head:currentHead,...currentConfig}=config;if(JSON.stringify(oldConfig)!==JSON.stringify(currentConfig))throw Error('resume configuration/source differs; use a fresh output directory');config.head=oldHead;config.executionHead=currentHead; }
    const state = async status => atomic(stateFile, JSON.stringify({ config, pid: process.pid, status, selectedSkins: selected.length, updatedAt: new Date().toISOString(), totals: await report() }, null, 2));
    await atomic(path.join(out, 'selection.json'), JSON.stringify(selected.map(e => ({ skinId: e.skinId, reasons: selectionReasons(e, values.seed) })), null, 2));
    // Shared initial-pose framing avoids the production envelope's offstage props
    // and expensive 180-pose bound sampling. Playback still uses public update().
    const contents = harnessSource().replaceAll('512', String(size)).replace('runtime.getFramingBounds()', 'motionPoseBounds(runtime.root)').replace('const delta=1/60;while(elapsed+delta<time-1e-9){runtime.update(delta);elapsed+=delta;}','').replace('const second=draw(jitter),metrics=', 'const second=first,metrics=') + `
const motionIndices=${referenceVertexIndices.toString()},motionPoseVertex=${referencePoseVertex.toString()},motionPoseVertices=${nonDegeneratePoseVertices.toString()},motionComponent=${largestSilhouetteComponent.toString()};
function motionPoseBounds(root){root.updateMatrixWorld(true);const bounds=new THREE.Box3();root.traverseVisible(o=>{if(!o.isMesh)return;for(const v of motionPoseVertices(o.geometry,i=>motionPoseVertex(o,i,new THREE.Vector3())))bounds.expandByPoint(v);});if(bounds.isEmpty()||bounds.getSize(new THREE.Vector3()).length()<1e-6)return new THREE.Box3(new THREE.Vector3(-10,-10,-10),new THREE.Vector3(10,10,10));return bounds;}
function motionGPUFit(result){
 const initial=motionComponent(draw());result.framing.initialComponentPixels=initial?.pixels??0;if(initial&&initial.pixels>=256)return;
 const savedPosition=wrapper.position.clone(),savedDistance=camera.position.length(),savedNear=camera.near,savedFar=camera.far;
 wrapper.position.set(0,0,0);camera.near=.01;camera.far=40000;let distance=300;
 const setCamera=()=>{camera.position.copy(direction).multiplyScalar(distance);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);};setCamera();let box=motionComponent(draw());
 if(!box){wrapper.position.copy(savedPosition);distance=savedDistance;camera.near=savedNear;camera.far=savedFar;setCamera();return;}
 const point=new THREE.Vector3((box.x+box.width/2)/${size}*2-1,1-(box.y+box.height/2)/${size}*2,.5).unproject(camera),ray=point.sub(camera.position).normalize();wrapper.position.sub(camera.position.clone().addScaledVector(ray,-distance/ray.dot(direction)));
 for(let i=0;i<4;i++){setCamera();box=motionComponent(draw());if(!box)break;const ratio=box.height/100;if(Math.abs(ratio-1)<.025)break;distance*=ratio;}
 setCamera();result.framing={...result.framing,distance,near:camera.near,far:camera.far,gpuFit:true};
}
const motionSelect=window.audit.selectAnimation;window.audit.selectAnimation=async function(key){const result=await motionSelect.call(this,key);motionGPUFit(result);const bounds=motionPoseBounds(runtime.root);result.framing.poseCenter=bounds.getCenter(new THREE.Vector3()).toArray();if(![result.framing.distance,...result.framing.poseCenter].every(Number.isFinite))throw Error('non-finite local camera');return result;};
const motionRender=window.audit.renderFrame;window.audit.renderFrame=async function(args){if(renderer.getContext().isContextLost())throw Error('local WebGL context lost');const result=await motionRender.call(this,args);if(renderer.getContext().isContextLost())throw Error('local WebGL context lost');return result;};`;
    const build = await esbuild.build({ stdin: { contents, resolveDir: path.join(repo, 'apps/brawlstats'), sourcefile: 'audit-motion-harness.ts', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env.BASE_URL': '"/"' }, logLevel: 'warning' });
    server = http.createServer(async (req, res) => { try {
      if (req.url === '/harness.js') { res.setHeader('content-type', 'text/javascript'); res.end(build.outputFiles[0].contents); }
      else if (req.url.startsWith('/assets/')) { const r = await get(new URL(req.url, snapshot.url).href); res.writeHead(r.status, r.headers); res.end(r.body); }
      else { res.setHeader('content-type', 'text/html'); res.end(`<canvas id="canvas" width="${size}" height="${size}"></canvas><script type="module" src="/harness.js"></script>`); }
    } catch (e) { res.writeHead(502); res.end(String(e)); } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const localUrl = `http://127.0.0.1:${server.address().port}`;
    let localPage, localContext, referenceContext;
    async function startBrowser() {
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--disk-cache-size=1', '--media-cache-size=1'] });
    localContext = await browser.newContext({ viewport: { width: size, height: size }, serviceWorkers: 'block' });
    referenceContext = await browser.newContext({ viewport: { width: size, height: size }, serviceWorkers: 'block' });
    await referenceContext.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await referenceContext.route('**/*', async route => {
      const url = route.request().url();
      if (!/^(mv\.brawlstars\.top|cdn\.brawlbox\.com\.cn)$/.test(new URL(url).hostname) || /cdn-cgi|beacon/.test(url)) return route.abort();
      try {
        const r = await get(url.split('#')[0]); let body = r.body;
        if (r.headers['content-type'].includes('text/html')) body = Buffer.from(body.toString().replace(/type="[^"]*-module"/g, 'type="module"').replace(/<script\b[^>]*src="[^\"]*(?:rocket-loader|beacon)[^\"]*"[^>]*>[^<]*<\/script>/g, ''));
        else if (new URL(url).pathname.includes('sc3dWebGLContext')) body = Buffer.from(body.toString() + instrumentReference(body.toString()).slice(body.toString().length).replace('__=false;window.referenceAudit={',`const motionReferencePoseVertex=${referencePoseVertex.toString()},motionReferencePoseVertices=${nonDegeneratePoseVertices.toString()};__=false;window.referenceAudit={`).replace('let lo=[Infinity,Infinity,Infinity]', 'let usedFallback=false;let lo=[Infinity,Infinity,Infinity]').replace('for(const i of referenceVertexIndices(o.geometry)){const v=new dg.position.constructor();if(o.getVertexPosition)o.getVertexPosition(i,v);else v.fromBufferAttribute(p,i);v.applyMatrix4(o.matrixWorld);for(let j=0;', 'for(const v of motionReferencePoseVertices(o.geometry,i=>motionReferencePoseVertex(o,i,new dg.position.constructor(),()=>{usedFallback=true;}))){for(let j=0;').replace('return {center,lo,hi};','return {center,lo,hi,usedFallback};').replace('await a_(pair[1]);',"const previousClip=Yg;await a_(pair[1]);if(Yg===previousClip)throw Error('reference has no clip: '+label);").replace('return {duration:Kg,label:Qg};', "if(Qg!==label)throw Error('reference has no clip: '+label);return {duration:Kg,label:Qg,fps:e_,startFrame:$g,endFrame:Zg,clipDuration:Yg.animations[0].duration,source:pair[1]};").replace('const center=lo.map((v,i)=>(v+hi[i])/2);', 'let center=lo.map((v,i)=>(v+hi[i])/2-(f.poseCenter?.[i]??0));if(!center.every(Number.isFinite)){center=[0,0,0];usedFallback=true;}').replaceAll('512', String(size)) + `\nconst motionReferenceRender=window.referenceAudit.render;window.referenceAudit.render=t=>{if(ug.getContext().isContextLost())throw Error('reference WebGL context lost');const png=motionReferenceRender(t);if(ug.getContext().isContextLost())throw Error('reference WebGL context lost');return png;};
window.referenceAudit.camera=(f,center,distance)=>{const target=new dg.position.constructor(...center);Xg.scene.scale.setScalar(1);Xg.scene.updateMatrixWorld(true);dg.position.set(.18,.05,1.18).normalize().multiplyScalar(distance).add(target);dg.lookAt(target);dg.near=f.near;dg.far=Math.max(f.far,distance*20);dg.fov=20;dg.updateProjectionMatrix();dg.updateMatrixWorld(true);};
window.referenceAudit.gpuCenter=(f,ndc,localNdc)=>{const wide=f.distance*4,point=new dg.position.constructor(ndc[0]-localNdc[0]/4,ndc[1]-localNdc[1]/4,.5).unproject(dg);const ray=point.sub(dg.position).normalize(),direction=new dg.position.constructor(.18,.05,1.18).normalize();return dg.position.clone().addScaledVector(ray,-wide/ray.dot(direction)).toArray();};`);
        await route.fulfill({ status: r.status, headers: { ...r.headers, 'access-control-allow-origin': '*' }, body });
      } catch (e) { console.error('reference request', url, String(e)); await route.abort(); }
    });
    localPage = await localContext.newPage(); localPage.setDefaultTimeout(120000);
    await localPage.goto(localUrl); await localPage.waitForFunction(() => window.audit);
    const smoke = await localPage.evaluate(() => window.audit.smoke()); if (!smoke.metrics.silhouettePixels) throw Error('empty WebGL smoke');
    }
    await startBrowser();
    const decode = s => PNG.sync.read(Buffer.from(s.split(',')[1], 'base64'));
    function cropSequences(local, reference) {
      const images = [...local, ...reference].map(decode), allBoxes=images.map(i=>analyzeRGBA(i).bbox);
      const boxes=allBoxes.filter(Boolean);
      if (!boxes.length) throw Error('both sequences have empty silhouettes');
      const x0=Math.max(0,Math.min(...boxes.map(b=>b.x))-2), y0=Math.max(0,Math.min(...boxes.map(b=>b.y))-2);
      const x1=Math.min(size,Math.max(...boxes.map(b=>b.x+b.width))+2), y1=Math.min(size,Math.max(...boxes.map(b=>b.y+b.height))+2);
      // One FIXED crop for both full sequences; preserves translations and static intervals.
      const crop={x:x0,y:y0,width:x1-x0,height:y1-y0};
      const cropped=images.map(image=>{const result=new PNG({width:128,height:128});for(let y=0;y<128;y++)for(let x=0;x<128;x++){const src=((y0+Math.floor(y*crop.height/128))*size+x0+Math.floor(x*crop.width/128))*4;image.data.copy(result.data,(y*128+x)*4,src,src+4);}return result;});
      const encode=i=>'data:image/png;base64,'+PNG.sync.write(i).toString('base64');
      return {crop,local:cropped.slice(0,16).map(encode),reference:cropped.slice(16).map(encode),localDescriptors:cropped.slice(0,16).map(i=>analyzeRGBA(i).signature),referenceDescriptors:cropped.slice(16).map(i=>analyzeRGBA(i).signature)};
    }
    function sheet(local, reference) {
      const result = new PNG({ width: 8 * 128, height: 4 * 128 });
      // Rows: local 0..7, reference 0..7, local 8..15, reference 8..15.
      for (let i = 0; i < 16; i++) for (const [offset, frames] of [[0, local], [1, reference]]) {
        const image = decode(frames[i]);
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
          const src = (Math.floor(y * image.height / 128) * image.width + Math.floor(x * image.width / 128)) * 4;
          image.data.copy(result.data, ((Math.floor(i / 8) * 2 + offset) * 128 * result.width + y * result.width + i % 8 * 128 + x) * 4, src, src + 4);
        }
      }
      return PNG.sync.write(result);
    }
    const previous = await rows(), done = new Set(previous.filter(r => ['option','unavailable'].includes(r.kind)).map(r => `${r.skinId}/${r.key}`));
    const completed = new Set(previous.filter(r => r.kind === 'skin').map(r => r.skinId));
    await state('running');
    let loadedSkins = 0;
    for (const entry of selected) {
      if (stopping) break; if (completed.has(entry.skinId)) continue;
      if (loadedSkins) { await browser.close(); await startBrowser(); }
      loadedSkins++;
      let referencePage, skinFailed = false, missingReference=false, referenceReady=false, options = [];
      try {
        console.log('load local', entry.skinId);
        options = await localPage.evaluate(e => window.audit.loadSkin(e), entry);
        referencePage = await referenceContext.newPage(); referencePage.setDefaultTimeout(90000);
        referencePage.on('pageerror', e => console.error('reference page exception', entry.skinId, String(e)));
        referencePage.on('requestfailed', r => { if (!/sentry|cdn-cgi/.test(r.url())) console.error('reference request failed', r.url(), r.failure()?.errorText); });
        const slug = (entry.displayName || entry.skinId).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
        const referenceUrl = `https://mv.brawlstars.top/skins/${encodeURIComponent(slug)}`;
        console.log('load reference', referenceUrl);
        const response=await referencePage.goto(referenceUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        if([404,410].includes(response?.status())){missingReference=true;throw Error('reference page HTTP '+response.status()+': '+referenceUrl);}
        await referencePage.waitForFunction(() => window.referenceAudit, null, { timeout: 90000, polling: 100 });
        referenceReady=true;
        for (const option of options) {
          if (stopping) break; if (done.has(`${entry.skinId}/${option.key}`)) continue;
          try {
            const local = await localPage.evaluate(key => window.audit.selectAnimation(key), option.key);
            const localTimes = sampleTimes(local.duration, FRAME_COUNT);
            const localFrames = await localPage.evaluate(async args => { const result = []; for (const time of args.times) { const r = await window.audit.renderFrame({ skinId: args.skinId, animationKey: args.key, time, jitter: 0 }); result.push({ png: r.png, signature: r.signature }); } return result; }, { times: localTimes, skinId: entry.skinId, key: option.key });
            let reference;
            try { reference = await referencePage.evaluate(label => window.referenceAudit.select(label), entry.animations[option.key].label); }
            catch(e) { if (/reference animation missing|reference has no clip/.test(String(e))) { const folder=path.join(out,'skins',safe(entry.skinId));await fs.mkdir(folder,{recursive:true});const contactSheet=path.join(folder,`${safe(option.key)}-unavailable.png`);const empty=new PNG({width:size,height:size});const blank='data:image/png;base64,'+PNG.sync.write(empty).toString('base64');await fs.writeFile(contactSheet,sheet(localFrames.map(f=>f.png),Array(16).fill(blank)));await append({kind:'unavailable',skinId:entry.skinId,key:option.key,label:option.label,local,localFrameCount:16,localDuration:local.duration,referenceDuration:null,mean:null,max:null,alignment:null,staticLocal:null,staticReference:null,catalog:entry.animations[option.key],referenceUrl,contactSheet,error:String(e)});done.add(`${entry.skinId}/${option.key}`);continue; } throw e; }
            let referenceFraming=await referencePage.evaluate(f => window.referenceAudit.frame(f), local.framing);
            if(referenceFraming.usedFallback||local.framing.gpuFit){
              await referencePage.evaluate(f=>window.referenceAudit.camera(f,[0,0,0],f.distance*4),local.framing);
              const framingBox=png=>local.framing.gpuFit?largestSilhouetteComponent(decode(png)):analyzeRGBA(decode(png)).bbox;
              const wide=await referencePage.evaluate(()=>window.referenceAudit.render(0)),wideBox=framingBox(wide),localBox=framingBox(localFrames[0].png);
              if(wideBox&&localBox){
                const ndc=b=>[(b.x+b.width/2)/size*2-1,1-(b.y+b.height/2)/size*2];
                let center=await referencePage.evaluate(a=>window.referenceAudit.gpuCenter(a.f,a.ndc,a.localNdc),{f:local.framing,ndc:ndc(wideBox),localNdc:ndc(localBox)}),distance=local.framing.distance,alignedBox;
                for(let iteration=0;iteration<3;iteration++){
                  await referencePage.evaluate(a=>window.referenceAudit.camera(a.f,a.center,a.distance),{f:local.framing,center,distance});
                  alignedBox=framingBox(await referencePage.evaluate(()=>window.referenceAudit.render(0)));
                  if(!alignedBox)break;const ratio=alignedBox.height/localBox.height;if(Math.abs(ratio-1)<.025)break;distance*=ratio;
                }
                await referencePage.evaluate(a=>window.referenceAudit.camera(a.f,a.center,a.distance),{f:local.framing,center,distance});
                alignedBox=framingBox(await referencePage.evaluate(()=>window.referenceAudit.render(0)));
                if(alignedBox)center=await referencePage.evaluate(a=>window.referenceAudit.gpuCenter(a.f,a.ndc,a.localNdc),{f:{distance:distance/4},ndc:ndc(alignedBox),localNdc:ndc(localBox).map(v=>v*4)});
                await referencePage.evaluate(a=>window.referenceAudit.camera(a.f,a.center,a.distance),{f:local.framing,center,distance});
                referenceFraming={...referenceFraming,gpuCenter:center,gpuDistance:distance,wideBox,localBox};
              }
              else await referencePage.evaluate(f=>window.referenceAudit.frame(f),local.framing);
            }
            const referenceTimes = sampleTimes(reference.duration, FRAME_COUNT);
            const referenceImages = await referencePage.evaluate(times => times.map(t => window.referenceAudit.render(t)), referenceTimes);
            const poses=cropSequences(localFrames.map(f=>f.png),referenceImages);
            const comparison = compareMotion(poses.localDescriptors, poses.referenceDescriptors, local.duration, reference.duration);
            let physicalComparison=null,physicalImages=null;
            if(comparison.flags.length){
              physicalImages=await referencePage.evaluate(args=>args.times.map(t=>window.referenceAudit.render(args.duration>0?t%args.duration:0)),{times:localTimes,duration:reference.duration});
              const physicalPoses=cropSequences(localFrames.map(f=>f.png),physicalImages);
              const frames=localTimes.map((time,index)=>({index,time,difference:time<reference.duration?signatureDistance(physicalPoses.localDescriptors[index],physicalPoses.referenceDescriptors[index]):null}));
              const differences=frames.map(f=>f.difference).filter(v=>v!==null);
              physicalComparison={mean:differences.reduce((a,b)=>a+b,0)/differences.length,max:Math.max(...differences),frames,crop:physicalPoses.crop};
            }
            const folder = path.join(out, 'skins', safe(entry.skinId)); await fs.mkdir(folder, { recursive: true });
            const contactSheet = path.join(folder, `${safe(option.key)}-motion.png`);
            await fs.writeFile(contactSheet, sheet(poses.local, poses.reference));
            const fullSheet=contactSheet.replace('-motion.png','-full-motion.png');await fs.writeFile(fullSheet,sheet(localFrames.map(f=>f.png),referenceImages));
            const physicalSheet=physicalImages?contactSheet.replace('-motion.png','-physical-motion.png'):null;if(physicalSheet)await fs.writeFile(physicalSheet,sheet(localFrames.map(f=>f.png),physicalImages));
            await atomic(path.join(folder, `${safe(option.key)}-descriptors.json.gz`), gzipSync(JSON.stringify({ local: poses.localDescriptors, reference: poses.referenceDescriptors, crop:poses.crop, localTimes, referenceTimes })));
            await append({ kind: 'option', skinId: entry.skinId, key: option.key, label: option.label, reasons: selectionReasons(entry, values.seed), ...comparison, local, reference, referenceFraming, crop:poses.crop, catalog: entry.animations[option.key], referenceUrl, contactSheet, fullSheet, physicalComparison, physicalSheet });
            done.add(`${entry.skinId}/${option.key}`);
            console.log(`${entry.skinId}/${option.key} mean=${comparison.mean.toFixed(4)} durations=${local.duration.toFixed(3)}/${reference.duration.toFixed(3)} flags=${comparison.flags.join(',')}`);
          } catch (e) { skinFailed = true; await append({ kind: 'failure', skinId: entry.skinId, key: option.key, error: String(e) }); console.error(entry.skinId, option.key, String(e)); }
        }
      } catch (e) {
        if(missingReference&&options.length){
          for(const option of options){if(stopping)break;if(done.has(`${entry.skinId}/${option.key}`))continue;
            try{const local=await localPage.evaluate(key=>window.audit.selectAnimation(key),option.key),times=sampleTimes(local.duration,FRAME_COUNT);
              const images=await localPage.evaluate(async args=>{const frames=[];for(const time of args.times)frames.push((await window.audit.renderFrame({skinId:args.skinId,animationKey:args.key,time,jitter:0})).png);return frames;},{skinId:entry.skinId,key:option.key,times});
              const folder=path.join(out,'skins',safe(entry.skinId));await fs.mkdir(folder,{recursive:true});const contactSheet=path.join(folder,`${safe(option.key)}-unavailable.png`),blank='data:image/png;base64,'+PNG.sync.write(new PNG({width:size,height:size})).toString('base64');await fs.writeFile(contactSheet,sheet(images,Array(16).fill(blank)));
              await append({kind:'unavailable',skinId:entry.skinId,key:option.key,label:option.label,local,localFrameCount:16,localDuration:local.duration,referenceDuration:null,mean:null,max:null,alignment:null,staticLocal:null,staticReference:null,catalog:entry.animations[option.key],contactSheet,error:String(e)});done.add(`${entry.skinId}/${option.key}`);
            }catch(error){skinFailed=true;await append({kind:'failure',skinId:entry.skinId,key:option.key,error:String(error)});}
          }
        }else if(/catalog has no complete viewer manifest/.test(String(e))){
          options=await localPage.evaluate(e=>window.audit.options(e),entry);
          for(const option of options){await append({kind:'unavailable',skinId:entry.skinId,key:option.key,label:option.label,localFrameCount:0,localDuration:null,referenceDuration:null,mean:null,max:null,alignment:null,staticLocal:null,staticReference:null,catalog:entry.animations[option.key],error:String(e)});done.add(`${entry.skinId}/${option.key}`);}
        }else if(!referenceReady&&options.length){
          // An initialization failure has no reference clock/pose. Preserve local
          // coverage and null comparison metrics, while keeping every option retryable.
          skinFailed=true;
          for(const option of options){if(stopping)break;if(done.has(`${entry.skinId}/${option.key}`))continue;
            try{const local=await localPage.evaluate(key=>window.audit.selectAnimation(key),option.key),times=sampleTimes(local.duration,FRAME_COUNT);
              const images=await localPage.evaluate(async args=>{const frames=[];for(const time of args.times)frames.push((await window.audit.renderFrame({skinId:args.skinId,animationKey:args.key,time,jitter:0})).png);return frames;},{skinId:entry.skinId,key:option.key,times});
              const folder=path.join(out,'skins',safe(entry.skinId));await fs.mkdir(folder,{recursive:true});const contactSheet=path.join(folder,`${safe(option.key)}-failed-reference.png`),blank='data:image/png;base64,'+PNG.sync.write(new PNG({width:size,height:size})).toString('base64');await fs.writeFile(contactSheet,sheet(images,Array(16).fill(blank)));
              await append({kind:'failure',skinId:entry.skinId,key:option.key,label:option.label,local,localFrameCount:16,localDuration:local.duration,referenceDuration:null,mean:null,max:null,alignment:null,staticLocal:null,staticReference:null,catalog:entry.animations[option.key],contactSheet,error:String(e)});
            }catch(error){await append({kind:'failure',skinId:entry.skinId,key:option.key,error:String(error)});}
          }
        }else{skinFailed=true;await append({kind:'failure',skinId:entry.skinId,error:String(e)});}console.error(entry.skinId,String(e));
      }
      finally { await localPage.evaluate(() => window.audit.dispose()).catch(() => {}); await referencePage?.close().catch(() => {}); }
      if (!browser.isConnected() && !stopping) { console.error('browser disconnected; preserving failures and restarting for next skin'); await startBrowser(); loadedSkins=0; }
      if (stopping) break;
      // Failures remain retryable with --resume; a skin is complete only after every option succeeded.
      if (!skinFailed) { await append({ kind: 'skin', skinId: entry.skinId, options: options.length }); completed.add(entry.skinId); }
      await state('running'); console.log(`progress ${completed.size}/${selected.length}`);
    }
    await state(stopping ? 'interrupted' : completed.size === selected.length ? 'complete' : 'incomplete'); console.log(await report());
  } finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await fs.unlink(lockFile).catch(() => {}); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === script) main().catch(e => { console.error(e); process.exitCode = 1; });
