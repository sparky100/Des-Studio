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

export function validateLinkModel(model) {
  return validateModel(model);
}
