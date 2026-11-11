// L-system curves: a rewriting grammar and a turtle that draws the result live, step by step
// (Koch, Hilbert, Gosper, Peano, plants…). The rules can be edited in the panel.
import { SegmentBatch } from '../draw.js';
import { viewMatrix } from '../gl.js';
import { PRESETS, parseRules, expand, turtle } from '../core/lsystem.js';
import { paletteParam, cycleParam, deg, presetFromLink } from '../schema.js';
import { num } from '../i18n.js';

const PRESET_IDS = Object.keys(PRESETS);
const STRUCTURE = ['axiom', 'rules', 'angle', 'iter', 'draw', 'heading'];

const schema = [
  { key: 'preset', type: 'select', group: 'g.grammar', label: 'preset', def: 'koch', options: PRESET_IDS.map((k) => ({ v: k, k: `lp.${k}` })) },
  { key: 'iter', type: 'range', group: 'g.grammar', label: 'lgen', min: 0, max: 10, step: 1, def: 4 },
  { key: 'angle', type: 'range', group: 'g.grammar', label: 'angle', min: 1, max: 180, step: 0.5, def: 60, fmt: deg },
  { key: 'heading', type: 'range', group: 'g.grammar', label: 'heading', min: 0, max: 360, step: 1, def: 0, fmt: deg },
  { key: 'axiom', type: 'text', group: 'g.grammar', label: 'axiom', def: 'F--F--F' },
  { key: 'rules', type: 'text', group: 'g.grammar', label: 'rules', def: 'F=F+F--F+F' },
  { key: 'draw', type: 'text', group: 'g.grammar', label: 'drawSyms', def: 'F' },
  { type: 'hint', group: 'g.grammar', k: 'h.grammar' },
  { key: 'duration', type: 'range', group: 'g.anim', label: 'duration', min: 2, max: 60, step: 1, def: 10, fmt: (v) => `${num(v)} s` },
  { key: 'width', type: 'range', group: 'g.anim', label: 'width', min: 0.5, max: 4, step: 0.25, def: 1.5, fmt: (v) => `${num(v, 2)} px` },
  paletteParam('isla'),
  cycleParam(0),
  { key: 'span', type: 'range', group: 'g.color', label: 'span', min: 0, max: 4, step: 0.05, def: 1, fmt: (v) => `×${num(v, 2)}` },
];

const texts = {
  es: {
    'tab.lsystem': 'L-system',
    'pitch.lsystem': 'Una gramática reescribe la cadena en cada generación y una tortuga la dibuja en directo: F avanza, + y − giran, [ y ] guardan y recuperan la posición.',
    'g.grammar': 'Gramática', lgen: 'Generaciones', heading: 'Rumbo inicial', axiom: 'Axioma', rules: 'Reglas', drawSyms: 'Símbolos que dibujan',
    'h.grammar': 'Reglas separadas por punto y coma, como A=+BF-AFA-FB+; B=-AF+BFB+FA-. Pulsa Intro para aplicarlas.',
    duration: 'Duración del trazado', width: 'Grosor de línea', span: 'Vueltas de paleta en la curva',
    'lp.koch': 'Copo de Koch', 'lp.island': 'Isla de Koch cuadrada', 'lp.hilbert': 'Curva de Hilbert', 'lp.peano': 'Curva de Peano',
    'lp.gosper': 'Curva de Gosper', 'lp.arrowhead': 'Punta de flecha de Sierpinski', 'lp.terdragon': 'Terdragón', 'lp.plant': 'Planta', 'lp.bush': 'Arbusto',
    seg: 'segmentos', cut: 'recortado a {n} generaciones',
  },
  en: {
    'tab.lsystem': 'L-system',
    'pitch.lsystem': 'A grammar rewrites the string every generation and a turtle draws it live: F moves forward, + and − turn, [ and ] save and restore the position.',
    'g.grammar': 'Grammar', lgen: 'Generations', heading: 'Starting heading', axiom: 'Axiom', rules: 'Rules', drawSyms: 'Symbols that draw',
    'h.grammar': 'Rules separated by semicolons, like A=+BF-AFA-FB+; B=-AF+BFB+FA-. Press Enter to apply them.',
    duration: 'Drawing time', width: 'Line width', span: 'Palette turns along the curve',
    'lp.koch': 'Koch snowflake', 'lp.island': 'Quadratic Koch island', 'lp.hilbert': 'Hilbert curve', 'lp.peano': 'Peano curve',
    'lp.gosper': 'Gosper curve', 'lp.arrowhead': 'Sierpinski arrowhead', 'lp.terdragon': 'Terdragon', 'lp.plant': 'Plant', 'lp.bush': 'Bush',
    seg: 'segments', cut: 'cut to {n} generations',
  },
};

