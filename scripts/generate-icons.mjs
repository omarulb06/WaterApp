/**
 * Builds the launcher and notification icons from one droplet shape.
 *
 *   npm run icons
 *
 * Native density folders (mipmap-hdpi, AppIcon.appiconset, drawable-*)
 * are produced later by `npx expo prebuild` from these 1024px sources.
 */
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'assets');

const SIZE = 1024;
/** Android adaptive safe zone: center 66% of the 1024 canvas. */
const SAFE_RADIUS = SIZE * 0.33;
const NOTIFICATION_SIZE = 96;

/**
 * Teardrop in a 100-unit box. The bulb sits on the lower half and the
 * point stays inside the adaptive-icon safe circle after scaling.
 */
const DROP_PATH = 'M50 8C50 8 18 42 18 62C18 80 32 94 50 94C68 94 82 80 82 62C82 42 50 8 50 8Z';

const BACKGROUND = `
  <defs>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1E3A8A"/>
      <stop offset="46%" stop-color="#0EA5E9"/>
      <stop offset="100%" stop-color="#38BDF8"/>
    </linearGradient>
    <radialGradient id="shade" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0F172A" stop-opacity="0.38"/>
      <stop offset="62%" stop-color="#0F172A" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="0"/>
    </radialGradient>
  </defs>
`;

