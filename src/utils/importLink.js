// utils/importLink.js — Magic-link import helpers
import { validateModel } from '../engine/validation.js';

function toBase64url(str) {
  const bytes = new TextEncoder().encode(str);
  const chars = Array.from(bytes, b => String.fromCharCode(b));
  return btoa(chars.join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(b64u) {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const rem = padded.length % 4;
  const padded2 = rem ? padded + '='.repeat(4 - rem) : padded;
  const binary = atob(padded2);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeModelToLink(modelJson, baseUrl) {
  const json = typeof modelJson === 'string' ? modelJson : JSON.stringify(modelJson);
  const encoded = toBase64url(json);
  const base = (baseUrl || (typeof window !== 'undefined'
    ? window.location.origin + window.location.pathname
    : '')).replace(/\/+$/, '');
  return `${base}/#import?m=${encoded}`;
}

export function decodeModelFromUrl(hashOrEncoded) {
  let encoded = hashOrEncoded;
  const importIdx = hashOrEncoded.indexOf('#import');
  if (importIdx !== -1) {
    const after = hashOrEncoded.slice(importIdx + '#import'.length);
    const params = new URLSearchParams(after.startsWith('?') ? after.slice(1) : after);
    encoded = params.get('m') || '';
  }
  if (!encoded) throw new Error('No model data found in URL.');
  return JSON.parse(fromBase64url(encoded));
}

// ── Compressed links (used by the Flow MCP's "open in Flow") ───────────────
// `#import?z=<deflate-raw, base64url>&target=<model id>`. The model never
// reaches a server: the fragment stays in the browser. `target` names the
// model the file was exported from, so the preview can offer to update it.

function bytesToBase64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(b64u) {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const rem = padded.length % 4;
  const binary = atob(rem ? padded + '='.repeat(4 - rem) : padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function pipeBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function buildImportLink(model, { baseUrl = '', targetId = null } = {}) {
  const json = typeof model === 'string' ? model : JSON.stringify(model);
  const packed = await pipeBytes(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  const params = new URLSearchParams({ z: bytesToBase64url(packed) });
  if (targetId) params.set('target', String(targetId));
  return `${String(baseUrl).replace(/\/+$/, '')}/#import?${params.toString()}`;
}

// A Flow export ({ name, model_json }) as the flat model the preview reads.
function flattenExport(payload) {
  if (!payload?.model_json || typeof payload.model_json !== 'object') return payload;
  const { model_json, ...rest } = payload;
  return { ...model_json, name: rest.name ?? model_json.name, description: rest.description ?? model_json.description };
}

// Reads either kind of import link: the original `m=` (plain base64url) or
// the compressed `z=`. Returns { model, targetId }.
export async function parseImportLink(hash) {
  const importIdx = hash.indexOf('#import');
  if (importIdx === -1) throw new Error('Not an import link.');
  const after = hash.slice(importIdx + '#import'.length);
  const params = new URLSearchParams(after.startsWith('?') ? after.slice(1) : after);
  const targetId = params.get('target') || null;
  const z = params.get('z');
  if (z) {
    const bytes = await pipeBytes(base64urlToBytes(z), new DecompressionStream('deflate-raw'));
    return { model: flattenExport(JSON.parse(new TextDecoder().decode(bytes))), targetId };
  }
  return { model: flattenExport(decodeModelFromUrl(hash)), targetId };
}

export function validateLinkModel(model) {
  return validateModel(model);
}
