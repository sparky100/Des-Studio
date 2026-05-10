// qr.js — Inline SVG QR Code Generator
// Byte mode, ECC level L, versions 1–6. No external dependencies.

// — GF(256) with primitive polynomial 0x11D (x^8+x^4+x^3+x^2+1) —
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, v = 1; i < 255; i++) {
  EXP[i] = v; LOG[v] = i;
  v = (v << 1) ^ (v & 0x80 ? 0x11D : 0);
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const GM = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;

// — Reed-Solomon generator polynomial —
function rsGenPoly(deg) {
  let gen = [1];
  for (let i = 0; i < deg; i++) {
    const c = EXP[i];
    const next = new Array(gen.length + 1).fill(0);
    next[0] = GM(c, gen[0]);
    for (let j = 1; j < gen.length; j++) next[j] = gen[j - 1] ^ GM(c, gen[j]);
    next[gen.length] = gen[gen.length - 1];
    gen = next;
  }
  return gen;
}

// — RS encode: returns ECC codewords —
function rsEncode(data, eccCount) {
  const gen = rsGenPoly(eccCount);
  const buf = [...data];
  for (let i = 0; i < eccCount; i++) buf.push(0);
  for (let i = 0; i < data.length; i++) {
    const lead = buf[i];
    if (!lead) continue;
    for (let j = 0; j <= eccCount; j++) buf[i + j] ^= GM(gen[eccCount - j], lead);
  }
  return buf.slice(data.length);
}

// — Version info: modules, data codewords, ECC count, block count, total codewords —
const V = {
  1: { m: 21, d: 19, e: 7,  b: 1, t: 26 },
  2: { m: 25, d: 34, e: 10, b: 1, t: 44 },
  3: { m: 29, d: 55, e: 15, b: 1, t: 70 },
  4: { m: 33, d: 80, e: 20, b: 2, t: 100 },
  5: { m: 37, d: 108, e: 26, b: 2, t: 134 },
  6: { m: 41, d: 136, e: 36, b: 4, t: 172 },
};

function pickVersion(len) {
  for (let v = 1; v <= 6; v++) if (V[v].d >= len + 3) return v;
  return 6;
}

// — Format info (ECC L, masks 0-7) —
const FORMAT_MASK = 0x5412;
const FORMATS = [0, 1, 2, 3, 4, 5, 6, 7].map(m => {
  let f = 0x5372 ^ (m << 10); // EC level L = 0b01, mask bits at 13..10
  for (let i = 14; i >= 10; i--) if (f & (1 << i)) f ^= FORMAT_MASK << (i - 10);
  for (let i = 9; i >= 0; i--) if (f & (1 << i)) f ^= FORMAT_MASK;
  return f & 0x7FFF;
});

// — Matrix helpers —
function set(m, x, y, v) { m[y * v.m + x] = v; }
function get(m, x, y, v) { return m[y * v.m + x]; }

function isFunc(x, y, mod) {
  if (y < 9 || x < 9) { if (y < 9 && x < 9) {if ((y < 7 && x < 7) || (y > 6 && x < 3) || (x > 6 && y < 3)) return true; if ((y === 6 || y === 7) && x > 8) return true; if ((x === 6 || x === 7) && y > 8) return true; return false; } return true; }
  if (x >= mod - 8 && y < 9) { if ((y < 7 && x >= mod - 7) || (y > 6 && x >= mod - 3) || (x >= mod - 8 && y < 3)) return true; return x >= mod - 8; }
  if (x < 9 && y >= mod - 8) { if ((x < 7 && y >= mod - 7) || (x < 3 && y >= mod - 8)) return true; return y >= mod - 8; }
  if (x === 6 || y === 6) return true;
  return false;
}

export function generateQrMatrix(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) { bytes.push(0xC0 | (c >> 6)); bytes.push(0x80 | (c & 0x3F)); }
    else { bytes.push(0xE0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 0x3F)); bytes.push(0x80 | (c & 0x3F)); }
  }

  const vNum = pickVersion(bytes.length);
  const vi = V[vNum];
  const modSize = vi.m;

  // Assemble data: mode indicator (byte = 0100) + char count (8 bits) + data + terminator + pad
  const modeAndCount = [0x40 | ((bytes.length >> 4) & 0x0F), (bytes.length & 0x0F) << 4];
  // 8-bit count: for v1-6, byte mode char count is 8 bits
  // Actually, for versions 1-9, byte mode character count is 8 bits
  // mode indicator for byte: 0100 → 4
  // char count: for v1-9, 8 bits
  const dataBits = [];
  // mode: 0100
  for (let b = 0; b < 4; b++) dataBits.push((4 >> (3 - b)) & 1);
  // char count (8 bits)
  for (let b = 0; b < 8; b++) dataBits.push((bytes.length >> (7 - b)) & 1);
  // data bytes
  for (const byte of bytes) for (let b = 0; b < 8; b++) dataBits.push((byte >> (7 - b)) & 1);

  // Terminator (up to 4 zeros)
  const maxDataBits = vi.d * 8;
  for (let i = dataBits.length; i < maxDataBits && i < dataBits.length + 4; i++) dataBits.push(0);

  // Pad to byte boundary
  while (dataBits.length % 8 !== 0) dataBits.push(0);

  // Pad with alternating 0xEC, 0x11
  const padBytes = [0xEC, 0x11];
  let padIdx = 0;
  while (dataBits.length < maxDataBits) {
    for (let b = 0; b < 8 && dataBits.length < maxDataBits; b++) dataBits.push((padBytes[padIdx & 1] >> (7 - b)) & 1);
    padIdx++;
  }

  // Convert bits to data codewords
  const dataWords = [];
  for (let i = 0; i < dataBits.length; i += 8) {
    let w = 0;
    for (let j = 0; j < 8; j++) w = (w << 1) | (dataBits[i + j] || 0);
    dataWords.push(w);
  }

  // Compute ECC
  const eccWords = rsEncode(dataWords, vi.e);

  // All codewords: data + ECC
  const allWords = [...dataWords, ...eccWords];

  // Place codewords in matrix (interleaved placement)
  const f = [];
  const fill = new Int8Array(modSize * modSize);
  for (let i = 0; i < modSize * modSize; i++) fill[i] = -1;

  // Mark function patterns
  for (let y = 0; y < modSize; y++) for (let x = 0; x < modSize; x++) if (isFunc(x, y, modSize)) { fill[y * modSize + x] = 0; f.push(y * modSize + x); }

  // Place finder patterns
  function drawFinder(ox, oy) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const v = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) ? 1 : 0;
      fill[(oy + r) * modSize + (ox + c)] = v;
    }
  }
  drawFinder(0, 0); drawFinder(modSize - 7, 0); drawFinder(0, modSize - 7);

  // Separators
  for (let i = 0; i < 8; i++) {
    if (i < 7) { fill[7 * modSize + i] = fill[(modSize - 8) * modSize + i] = fill[i * modSize + 7] = fill[i * modSize + (modSize - 8)] = 0; }
    fill[7 * modSize + 7] = fill[7 * modSize + (modSize - 8)] = fill[(modSize - 8) * modSize + 7] = 0;
  }

  // Timing patterns
  for (let i = 8; i < modSize - 8; i++) { fill[6 * modSize + i] = (i + 1) % 2; fill[i * modSize + 6] = (i + 1) % 2; }

  // Place codewords (zigzag from bottom-right, up columns)
  let bitIdx = 0;
  const bitLen = allWords.length * 8;

  for (let col = modSize - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let rowUp = 0; rowUp < 2; rowUp++) {
      const dir = rowUp === 0 ? -1 : 1;
      const startY = rowUp === 0 ? modSize - 1 : 0;
      const endY = rowUp === 0 ? -1 : modSize;
      for (let y = startY; y !== endY; y += dir) {
        for (let cx = 0; cx < 2; cx++) {
          const x = col - cx;
          if (x < 0 || fill[y * modSize + x] !== -1) continue;
          const bit = bitIdx < bitLen ? (allWords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1 : 0;
          fill[y * modSize + x] = bit;
          bitIdx++;
        }
      }
    }
  }

  // Evaluate masks and pick best
  const maskModule = (m, v, x, y) => {
    if (m === 0) return v ^ ((x + y) % 2 === 0 ? 1 : 0);
    if (m === 1) return v ^ (y % 2 === 0 ? 1 : 0);
    if (m === 2) return v ^ (x % 3 === 0 ? 1 : 0);
    if (m === 3) return v ^ ((x + y) % 3 === 0 ? 1 : 0);
    if (m === 4) return v ^ ((Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0 ? 1 : 0);
    if (m === 5) return v ^ (((x * y) % 2) + ((x * y) % 3) === 0 ? 1 : 0);
    if (m === 6) return v ^ (((x * y) % 2 + (x * y) % 3) % 2 === 0 ? 1 : 0);
    return v ^ (((x + y) % 2 + (x * y) % 3) % 2 === 0 ? 1 : 0);
  };
  let bestMask = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const score = (() => {
      let s = 0;
      // Penalty 1: adjacent modules in rows
      for (let y = 0; y < modSize; y++) {
        let run = 0;
        for (let x = 0; x < modSize; x++) {
          const ci = y * modSize + x;
          let v = fill[ci];
          if (v < 0) continue;
          if (f.includes(ci)) continue; // skip function patterns
          if (m === 0) v ^= (x + y) % 2 === 0 ? 1 : 0;
          else if (m === 1) v ^= y % 2 === 0 ? 1 : 0;
          else if (m === 2) v ^= x % 3 === 0 ? 1 : 0;
          else if (m === 3) v ^= (x + y) % 3 === 0 ? 1 : 0;
          else if (m === 4) v ^= (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0 ? 1 : 0;
          else if (m === 5) v ^= ((x * y) % 2) + ((x * y) % 3) === 0 ? 1 : 0;
          else if (m === 6) v ^= ((x * y) % 2 + (x * y) % 3) % 2 === 0 ? 1 : 0;
          else if (m === 7) v ^= ((x + y) % 2 + (x * y) % 3) % 2 === 0 ? 1 : 0;
          if (v === 1) { run++; } else { if (run >= 5) s += run - 2; run = 0; }
        }
        if (run >= 5) s += run - 2;
      }
      for (let x = 0; x < modSize; x++) {
        let run = 0;
        for (let y = 0; y < modSize; y++) {
          const ci = y * modSize + x;
          if (fill[ci] < 0 || f.includes(ci)) { run = 0; continue; }
          let v = fill[ci];
          if (m === 0) v ^= (x + y) % 2 === 0 ? 1 : 0;
          else if (m === 1) v ^= y % 2 === 0 ? 1 : 0;
          else if (m === 2) v ^= x % 3 === 0 ? 1 : 0;
          else if (m === 3) v ^= (x + y) % 3 === 0 ? 1 : 0;
          else if (m === 4) v ^= (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0 ? 1 : 0;
          else if (m === 5) v ^= ((x * y) % 2) + ((x * y) % 3) === 0 ? 1 : 0;
          else if (m === 6) v ^= ((x * y) % 2 + (x * y) % 3) % 2 === 0 ? 1 : 0;
          else if (m === 7) v ^= ((x + y) % 2 + (x * y) % 3) % 2 === 0 ? 1 : 0;
          if (v === 1) { run++; } else { if (run >= 5) s += run - 2; run = 0; }
        }
        if (run >= 5) s += run - 2;
      }
      // Penalty 2: 2×2 blocks
      for (let y = 0; y < modSize - 1; y++) for (let x = 0; x < modSize - 1; x++) {
        if (x === 6 || y === 6) continue;
        if ([0, 1, 2, 3].every(d => !f.includes((y + (d >> 1)) * modSize + x + (d & 1)))) {
          const v = (() => {
            const ci = y * modSize + x;
            const tl = fill[ci], tr = fill[ci + 1], bl = fill[(y + 1) * modSize + x], br = fill[(y + 1) * modSize + x + 1];
            if (tl < 0 || tr < 0 || bl < 0 || br < 0) return -1;
            const mtl = (() => { let v = tl; if (m === 0) v ^= (x + y) % 2 === 0 ? 1 : 0; else if (m === 1) v ^= y % 2 === 0 ? 1 : 0; else if (m === 2) v ^= x % 3 === 0 ? 1 : 0; else if (m === 3) v ^= (x + y) % 3 === 0 ? 1 : 0; else if (m === 4) v ^= (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0 ? 1 : 0; else if (m === 5) v ^= ((x * y) % 2) + ((x * y) % 3) === 0 ? 1 : 0; else if (m === 6) v ^= ((x * y) % 2 + (x * y) % 3) % 2 === 0 ? 1 : 0; else v ^= ((x + y) % 2 + (x * y) % 3) % 2 === 0 ? 1 : 0; return v; })();
            if (mtl < 0) return -1;
            const mtr = (() => { let v = tr; const rx = x + 1; if (m === 0) v ^= (rx + y) % 2 === 0 ? 1 : 0; else if (m === 1) v ^= y % 2 === 0 ? 1 : 0; else if (m === 2) v ^= rx % 3 === 0 ? 1 : 0; else if (m === 3) v ^= (rx + y) % 3 === 0 ? 1 : 0; else if (m === 4) v ^= (Math.floor(y / 2) + Math.floor(rx / 3)) % 2 === 0 ? 1 : 0; else if (m === 5) v ^= ((rx * y) % 2) + ((rx * y) % 3) === 0 ? 1 : 0; else if (m === 6) v ^= ((rx * y) % 2 + (rx * y) % 3) % 2 === 0 ? 1 : 0; else v ^= ((rx + y) % 2 + (rx * y) % 3) % 2 === 0 ? 1 : 0; return v; })();
            const mbl = (() => { let v = bl; const by = y + 1; if (m === 0) v ^= (x + by) % 2 === 0 ? 1 : 0; else if (m === 1) v ^= by % 2 === 0 ? 1 : 0; else if (m === 2) v ^= x % 3 === 0 ? 1 : 0; else if (m === 3) v ^= (x + by) % 3 === 0 ? 1 : 0; else if (m === 4) v ^= (Math.floor(by / 2) + Math.floor(x / 3)) % 2 === 0 ? 1 : 0; else if (m === 5) v ^= ((x * by) % 2) + ((x * by) % 3) === 0 ? 1 : 0; else if (m === 6) v ^= ((x * by) % 2 + (x * by) % 3) % 2 === 0 ? 1 : 0; else v ^= ((x + by) % 2 + (x * by) % 3) % 2 === 0 ? 1 : 0; return v; })();
            const mbr = (() => { let v = br; const rx = x + 1, by = y + 1; if (m === 0) v ^= (rx + by) % 2 === 0 ? 1 : 0; else if (m === 1) v ^= by % 2 === 0 ? 1 : 0; else if (m === 2) v ^= rx % 3 === 0 ? 1 : 0; else if (m === 3) v ^= (rx + by) % 3 === 0 ? 1 : 0; else if (m === 4) v ^= (Math.floor(by / 2) + Math.floor(rx / 3)) % 2 === 0 ? 1 : 0; else if (m === 5) v ^= ((rx * by) % 2) + ((rx * by) % 3) === 0 ? 1 : 0; else if (m === 6) v ^= ((rx * by) % 2 + (rx * by) % 3) % 2 === 0 ? 1 : 0; else v ^= ((rx + by) % 2 + (rx * by) % 3) % 2 === 0 ? 1 : 0; return v; })();
            return mtl === mtr && mtr === mbl && mbl === mbr ? mtl : -1;
          })();
          if (v === 0 || v === 1) s += 3;
        }
      }
      // Penalty 3: 1:1:3:1:1 pattern
      const pattern = [1, 0, 1, 1, 1, 0, 1];
      for (let y = 0; y < modSize; y++) for (let x = 0; x < modSize - 10; x++) {
        let match = true;
        for (let k = 0; k < 7; k++) {
          const ci = y * modSize + x + k;
          if (fill[ci] < 0 || f.includes(ci)) { match = false; break; }
          let v = fill[ci];
          if (m === 0) v ^= ((x + k) + y) % 2 === 0 ? 1 : 0;
          else if (m === 1) v ^= y % 2 === 0 ? 1 : 0;
          else if (m === 2) v ^= (x + k) % 3 === 0 ? 1 : 0;
          else if (m === 3) v ^= ((x + k) + y) % 3 === 0 ? 1 : 0;
          else if (m === 4) v ^= (Math.floor(y / 2) + Math.floor((x + k) / 3)) % 2 === 0 ? 1 : 0;
          else if (m === 5) v ^= (((x + k) * y) % 2) + (((x + k) * y) % 3) === 0 ? 1 : 0;
          else if (m === 6) v ^= (((x + k) * y) % 2 + ((x + k) * y) % 3) % 2 === 0 ? 1 : 0;
          else v ^= (((x + k) + y) % 2 + ((x + k) * y) % 3) % 2 === 0 ? 1 : 0;
          if (v !== pattern[k]) { match = false; break; }
        }
        if (match) s += 40;
      }
      for (let x = 0; x < modSize; x++) for (let y = 0; y < modSize - 10; y++) {
        let match = true;
        for (let k = 0; k < 7; k++) {
          const ci = (y + k) * modSize + x;
          if (fill[ci] < 0 || f.includes(ci)) { match = false; break; }
          let v = fill[ci];
          if (m === 0) v ^= (x + y + k) % 2 === 0 ? 1 : 0;
          else if (m === 1) v ^= (y + k) % 2 === 0 ? 1 : 0;
          else if (m === 2) v ^= x % 3 === 0 ? 1 : 0;
          else if (m === 3) v ^= (x + y + k) % 3 === 0 ? 1 : 0;
          else if (m === 4) v ^= (Math.floor((y + k) / 2) + Math.floor(x / 3)) % 2 === 0 ? 1 : 0;
          else if (m === 5) v ^= ((x * (y + k)) % 2) + ((x * (y + k)) % 3) === 0 ? 1 : 0;
          else if (m === 6) v ^= ((x * (y + k)) % 2 + (x * (y + k)) % 3) % 2 === 0 ? 1 : 0;
          else v ^= ((x + y + k) % 2 + (x * (y + k)) % 3) % 2 === 0 ? 1 : 0;
          if (v !== pattern[k]) { match = false; break; }
        }
        if (match) s += 40;
      }
      // Penalty 4: proportion of dark modules
      let dark = 0, total = 0;
      for (let y = 0; y < modSize; y++) for (let x = 0; x < modSize; x++) {
        const ci = y * modSize + x;
        if (fill[ci] < 0 || f.includes(ci) || (x >= modSize - 8 && y < 9) || (x < 9 && y >= modSize - 8)) continue;
        let v = fill[ci];
        if (m === 0) v ^= (x + y) % 2 === 0 ? 1 : 0;
        else if (m === 1) v ^= y % 2 === 0 ? 1 : 0;
        else if (m === 2) v ^= x % 3 === 0 ? 1 : 0;
        else if (m === 3) v ^= (x + y) % 3 === 0 ? 1 : 0;
        else if (m === 4) v ^= (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0 ? 1 : 0;
        else if (m === 5) v ^= ((x * y) % 2) + ((x * y) % 3) === 0 ? 1 : 0;
        else if (m === 6) v ^= ((x * y) % 2 + (x * y) % 3) % 2 === 0 ? 1 : 0;
        else v ^= ((x + y) % 2 + (x * y) % 3) % 2 === 0 ? 1 : 0;
        if (v === 1) dark++;
        total++;
      }
      if (total) { const pct = Math.round((dark / total) * 100); const diff = Math.abs(pct - 50); s += Math.floor(diff / 5) * 10; }
      return s;
    })();
    if (score < bestScore) { bestScore = score; bestMask = m; }
  }

  // Apply best mask + format info
  const matrix = [];
  for (let i = 0; i < modSize; i++) {
    matrix[i] = new Uint8Array(modSize);
    for (let j = 0; j < modSize; j++) {
      const ci = i * modSize + j;
      if (fill[ci] < 0) { matrix[i][j] = 0; continue; }
      if (f.includes(ci)) { matrix[i][j] = fill[ci]; continue; }
      let v = fill[ci];
      if (bestMask === 0) v ^= (j + i) % 2 === 0 ? 1 : 0;
      else if (bestMask === 1) v ^= i % 2 === 0 ? 1 : 0;
      else if (bestMask === 2) v ^= j % 3 === 0 ? 1 : 0;
      else if (bestMask === 3) v ^= (j + i) % 3 === 0 ? 1 : 0;
      else if (bestMask === 4) v ^= (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0 ? 1 : 0;
      else if (bestMask === 5) v ^= ((j * i) % 2) + ((j * i) % 3) === 0 ? 1 : 0;
      else if (bestMask === 6) v ^= ((j * i) % 2 + (j * i) % 3) % 2 === 0 ? 1 : 0;
      else v ^= ((j + i) % 2 + (j * i) % 3) % 2 === 0 ? 1 : 0;
      matrix[i][j] = v;
    }
  }

  // Apply format info
  const fmtBits = FORMATS[bestMask];
  for (let i = 0; i < 15; i++) {
    const bit = (fmtBits >> (14 - i)) & 1;
    // Horizontal at top
    if (i < 6) matrix[8][i] = bit;
    else if (i < 7) matrix[8][i + 1] = bit;
    else if (i < 8) matrix[8][modSize - 15 + i] = bit;
    else matrix[8][modSize - 15 + i] = bit;
    // Vertical on left
    if (i < 6) matrix[i][8] = bit;
    else if (i < 7) matrix[i + 1][8] = bit;
    else if (i < 8) matrix[modSize - 15 + i][8] = bit;
    else matrix[modSize - 15 + i][8] = bit;
  }

  return { matrix, modSize, vNum };
}

export function qrSvg(text, size = 200) {
  const qr = generateQrMatrix(text);
  const { matrix, modSize } = qr;
  const cell = size / modSize;
  const modules = [];

  for (let y = 0; y < modSize; y++) {
    for (let x = 0; x < modSize; x++) {
      if (matrix[y][x]) {
        modules.push(`<rect x="${(x * cell).toFixed(2)}" y="${(y * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="#000"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${modules.join('')}</svg>`;
}
