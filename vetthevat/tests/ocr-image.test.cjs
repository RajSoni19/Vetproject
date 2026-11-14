const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { flattenLighting } = loadSource('lib/ocr-image');

test('photo shadow is removed: paper becomes white, text stays dark on both sides', () => {
  const width = 400, height = 200, pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const paper = 230 - Math.round(x / width * 130); // bright left, shadowed right (100)
    const ink = (x % 50 < 4 && y % 40 < 20) ? 0.3 : 1; // thin dark strokes
    const p = (y * width + x) * 4; pixels[p] = pixels[p + 1] = pixels[p + 2] = Math.round(paper * ink); pixels[p + 3] = 255;
  }
  flattenLighting(pixels, width, height);
  const at = (x, y) => pixels[(y * width + x) * 4];
  assert.ok(at(30, 30) >= 240 && at(370, 30) >= 240, `paper ${at(30, 30)} / ${at(370, 30)}`);
  assert.ok(at(1, 5) <= 60 && at(351, 5) <= 60, `ink ${at(1, 5)} / ${at(351, 5)}`);
});
