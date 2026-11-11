// Fractal trees: each branch forks into N shorter branches. The tree grows on screen, sways in the
// wind (more in the thin branches, a little later at each level) and bends with gravity. Drag the
// tip of a first-level branch to change the angle and the length ratio of the whole tree.
import { SegmentBatch } from '../draw.js';
import { viewMatrix } from '../gl.js';
import { buildTree, poseTree, leafIndices } from '../core/tree.js';
import { ISLAND } from '../core/palettes.js';
import { hexToRgb } from '../gl.js';
import { paletteParam, cycleParam, yesNo, deg, pct, presetFromLink } from '../schema.js';
import { num } from '../i18n.js';

const PRESETS = {
  classic: { shape: 'branch', depth: 11, branches: 2, spread: 50, asym: 0, ratio: 0.72, thick: 0.7, trunk: 0.12, random: 0, gravity: 0, apical: 0, leaves: false },
  pythagoras: { shape: 'squares', depth: 11, branches: 2, spread: 90, asym: 0, ratio: 0.71, thick: 0.7, trunk: 0.12, random: 0, gravity: 0, apical: 0, leaves: false },
  htree: { shape: 'branch', depth: 12, branches: 2, spread: 180, asym: 0, ratio: 0.71, thick: 0.75, trunk: 0.06, random: 0, gravity: 0, apical: 0, leaves: false },
  willow: { shape: 'branch', depth: 10, branches: 2, spread: 40, asym: 0, ratio: 0.8, thick: 0.68, trunk: 0.1, random: 0.25, gravity: 0.9, apical: 0, leaves: true },
  pine: { shape: 'branch', depth: 9, branches: 3, spread: 110, asym: 0, ratio: 0.62, thick: 0.65, trunk: 0.09, random: 0.1, gravity: 0.35, apical: 0.8, leaves: false },
  baobab: { shape: 'branch', depth: 8, branches: 3, spread: 120, asym: 0, ratio: 0.6, thick: 0.55, trunk: 0.38, random: 0.15, gravity: -0.2, apical: 0, leaves: true },
  coral: { shape: 'branch', depth: 9, branches: 3, spread: 75, asym: 0.1, ratio: 0.7, thick: 0.75, trunk: 0.15, random: 0.6, gravity: -0.4, apical: 0, leaves: false },
};
const PRESET_IDS = Object.keys(PRESETS);
const STRUCTURE = ['shape', 'depth', 'branches', 'spread', 'asym', 'ratio', 'thick', 'trunk', 'random', 'apical'];

const schema = [
  { key: 'preset', type: 'select', group: 'g.tree', label: 'preset', def: 'classic', options: PRESET_IDS.map((k) => ({ v: k, k: `tp.${k}` })) },
  { key: 'shape', type: 'modes', group: 'g.tree', label: 'shape', def: 'branch', options: [{ v: 'branch', k: 'shape.branch' }, { v: 'squares', k: 'shape.squares' }] },
  { key: 'depth', type: 'range', group: 'g.tree', label: 'tdepth', min: 1, max: 14, step: 1, def: 11 },
  { key: 'branches', type: 'range', group: 'g.tree', label: 'branches', min: 2, max: 5, step: 1, def: 2, when: (v) => v.shape === 'branch' },
  { key: 'spread', type: 'range', group: 'g.tree', label: 'spread', min: 0, max: 180, step: 1, def: 50, fmt: deg },
  { key: 'asym', type: 'range', group: 'g.tree', label: 'asym', min: -0.5, max: 0.5, step: 0.01, def: 0, fmt: pct, when: (v) => v.shape === 'branch' },
  { key: 'ratio', type: 'range', group: 'g.tree', label: 'ratio', min: 0.5, max: 0.85, step: 0.01, def: 0.72, fmt: (v) => num(v, 2), when: (v) => v.shape === 'branch' },
  { key: 'thick', type: 'range', group: 'g.tree', label: 'thick', min: 0.5, max: 0.9, step: 0.01, def: 0.7, fmt: (v) => num(v, 2), when: (v) => v.shape === 'branch' },
  { key: 'trunk', type: 'range', group: 'g.tree', label: 'trunk', min: 0.03, max: 0.4, step: 0.01, def: 0.12, fmt: (v) => num(v, 2), when: (v) => v.shape === 'branch' },
  { key: 'apical', type: 'range', group: 'g.tree', label: 'apical', min: 0, max: 1, step: 0.01, def: 0, fmt: pct, when: (v) => v.shape === 'branch' },
  { key: 'random', type: 'range', group: 'g.tree', label: 'random', min: 0, max: 1, step: 0.01, def: 0, fmt: pct },
  { key: 'gravity', type: 'range', group: 'g.tree', label: 'gravity', min: -1, max: 1, step: 0.01, def: 0, fmt: (v) => num(v, 2) },
  { key: 'leaves', type: 'modes', group: 'g.tree', label: 'leaves', def: false, options: yesNo },
  { type: 'buttons', group: 'g.tree', items: [{ act: 'reseed', k: 'reseed', title: 't.reseed', wide: true }] },
  { key: 'wind', type: 'range', group: 'g.anim', label: 'wind', min: 0, max: 1, step: 0.01, def: 0.35, fmt: pct },
  { key: 'pace', type: 'range', group: 'g.anim', label: 'pace', min: 0.25, max: 4, step: 0.05, log: true, def: 1, fmt: (v) => `×${num(v, 2)}` },
  paletteParam('bosque'),
  cycleParam(0),
];

