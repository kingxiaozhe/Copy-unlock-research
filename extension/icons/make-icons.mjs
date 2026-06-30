// 依赖无关的图标生成：在 128 坐标系里用几何定义「绿底圆角 + 白色开锁」图形，
// 4x 超采样抗锯齿，输出 16/32/48/128 的 RGBA PNG（手写 PNG 编码，仅用 node:zlib）。
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const GREEN = [22, 163, 74];   // #16a34a
const WHITE = [255, 255, 255];

function inRoundRect(x, y, x0, y0, w, h, r) {
  const x1 = x0 + w, y1 = y0 + h;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// 在 128×128 坐标系里返回某点的 RGBA
function colorAt(x, y) {
  if (!inRoundRect(x, y, 0, 0, 128, 128, 28)) return [0, 0, 0, 0]; // 圆角外透明

  // 开锁形状（白）：左立柱 + 上半环（右侧开口），锁体
  const body = inRoundRect(x, y, 36, 62, 56, 44, 9);
  const leftLeg = inRoundRect(x, y, 39, 47, 11, 18, 2);
  const dx = x - 64, dy = y - 48, d = Math.hypot(dx, dy);
  const upperRing = y <= 48 && d >= 14 && d <= 25; // 顶部半环
  const white = body || leftLeg || upperRing;

  // 锁孔（在锁体上挖绿）：圆 + 短竖槽
  const keyCircle = (x - 64) ** 2 + (y - 80) ** 2 <= 7 * 7;
  const keySlot = inRoundRect(x, y, 60.5, 80, 7, 16, 3);
  const keyhole = body && (keyCircle || keySlot);

  if (keyhole) return [...GREEN, 255];
  if (white) return [...WHITE, 255];
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
          // 预乘 alpha 再平均，避免边缘发黑
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
