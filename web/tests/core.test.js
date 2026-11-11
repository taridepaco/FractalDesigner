// Tests of the pure modules (the maths that runs on the CPU). Run with: deploy/test.sh (or npm test)
// web/tests/ is not published (see deploy/build.sh).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseHash, formatHash, fmtNumber, readParams, changedParams, defaults } from '../js/core/state.js';
import { maxIterations, referenceOrbit, chooseReference, driftTarget, DESTINATIONS, BAILOUT } from '../js/core/mandel.js';
import { seedFigure, grow, pivotOf, SEEDS, FLOATS } from '../js/core/dragon.js';
import { buildTree, poseTree, effectiveDepth, MAX_BRANCHES } from '../js/core/tree.js';
import { PRESETS, parseRules, expand, turtle } from '../js/core/lsystem.js';
import { polygon, targets, ChaosGame } from '../js/core/chaos.js';
import { gradientPixels, PALETTE_IDS, paletteStops } from '../js/core/palettes.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---- URL state ------------------------------------------------------------
test('hash round trip keeps tab, numbers and text', () => {
  const h = formatHash('mandelbrot', [['x', -0.7436438870371587], ['y', 0.131825904205312], ['palette', 'mar'], ['rules', 'A=+BF-AFA-FB+; B=-AF']]);
  const { tab, values } = parseHash(h);
  assert.equal(tab, 'mandelbrot');
  assert.equal(+values.x, -0.7436438870371587);
  assert.equal(+values.y, 0.131825904205312);
  assert.equal(values.palette, 'mar');
  assert.equal(values.rules, 'A=+BF-AFA-FB+; B=-AF');
});

test('numbers in links read back as the same double', () => {
  for (const v of [0.1, -1.7684806829471860, 1 / 3, 2.7e-13, 123456789.123]) assert.equal(+fmtNumber(v), v);
  assert.equal(fmtNumber(0.5), '0.5');
});

test('link parameters are typed, clamped and checked against the schema', () => {
  const schema = [
    { key: 'speed', type: 'range', min: 1, max: 3, def: 1.5 },
    { key: 'mode', type: 'modes', def: 'a', options: [{ v: 'a' }, { v: 'b' }] },
    { key: 'on', type: 'modes', def: true, options: [{ v: true }, { v: false }] },
    { key: 'pal', type: 'select', def: 'x', options: () => [{ v: 'x' }, { v: 'y' }] },
  ];
  assert.deepEqual(readParams(schema, { speed: '9', mode: 'zzz', on: 'false', pal: 'y', other: '1' }), { speed: 3, on: false, pal: 'y' });
  const v = { ...defaults(schema), speed: 2 };
  assert.deepEqual(changedParams(schema, v), [['speed', '2']]);
});

// ---- Mandelbrot -------------------------------------------------------------
test('iterations grow with the zoom, in steps of 64', () => {
  let last = 0;
  for (const z of [1, 1e3, 1e6, 1e9, 1e13]) {
    const n = maxIterations(z);
    assert.equal(n % 64, 0);
    assert.ok(n > last);
    last = n;
  }
});

test('reference orbits: inside points last, outside points stop after escaping', () => {
  const out = new Float32Array(2 * 101);
  assert.equal(referenceOrbit(-1, 0, 100, out), 101); // period 2: 0, -1, 0, -1 …
  assert.deepEqual([out[2], out[3], out[4], out[5]], [-1, 0, 0, 0]);
  const n = referenceOrbit(2, 0, 100, out); // 0, 2, 6, 38, 1446 → escaped
  assert.equal(n, 5);
  assert.ok(out[2 * 4] ** 2 > BAILOUT);
  const best = chooseReference([[2, 0], [0.5, 0], [-0.5, 0]], 100);
  assert.deepEqual([best.x, best.y, best.length], [-0.5, 0, 101]);
});