const texts = {
  es: {
    'tab.tree': 'Árbol',
    'pitch.tree': 'Cada rama se bifurca en ramas más cortas siguiendo una regla. El árbol crece y se mece; arrastra la punta de una de las primeras ramas para cambiar todo el árbol.',
    'g.tree': 'Árbol', 'g.anim': 'Animación',
    shape: 'Forma', 'shape.branch': 'Ramas', 'shape.squares': 'Cuadrados',
    tdepth: 'Profundidad', branches: 'Ramas por nudo', spread: 'Ángulo de apertura', asym: 'Asimetría',
    ratio: 'Ratio de longitud', thick: 'Ratio de grosor', trunk: 'Grosor del tronco', apical: 'Eje dominante',
    random: 'Aleatoriedad', gravity: 'Gravedad / luz', leaves: 'Flores en las puntas', wind: 'Viento', pace: 'Ritmo',
    reseed: 'Otra semilla', 't.reseed': 'Mismo estilo, otro árbol (necesita aleatoriedad)',
    'tp.classic': 'Binario clásico', 'tp.pythagoras': 'Árbol de Pitágoras', 'tp.htree': 'Árbol H', 'tp.willow': 'Sauce',
    'tp.pine': 'Pino', 'tp.baobab': 'Baobab', 'tp.coral': 'Coral',
    brs: 'ramas', 'k.tip': 'Arrastrar una punta', 'h.tip': 'cambiar ángulo y ratio de las primeras ramas',
  },
  en: {
    'tab.tree': 'Tree',
    'pitch.tree': 'Each branch forks into shorter branches following one rule. The tree grows and sways; drag the tip of one of the first branches to change the whole tree.',
    'g.tree': 'Tree', 'g.anim': 'Animation',
    shape: 'Shape', 'shape.branch': 'Branches', 'shape.squares': 'Squares',
    tdepth: 'Depth', branches: 'Branches per fork', spread: 'Spread angle', asym: 'Asymmetry',
    ratio: 'Length ratio', thick: 'Width ratio', trunk: 'Trunk width', apical: 'Leading shoot',
    random: 'Randomness', gravity: 'Gravity / light', leaves: 'Flowers at the tips', wind: 'Wind', pace: 'Pace',
    reseed: 'Another seed', 't.reseed': 'Same style, another tree (needs randomness)',
    'tp.classic': 'Classic binary', 'tp.pythagoras': 'Pythagoras tree', 'tp.htree': 'H tree', 'tp.willow': 'Willow',
    'tp.pine': 'Pine', 'tp.baobab': 'Baobab', 'tp.coral': 'Coral',
    brs: 'branches', 'k.tip': 'Drag a tip', 'h.tip': 'change angle and ratio of the first branches',
  },
};

