import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, open, unlink } from "node:fs/promises";
import path from "node:path";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let writeSequence = 0;

export async function acquireImportLock(stateFile) {
  const file = `${path.resolve(stateFile)}.lock`;
  await mkdir(path.dirname(file), { recursive: true });
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, token })); }
      finally { await handle.close(); }
      return async () => {
        const owner = JSON.parse(await readFile(file, "utf8"));
        if (owner.token === token) await unlink(file);
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let owner;
      try { owner = JSON.parse(await readFile(file, "utf8")); }
      catch { throw new Error("import lock metadata is incomplete; verify no importer is running before removing it"); }
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error("import lock has invalid ownership metadata");
      let alive = true;
      try { process.kill(owner.pid, 0); } catch (check) { if (check.code === "ESRCH") alive = false; }
      if (alive) throw new Error(`an importer is already running for this state (PID ${owner.pid})`);
      await unlink(file);
    }
  }
  throw new Error("could not acquire import lock");
}

export async function atomicWrite(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${writeSequence++}`;
  await writeFile(temporary, bytes);
  await rename(temporary, file);
}

export async function verifiedBytes(file, digest) {
  if (typeof file !== "string" || !/^[a-f0-9]{64}$/.test(digest ?? "")) return null;
  try {
    const bytes = await readFile(file);
    return hash(bytes) === digest ? bytes : null;
  } catch { return null; }
}

function retryAfter(response) {
  const value = response.headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

// One caller owns this gate. The timeout includes the response body, not only headers.
export async function fetchWithRetry(fetchImpl, url, { headers, maxRetries, retryDelayMs, requestDelayMs, requestTimeoutMs = 30000, maxRetryDelayMs = 60000, requestGate, onProgress }) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const turn = (requestGate.schedule ?? Promise.resolve()).then(async () => {
      while (Date.now() < requestGate.nextRequestAt) await sleep(requestGate.nextRequestAt - Date.now());
      requestGate.nextRequestAt = Date.now() + requestDelayMs;
    });
    requestGate.schedule = turn.catch(() => {});
    await turn;
    const controller = new AbortController();
    let timeout;
    let response;
    let failure;
    try {
      response = await Promise.race([
        (async () => {
          const fetched = await fetchImpl(url, { headers, signal: controller.signal });
          const bytes = await fetched.arrayBuffer();
          return new Response([204, 205, 304].includes(fetched.status) ? null : bytes, { status: fetched.status, statusText: fetched.statusText, headers: fetched.headers });
        })(),
        new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error(`request timed out after ${requestTimeoutMs}ms: ${url}`)); }, requestTimeoutMs); }),
      ]);
    } catch (error) { failure = error; }
    finally {
      clearTimeout(timeout);
    }
    const retryable = failure || response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxRetries) {
      if (failure) throw failure;
      return response;
    }
    const delay = Math.max(retryDelayMs * (2 ** attempt), response ? retryAfter(response) : 0);
    if (response?.status === 429) requestGate.nextRequestAt = Math.max(requestGate.nextRequestAt, Date.now() + delay);
    // Do not retry earlier than Retry-After, or block a run on an unbounded server delay.
    if (delay > maxRetryDelayMs) throw new Error(`retry deferred: required wait ${delay}ms exceeds ${maxRetryDelayMs}ms for ${url}`);
    onProgress?.({ event: "retry", sourceUrl: url, attempt: attempt + 1, delayMs: delay, reason: failure?.message ?? `HTTP ${response.status}` });
    await sleep(delay);
  }
  throw new Error(`request attempts exhausted: ${url}`);
}

export function createAssetCache({ directory, fetchBytes, onProgress }) {
  const validated = new Map();
  const failed = new Map();
  const pending = new Map();
  const capture = async (sourceUrl) => {
      if (validated.has(sourceUrl)) return validated.get(sourceUrl);
      if (failed.has(sourceUrl)) throw failed.get(sourceUrl);
      const key = hash(sourceUrl);
      const indexPath = path.join(directory, "urls", `${key}.json`);
      let cached;
      try { cached = JSON.parse(await readFile(indexPath, "utf8")); } catch { /* New or incomplete URL capture. */ }
      const extension = path.extname(new URL(sourceUrl).pathname);
      const suffix = /^\.[a-z0-9]{1,10}$/i.test(extension) ? extension : ".bin";
      if (cached?.sourceUrl === sourceUrl && /^[a-f0-9]{64}$/.test(cached.sha256 ?? "")) {
        const file = path.join(directory, "objects", `${cached.sha256}${suffix}`);
        const bytes = await verifiedBytes(file, cached.sha256);
        if (bytes) {
          const capture = { sourceUrl, path: file, sha256: cached.sha256, byteLength: bytes.length };
          validated.set(sourceUrl, capture);
          onProgress?.({ event: "asset", sourceUrl, cacheHit: true, bytes: bytes.length });
          return capture;
        }
      }
      let bytes;
      try { bytes = await fetchBytes(sourceUrl); }
      catch (error) { failed.set(sourceUrl, error); throw error; }
      const sha256 = hash(bytes);
      const file = path.join(directory, "objects", `${sha256}${suffix}`);
      await atomicWrite(file, bytes);
      await atomicWrite(indexPath, `${JSON.stringify({ sourceUrl, sha256, byteLength: bytes.length })}\n`);
      const capture = { sourceUrl, path: file, sha256, byteLength: bytes.length };
      validated.set(sourceUrl, capture);
      onProgress?.({ event: "asset", sourceUrl, cacheHit: false, bytes: bytes.length });
      return capture;
  };
  return {
    async get(sourceUrl) {
      if (!pending.has(sourceUrl)) pending.set(sourceUrl, capture(sourceUrl));
      return pending.get(sourceUrl);
    },
  };
}
