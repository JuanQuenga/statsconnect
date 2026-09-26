/** Add validated native hero roles for the nine defaults absent from the v69 full-runtime batch. */
import { createHash } from 'node:crypto';
import { constants, cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBrawlAnimationGlb } from './validate-brawl-animation.mjs';

const prefix = '/assets/brawlers/3d/';
const ids = [16000003, 16000010, 16000011, 16000016, 16000023, 16000024, 16000053, 16000080, 16000087];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

function options(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1]) throw new Error(`Expected --option value: ${argv[index]}`);
    result.set(argv[index].slice(2), path.resolve(argv[index + 1]));
  }
  for (const key of ['source-dir', 'audit', 'assets-dir', 'output-dir', 'report']) if (!result.has(key)) throw new Error(`--${key} is required`);
  return result;
}

function assetPath(root, url) {
  if (!url?.startsWith(prefix)) throw new Error(`Unexpected asset URL: ${url}`);
  const relative = url.slice(prefix.length);
  if (!relative || relative.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe asset URL: ${url}`);
  return path.join(root, relative);
}

function glbDocument(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Expected GLB');
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
}

export function normalizeSscNodeNames(bytes) {
  const document = glbDocument(bytes);
  let normalized = 0;
  for (const node of document.nodes ?? []) {
    if (node.name?.endsWith(':SSC')) { node.name = node.name.slice(0, -4); normalized++; }
  }
  if (!normalized) return { bytes, normalized };
  const originalJsonLength = bytes.readUInt32LE(12);
  const oldChunkEnd = 20 + originalJsonLength;
  const tail = bytes.subarray(oldChunkEnd);
  const body = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(body.length / 4) * 4, 0x20);
  body.copy(padded);
  const result = Buffer.alloc(20 + padded.length + tail.length);
  bytes.copy(result, 0, 0, 12);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(result, 20);
  tail.copy(result, 20 + padded.length);
  return { bytes: result, normalized };
}

function copyReady(ref, sourceRoot, targetRoot) {
  if (ref?.kind !== 'ready') throw new Error('Required asset is unavailable');
  const source = assetPath(sourceRoot, ref.url);
  const target = assetPath(targetRoot, ref.url);
  if (!existsSync(source)) throw new Error(`Missing source asset ${source}`);
  const bytes = readFileSync(source);
  mkdirSync(path.dirname(target), { recursive: true });
  if (existsSync(target)) {
    if (hash(bytes) !== hash(readFileSync(target))) throw new Error(`Asset URL collision with different bytes: ${ref.url}`);
  } else writeFileSync(target, bytes);
}

function donorFor(shard, id) {
  const entries = id === 16000011 ? shard.releasedSkins : shard.defaults;
  const donor = entries.find((entry) => entry.skinId === (id === 16000011 ? 'Reference-Mortis_-Default-' : shard.defaults[0].skinId));
  if (donor?.baseModel?.kind !== 'ready' || donor.diffuseTexture?.kind !== 'ready') throw new Error(`No ready model donor for ${id}`);
  return donor;
}

function publishShard(root, id, shard) {
  const body = `${JSON.stringify(shard, null, 2)}\n`;
  const name = `catalog/${id}.${hash(body).slice(0, 16)}.json`;
  writeFileSync(path.join(root, name), body);
  return `${prefix}${name}`;
}

export function overlayNineHeroClips(input) {
  const source = realpathSync(input.get('source-dir'));
  const target = input.get('output-dir');
  if (target === source || target.startsWith(`${source}${path.sep}`) || source.startsWith(`${target}${path.sep}`)) throw new Error('Output must be separate from source');
  if (existsSync(target)) throw new Error(`Output directory already exists: ${target}`);
  cpSync(source, target, { recursive: true, mode: constants.COPYFILE_FICLONE });
  const audit = json(input.get('audit'));
  const index = json(path.join(target, 'catalog.json'));
  const report = { patched: [], normalizedNodeNames: {}, donorSkins: {} };
  for (const id of ids) {
    const row = index.brawlers.find((entry) => entry.brawlerId === id);
    const sourceEntry = audit.defaults.find((entry) => entry.brawlerId === id);
    if (!row || !sourceEntry) throw new Error(`Missing hero source or catalog entry ${id}`);
    const shard = json(assetPath(target, row.shard));
    const donor = donorFor(shard, id);
    const modelNodes = new Set(glbDocument(readFileSync(assetPath(target, donor.baseModel.url))).nodes.map((node) => node.name).filter(Boolean));
    for (const key of ['HeroScreenAnim', 'HeroScreenLoopAnim']) {
      const role = structuredClone(sourceEntry.animations[key]);
      if (role?.exported?.kind !== 'ready') throw new Error(`Missing ${key} for ${id}`);
      let bytes = readFileSync(assetPath(input.get('assets-dir'), role.exported.url));
      if (id === 16000053) {
        const normalized = normalizeSscNodeNames(bytes);
        bytes = normalized.bytes;
        report.normalizedNodeNames[`${id}:${key}`] = normalized.normalized;
        const oldName = role.exported.url.slice(prefix.length);
        const newName = oldName.replace(/\.[a-f0-9]{16}\.glb$/, `.${hash(bytes).slice(0, 16)}.glb`);
        if (newName === oldName) throw new Error(`Expected content-addressed animation URL: ${oldName}`);
        role.exported.url = `${prefix}${newName}`;
      }
      const validation = validateBrawlAnimationGlb(bytes);
      if (!validation.ok) throw new Error(`Invalid ${key} for ${id}: ${validation.reason}`);
      const animation = glbDocument(bytes);
      const targets = new Set(animation.animations.flatMap((clip) => clip.channels.map((channel) => animation.nodes[channel.target.node]?.name)));
      const missing = [...targets].filter((name) => !modelNodes.has(name));
      if (missing.length) throw new Error(`Unbound ${key} nodes for ${id}: ${missing.join(', ')}`);
      const output = assetPath(target, role.exported.url);
      mkdirSync(path.dirname(output), { recursive: true });
      if (existsSync(output) && hash(readFileSync(output)) !== hash(bytes)) throw new Error(`Asset URL collision with different bytes: ${role.exported.url}`);
      if (!existsSync(output)) writeFileSync(output, bytes);
      donor.animations[key] = role;
    }
    for (const key of ['HeroScreenFace', 'HeroScreenLoopFace']) {
      const face = sourceEntry.faces[key];
      if (!face?.ready) throw new Error(`Missing ${key} for ${id}`);
      copyReady(face.atlas, input.get('assets-dir'), target);
      copyReady(face.binary, input.get('assets-dir'), target);
      donor.faces[key] = face;
    }
    report.donorSkins[id] = donor.skinId;
    row.shard = publishShard(target, id, shard);
    report.patched.push(id);
  }
  writeFileSync(path.join(target, 'catalog.json'), `${JSON.stringify(index, null, 2)}\n`);
  mkdirSync(path.dirname(input.get('report')), { recursive: true });
  writeFileSync(input.get('report'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(overlayNineHeroClips(options(process.argv.slice(2)))));
}
