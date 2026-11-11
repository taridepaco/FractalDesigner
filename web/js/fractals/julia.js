// Animated Julia sets: the parameter c travels along the edge of the main cardioid of the
// Mandelbrot set (or a circle), so the shape keeps mutating and never repeats exactly. The small
// Mandelbrot in the corner shows where c is; click or drag in it to choose c by hand.
import { EscapeRenderer } from '../escape.js';
import { SegmentBatch } from '../draw.js';
import { IDENTITY } from '../gl.js';
import { paletteParam, cycleParam, yesNo } from '../schema.js';
import { num, sci } from '../i18n.js';

const HOME = { x: 0, y: 0, h: 3.1 };
const MINI = { x: -0.62, y: 0, h: 2.7 }; // the small Mandelbrot
const CIRCLE_R = 0.7885;

const PRESETS = {
  rabbit: [-0.122561, 0.744862], sanmarco: [-0.75, 0], dendrite: [0, 1], siegel: [-0.390541, -0.586788],
  galaxy: [-0.8, 0.156], sparks: [0.285, 0.01], spiral: [-0.7269, 0.1889], fern: [-0.4, 0.6],
};

/** Point of the path at angle a. */
function pathPoint(path, a, rho) {
  if (path === 'circle') return [CIRCLE_R * rho * Math.cos(a), CIRCLE_R * rho * Math.sin(a)];
  // main cardioid: c = e^{ia}/2 − e^{2ia}/4, scaled about its cusp at 1/4
  const x = Math.cos(a) / 2 - Math.cos(2 * a) / 4, y = Math.sin(a) / 2 - Math.sin(2 * a) / 4;
  return [0.25 + (x - 0.25) * rho, y * rho];
}

const schema = [
  { key: 'path', type: 'select', group: 'g.c', label: 'path', def: 'cardioid',
    options: [{ v: 'cardioid', k: 'path.cardioid' }, { v: 'circle', k: 'path.circle' }, { v: 'still', k: 'path.still' }] },
  { key: 'rho', type: 'range', group: 'g.c', label: 'rho', min: 0.9, max: 1.1, step: 0.002, def: 1.0, fmt: (v) => `×${num(v, 3)}`, when: (v) => v.path !== 'still' },
  { key: 'cspeed', type: 'range', group: 'g.c', label: 'cspeed', min: 0.5, max: 30, step: 0.5, def: 5, fmt: (v) => `${num(v, 1)}°/s`, when: (v) => v.path !== 'still' },
  { key: 'preset', type: 'select', group: 'g.c', label: 'preset', def: 'rabbit',
    options: Object.keys(PRESETS).map((k) => ({ v: k, k: `jp.${k}` })), when: (v) => v.path === 'still' },
  paletteParam('mar'),
  cycleParam(6),
  { key: 'density', type: 'range', group: 'g.color', label: 'density', min: 0.1, max: 10, step: 0.01, log: true, def: 1.5, fmt: (v) => `×${num(v, 2)}` },
  { key: 'iter', type: 'range', group: 'g.render', label: 'iter', min: 50, max: 2000, step: 10, log: true, def: 300, fmt: (v) => num(v) },
  { key: 'mini', type: 'modes', group: 'g.render', label: 'mini', def: true, options: yesNo },
];

const texts = {
  es: {
    'tab.julia': 'Julia',
    'pitch.julia': 'El conjunto de Julia de un punto c. Mientras c recorre el borde del cardioide la forma muta sin parar; en la esquina, haz clic en el Mandelbrot para elegir c.',
    'g.c': 'Parámetro c', path: 'Recorrido de c', 'path.cardioid': 'Borde del cardioide', 'path.circle': 'Círculo |c| = 0,7885', 'path.still': 'Quieto',
    rho: 'Escala del recorrido', cspeed: 'Velocidad de c', mini: 'Mandelbrot en la esquina',
    'jp.rabbit': 'Conejo de Douady', 'jp.sanmarco': 'San Marcos', 'jp.dendrite': 'Dendrita', 'jp.siegel': 'Disco de Siegel',
    'jp.galaxy': 'Galaxia', 'jp.sparks': 'Chispas', 'jp.spiral': 'Espiral', 'jp.fern': 'Helecho',
    'k.minidrag': 'Clic en la esquina', 'h.minidrag': 'elegir c en el Mandelbrot',
  },
  en: {
    'tab.julia': 'Julia',
    'pitch.julia': 'The Julia set of a point c. While c travels along the edge of the cardioid the shape keeps mutating; click on the Mandelbrot in the corner to choose c.',
    'g.c': 'Parameter c', path: 'Path of c', 'path.cardioid': 'Edge of the cardioid', 'path.circle': 'Circle |c| = 0.7885', 'path.still': 'Still',
    rho: 'Path scale', cspeed: 'Speed of c', mini: 'Mandelbrot in the corner',
    'jp.rabbit': 'Douady rabbit', 'jp.sanmarco': 'San Marco', 'jp.dendrite': 'Dendrite', 'jp.siegel': 'Siegel disk',
    'jp.galaxy': 'Galaxy', 'jp.sparks': 'Sparks', 'jp.spiral': 'Spiral', 'jp.fern': 'Fern',
    'k.minidrag': 'Click in the corner', 'h.minidrag': 'choose c on the Mandelbrot',
  },
};

