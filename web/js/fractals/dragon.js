// Copy and rotate: fractals that unfold. Every generation the whole figure is copied and the copy
// turns by θ about a pivot, born on top of the original and opening like a folded sheet of paper.
// The camera frames the box the generation will end in, so it never jerks.
import { SegmentBatch } from '../draw.js';
import { viewMatrix, rotationAbout, mul3, IDENTITY } from '../gl.js';
import { SEEDS, seedFigure, grow, grownBounds, pivotOf, turnOf, bounds } from '../core/dragon.js';
import { paletteParam, cycleParam, yesNo, deg, presetFromLink } from '../schema.js';
import { num } from '../i18n.js';

const MAX_SEGMENTS = 300000;
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

const PRESETS = {
  heighway: { seed: 'segment', copies: 2, angle: 90, dir: 'ccw', pivot: 'end', alternate: false, scale: 1, sym: 1 },
  twin: { seed: 'segment', copies: 2, angle: 90, dir: 'ccw', pivot: 'end', alternate: false, scale: 1, sym: 2 },
  four: { seed: 'segment', copies: 2, angle: 90, dir: 'ccw', pivot: 'end', alternate: false, scale: 1, sym: 4 },
  levy: { seed: 'segment', copies: 2, angle: 90, dir: 'cw', pivot: 'chain', alternate: false, scale: 1, sym: 1 },
  folds: { seed: 'segment', copies: 2, angle: 90, dir: 'ccw', pivot: 'end', alternate: true, scale: 1, sym: 1 },
  tripod: { seed: 'segment', copies: 3, angle: 120, dir: 'ccw', pivot: 'end', alternate: false, scale: 1, sym: 1 },
  cross: { seed: 'segment', copies: 3, angle: 90, dir: 'ccw', pivot: 'end', alternate: false, scale: 1, sym: 1 },
};
const PRESET_IDS = Object.keys(PRESETS);

const schema = [
  { key: 'preset', type: 'select', group: 'g.rule', label: 'preset', def: 'heighway', options: PRESET_IDS.map((k) => ({ v: k, k: `dp.${k}` })) },
  { key: 'copies', type: 'range', group: 'g.rule', label: 'copies', min: 2, max: 4, step: 1, def: 2 },
  { key: 'angle', type: 'range', group: 'g.rule', label: 'angle', min: 0, max: 180, step: 1, def: 90, fmt: deg },
  { key: 'dir', type: 'modes', group: 'g.rule', label: 'dir', def: 'ccw', options: [{ v: 'ccw', k: 'dir.ccw' }, { v: 'cw', k: 'dir.cw' }] },
  { key: 'alternate', type: 'modes', group: 'g.rule', label: 'alternate', def: false, options: yesNo },
  { key: 'pivot', type: 'select', group: 'g.rule', label: 'pivot', def: 'end',
    options: ['end', 'start', 'center', 'chain', 'custom'].map((v) => ({ v, k: `pv.${v}` })) },
  { key: 'scale', type: 'range', group: 'g.rule', label: 'scale', min: 0.5, max: 1, step: 0.01, def: 1, fmt: (v) => `×${num(v, 2)}` },
  { key: 'seed', type: 'select', group: 'g.seed', label: 'seed', def: 'segment',
    options: [...Object.keys(SEEDS), 'drawn'].map((v) => ({ v, k: `seed.${v}` })) },
  { type: 'buttons', group: 'g.seed', items: [{ act: 'draw', k: 'draw', title: 't.draw' }, { act: 'pickPivot', k: 'pickPivot', title: 't.pickPivot' }] },
  { type: 'hint', group: 'g.seed', k: 'h.draw' },
  { key: 'sym', type: 'range', group: 'g.view', label: 'sym', min: 1, max: 4, step: 1, def: 1 },
  { key: 'gens', type: 'range', group: 'g.view', label: 'gens', min: 4, max: 20, step: 1, def: 18 },
  { key: 'pace', type: 'range', group: 'g.view', label: 'pace', min: 0.25, max: 4, step: 0.05, log: true, def: 1, fmt: (v) => `×${num(v, 2)}` },
  paletteParam('isla'),
  cycleParam(0),
  { key: 'colorStep', type: 'range', group: 'g.color', label: 'colorStep', min: 0, max: 0.5, step: 0.01, def: 0.07, fmt: (v) => num(v, 2) },
  { key: 'width', type: 'range', group: 'g.color', label: 'width', min: 0.5, max: 4, step: 0.25, def: 1.5, fmt: (v) => `${num(v, 2)} px` },
];

