// The chaos game: a point jumps a fixed fraction of the way towards a target picked at random
// among the vertices of a polygon (and, optionally, the midpoints of its sides and its centre).
// Plotting every position draws a fractal out of noise: with a triangle and half way, Sierpinski.
// Restrictions on the choice (never the same vertex twice in a row, never a neighbour of the
// last one) give other figures. Pure module.

/** Regular polygon with n vertices on the unit circle: a vertex at the top, squares sit flat. */
export function polygon(n) {
  const out = [];
  const a0 = n === 4 ? Math.PI / 4 : Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * 2 * Math.PI) / n;
    out.push([Math.cos(a), Math.sin(a)]);
  }
  return out;
}

/** Targets: vertices, then midpoints of the sides, then the centre (as asked). */
export function targets(verts, { mid = false, center = false }) {
  const out = verts.map((v) => [...v]);
  if (mid) {
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
  }
  if (center) {
    let x = 0, y = 0;
    for (const v of verts) { x += v[0]; y += v[1]; }
    out.push([x / verts.length, y / verts.length]);
  }
  return out;
}

/**
 * A chaos game that remembers where it is. rule: 'free' | 'norepeat' (never the same target twice
 * in a row) | 'noneighbor' (never a vertex next to the last one). The restrictions apply to the
 * vertices; midpoints and the centre are always allowed.
 */
export class ChaosGame {
  constructor(pts, nVerts, ratio, rule, random = Math.random) {
    this.pts = pts;
    this.n = nVerts;
    this.ratio = ratio;
    this.rule = rule;
    this.random = random;
    this.x = 0;
    this.y = 0;
    this.last = -1;
    for (let i = 0; i < 30; i++) this.step(); // forget the start
  }

  pick() {
    const m = this.pts.length, n = this.n;
    for (let tries = 0; tries < 64; tries++) {
      const k = Math.floor(this.random() * m);
      if (k >= n || this.last < 0 || this.last >= n) return k;
      if (this.rule === 'norepeat' && k === this.last) continue;
      if (this.rule === 'noneighbor' && (k === (this.last + 1) % n || k === (this.last + n - 1) % n)) continue;
      return k;
    }
    return 0;
  }

  step() {
    const k = this.pick();
    const t = this.pts[k];
    this.x += (t[0] - this.x) * this.ratio;
    this.y += (t[1] - this.y) * this.ratio;
    this.last = k;
    return k;
  }

  /** Writes count points into out as x, y, target index. */
  run(out, count) {
    for (let i = 0; i < count; i++) {
      const k = this.step();
      out[i * 3] = this.x;
      out[i * 3 + 1] = this.y;
      out[i * 3 + 2] = k;
    }
  }
}