function create(ctx, values) {
  const { gl, camera, palette, colors } = ctx;
  const batch = new SegmentBatch(gl);
  const leafBatch = new SegmentBatch(gl);
  let seed = 1 + Math.floor(Math.random() * 1e6);
  let tree = null, leaves = [], data = null, leafData = null;
  let levelStart = [];
  let grown = 0;      // levels grown so far
  let hold = 0;       // seconds shown fully grown
  let time = 0;
  let shift = 0;
  let target = null;
  let drag = null;
  let box = [0, 0, 0, 0];

  function build() {
    tree = buildTree(values, seed);
    data = new Float32Array(tree.count * 6);
    leaves = values.leaves && !tree.squares ? leafIndices(tree) : [];
    leafData = new Float32Array(leaves.length * 6);
    levelStart = [];
    for (let i = 0; i < tree.count; i++) if (levelStart[tree.level[i]] === undefined) levelStart[tree.level[i]] = i;
    levelStart[tree.depth] = tree.count;
    // the camera frames the grown tree, without wind
    target = frame(poseTree(tree, data, { grown: Infinity, gravity: values.gravity }));
  }

  function frame([x0, y0, x1, y1]) {
    const aspect = camera.width / camera.height;
    const pad = values.shape === 'squares' ? 0.6 : 0.2;
    x0 -= pad; x1 += pad; y0 = Math.min(y0, 0) - pad; y1 += pad;
    const h = Math.max(y1 - y0, (x1 - x0) / aspect) * 1.08;
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, h, r: 0 };
  }

  function regrow(newSeed = false) {
    if (newSeed) seed = 1 + Math.floor(Math.random() * 1e6);
    build();
    grown = 0;
    hold = 0;
    camera.set(target);
    ctx.redraw();
  }

  function applyPreset(id) {
    Object.assign(values, PRESETS[id]);
    values.preset = id;
    ctx.setParam('preset', id);
    regrow(true);
  }

  return {
    limits: { minH: 1e-3, maxH: 500 },
    home: () => (target ? { ...target } : { x: 0, y: 2, h: 5, r: 0 }),
    enter() { if (!tree) regrow(); },
    leave() {},

    param(key) {
      if (key === 'preset') applyPreset(values.preset);
      else if (STRUCTURE.includes(key) || key === 'leaves') { build(); ctx.redraw(); }
      else if (key === 'gravity') { target = frame(poseTree(tree, data, { grown: Infinity, gravity: values.gravity })); }
    },
    action(act) { if (act === 'reseed') ctx.fade(() => regrow(true)); },
    next() {
      ctx.fade(() => {
        if (values.random > 0.05 && Math.random() < 0.5) regrow(true);
        else applyPreset(PRESET_IDS[(PRESET_IDS.indexOf(values.preset) + 1) % PRESET_IDS.length]);
      });
    },
    fit() { if (target) camera.flyTo(target); },

    update(dt, s) {
      let changed = false;
      if (s.running) {
        time += dt;
        if (values.wind > 0) changed = true;
        if (values.cycle > 0) { shift = (shift + (values.cycle / 60) * dt) % 1; changed = true; }
      }
      if (s.auto && tree) {
        if (grown < tree.depth) {
          grown = Math.min(tree.depth, grown + dt * values.pace * Math.max(1.2, tree.depth / 4.5));
        } else {
          hold += dt * values.pace;
          if (hold > 12 && hold - dt * values.pace <= 12) this.next();
        }
        camera.follow(target, dt, 1.2);
        changed = true;
      }
      return changed;
    },

    render() {
      gl.clearColor(...colors.surfaceRgb, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!tree) return;
      box = poseTree(tree, data, { grown: drag ? Infinity : grown, wind: values.wind, gravity: values.gravity, time });
      const g = drag ? tree.depth : grown;
      const count = levelStart[Math.min(tree.depth, Math.ceil(g))] ?? tree.count;
      batch.set(data, count);
      const view = viewMatrix(camera, camera.width, camera.height);
      const dpr = camera.width / (ctx.canvas.clientWidth || 1);
      const base = { view, res: [camera.width, camera.height], scale: camera.k, palette, minPx: 1 * dpr, tShift: shift };
      batch.draw({ ...base, cap: tree.squares ? 0 : 1 });
      // flowers at the tips, once the last level is out
      const bloom = Math.min(1, Math.max(0, g - (tree.depth - 1)));
      if (leaves.length && bloom > 0) {
        for (let i = 0; i < leaves.length; i++) {
          const o = leaves[i] * 6;
          const x = data[o + 2], y = data[o + 3];
          leafData.set([x, y, x, y, 0, tree.len[leaves[i]] * 0.9 * bloom], i * 6);
        }
        leafBatch.set(leafData, leaves.length);
        leafBatch.draw({ ...base, minPx: 2 * dpr, solid: hexToRgb(ISLAND.flor) });
      }
    },

    pointerDown(info) {
      if (!tree || tree.squares || tree.depth < 2) return false;
      const dpr = camera.width / (ctx.canvas.clientWidth || 1);
      // tips of the branches of the first level
      for (let i = levelStart[1]; i < (levelStart[2] ?? tree.count); i++) {
        const [sx, sy] = camera.toScreen(data[i * 6 + 2], data[i * 6 + 3]);
        if (Math.hypot(sx - info.px, sy - info.py) < 24 * dpr) {
          drag = { side: Math.sign(tree.rel[i]) || 1 };
          return true;
        }
      }
      return false;
    },
    pointerMove(info) {
      if (!drag) return;
      // the trunk goes from (0, 0) to (0, 1) when nothing bends it
      const vx = info.wx, vy = info.wy - 1;
      const ang = Math.atan2(vx, vy); // from straight up
      values.spread = Math.round(Math.min(180, Math.max(0, (Math.abs(ang) * 2 * 180) / Math.PI)));
      values.ratio = Math.min(0.85, Math.max(0.5, Math.hypot(vx, vy)));
      build();
      ctx.setParam('spread', values.spread);
    },
    pointerUp() { drag = null; },

    linkState: () => [['seed', seed]],
    readLink(raw) {
      presetFromLink(values, raw, PRESETS);
      const s = parseInt(raw.seed, 10);
      if (s > 0) seed = s;
    },

    stats() {
      const shown = tree ? (levelStart[Math.min(tree.depth, Math.ceil(grown))] ?? tree.count) : 0;
      return `${num(shown)} ${ctx.t('brs')} · ${num(Math.min(grown, tree ? tree.depth : 0), 1)}/${tree ? tree.depth : 0}`;
    },
  };
}

export default { id: 'tree', schema, texts, create, keys: [['k.tip', 'h.tip']] };