const texts = {
  es: {
    'tab.dragon': 'Dragón',
    'pitch.dragon': 'Una sola regla repetida: copia la figura entera y gira la copia alrededor de un pivote. Así, doblando una tira de papel una y otra vez, sale el dragón.',
    'g.rule': 'Regla', 'g.seed': 'Semilla y pivote', 'g.view': 'Generaciones',
    copies: 'Copias', angle: 'Ángulo', dir: 'Sentido', 'dir.ccw': 'Antihorario', 'dir.cw': 'Horario',
    alternate: 'Alternar el sentido', pivot: 'Pivote', scale: 'Escala de cada copia',
    'pv.end': 'Extremo final', 'pv.start': 'Inicio', 'pv.center': 'Centro de la figura', 'pv.chain': 'Encadenado', 'pv.custom': 'El que elijas',
    seed: 'Semilla', 'seed.segment': 'Segmento', 'seed.ell': 'Ángulo en L', 'seed.zigzag': 'Pico', 'seed.hook': 'Gancho', 'seed.drawn': 'Dibujada a mano',
    draw: 'Dibujar', 't.draw': 'Dibuja la semilla con clics; doble clic para terminar', pickPivot: 'Elegir pivote', 't.pickPivot': 'El siguiente clic en la pantalla fija el pivote',
    'h.draw': 'Dibujar: cada clic añade un punto y un doble clic termina. Elegir pivote: haz clic donde quieras que gire.',
    sym: 'Simetría (copias de todo)', gens: 'Generaciones antes de cambiar', pace: 'Ritmo',
    colorStep: 'Color de cada copia', width: 'Grosor de línea',
    'dp.heighway': 'Dragón de Heighway', 'dp.twin': 'Twindragon (dos dragones)', 'dp.four': 'Cuatro dragones', 'dp.levy': 'Curva C de Lévy',
    'dp.folds': 'Pliegues alternos', 'dp.tripod': 'Trípode (3 copias a 120°)', 'dp.cross': 'Cruz (3 copias a 90°)',
    gen: 'gen', segs: 'segmentos', drawing: 'dibujando: {n} puntos · doble clic para terminar', picking: 'haz clic donde quieras el pivote',
    'k.tap': 'Clic', 'h.tap': 'añadir un punto al dibujar', 'h.esc': 'cancelar el dibujo o el pivote',
  },
  en: {
    'tab.dragon': 'Dragon',
    'pitch.dragon': 'One rule, repeated: copy the whole figure and turn the copy about a pivot. Folding a strip of paper in two, again and again, is how the dragon comes out.',
    'g.rule': 'Rule', 'g.seed': 'Seed and pivot', 'g.view': 'Generations',
    copies: 'Copies', angle: 'Angle', dir: 'Direction', 'dir.ccw': 'Counterclockwise', 'dir.cw': 'Clockwise',
    alternate: 'Alternate the direction', pivot: 'Pivot', scale: 'Scale of each copy',
    'pv.end': 'End point', 'pv.start': 'Start point', 'pv.center': 'Centre of the figure', 'pv.chain': 'Chained', 'pv.custom': 'The one you pick',
    seed: 'Seed', 'seed.segment': 'Segment', 'seed.ell': 'L shape', 'seed.zigzag': 'Peak', 'seed.hook': 'Hook', 'seed.drawn': 'Drawn by hand',
    draw: 'Draw', 't.draw': 'Draw the seed with clicks; double click to finish', pickPivot: 'Pick pivot', 't.pickPivot': 'The next click on the screen sets the pivot',
    'h.draw': 'Draw: each click adds a point and a double click finishes. Pick pivot: click where you want it to turn.',
    sym: 'Symmetry (copies of it all)', gens: 'Generations before changing', pace: 'Pace',
    colorStep: 'Colour of each copy', width: 'Line width',
    'dp.heighway': 'Heighway dragon', 'dp.twin': 'Twindragon (two dragons)', 'dp.four': 'Four dragons', 'dp.levy': 'Lévy C curve',
    'dp.folds': 'Alternate folds', 'dp.tripod': 'Tripod (3 copies at 120°)', 'dp.cross': 'Cross (3 copies at 90°)',
    gen: 'gen', segs: 'segments', drawing: 'drawing: {n} points · double click to finish', picking: 'click where you want the pivot',
    'k.tap': 'Click', 'h.tap': 'add a point while drawing', 'h.esc': 'cancel drawing or picking the pivot',
  },
};

