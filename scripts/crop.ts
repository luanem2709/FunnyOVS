/**
 * Cắt & phóng to vùng giữa ảnh để kiểm tra chi tiết (không phụ thuộc thư viện ngoài).
 * Chạy: npx tsx scripts/crop.ts <in.png> <out.png> <cx> <cy> <w> <h>
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/** Đọc PNG (chỉ hỗ trợ 8-bit RGBA/RGB, không interlace) → {w,h,data}. */
function readPng(file: string): { w: number; h: number; data: Buffer } {
  const buf = fs.readFileSync(file);
  let off = 8;
  let w = 0;
  let h = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, data: out };
}

/** Ghi PNG (RGB, không filter). */
function writePng(file: string, w: number, h: number, data: Buffer): void {
  const stride = w * 3;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunks: Buffer[] = [];
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  chunks.push(chunk("IHDR", ihdr));
  chunks.push(chunk("IDAT", zlib.deflateSync(raw)));
  chunks.push(chunk("IEND", Buffer.alloc(0)));
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]));
}

let crcTable: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const [, , inFile, outFile, cxS, cyS, cwS, chS] = process.argv;
const src = readPng(path.resolve(inFile));
const bpp = 3;
const cx = Number(cxS);
const cy = Number(cyS);
const cw = Math.min(Number(cwS), src.w - cx);
const ch = Math.min(Number(chS), src.h - cy);
const scale = Math.max(1, Math.floor(900 / Math.max(cw, ch)));
const ow = cw * scale;
const oh = ch * scale;
const out = Buffer.alloc(ow * oh * 3);
for (let y = 0; y < oh; y++) {
  for (let x = 0; x < ow; x++) {
    const sx = cx + Math.floor(x / scale);
    const sy = cy + Math.floor(y / scale);
    const si = (sy * src.w + sx) * bpp;
    const di = (y * ow + x) * 3;
    out[di] = src.data[si];
    out[di + 1] = src.data[si + 1];
    out[di + 2] = src.data[si + 2];
  }
}
writePng(path.resolve(outFile), ow, oh, out);
console.log(`→ ${outFile} (${ow}x${oh}, scale ${scale})`);