test('the destinations stay bounded (they lie on the boundary of the set)', () => {
  for (const d of DESTINATIONS) {
    let zx = 0, zy = 0, bounded = true;
    for (let i = 0; i < 60; i++) {
      [zx, zy] = [zx * zx - zy * zy + d.x, 2 * zx * zy + d.y];
      if (zx * zx + zy * zy > 4) { bounded = false; break; }
    }
    assert.ok(bounded, d.id);
  }
});

test('drift heads to the escaped point with the highest escape time, near the centre', () => {
  const w = 16, h = 16, px = new Uint8Array(w * h * 4);
  const set = (x, y, v) => { const i = (y * w + x) * 4; px[i] = v >> 8; px[i + 1] = v & 255; px[i + 2] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, 100);
  set(9, 7, 900);
  set(1, 1, 1000); // a bit higher but in the border: ignored
  assert.deepEqual(driftTarget(px, w, h), [9.5, 7.5]);
  assert.equal(driftTarget(new Uint8Array(w * h * 4), w, h), null);
});

// ---- copy and rotate ----------------------------------------------------------
/** The segments of a figure as a sorted list of "x1,y1 x2,y2" (rounded, direction ignored). */
const segSet = (fig) => {
  const out = [];
  for (let i = 0; i < fig.count; i++) {
    const d = fig.data.subarray(i * FLOATS, i * FLOATS + 4);
    const a = `${Math.round(d[0])},${Math.round(d[1])}`, b = `${Math.round(d[2])},${Math.round(d[3])}`;
    out.push(a < b ? `${a} ${b}` : `${b} ${a}`);
  }
  return out.sort();
};
/** Segments of the path that starts at (0, 0) heading east and turns as told (R, L or S). */
const walk = (turnsText) => {
  let x = 0, y = 0, dx = 1, dy = 0;
  const pts = [[0, 0]];
  for (const t of `S${turnsText}`) {
    if (t === 'R') [dx, dy] = [dy, -dx];
    if (t === 'L') [dx, dy] = [-dy, dx];
    x += dx; y += dy;
    pts.push([x, y]);
  }
  const fig = seedFigure(pts);
  return segSet(fig);
};
const dragon = { copies: 2, angle: 90, dir: 'ccw', alternate: false, pivot: 'end', scale: 1, colorStep: 0.1 };

test('Heighway dragon: 2^n segments along the paper folding sequence', () => {
  let fig = seedFigure(SEEDS.segment);
  for (let g = 0; g < 3; g++) fig = grow(fig, dragon, g);
  assert.equal(fig.count, 8);
  assert.deepEqual(segSet(fig), walk('RRLRRLL'));
  assert.ok(close(fig.end[0], -2) && close(fig.end[1], -2), `end ${fig.end}`);
});

test('chained pivot: the turn takes the start onto the end (Lévy C curve)', () => {
  const p = { ...dragon, dir: 'cw', pivot: 'chain' };
  let fig = seedFigure(SEEDS.segment);
  const [px, py] = pivotOf(fig, p, -Math.PI / 2);
  assert.ok(close(px, 0.5) && close(py, -0.5));
  fig = grow(fig, p, 0);
  fig = grow(fig, p, 1);
  assert.deepEqual(segSet(fig), walk('RSR')); // the ⊓ shape: east, south, south, west
  assert.ok(close(fig.end[0], 0) && close(fig.end[1], -2));
});

test('each copy is shifted along the palette', () => {
  const fig = grow(seedFigure(SEEDS.segment), { ...dragon, copies: 3 }, 0);
  assert.deepEqual([...fig.data.filter((_, i) => i % FLOATS === 4)].map((v) => +v.toFixed(3)), [0, 0.1, 0.2]);
});

// ---- trees ----------------------------------------------------------------------
const treeP = { shape: 'branch', depth: 11, branches: 2, spread: 50, asym: 0, ratio: 0.7, thick: 0.7, trunk: 0.1, random: 0, apical: 0 };

test('a binary tree of depth 11 has 2047 branches; deep bushes are capped', () => {
  assert.equal(buildTree(treeP).count, 2047);
  const bush = buildTree({ ...treeP, branches: 5, depth: 14 });
  assert.ok(bush.count <= MAX_BRANCHES);
  assert.equal(bush.depth, effectiveDepth(14, 5));
});

