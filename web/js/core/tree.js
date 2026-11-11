// Fractal trees: every branch forks into N shorter branches following one rule. The structure is
// built once (with a seeded random generator, so "another seed" gives a different tree of the same
// kind) and posed every frame, which is where growth, wind and gravity come in. Pure module.

export const MAX_BRANCHES = 40000;

/** Small seeded random generator (mulberry32): the same seed always gives the same tree. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deepest depth ≤ depth whose branch count stays under MAX_BRANCHES. */
export function effectiveDepth(depth, n) {
  let total = 0, level = 1, d = 0;
  while (d < depth && total + level <= MAX_BRANCHES) {
    total += level;
    level *= n;
    d++;
  }
  return Math.max(1, d);
}

/**
 * Builds the structure. p: shape ('branch' | 'squares'), depth, branches, spread (degrees),
 * asym (−0.5…0.5), ratio, thick, trunk (trunk width / trunk length), random (0…1), apical (0…1).
 * Each branch stores its parent, level, angle relative to the parent, length, width and where it
 * starts in its parent's frame (along, across, in parent lengths): (1, 0) is the parent's tip.
 */
export function buildTree(p, seed = 1) {
  const squares = p.shape === 'squares';
  const n = squares ? 2 : p.branches;
  const depth = effectiveDepth(p.depth, n);
  let count = 0;
  for (let d = 0, l = 1; d < depth; d++, l *= n) count += l;
  const t = {
    count, depth, squares,
    parent: new Int32Array(count), level: new Uint8Array(count),
    rel: new Float32Array(count), len: new Float32Array(count), width: new Float32Array(count),
    along: new Float32Array(count), across: new Float32Array(count), phase: new Float32Array(count),
  };
  const rand = rng(seed);
  const spread = (p.spread * Math.PI) / 180;
  t.parent[0] = -1;
  t.rel[0] = Math.PI / 2;
  t.len[0] = 1;
  t.width[0] = squares ? 1 : p.trunk;
  t.along[0] = 0;
  t.phase[0] = 0;
  let next = 1;
  for (let i = 0; i < count && next < count; i++) {
    if (t.level[i] >= depth - 1) continue;
    for (let j = 0; j < n; j++) {
      const c = next++;
      t.parent[c] = i;
      t.level[c] = t.level[i] + 1;
      t.phase[c] = rand() * Math.PI * 2;
      if (squares) {
        // Pythagoras tree: two squares on the legs of a right triangle with angle α on the left
        const a = Math.min(85, Math.max(5, p.spread / 2)) * (Math.PI / 180);
        const ca = Math.cos(a), sa = Math.sin(a);
        if (j === 0) {
          t.rel[c] = a;
          t.len[c] = t.len[i] * ca;
          t.along[c] = 1 + (ca * sa) / 2;
          t.across[c] = 0.5 - (ca * ca) / 2;
        } else {
          t.rel[c] = a - Math.PI / 2;
          t.len[c] = t.len[i] * sa;
          t.along[c] = 1 + (ca * sa) / 2;
          t.across[c] = -(ca * ca) / 2;
        }
        t.width[c] = t.len[c];
        continue;
      }
      let off = n === 1 ? 0 : -spread / 2 + (j * spread) / (n - 1);
      off *= off > 0 ? 1 + p.asym : 1 - p.asym;
      let mult = 1;
      if (p.apical > 0) mult = Math.abs(j - (n - 1) / 2) < 0.6 ? 1 + 0.6 * p.apical : 1 - 0.45 * p.apical;
      off += (rand() * 2 - 1) * p.random * 0.6;
      mult *= 1 + (rand() * 2 - 1) * p.random * 0.35;
      t.rel[c] = off;
      t.len[c] = t.len[i] * p.ratio * mult;
      t.width[c] = t.width[i] * p.thick;
      t.along[c] = 1;
      t.across[c] = 0;
    }
  }
  return t;
}

/**
 * Positions of every branch into out (6 floats each: ax, ay, bx, by, t, w), for a moment:
 * grown (0…depth levels grown), wind (0…1), gravity (−1…1), time (s).
 * Returns the box [minx, miny, maxx, maxy] of the drawn branches.
 */
export function poseTree(t, out, { grown = Infinity, wind = 0, gravity = 0, time = 0 }) {
  const abs = poseTree.abs && poseTree.abs.length >= t.count ? poseTree.abs : (poseTree.abs = new Float32Array(t.count));
  const tx = poseTree.tx && poseTree.tx.length >= t.count ? poseTree.tx : (poseTree.tx = new Float32Array(t.count));
  const ty = poseTree.ty && poseTree.ty.length >= t.count ? poseTree.ty : (poseTree.ty = new Float32Array(t.count));
  const dl = poseTree.dl && poseTree.dl.length >= t.count ? poseTree.dl : (poseTree.dl = new Float32Array(t.count));
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
  const gust = 0.65 + 0.35 * Math.sin(time * 0.37);
  for (let i = 0; i < t.count; i++) {
    const lv = t.level[i];
    const f = Math.min(1, Math.max(0, grown - lv));
    const g = f * f * (3 - 2 * f);
    let a, bx, by;
    if (i === 0) {
      a = t.rel[0];
      bx = 0;
      by = 0;
    } else {
      const p = t.parent[i];
      const pa = abs[p], pl = dl[p];
      // start: (along, across) in the parent's frame, scaled by how much of the parent is drawn
      const ca = Math.cos(pa), sa = Math.sin(pa);
      const al = t.along[i] * pl, ac = t.across[i] * pl;
      const px = tx[p] - ca * pl, py = ty[p] - sa * pl; // parent's start
      bx = px + ca * al - sa * ac;
      by = py + sa * al + ca * ac;
      a = pa + t.rel[i];
      const depthShare = lv / Math.max(1, t.depth - 1);
      if (wind) a += wind * 0.16 * depthShare * gust * Math.sin(time * 1.7 - lv * 0.55 + t.phase[i] * 0.35);
      if (gravity) a -= gravity * 0.22 * depthShare * Math.cos(a);
    }
    const len = t.len[i] * g;
    abs[i] = a;
    dl[i] = len;
    const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
    tx[i] = ex;
    ty[i] = ey;
    const o = i * 6;
    out[o] = bx; out[o + 1] = by; out[o + 2] = ex; out[o + 3] = ey;
    out[o + 4] = (0.72 * lv) / Math.max(1, t.depth);
    out[o + 5] = t.width[i] * (t.squares ? g : Math.max(g, 0.15));
    if (f > 0) {
      const hw = t.squares ? t.width[i] * 0.75 : 0;
      if (ex - hw < x0) x0 = ex - hw; if (ex + hw > x1) x1 = ex + hw;
      if (ey - hw < y0) y0 = ey - hw; if (ey + hw > y1) y1 = ey + hw;
      if (bx - hw < x0) x0 = bx - hw; if (bx + hw > x1) x1 = bx + hw;
    }
  }
  return [x0, y0, x1, y1];
}

/** Tips of the last level (for leaves and flowers): indices of branches without children. */
export function leafIndices(t) {
  const out = [];
  for (let i = 0; i < t.count; i++) if (t.level[i] === t.depth - 1) out.push(i);
  return out;
}