function create(ctx, values) {
  const { gl, camera, palette, colors } = ctx;
  const batch = new SegmentBatch(gl);
  const overlay = new SegmentBatch(gl);
  let fig = null;       // the figure of the current generation (all its copies baked in)
  let gen = 0;
  let phase = 'turn';   // turn → hold → (bake) → turn …, then 'end'
  let u = 0;            // progress of the phase
  let pivot = [0, 0], turn = 0;
  let target = null;    // view the camera heads to
  let shift = 0;
  let drawn = null;     // points drawn by hand
  let drawing = null;   // points while drawing
  let pickingPivot = false;
  let custom = null;
  let endT = 0;

  const rule = () => ({
    copies: values.copies, angle: values.angle, dir: values.dir, alternate: values.alternate,
    pivot: values.pivot, custom, scale: values.scale, colorStep: values.colorStep,
  });
  const symCenter = () => (fig ? [fig.start[0], fig.start[1]] : [0, 0]);

  /** View that holds a box, with the symmetry copies. */
  function frame(b) {
    let [x0, y0, x1, y1] = b;
    if (values.sym > 1) {
      const [cx, cy] = symCenter();
      const r = Math.max(Math.hypot(x0 - cx, y0 - cy), Math.hypot(x1 - cx, y0 - cy), Math.hypot(x0 - cx, y1 - cy), Math.hypot(x1 - cx, y1 - cy));
      [x0, y0, x1, y1] = [cx - r, cy - r, cx + r, cy + r];
    }
    const aspect = camera.width / camera.height;
    const h = Math.max(y1 - y0, (x1 - x0) / aspect, 1e-3) * 1.18;
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, h, r: 0 };
  }

  function startGeneration() {
    const p = rule();
    turn = turnOf(p, gen);
    pivot = pivotOf(fig, p, turn);
    target = frame(grownBounds(fig, p, gen));
    phase = 'turn';
    u = 0;
  }

  function restart() {
    let pts = SEEDS[values.seed] || SEEDS.segment;
    if (values.seed === 'drawn') pts = drawn || SEEDS.segment;
    fig = seedFigure(pts);
    batch.set(fig.data, fig.count);
    gen = 0;
    endT = 0;
    startGeneration();
    camera.set(frame(bounds(fig)));
    ctx.redraw();
  }

  function applyPreset(id) {
    Object.assign(values, PRESETS[id]);
    values.preset = id;
    ctx.setParam('preset', id);
    restart();
  }

  function finishDrawing() {
    if (drawing && drawing.length >= 2) {
      drawn = drawing;
      values.seed = 'drawn';
      ctx.setParam('seed', 'drawn');
    }
    drawing = null;
    restart();
  }

  function advance(dt, autoNext) {
    const pace = values.pace;
    if (phase === 'turn') {
      u = Math.min(1, u + (dt * pace) / 1.5);
      if (u >= 1) { phase = 'hold'; u = 0; }
    } else if (phase === 'hold') {
      u = Math.min(1, u + (dt * pace) / 0.4);
      if (u >= 1) {
        fig = grow(fig, rule(), gen);
        gen++;
        batch.set(fig.data, fig.count);
        if (gen >= values.gens || fig.count * values.copies > MAX_SEGMENTS) {
          phase = 'end';
          endT = 0;
        } else {
          startGeneration();
        }
      }
    } else if (phase === 'end' && autoNext) {
      const before = endT;
      endT += dt;
      if (before <= 3 && endT > 3) {
        // loop: fade and start the next preset
        ctx.fade(() => applyPreset(PRESET_IDS[(PRESET_IDS.indexOf(values.preset) + 1) % PRESET_IDS.length]));
      }
    }
  }

  return {
    limits: { minH: 1e-4, maxH: 1e5 },
    home: () => (target ? { ...target } : { x: 0.5, y: 0, h: 2, r: 0 }),
    enter() { if (!fig) restart(); },
    leave() {},

    param(key) {
      if (key === 'preset') applyPreset(values.preset);
      else if (key === 'seed' && values.seed === 'drawn' && !drawn) { drawing = []; fig = null; }
      else if (['copies', 'angle', 'dir', 'alternate', 'pivot', 'scale', 'seed', 'colorStep', 'gens'].includes(key)) {
        if (key === 'pivot' && values.pivot === 'custom' && !custom) { pickingPivot = true; return; }
        restart();
      } else if (key === 'sym' && fig) target = frame(grownBounds(fig, rule(), gen));
    },

    action(act) {
      if (act === 'draw') { drawing = []; pickingPivot = false; }
      if (act === 'pickPivot') { pickingPivot = true; drawing = null; }
      ctx.redraw();
    },

    next() { ctx.fade(() => applyPreset(PRESET_IDS[(PRESET_IDS.indexOf(values.preset) + 1) % PRESET_IDS.length])); },
    fit() { if (target) camera.flyTo(target); },

    update(dt, s) {
      let changed = false;
      if (s.running && values.cycle > 0) {
        shift = (shift + (values.cycle / 60) * dt) % 1;
        changed = true;
      }
      if (s.auto && fig && !drawing && !pickingPivot) {
        advance(dt, s.autoNext);
        if (target) camera.follow(target, dt, 1.6);
        changed = true;
      }
      return changed;
    },

    render() {
      gl.clearColor(...colors.surfaceRgb, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const view = viewMatrix(camera, camera.width, camera.height);
      const dpr = camera.width / (ctx.canvas.clientWidth || 1);
      const base = { view, res: [camera.width, camera.height], scale: camera.k, palette, minPx: values.width * dpr };
      if (fig && !drawing) {
        const [cx, cy] = symCenter();
        const turning = phase === 'turn' || phase === 'hold';
        const e = phase === 'turn' ? ease(u) : 1;
        for (let j = 0; j < values.sym; j++) {
          const msym = j ? rotationAbout(cx, cy, (j * 2 * Math.PI) / values.sym) : IDENTITY;
          batch.draw({ ...base, model: msym, tShift: shift });
          if (!turning) continue;
          for (let k = 1; k < values.copies; k++) {
            const m = rotationAbout(pivot[0], pivot[1], k * turn * e, Math.pow(values.scale, k * e));
            batch.draw({ ...base, model: j ? mul3(msym, m) : m, tShift: shift + k * values.colorStep });
          }
        }
        if (phase === 'turn' && fig.count < 2000) {
          overlay.set(new Float32Array([pivot[0], pivot[1], pivot[0], pivot[1], 0, 0]));
          overlay.draw({ ...base, minPx: 7 * dpr, solid: colors.accentRgb });
        }
      }
      // the seed being drawn, or the pivot the user chose
      const pts = drawing || [];
      if (pts.length || (custom && values.pivot === 'custom')) {
        const segs = [];
        for (let i = 0; i + 1 < pts.length; i++) segs.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0, 0);
        if (segs.length) {
          overlay.set(new Float32Array(segs));
          overlay.draw({ ...base, minPx: 2 * dpr, solid: colors.inkRgb });
        }
        const dots = [];
        for (const p of pts) dots.push(p[0], p[1], p[0], p[1], 0, 0);
        if (custom && values.pivot === 'custom') dots.push(custom[0], custom[1], custom[0], custom[1], 0, 0);
        overlay.set(new Float32Array(dots));
        overlay.draw({ ...base, minPx: 9 * dpr, solid: colors.accentRgb });
      }
    },

    tap(info) {
      if (drawing) { drawing.push([info.wx, info.wy]); ctx.redraw(); }
      else if (pickingPivot) {
        pickingPivot = false;
        custom = [info.wx, info.wy];
        values.pivot = 'custom';
        ctx.setParam('pivot', 'custom');
        restart();
      }
    },
    doubleTap() {
      if (!drawing) return false;
      finishDrawing();
      return true;
    },
    readLink(raw) { presetFromLink(values, raw, PRESETS); },
    key(k) { if (k === 'escape' && (drawing || pickingPivot)) { drawing = null; pickingPivot = false; restart(); } },

    stats() {
      if (drawing) return ctx.t('drawing', { n: drawing.length });
      if (pickingPivot) return ctx.t('picking');
      return `${ctx.t('gen')} ${gen} · ${num(fig ? fig.count * values.sym : 0)} ${ctx.t('segs')}`;
    },
  };
}

export default { id: 'dragon', schema, texts, create, keys: [['k.tap', 'h.tap'], ['Esc', 'h.esc']] };
