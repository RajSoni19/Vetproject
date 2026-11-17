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

const { textRegion } = loadSource('lib/ocr-image');
const box = (x0, y0, w = 60, h = 14, confidence = 90, text = 'Invoice') => ({ x0, y0, x1: x0 + w, y1: y0 + h, confidence, text });
test('page shot from a distance: crop area is found around the invoice text, ignoring specks', () => {
  const words = [];
  for (let row = 0; row < 20; row++) for (let col = 0; col < 5; col++) words.push(box(1000 + col * 90, 1200 + row * 30));
  words.push(box(100, 3800, 20, 10, 20, '~~'), box(2900, 100, 30, 10, 30, '|'));
  const region = textRegion(words, 3000, 4000);
  assert.ok(region, 'region found');
  assert.ok(region.x > 900 && region.x < 1000 && region.y > 1100 && region.y < 1200, JSON.stringify(region));
  assert.ok(region.x + region.width < 1500 && region.y + region.height < 1850, JSON.stringify(region));
});
test('no crop when the invoice already fills the photo, or too little text was read', () => {
  const full = [];
  for (let row = 0; row < 30; row++) for (let col = 0; col < 6; col++) full.push(box(50 + col * 480, 50 + row * 130, 300));
  assert.equal(textRegion(full, 3000, 4000), null);
  assert.equal(textRegion([box(10, 10), box(100, 100)], 3000, 4000), null);
});
