import { SITE_TOOL_MAX_RESULT_BYTES, SITE_TOOL_MAX_CHUNK_BYTES } from './site-tool-contract';

export async function siteDigest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export function siteBase64(bytes: Uint8Array): string {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += SITE_TOOL_MAX_CHUNK_BYTES) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + SITE_TOOL_MAX_CHUNK_BYTES));
  }
  return btoa(text);
}

/** Snapshot mutable binary leaves before hashing or releasing any result. */
export async function encodeSiteResult(value: unknown): Promise<Uint8Array> {
  const snapshot = structuredClone(value);
  let budget = SITE_TOOL_MAX_RESULT_BYTES;
  async function encode(input: unknown, depth: number): Promise<unknown> {
    if (depth > 24) throw new Error('result_limit');
    if (input instanceof Uint8Array || input instanceof Uint8ClampedArray || input instanceof ArrayBuffer) {
      const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      budget -= bytes.byteLength * 2;
      if (budget < 0) throw new Error('result_limit');
      return { type: 'pf-bytes/1', encoding: 'base64', byteLength: bytes.byteLength, digest: await siteDigest(bytes), data: siteBase64(bytes) };
    }
    if (Array.isArray(input)) {
      if (input.length > 250_000) throw new Error('result_limit');
      const output = [];
      for (const item of input) output.push(await encode(item, depth + 1));
      return output;
    }
    if (input && typeof input === 'object') {
      if (Object.getPrototypeOf(input) !== Object.prototype) throw new Error('result_type');
      const output: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(input)) {
        if (item !== undefined) output[key] = await encode(item, depth + 1);
      }
      return output;
    }
    if (typeof input === 'string') budget -= input.length * 2;
    if (budget < 0 || typeof input === 'function' || typeof input === 'bigint' || typeof input === 'symbol'
      || (typeof input === 'number' && !Number.isFinite(input))) throw new Error('result_type');
    return input;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(await encode(snapshot, 0)));
  if (bytes.byteLength > SITE_TOOL_MAX_RESULT_BYTES) throw new Error('result_limit');
  return bytes;
}