test('trunk from (0, 0) to (0, 1); symmetric tree has a symmetric box', () => {
  const t = buildTree(treeP);
  const out = new Float32Array(t.count * 6);
  const [x0, , x1] = poseTree(t, out, {});
  assert.ok(close(out[0], 0) && close(out[1], 0) && close(out[2], 0, 1e-6) && close(out[3], 1, 1e-6));
  assert.ok(close(x0, -x1, 1e-4));
});

test('Pythagoras tree: the two squares have sides cos α and sin α', () => {
  const t = buildTree({ ...treeP, shape: 'squares', spread: 60, depth: 2 });
  assert.ok(close(t.len[1], Math.cos(Math.PI / 6), 1e-6) && close(t.len[2], Math.sin(Math.PI / 6), 1e-6));
});

// ---- L-systems --------------------------------------------------------------------
test('Koch snowflake: 3·4^n segments and a closed curve', () => {
  const k = PRESETS.koch;
  const { text } = expand(k.axiom, parseRules(k.rules), 3, k.draw);
  const c = turtle(text, k.angle, k.draw);
  assert.equal(c.count, 3 * 4 ** 3);
  const last = c.data.subarray((c.count - 1) * 6);
  assert.ok(close(last[2], 0, 1e-3) && close(last[3], 0, 1e-3));
});

test('Hilbert curve visits every cell of the grid once', () => {
  const p = PRESETS.hilbert;
  const { text } = expand(p.axiom, parseRules(p.rules), 4, p.draw);
  const c = turtle(text, p.angle, p.draw);
  assert.equal(c.count, 4 ** 4 - 1);
  const seen = new Set(['0,0']);
  for (let i = 0; i < c.count; i++) seen.add(`${Math.round(c.data[i * 6 + 2])},${Math.round(c.data[i * 6 + 3])}`);
  assert.equal(seen.size, 4 ** 4);
});

test('rules parse and the expansion stops before it gets too big', () => {
  assert.deepEqual([...parseRules('A=+BF; B = -AF ;bad')], [['A', '+BF'], ['B', '-AF']]);
  const { iter } = expand('F', parseRules('F=FF'), 30, 'F', 1000);
  assert.equal(iter, 9); // 2^9 = 512 ≤ 1000 < 2^10
});

// ---- chaos game ---------------------------------------------------------------------
test('chaos game: points stay in the triangle and the rules are kept', () => {
  const tri = polygon(3);
  const g = new ChaosGame(targets(tri, {}), 3, 0.5, 'free');
  const out = new Float32Array(3000);
  g.run(out, 1000);
  for (let i = 0; i < 1000; i++) {
    const x = out[i * 3], y = out[i * 3 + 1];
    assert.ok(y <= 1 + 1e-9 && y >= -0.5 - 1e-9 && Math.abs(x) <= (1 - y) / Math.sqrt(3) + 1e-9);
  }
  const sq = polygon(4);
  for (const rule of ['norepeat', 'noneighbor']) {
    const game = new ChaosGame(targets(sq, {}), 4, 0.5, rule);
    let last = game.last;
    for (let i = 0; i < 2000; i++) {
      const k = game.step();
      if (rule === 'norepeat') assert.notEqual(k, last);
      else assert.ok(k !== (last + 1) % 4 && k !== (last + 3) % 4);
      last = k;
    }
  }
  assert.equal(targets(sq, { mid: true, center: true }).length, 9);
});

// ---- palettes -----------------------------------------------------------------------
test('palettes: 256 opaque pixels starting at the first stop', () => {
  for (const id of PALETTE_IDS) {
    const stops = paletteStops(id);
    const px = gradientPixels(stops);
    assert.equal(px.length, 256 * 4);
    const first = parseInt(stops[0].slice(1), 16);
    assert.deepEqual([px[0], px[1], px[2], px[3]], [first >> 16, (first >> 8) & 255, first & 255, 255]);
  }
});
