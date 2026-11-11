// "Copy and rotate": one rule repeated. Take the whole figure, copy it and turn the copy by an
// angle θ about a pivot; the union is the new figure. With the pivot at the end and θ = 90°
// this is how folding a strip of paper in two, again and again, makes the Heighway dragon.
// Pure module: the figure is a list of segments; the GPU draws the copies while they turn.

export const FLOATS = 6; // ax, ay, bx, by, t (palette position), w (0: width in pixels)

export const SEEDS = {
  segment: [[0, 0], [1, 0]],
  ell: [[0, 0], [1, 0], [1, 1]],
  zigzag: [[0, 0], [1, 0.6], [2, 0]],
  hook: [[0, 0], [1, 0], [1, 1], [0.5, 1]],
};

/** Figure from a polyline: segments, start and end. */
export function seedFigure(points) {
  const n = Math.max(1, points.length - 1);
  const data = new Float32Array(n * FLOATS);
  for (let i = 0; i < points.length - 1; i++) {
    data.set([points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], 0, 0], i * FLOATS);
  }
  return { data, count: points.length - 1, start: [...points[0]], end: [...points[points.length - 1]] };
}

/** Bounding box [minx, miny, maxx, maxy] of the segments. */
export function bounds(fig) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const d = fig.data;
  for (let i = 0; i < fig.count; i++) {
    const o = i * FLOATS;
    for (const j of [0, 2]) {
      const x = d[o + j], y = d[o + j + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

/**
 * The pivot of a generation. end/start: those points of the figure; center: middle of its box;
 * chain: the point about which the turn by θ takes the start onto the end, so each copy begins
 * where the previous one ends; custom: the point the user chose.
 */
export function pivotOf(fig, p, theta) {
  if (p.pivot === 'start') return fig.start;
  if (p.pivot === 'center') {
    const b = bounds(fig);
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }
  if (p.pivot === 'custom' && p.custom) return p.custom;
  if (p.pivot === 'chain') {
    // P = (E − e^{iθ}·S) / (1 − e^{iθ})
    const c = Math.cos(theta), s = Math.sin(theta);
    const [sx, sy] = fig.start, [ex, ey] = fig.end;
    const nx = ex - (c * sx - s * sy), ny = ey - (s * sx + c * sy);
    const dx = 1 - c, dy = -s;
    const den = dx * dx + dy * dy;
    if (den < 1e-12) return fig.end;
    return [(nx * dx + ny * dy) / den, (ny * dx - nx * dy) / den];
  }
  return fig.end;
}

/** Signed turn of a generation: θ, its direction, and the alternation on odd generations. */
export function turnOf(p, gen) {
  const dir = p.dir === 'cw' ? -1 : 1;
  const alt = p.alternate && gen % 2 === 1 ? -1 : 1;
  return ((p.angle * Math.PI) / 180) * dir * alt;
}

/** Applies rotation by a and scale s about (px, py) to a point. */
export function transformPoint([x, y], px, py, a, s) {
  const c = Math.cos(a) * s, n = Math.sin(a) * s;
  return [px + c * (x - px) - n * (y - py), py + n * (x - px) + c * (y - py)];
}

/**
 * One generation: the figure plus copies k = 1 … copies−1, each turned by k·turn and scaled by
 * scale^k about the pivot. Each copy is shifted along the palette by k·colorStep, so the colours
 * show which copy came from which. Returns the new figure.
 */
export function grow(fig, p, gen) {
  const n = p.copies;
  const turn = turnOf(p, gen);
  const [px, py] = pivotOf(fig, p, turn);
  const out = new Float32Array(fig.count * n * FLOATS);
  out.set(fig.data.subarray(0, fig.count * FLOATS));
  for (let k = 1; k < n; k++) {
    const a = k * turn, s = Math.pow(p.scale, k);
    const c = Math.cos(a) * s, sn = Math.sin(a) * s;
    const base = k * fig.count * FLOATS;
    const d = fig.data;
    for (let i = 0; i < fig.count; i++) {
      const o = i * FLOATS, q = base + o;
      const ax = d[o] - px, ay = d[o + 1] - py, bx = d[o + 2] - px, by = d[o + 3] - py;
      out[q] = px + c * ax - sn * ay;
      out[q + 1] = py + sn * ax + c * ay;
      out[q + 2] = px + c * bx - sn * by;
      out[q + 3] = py + sn * bx + c * by;
      out[q + 4] = d[o + 4] + k * p.colorStep;
      out[q + 5] = d[o + 5];
    }
  }
  // the new end: with the pivot at the end, the copy of the start (the strip folds over);
  // otherwise the copy of the end
  const last = n - 1, a = last * turn, s = Math.pow(p.scale, last);
  const end = transformPoint(p.pivot === 'end' ? fig.start : fig.end, px, py, a, s);
  return { data: out, count: fig.count * n, start: fig.start, end, pivot: [px, py], turn };
}

/** Box of the figure once its copies have finished turning (for the camera). */
export function grownBounds(fig, p, gen) {
  const n = p.copies;
  const turn = turnOf(p, gen);
  const [px, py] = pivotOf(fig, p, turn);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const d = fig.data;
  // a large figure is sampled: the box only frames the camera
  const stride = Math.max(1, Math.floor(fig.count / 20000));
  for (let k = 0; k < n; k++) {
    const a = k * turn, s = Math.pow(p.scale, k);
    const c = Math.cos(a) * s, sn = Math.sin(a) * s;
    for (let i = 0; i < fig.count; i += stride) {
      const o = i * FLOATS;
      for (const j of [0, 2]) {
        const x = d[o + j] - px, y = d[o + j + 1] - py;
        const X = px + c * x - sn * y, Y = py + sn * x + c * y;
        if (X < x0) x0 = X; if (X > x1) x1 = X;
        if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
    }
  }
  return [x0, y0, x1, y1];
}