function create(ctx, values) {
  const { gl, camera, palette, colors } = ctx;
  const escape = new EscapeRenderer(gl);
  const pathBatch = new SegmentBatch(gl);
  const dotBatch = new SegmentBatch(gl);
  let angle = 0.9;
  let c = pathPoint(values.path, angle, values.rho);
  if (values.path === 'still') c = [...PRESETS[values.preset]];
  let shift = 0;
  let picking = false;
  let rect = null;

  const inRect = (info) => rect && info.px >= rect.x && info.px <= rect.x + rect.w && info.py >= rect.y && info.py <= rect.y + rect.h;
  function pick(info) {
    const k = rect.h / MINI.h;
    c = [MINI.x + (info.px - rect.x - rect.w / 2) / k, MINI.y - (info.py - rect.y - rect.h / 2) / k];
    if (values.path !== 'still') ctx.setParam('path', 'still');
    ctx.redraw();
  }

  function drawMini() {
    if (!values.mini) { rect = null; ctx.inset(null); return; }
    rect = ctx.insetRect('br');
    if (rect.w * 2.2 > camera.width || rect.h * 2.2 > camera.height) { rect = null; ctx.inset(null); return; }
    escape.draw(rect, {
      center: [MINI.x, MINI.y], h: MINI.h, r: 0, julia: false, maxIter: 120,
      palette, density: values.density, shift, inside: colors.shadeRgb,
    });
    // the path of c and where c is, in canvas pixels
    const k = rect.h / MINI.h;
    const ox = rect.x + rect.w / 2, oy = camera.height - rect.y - rect.h / 2;
    const toPx = (p) => [ox + (p[0] - MINI.x) * k, oy + (p[1] - MINI.y) * k];
    const segs = [];
    if (values.path !== 'still') {
      const n = 96;
      for (let i = 0; i < n; i++) {
        const a = toPx(pathPoint(values.path, (i / n) * Math.PI * 2, values.rho));
        const b = toPx(pathPoint(values.path, ((i + 1) / n) * Math.PI * 2, values.rho));
        segs.push(a[0], a[1], b[0], b[1], 0, 0);
      }
    }
    const pc = toPx(c);
    const base = { view: IDENTITY, res: [camera.width, camera.height], scale: 1 };
    const dpr = camera.width / (ctx.canvas.clientWidth || 1);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rect.x, camera.height - rect.y - rect.h, rect.w, rect.h);
    if (segs.length) {
      pathBatch.set(new Float32Array(segs));
      pathBatch.draw({ ...base, minPx: 1.5 * dpr, solid: colors.secondRgb });
    }
    gl.disable(gl.SCISSOR_TEST);
    // the dot for c: a square with a border, drawn as zero-length segments with square ends
    dotBatch.set(new Float32Array([pc[0], pc[1], pc[0], pc[1], 0, 0]));
    dotBatch.draw({ ...base, minPx: 11 * dpr, solid: colors.lineRgb });
    dotBatch.draw({ ...base, minPx: 6 * dpr, solid: colors.accentRgb });
    ctx.inset(rect, `c = ${num(c[0], 4)} ${c[1] < 0 ? '−' : '+'} ${num(Math.abs(c[1]), 4)}i`);
  }

  return {
    limits: { minH: 1e-5, maxH: 12 },
    home: () => ({ ...HOME, r: 0 }),
    enter() {},
    leave() { ctx.inset(null); rect = null; },

    param(key) {
      if (key === 'preset') c = [...PRESETS[values.preset]];
      else if ((key === 'path' || key === 'rho') && values.path !== 'still') c = pathPoint(values.path, angle, values.rho);
    },
    action() {},

    next() {
      if (values.path === 'still') {
        const keys = Object.keys(PRESETS);
        values.preset = keys[(keys.indexOf(values.preset) + 1) % keys.length];
        c = [...PRESETS[values.preset]];
        ctx.setParam('preset', values.preset);
      } else {
        angle += Math.PI / 3;
        c = pathPoint(values.path, angle, values.rho);
      }
    },

    update(dt, s) {
      let changed = false;
      if (s.running && values.cycle > 0) {
        shift = (shift + (values.cycle / 60) * dt) % 1;
        changed = true;
      }
      if (s.running && values.path !== 'still' && !picking) {
        angle += ((values.cspeed * Math.PI) / 180) * dt;
        c = pathPoint(values.path, angle, values.rho);
        changed = true;
      }
      if (s.auto && Math.abs(camera.r) > 1e-3) {
        camera.follow({ r: 0 }, dt, 0.5);
        changed = true;
      }
      return changed;
    },

    render() {
      escape.draw(null, {
        center: [camera.x, camera.y], h: camera.h, r: camera.r, julia: true, c,
        maxIter: Math.round(values.iter * (1 + Math.max(0, Math.log10(HOME.h / camera.h)) * 0.6)),
        palette, density: values.density, shift, inside: colors.shadeRgb,
      });
      drawMini();
    },

    pointerDown(info) {
      if (!inRect(info)) return false;
      picking = true;
      pick(info);
      return true;
    },
    pointerMove(info) { if (picking) pick(info); },
    pointerUp() { picking = false; },
    doubleTap(info) { return inRect(info); },

    linkState: () => (values.path === 'still'
      ? [['cx', +c[0].toFixed(7)], ['cy', +c[1].toFixed(7)]]
      : [['ca', +(angle % (Math.PI * 2)).toFixed(5)]]),
    readLink(v) {
      const x = parseFloat(v.cx), y = parseFloat(v.cy), a = parseFloat(v.ca);
      if (Number.isFinite(a)) angle = a;
      if (values.path !== 'still') c = pathPoint(values.path, angle, values.rho);
      else if (Number.isFinite(x) && Number.isFinite(y)) c = [x, y];
      else c = [...PRESETS[values.preset]];
    },

    stats() {
      return `c = ${num(c[0], 4)} ${c[1] < 0 ? '−' : '+'} ${num(Math.abs(c[1]), 4)}i · zoom ×${sci(HOME.h / camera.h)}`;
    },
  };
}

export default {
  id: 'julia', schema, texts, create, adaptive: true, linkView: true,
  keys: [['k.minidrag', 'h.minidrag']],
};
