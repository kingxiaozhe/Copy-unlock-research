// 依赖无关的图标生成：在 128 坐标系里用几何定义「绿底 + 复制符号(叠放方块) + 文字行」，
// 4x 超采样抗锯齿，输出 16/32/48/128 的 RGBA PNG（手写 PNG 编码，仅用 node:zlib）。
// 图标语义 = 「复制文本」（不是挂锁/加密）。
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const GREEN = [22, 163, 74]; // #16a34a
const WHITE = [255, 255, 255];

function rr(x, y, x0, y0, w, h, r) {
  const x1 = x0 + w, y1 = y0 + h;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// 在 128×128 坐标系里返回某点的 RGBA
function colorAt(x, y) {
  if (!rr(x, y, 0, 0, 128, 128, 28)) return [0, 0, 0, 0]; // 圆角外透明

  const back = rr(x, y, 50, 28, 46, 46, 9);   // 后方块（白）
  const gap = rr(x, y, 31, 45, 56, 56, 12);   // 绿色间隔，分出两块
  const front = rr(x, y, 35, 49, 48, 48, 9);  // 前方块（白）
  const lines =                               // 前块内文字行（绿）
    rr(x, y, 43, 60, 32, 5, 2.5) ||
    rr(x, y, 43, 72, 32, 5, 2.5) ||
    rr(x, y, 43, 84, 20, 5, 2.5);

  if (front && lines) return [...GREEN, 255];
  if (front) return [...WHITE, 255];
  if (gap) return [...GREEN, 255];
  if (back) return [...WHITE, 255];
  return [...GREEN, 255];
}

function render(size) {
  const ss = 4; // 超采样
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((px + (sx + 0.5) / ss) / size) * 128;
          const y = ((py + (sy + 0.5) / ss) / size) * 128;
          const [cr, cg, cb, ca] = colorAt(x, y);
          const af = ca / 255;
          r += cr * af; g += cg * af; b += cb * af; a += ca;
        }
      }
      const n = ss * ss;
      const af = a / 255 / n;
      const i = (py * size + px) * 4;
      buf[i] = af ? Math.round(r / n / af) : 0;
      buf[i + 1] = af ? Math.round(g / n / af) : 0;
      buf[i + 2] = af ? Math.round(b / n / af) : 0;
      buf[i + 3] = Math.round(a / n);
    }
  }
  return buf;
}

// ---- 极简 PNG 编码（RGBA, 8bit, filter 0）----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const outDir = process.argv[2] || ".";
for (const sz of [16, 32, 48, 128]) {
  writeFileSync(`${outDir}/icon${sz}.png`, png(sz, render(sz)));
  console.log(`wrote icon${sz}.png`);
}
