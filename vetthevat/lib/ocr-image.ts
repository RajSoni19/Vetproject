// Image clean-up before OCR, for phone photos of paper invoices.
//
// A photo has uneven light (shadow of the phone, a darker corner) and a
// coloured background. Plain contrast stretching turns the darker half of the
// page grey-on-grey and digits get misread ("154.99" as "164.99"). Dividing
// every pixel by the local paper brightness gives black text on even white
// paper everywhere on the page.

// In place, on RGBA pixels (canvas ImageData layout). Output is grey.
// invertDark: also read white-on-dark boxes (used by the supplementary pass
// only; block edges can damage nearby text, so the main pass leaves it off).
export function flattenLighting(pixels: Uint8ClampedArray, width: number, height: number, invertDark = false) {
  const count = width * height;
  const gray = new Uint8Array(count);
  for (let i = 0, p = 0; i < count; i++, p += 4) gray[i] = (pixels[p] * 77 + pixels[p + 1] * 150 + pixels[p + 2] * 29) >> 8;

  // Paper brightness on a coarse grid: the brightest value in each cell (text
  // is darker than the paper around it), then smoothed over neighbours.
  const cell = Math.max(16, Math.round(Math.max(width, height) / 64));
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const paper = new Float32Array(cols * rows);
  // Dark boxes with white text ("PLEASE PAY £404.30", dark table headings):
  // there the background is the dark part, so the cell is read inverted.
  const dark = new Uint8Array(cols * rows), darkPaper = new Float32Array(cols * rows);
  const histogram = new Uint32Array(256);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    histogram.fill(0);
    let total = 0;
    const yEnd = Math.min(height, (cy + 1) * cell), xEnd = Math.min(width, (cx + 1) * cell);
    for (let y = cy * cell; y < yEnd; y += 2) for (let x = cx * cell, row = y * width; x < xEnd; x += 2) { histogram[gray[row + x]]++; total++; }
    const percentile = (share: number) => { let seen = 0, level = 0; for (; level < 255; level++) { seen += histogram[level]; if (seen >= total * share) break; } return level; };
    // 90th percentile: ignores specks brighter than the paper.
    let seen = 0, level = 255;
    for (; level > 0; level--) { seen += histogram[level]; if (seen >= total * 0.1) break; }
    paper[cy * cols + cx] = Math.max(level, 40);
    // Mostly dark cell: background below mid-grey, read white-on-dark.
    if (invertDark && percentile(0.5) < 110) { dark[cy * cols + cx] = 1; darkPaper[cy * cols + cx] = Math.max(255 - percentile(0.1), 40); }
  }
  const smooth = new Float32Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    let sum = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const y = cy + dy, x = cx + dx;
      if (y >= 0 && y < rows && x >= 0 && x < cols) { sum += paper[y * cols + x]; n++; }
    }
    smooth[cy * cols + cx] = sum / n;
  }

  // Bilinear paper brightness per pixel, then pixel / paper. Values near the
  // paper go to white; a mild curve keeps thin strokes dark.
  for (let y = 0; y < height; y++) {
    const gy = Math.min(rows - 1, Math.max(0, (y + 0.5) / cell - 0.5)), y0 = Math.floor(gy), y1 = Math.min(rows - 1, y0 + 1), fy = gy - y0;
    for (let x = 0; x < width; x++) {
      const own = Math.min(rows - 1, Math.floor(y / cell)) * cols + Math.min(cols - 1, Math.floor(x / cell));
      let ratio: number;
      if (dark[own]) ratio = (255 - gray[y * width + x]) / darkPaper[own];
      else {
        const gx = Math.min(cols - 1, Math.max(0, (x + 0.5) / cell - 0.5)), x0 = Math.floor(gx), x1 = Math.min(cols - 1, x0 + 1), fx = gx - x0;
        const top = smooth[y0 * cols + x0] * (1 - fx) + smooth[y0 * cols + x1] * fx;
        const bottom = smooth[y1 * cols + x0] * (1 - fx) + smooth[y1 * cols + x1] * fx;
        ratio = gray[y * width + x] / (top * (1 - fy) + bottom * fy);
      }
      // 0.92 and above is paper; stretch the rest.
      const value = ratio >= 0.92 ? 255 : Math.max(0, Math.round(255 * Math.pow(ratio / 0.92, 1.6)));
      const p = (y * width + x) * 4;
      pixels[p] = pixels[p + 1] = pixels[p + 2] = value; pixels[p + 3] = 255;
    }
  }
}

// Where the document sits inside a photo taken from a distance (page on a
// desk). Input: word boxes from a first OCR pass. Returns the area to crop to
// (with a margin), or null when the text already fills most of the picture or
// too little was read to tell.
export type OcrWordBox = { x0: number; y0: number; x1: number; y1: number; confidence: number; text: string };
export function textRegion(words: OcrWordBox[], width: number, height: number): { x: number; y: number; width: number; height: number } | null {
  // Confident, word-like boxes only: desk texture and shadows read as low-confidence specks.
  const good = words.filter((word) => word.confidence >= 55 && /[A-Za-z0-9]{2,}/.test(word.text) && word.x1 > word.x0 && word.y1 > word.y0 && (word.y1 - word.y0) < height * 0.08);
  if (good.length < 12) return null;
  // Trim stray words far from the rest (a label on a pen, a keyboard key):
  // keep the span holding the middle 96% of words on each axis, then extend
  // to any word that starts inside that span.
  const span = (values: [number, number][], limit: number) => {
    const starts = values.map((v) => v[0]).sort((a, b) => a - b), ends = values.map((v) => v[1]).sort((a, b) => a - b);
    const cut = Math.floor(values.length * 0.02);
    let low = starts[cut], high = ends[ends.length - 1 - cut];
    const reach = (high - low) * 0.12;
    for (const [a, b] of values) { if (a >= low - reach && b <= high + reach) { low = Math.min(low, a); high = Math.max(high, b); } }
    return [Math.max(0, low), Math.min(limit, high)] as const;
  };
  const [left, right] = span(good.map((word) => [word.x0, word.x1]), width);
  const [top, bottom] = span(good.map((word) => [word.y0, word.y1]), height);
  const marginX = (right - left) * 0.04, marginY = (bottom - top) * 0.04;
  const x = Math.max(0, Math.floor(left - marginX)), y = Math.max(0, Math.floor(top - marginY));
  const w = Math.min(width, Math.ceil(right + marginX)) - x, h = Math.min(height, Math.ceil(bottom + marginY)) - y;
  if (w < 50 || h < 50 || (w * h) / (width * height) > 0.72) return null;
  return { x, y, width: w, height: h };
}