function create(ctx, values) {
  const { gl, camera, palette, colors } = ctx;
  const batch = new SegmentBatch(gl);
  const head = new SegmentBatch(gl);
  let curve = null;     // { data, count, box }
  let usedIter = 0;
  let drawn = 0;        // segments drawn so far
  let hold = 0;
  let shift = 0;
  let target = null;

  function build() {
    const rules = parseRules(values.rules);
    const drawSyms = values.draw || 'F';
    const { text, iter } = expand(values.axiom, rules, values.iter, drawSyms);
    usedIter = iter;
    curve = turtle(text, values.angle, drawSyms, values.heading);
    // colour along the path
    for (let i = 0; i < curve.count; i++) curve.data[i * 6 + 4] *= values.span;
    batch.set(curve.data, curve.count);
    const [x0, y0, x1, y1] = curve.box;
    const aspect = camera.width / camera.height;
    const h = Math.max(y1 - y0, (x1 - x0) / aspect, 1) * 1.12;
    target = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, h, r: 0 };
  }

  function restart() {
    build();
    drawn = 0;
    hold = 0;
    camera.set(target);
    ctx.redraw();
  }

  function applyPreset(id) {
    Object.assign(values, PRESETS[id]);
    values.preset = id;
    ctx.setParam('preset', id);
    restart();
  }

  return {
    limits: { minH: 1e-3, maxH: 1e7 },
    home: () => (target ? { ...target } : { x: 0, y: 0, h: 10, r: 0 }),
    enter() { if (!curve) restart(); },
    leave() {},

    param(key) {
      if (key === 'preset') applyPreset(values.preset);
      else if (STRUCTURE.includes(key)) restart();
      else if (key === 'span') { const d = drawn; build(); drawn = d; }
    },
    action() {},
    next() { ctx.fade(() => applyPreset(PRESET_IDS[(PRESET_IDS.indexOf(values.preset) + 1) % PRESET_IDS.length])); },
    fit() { if (target) camera.flyTo(target); },

    update(dt, s) {
      let changed = false;
      if (s.running && values.cycle > 0) { shift = (shift + (values.cycle / 60) * dt) % 1; changed = true; }
      if (s.auto && curve) {
        if (drawn < curve.count) {
          drawn = Math.min(curve.count, drawn + (curve.count / values.duration) * dt);
        } else {
          hold += dt;
          if (hold > 4 && hold - dt <= 4) this.next();
        }
        camera.follow(target, dt, 1.2);
        changed = true;
      }
      return changed;
    },

    render() {
      gl.clearColor(...colors.surfaceRgb, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!curve) return;
      const view = viewMatrix(camera, camera.width, camera.height);
      const dpr = camera.width / (ctx.canvas.clientWidth || 1);
      const base = { view, res: [camera.width, camera.height], scale: camera.k, palette, tShift: shift };
      const n = Math.floor(drawn);
      batch.draw({ ...base, minPx: values.width * dpr }, n);
      if (n < curve.count && n > 0) {
        // the turtle: a square at the tip of the line
        const o = (n - 1) * 6;
        const x = curve.data[o + 2], y = curve.data[o + 3];
        head.set(new Float32Array([x, y, x, y, 0, 0]));
        head.draw({ ...base, minPx: 9 * dpr, solid: colors.lineRgb });
        head.draw({ ...base, minPx: 5 * dpr, solid: colors.accentRgb });
      }
    },

    readLink(raw) { presetFromLink(values, raw, PRESETS); },

    stats() {
      const cut = usedIter < values.iter ? ` · ${ctx.t('cut', { n: usedIter })}` : '';
      return `${num(Math.floor(drawn))}/${num(curve ? curve.count : 0)} ${ctx.t('seg')}${cut}`;
    },
  };
}

export default { id: 'lsystem', schema, texts, create };
