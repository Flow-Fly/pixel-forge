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

interface WireBudget { remaining: number }

/** Snapshot mutable binary leaves before hashing or releasing any result. */
export async function encodeSiteResult(value: unknown): Promise<Uint8Array> {
  const snapshot = structuredClone(value);
  const budget = { remaining: SITE_TOOL_MAX_RESULT_BYTES };
  const encoded = await encodeValue(snapshot, budget, 0);
  const bytes = new TextEncoder().encode(JSON.stringify(encoded));
  if (bytes.byteLength > SITE_TOOL_MAX_RESULT_BYTES) throw new Error('result_limit');
  return bytes;
}

function consume(budget: WireBudget, size: number): void {
  budget.remaining -= size;
  if (budget.remaining < 0) throw new Error('result_limit');
}

async function encodeValue(input: unknown, budget: WireBudget, depth: number): Promise<unknown> {
  if (depth > 24) throw new Error('result_limit');
  if (input instanceof ArrayBuffer) return encodeBytes(new Uint8Array(input), budget);
  if (input instanceof Uint8Array || input instanceof Uint8ClampedArray) {
    return encodeBytes(new Uint8Array(input.buffer, input.byteOffset, input.byteLength), budget);
  }
  if (Array.isArray(input)) return encodeArray(input, budget, depth);
  if (input && typeof input === 'object') return encodeObject(input, budget, depth);
  return encodeScalar(input, budget);
}

async function encodeBytes(bytes: Uint8Array, budget: WireBudget): Promise<unknown> {
  consume(budget, bytes.byteLength * 2);
  return { type: 'pf-bytes/1', encoding: 'base64', byteLength: bytes.byteLength, digest: await siteDigest(bytes), data: siteBase64(bytes) };
}

async function encodeArray(input: unknown[], budget: WireBudget, depth: number): Promise<unknown[]> {
  if (input.length > 250_000) throw new Error('result_limit');
  consume(budget, input.length);
  const output = [];
  for (const item of input) output.push(await encodeValue(item, budget, depth + 1));
  return output;
}

async function encodeObject(input: object, budget: WireBudget, depth: number): Promise<Record<string, unknown>> {
  if (Object.getPrototypeOf(input) !== Object.prototype) throw new Error('result_type');
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input)) {
    consume(budget, key.length * 2);
    if (item !== undefined) output[key] = await encodeValue(item, budget, depth + 1);
  }
  return output;
}

function encodeScalar(input: unknown, budget: WireBudget): unknown {
  if (input === null || typeof input === 'boolean') return input;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') { consume(budget, input.length * 2); return input; }
  throw new Error('result_type');
}