function canvas(size, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${body}
</svg>`;
}

/** Places the 100-unit droplet so its box center lands on the canvas center. */
function dropGroup(size, { shadow = false, fill = '#FFFFFF' } = {}) {
  const scale = size === NOTIFICATION_SIZE ? size * 0.0086 : size * 0.00685;
  const originX = 50;
  const originY = 51;
  const tx = size / 2 - originX * scale;
  const ty = size / 2 - originY * scale;
  // Soft contact shadow under the bulb. Kept inside the adaptive safe circle.
  const shade = shadow
    ? (() => {
        const bottom = size / 2 + (94 - 51) * scale;
        const ry = size * 0.02;
        const cy = bottom - ry * 0.35;
        return `<ellipse cx="${size / 2}" cy="${cy}" rx="${size * 0.1}" ry="${ry}" fill="url(#shade)"/>`;
      })()
    : '';
  return `${shade}<g transform="translate(${tx} ${ty}) scale(${scale})">
    <path d="${DROP_PATH}" fill="${fill}"/>
  </g>`;
}

function render(svg) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: Number(svg.match(/width="(\d+)"/)[1]) } }).render().asPng();
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([length, body, checksum]);
}

/** RGB PNG with no alpha channel, which is what the iOS App Store requires. */
function encodeRgbPng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    rgb.copy(raw, rowStart + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function readPng(buffer) {
  const png = PNG.sync.read(buffer);
  return png;
}

function assertSize(png, size, label) {
  if (png.width !== size || png.height !== size) {
    throw new Error(`${label} is ${png.width}x${png.height}, expected ${size}x${size}`);
  }
}

function farthestOpaque(png, alphaFloor = 12) {
  const cx = (png.width - 1) / 2;
  const cy = (png.height - 1) / 2;
  let max = 0;
  let count = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha <= alphaFloor) continue;
      count += 1;
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > max) max = distance;
    }
  }
  return { max, count };
}

function assertWhiteSilhouette(png, label) {
  for (let i = 0; i < png.data.length; i += 4) {
    const alpha = png.data[i + 3];
    if (alpha === 0) continue;
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (r !== 255 || g !== 255 || b !== 255) {
      throw new Error(`${label} has a non-white pixel rgb(${r},${g},${b})`);
    }
  }
}

function assertFullyOpaque(png, label) {
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] !== 255) {
      throw new Error(`${label} has a transparent pixel`);
    }
  }
}

function toRgbBuffer(png) {
  const rgb = Buffer.alloc(png.width * png.height * 3);
  for (let i = 0, j = 0; i < png.data.length; i += 4, j += 3) {
    rgb[j] = png.data[i];
    rgb[j + 1] = png.data[i + 1];
    rgb[j + 2] = png.data[i + 2];
  }
  return rgb;
}

mkdirSync(assetsDir, { recursive: true });

const backgroundSvg = canvas(
  SIZE,
  `${BACKGROUND}<rect width="${SIZE}" height="${SIZE}" fill="url(#water)"/>`,
);
const foregroundSvg = canvas(SIZE, `${BACKGROUND}${dropGroup(SIZE, { shadow: true })}`);
const monochromeSvg = canvas(SIZE, dropGroup(SIZE));
const iconSvg = canvas(
  SIZE,
  `${BACKGROUND}<rect width="${SIZE}" height="${SIZE}" fill="url(#water)"/>${dropGroup(SIZE, { shadow: true })}`,
);
const notificationSvg = canvas(NOTIFICATION_SIZE, dropGroup(NOTIFICATION_SIZE));
const faviconSvg = canvas(
  48,
  `${BACKGROUND}<rect width="48" height="48" fill="url(#water)"/>${dropGroup(48, { shadow: false })}`,
);

const outputs = {
  'adaptive-icon-background.png': render(backgroundSvg),
  'adaptive-icon.png': render(foregroundSvg),
  'adaptive-icon-monochrome.png': render(monochromeSvg),
  'notification_icon.png': render(notificationSvg),
};

const iconPng = readPng(render(iconSvg));
const faviconPng = readPng(render(faviconSvg));
assertSize(iconPng, SIZE, 'icon.png');
assertFullyOpaque(iconPng, 'icon.png');
assertSize(faviconPng, 48, 'favicon.png');
assertFullyOpaque(faviconPng, 'favicon.png');
outputs['icon.png'] = encodeRgbPng(SIZE, SIZE, toRgbBuffer(iconPng));
outputs['favicon.png'] = encodeRgbPng(48, 48, toRgbBuffer(faviconPng));

for (const [name, buffer] of Object.entries(outputs)) {
  writeFileSync(join(assetsDir, name), buffer);
}

const foreground = readPng(outputs['adaptive-icon.png']);
const monochrome = readPng(outputs['adaptive-icon-monochrome.png']);
const notification = readPng(outputs['notification_icon.png']);
const background = readPng(outputs['adaptive-icon-background.png']);
const iconFile = readPng(outputs['icon.png']);

assertSize(foreground, SIZE, 'adaptive-icon.png');
assertSize(monochrome, SIZE, 'adaptive-icon-monochrome.png');
assertSize(background, SIZE, 'adaptive-icon-background.png');
assertSize(notification, NOTIFICATION_SIZE, 'notification_icon.png');
assertFullyOpaque(background, 'adaptive-icon-background.png');
assertWhiteSilhouette(monochrome, 'adaptive-icon-monochrome.png');
assertWhiteSilhouette(notification, 'notification_icon.png');

if (iconFile.colorType !== 2) {
  throw new Error(`icon.png color type is ${iconFile.colorType}; iOS requires RGB with no alpha`);
}

const foregroundReach = farthestOpaque(foreground);
const monochromeReach = farthestOpaque(monochrome);
const safeLimit = SAFE_RADIUS;
if (foregroundReach.max > safeLimit) {
  throw new Error(
    `Foreground droplet reaches ${foregroundReach.max.toFixed(1)}px from center; safe radius is ${safeLimit}`,
  );
}
if (monochromeReach.max > safeLimit) {
  throw new Error(
    `Monochrome droplet reaches ${monochromeReach.max.toFixed(1)}px from center; safe radius is ${safeLimit}`,
  );
}

console.log('Wrote assets:');
for (const name of Object.keys(outputs)) console.log(`  assets/${name}`);
console.log(
  `Foreground extent ${foregroundReach.max.toFixed(1)}px / safe ${safeLimit.toFixed(1)}px`,
);
console.log(`icon.png color type ${iconFile.colorType} (2 = RGB, no alpha)`);
