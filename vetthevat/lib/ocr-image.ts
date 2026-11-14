// Image clean-up before OCR, for phone photos of paper invoices.
//
// A photo has uneven light (shadow of the phone, a darker corner) and a
// coloured background. Plain contrast stretching turns the darker half of the
// page grey-on-grey and digits get misread ("154.99" as "164.99"). Dividing
// every pixel by the local paper brightness gives black text on even white
// paper everywhere on the page.

// In place, on RGBA pixels (canvas ImageData layout). Output is grey.
export function flattenLighting(pixels: Uint8ClampedArray, width: number, height: number) {
  const count = width * height;
  const gray = new Uint8Array(count);
  for (let i = 0, p = 0; i < count; i++, p += 4) gray[i] = (pixels[p] * 77 + pixels[p + 1] * 150 + pixels[p + 2] * 29) >> 8;

  // Paper brightness on a coarse grid: the brightest value in each cell (text
  // is darker than the paper around it), then smoothed over neighbours.
  const cell = Math.max(16, Math.round(Math.max(width, height) / 64));
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const paper = new Float32Array(cols * rows);
  const histogram = new Uint32Array(256);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    histogram.fill(0);
    let total = 0;
    const yEnd = Math.min(height, (cy + 1) * cell), xEnd = Math.min(width, (cx + 1) * cell);
    for (let y = cy * cell; y < yEnd; y += 2) for (let x = cx * cell, row = y * width; x < xEnd; x += 2) { histogram[gray[row + x]]++; total++; }
    // 90th percentile: ignores specks brighter than the paper.
    let seen = 0, level = 255;
    for (; level > 0; level--) { seen += histogram[level]; if (seen >= total * 0.1) break; }
    paper[cy * cols + cx] = Math.max(level, 40);
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
      const gx = Math.min(cols - 1, Math.max(0, (x + 0.5) / cell - 0.5)), x0 = Math.floor(gx), x1 = Math.min(cols - 1, x0 + 1), fx = gx - x0;
      const top = smooth[y0 * cols + x0] * (1 - fx) + smooth[y0 * cols + x1] * fx;
      const bottom = smooth[y1 * cols + x0] * (1 - fx) + smooth[y1 * cols + x1] * fx;
      const ratio = gray[y * width + x] / (top * (1 - fy) + bottom * fy);
      // 0.92 and above is paper; stretch the rest.
      const value = ratio >= 0.92 ? 255 : Math.max(0, Math.round(255 * Math.pow(ratio / 0.92, 1.6)));
      const p = (y * width + x) * 4;
      pixels[p] = pixels[p + 1] = pixels[p + 2] = value; pixels[p + 3] = 255;
    }
  }
}
