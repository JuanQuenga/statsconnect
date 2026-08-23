const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const UNIT_EPSILON = 1e-3;

function fail(reason) {
  return { ok: false, reason, quaternionCount: 0 };
}

/** Validate every FLOAT VEC4 rotation sampler in a GLB animation. */
export function validateBrawlAnimationGlb(buffer) {
  if (!(buffer instanceof Uint8Array) || buffer.byteLength < 20) return fail("animation-glb-invalid");
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== GLB_VERSION) return fail("animation-glb-invalid");
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== buffer.byteLength) return fail("animation-glb-invalid");
  let offset = 12;
  let document;
  let binary;
  while (offset < declaredLength) {
    if (offset + 8 > declaredLength) return fail("animation-glb-invalid");
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkEnd = offset + 8 + chunkLength;
    if (chunkEnd > declaredLength) return fail("animation-glb-invalid");
    const chunk = buffer.subarray(offset + 8, chunkEnd);
    if (chunkType === JSON_CHUNK) {
      try {
        document = JSON.parse(new TextDecoder().decode(chunk));
      } catch {
        return fail("animation-glb-invalid");
      }
    } else if (chunkType === BIN_CHUNK) {
      binary = chunk;
    }
    offset = chunkEnd;
  }
  if (!document || !binary || !Array.isArray(document.accessors) || !Array.isArray(document.bufferViews)) return fail("animation-glb-invalid");
  let quaternionCount = 0;
  for (const animation of document.animations ?? []) {
    for (const channel of animation.channels ?? []) {
      if (channel?.target?.path !== "rotation") continue;
      const sampler = animation.samplers?.[channel.sampler];
      const accessor = sampler ? document.accessors[sampler.output] : undefined;
      if (!accessor || accessor.type !== "VEC4" || accessor.componentType !== 5126 || !Number.isSafeInteger(accessor.count)) return fail("animation-quaternion-invalid");
      const bufferView = document.bufferViews[accessor.bufferView];
      if (!bufferView) return fail("animation-quaternion-invalid");
      const stride = bufferView.byteStride ?? 16;
      const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      if (stride < 16 || base < 0 || base + Math.max(0, accessor.count - 1) * stride + 16 > binary.byteLength) return fail("animation-quaternion-invalid");
      for (let index = 0; index < accessor.count; index += 1) {
        const start = base + index * stride;
        const quaternion = [viewFloat(binary, start), viewFloat(binary, start + 4), viewFloat(binary, start + 8), viewFloat(binary, start + 12)];
        if (!quaternion.every(Number.isFinite)) return fail("animation-quaternion-non-finite");
        const norm = Math.hypot(...quaternion);
        if (!Number.isFinite(norm) || Math.abs(norm - 1) > UNIT_EPSILON) return fail("animation-quaternion-not-unit");
        quaternionCount += 1;
      }
    }
  }
  return { ok: true, reason: undefined, quaternionCount };
}

function viewFloat(binary, offset) {
  return new DataView(binary.buffer, binary.byteOffset, binary.byteLength).getFloat32(offset, true);
}
