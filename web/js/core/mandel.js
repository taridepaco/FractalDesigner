// Mandelbrot maths that runs on the CPU, in doubles: the curated destinations, the reference
// orbit for perturbation and the choice of where the "drift" autopilot heads. Pure module.
//
// Perturbation: the GPU only has 32-bit floats, which run out at a zoom of about 10⁵. So one
// reference point C is iterated here in doubles, Z(n+1) = Z(n)² + C, and each pixel c = C + δc
// only iterates its difference δ(n+1) = 2·Z(n)·δ(n) + δ(n)² + δc, which stays small and keeps its
// relative precision in 32 bits. When |Z + δ| < |δ| the pixel is rebased onto the start of the
// reference orbit (Zhuoran's rebasing), so one reference is enough for the whole image. The
// limit is then the doubles of the centre: about 10¹³.

export const HOME = { x: -0.62, y: 0, h: 2.7 };
export const BAILOUT = 65536; // |z|² that counts as escaped (large, for smooth colouring)
export const MAX_DEPTH = 13;  // 10¹³: below that the centre itself is no longer a double

// Points of the boundary with detail all the way down: Misiurewicz points, found with Newton's
// method in doubles, and the classic Seahorse Valley point (Wikipedia's zoom sequence). Checked
// to keep detail at zooms of 10³, 10⁶, 10⁹ and 10¹².
export const DESTINATIONS = [
  { id: 'seahorse', x: -0.74364388703715867, y: 0.13182590420531201 },
  { id: 'elephant', x: 0.27504023814727152, y: 0.0059826830143918487 },
  { id: 'spiral', x: -0.77568376800905381, y: 0.13646736829469011 },
  { id: 'antenna', x: -1.7684806829471860, y: -0.0050975077682112145 },
  { id: 'triple', x: -0.069394468950620056, y: 0.65200307429717641 },
  { id: 'branch', x: -0.10109636384562219, y: 0.95628651080914151 },
  { id: 'dendrite', x: 0, y: 1 },
];

/** Iterations for a zoom level (relative to HOME), times a user multiplier. Rounded up to 64. */
export function maxIterations(zoom, mult = 1) {
  const raw = mult * (160 + 70 * Math.log2(Math.max(1, zoom)));
  return Math.min(50000, Math.max(64, Math.ceil(raw / 64) * 64));
}

/**
 * Reference orbit of c into out (pairs x, y; out must hold 2·(maxIter + 1) numbers): Z0 = 0, then
 * up to maxIter more, stopping after the first escaped value. Returns how many points it wrote.
 */
export function referenceOrbit(cx, cy, maxIter, out) {
  let zx = 0, zy = 0;
  out[0] = 0;
  out[1] = 0;
  let n = 1;
  for (let i = 0; i < maxIter; i++) {
    const x = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = x;
    out[2 * n] = zx;
    out[2 * n + 1] = zy;
    n++;
    if (zx * zx + zy * zy > BAILOUT) break;
  }
  return n;
}

/**
 * Picks the reference point among candidates [[x, y], ...]: the first one whose orbit lasts all
 * maxIter iterations, or else the one that lasts longest. Returns { x, y, length, orbit }.
 */
export function chooseReference(candidates, maxIter) {
  const size = 2 * (maxIter + 1);
  let best = null;
  let scratch = new Float32Array(size);
  for (const [x, y] of candidates) {
    const length = referenceOrbit(x, y, maxIter, scratch);
    if (!best || length > best.length) {
      best = { x, y, length, orbit: scratch };
      scratch = new Float32Array(size);
      if (length === maxIter + 1) break;
    }
  }
  return best;
}

/** Candidate reference points: the preferred ones, then a grid over the view. */
export function referenceCandidates(preferred, cx, cy, h, aspect, n = 5) {
  const out = [...preferred];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      out.push([cx + ((i + 0.5) / n - 0.5) * h * aspect, cy + ((j + 0.5) / n - 0.5) * h]);
    }
  }
  return out;
}

/**
 * Where the drift autopilot heads, from a small map of the view rendered by the GPU (RGBA8, rows
 * from the bottom): R and G hold the escape time as a fraction of the iterations in 16 bits, B
 * is 255 for points that escaped. Escaped points with the highest escape time are the closest to
 * the deep structure; the distance to the centre is penalised so the course stays steady.
 * Returns the pixel [x, y] (from the bottom-left) or null when nothing escaped.
 */
export function driftTarget(pixels, w, h) {
  let top = 0;
  for (let i = 0; i < w * h; i++) {
    if (pixels[i * 4 + 2] > 127) top = Math.max(top, pixels[i * 4] * 256 + pixels[i * 4 + 1]);
  }
  if (!top) return null;
  let best = null, bestScore = -Infinity;
  const half = Math.hypot(w, h) / 2;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (pixels[i + 2] < 128) continue;
      const mu = (pixels[i] * 256 + pixels[i + 1]) / top;
      const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) / half;
      const score = mu - 0.35 * d;
      if (score > bestScore) { bestScore = score; best = [x + 0.5, y + 0.5]; }
    }
  }
  return best;
}
