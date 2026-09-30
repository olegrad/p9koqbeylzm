// Генерирует PNG-иконки без зависимостей: кольцо из четырёх дуг (фазы) и точка «сегодня» на светлом фоне.
// Запуск: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [250, 247, 245];
const PHASES = [[217, 100, 111], [78, 156, 131], [216, 150, 44], [132, 115, 190]];
const CENTER = [43, 37, 48];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// scale < 1 — уменьшить рисунок для maskable-иконки (безопасная зона)
function sample(x, y, scale) {
  const dx = (x - 0.5) / scale, dy = (y - 0.5) / scale;
  const r = Math.hypot(dx, dy);
  // точка «сегодня» на кольце
  const ta = 0.62 * 2 * Math.PI;
  const tx = 0.29 * Math.sin(ta), ty = -0.29 * Math.cos(ta);
  const td = Math.hypot(dx - tx, dy - ty);
  if (td <= 0.075) return td >= 0.05 ? BG : CENTER;
  if (r >= 0.25 && r <= 0.33) {
    let a = Math.atan2(dx, -dy); // 0 сверху, по часовой
    if (a < 0) a += 2 * Math.PI;
    const seg = a / (Math.PI / 2);
    const i = Math.floor(seg);
    const within = seg - i;
    const gap = 0.018 / (r * Math.PI / 2); // зазор между дугами
    if (within > gap && within < 1 - gap) return PHASES[i];
  }
  return BG;
}

function png(size, scale = 1) {
  const SS = 4; // суперсэмплинг для сглаживания
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, scale);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r / SS / SS; raw[o + 1] = g / SS / SS; raw[o + 2] = b / SS / SS;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../icons/', import.meta.url);
writeFileSync(new URL('apple-touch-icon.png', out), png(180, 1.15));
writeFileSync(new URL('icon-192.png', out), png(192, 1.15));
writeFileSync(new URL('icon-512.png', out), png(512, 1.15));
writeFileSync(new URL('icon-maskable-512.png', out), png(512, 0.95));
console.log('icons ok');
