// The chaos game: Sierpinski emerges out of noise, point by point. The points pile up on the GPU
// (a float buffer that counts them and sums their colours), so millions of them stay cheap.
// Drag a vertex to bend the figure.
import { HEADER, FULLSCREEN_VS, createProgram, createTexture, drawFullscreen, viewMatrix } from '../gl.js';
import { SegmentBatch } from '../draw.js';
import { polygon, targets, ChaosGame } from '../core/chaos.js';
import { paletteParam, yesNo, presetFromLink } from '../schema.js';
import { num } from '../i18n.js';

const PRESETS = {
  sierpinski: { sides: 3, ratio: 0.5, rule: 'free', mid: false, center: false },
  carpet: { sides: 4, ratio: 0.6667, rule: 'free', mid: true, center: false },
  vicsek: { sides: 4, ratio: 0.6667, rule: 'free', mid: false, center: true },
  pentaflake: { sides: 5, ratio: 0.618, rule: 'free', mid: false, center: false },
  hexaflake: { sides: 6, ratio: 0.6667, rule: 'free', mid: false, center: true },
  square: { sides: 4, ratio: 0.5, rule: 'norepeat', mid: false, center: false },
  pentagram: { sides: 5, ratio: 0.5, rule: 'noneighbor', mid: false, center: false },
};
const PRESET_IDS = Object.keys(PRESETS);

const POINT_VS = `${HEADER}
layout(location = 0) in vec3 aP;   // x, y, target index
uniform mat3 uView;
uniform vec2 uRes;
uniform float uTargets;
uniform sampler2D uPalette;
out vec3 vColor;
void main() {
  vec2 p = (uView * vec3(aP.xy, 1.0)).xy;
  gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  vColor = texture(uPalette, vec2((aP.z + 0.5) / uTargets, 0.5)).rgb;
}`;
const POINT_FS = `${HEADER}
uniform float uWeight;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor * uWeight, uWeight); }`;

// sum of colours in rgb, number of points in a: average colour, brighter where more points fell
const SHOW_FS = `${HEADER}
uniform sampler2D uAccum;
uniform float uScale;    // 1 for float buffers, 255 for 8-bit ones
uniform float uExposure;
uniform vec3 uBg;
out vec4 outColor;
void main() {
  vec4 s = texelFetch(uAccum, ivec2(gl_FragCoord.xy), 0) * uScale;
  float n = s.a;
  vec3 avg = n > 0.0 ? s.rgb / n : uBg;
  float k = 1.0 - exp(-n * uExposure);
  outColor = vec4(mix(uBg, avg, k), 1.0);
}`;

const schema = [
  { key: 'preset', type: 'select', group: 'g.game', label: 'preset', def: 'sierpinski', options: PRESET_IDS.map((k) => ({ v: k, k: `cp.${k}` })) },
  { key: 'sides', type: 'range', group: 'g.game', label: 'sides', min: 3, max: 8, step: 1, def: 3 },
  { key: 'ratio', type: 'range', group: 'g.game', label: 'jump', min: 0.3, max: 0.9, step: 0.001, def: 0.5, fmt: (v) => num(v, 3) },
  { key: 'rule', type: 'select', group: 'g.game', label: 'rule', def: 'free',
    options: [{ v: 'free', k: 'rule.free' }, { v: 'norepeat', k: 'rule.norepeat' }, { v: 'noneighbor', k: 'rule.noneighbor' }] },
  { key: 'mid', type: 'modes', group: 'g.game', label: 'mid', def: false, options: yesNo },
  { key: 'center', type: 'modes', group: 'g.game', label: 'center', def: false, options: yesNo },
  { type: 'buttons', group: 'g.game', items: [{ act: 'reset', k: 'resetVerts', title: 't.resetVerts', wide: true }] },
  { key: 'rate', type: 'range', group: 'g.anim', label: 'rate', min: 0.25, max: 4, step: 0.05, log: true, def: 1, fmt: (v) => `×${num(v, 2)}` },
  paletteParam('isla'),
];

const texts = {
  es: {
    'tab.chaos': 'Caos',
    'pitch.chaos': 'Un punto salta, cada vez, una fracción del camino hacia un vértice elegido al azar. De ese ruido sale un fractal. Arrastra un vértice para deformarlo.',
    'g.game': 'Juego', sides: 'Vértices', jump: 'Fracción del salto', rule: 'Regla',
    'rule.free': 'Cualquier vértice', 'rule.norepeat': 'No repetir vértice', 'rule.noneighbor': 'No ir a un vecino del anterior',
    mid: 'Puntos medios de los lados', center: 'El centro también', rate: 'Velocidad',
    resetVerts: 'Recolocar los vértices', 't.resetVerts': 'Vuelve al polígono regular',
    'cp.sierpinski': 'Triángulo de Sierpinski', 'cp.carpet': 'Alfombra de Sierpinski', 'cp.vicsek': 'Fractal de Vicsek', 'cp.pentaflake': 'Copo pentagonal',
    'cp.hexaflake': 'Copo hexagonal', 'cp.square': 'Cuadrado sin repetir', 'cp.pentagram': 'Pentágono sin vecinos',
    pts: 'puntos', 'k.vertex': 'Arrastrar un vértice', 'h.vertex': 'deformar el polígono',
  },
  en: {
    'tab.chaos': 'Chaos',
    'pitch.chaos': 'A point jumps, each time, part of the way towards a vertex picked at random. A fractal comes out of that noise. Drag a vertex to bend it.',
    'g.game': 'Game', sides: 'Vertices', jump: 'Jump fraction', rule: 'Rule',
    'rule.free': 'Any vertex', 'rule.norepeat': 'Never the same vertex twice', 'rule.noneighbor': 'Never a neighbour of the last one',
    mid: 'Midpoints of the sides', center: 'The centre as well', rate: 'Speed',
    resetVerts: 'Reset the vertices', 't.resetVerts': 'Back to the regular polygon',
    'cp.sierpinski': 'Sierpinski triangle', 'cp.carpet': 'Sierpinski carpet', 'cp.vicsek': 'Vicsek fractal', 'cp.pentaflake': 'Pentaflake',
    'cp.hexaflake': 'Hexaflake', 'cp.square': 'Square, no repeats', 'cp.pentagram': 'Pentagon, no neighbours',
    pts: 'points', 'k.vertex': 'Drag a vertex', 'h.vertex': 'bend the polygon',
  },
};

const HOME = { x: 0, y: -0.08, h: 2.45 };
const MAX_PER_FRAME = 120000;

function create(ctx, values) {
  const { gl, camera, palette, colors } = ctx;
  const points = createProgram(gl, POINT_VS, POINT_FS);
  const show = createProgram(gl, FULLSCREEN_VS, SHOW_FS);
  const handles = new SegmentBatch(gl);
  const floatOk = !!gl.getExtension('EXT_color_buffer_float');
  const vbo = gl.createBuffer();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, MAX_PER_FRAME * 12, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const buf = new Float32Array(MAX_PER_FRAME * 3);

  let accum = null; // { fbo, tex, w, h }
  let verts = polygon(values.sides);
  let pts = targets(verts, values);
  let game = new ChaosGame(pts, verts.length, values.ratio, values.rule);
  let total = 0;          // points in the buffer
  let age = 0;            // seconds since the last restart (the pace of the emergence)
  let seenMoves = -1;
  let full = 0;           // seconds since the buffer is "done"
  let drag = -1;

  function ensureAccum() {
    const w = camera.width, h = camera.height;
    if (accum && accum.w === w && accum.h === h) return;
    if (accum) { gl.deleteFramebuffer(accum.fbo); gl.deleteTexture(accum.tex); }
    const tex = floatOk
      ? createTexture(gl, { width: w, height: h, internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT })
      : createTexture(gl, { width: w, height: h, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    accum = { fbo, tex, w, h };
    clear();
  }

  function clear() {
    if (!accum) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    total = 0;
    full = 0;
  }

  function rebuild(newPolygon) {
    if (newPolygon) verts = polygon(values.sides);
    pts = targets(verts, values);
    game = new ChaosGame(pts, verts.length, values.ratio, values.rule);
    clear();
    age = 0;
    ctx.redraw();
  }

  // the buffer counts up to about 2000 points per pixel (half floats), 255 in 8 bits
  const budget = () => camera.width * camera.height * (floatOk ? 60 : 12);

  function addPoints(count) {
    ensureAccum();
    let left = count;
    gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fbo);
    gl.viewport(0, 0, accum.w, accum.h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(points.program);
    const u = points.u;
    gl.uniformMatrix3fv(u.uView, false, viewMatrix(camera, camera.width, camera.height));
    gl.uniform2f(u.uRes, camera.width, camera.height);
    gl.uniform1f(u.uTargets, pts.length);
    gl.uniform1f(u.uWeight, floatOk ? 1 : 1 / 255);
    palette.bind(0);
    gl.uniform1i(u.uPalette, 0);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    while (left > 0) {
      const n = Math.min(left, MAX_PER_FRAME);
      game.run(buf, n);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, n * 3);
      gl.drawArrays(gl.POINTS, 0, n);
      left -= n;
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, camera.width, camera.height);
    total += count;
  }

  return {
    limits: { minH: 1e-4, maxH: 50 },
    home: () => ({ ...HOME, r: 0 }),
    enter() { seenMoves = -1; },
    leave() {},
    resize() { clear(); },

    param(key) {
      if (key === 'preset') {
        Object.assign(values, PRESETS[values.preset]);
        ctx.setParam('preset', values.preset);
        rebuild(true);
      } else if (key === 'sides') rebuild(true);
      else if (['ratio', 'rule', 'mid', 'center'].includes(key)) rebuild(false);
      else if (key === 'palette') clear();
    },
    action(act) { if (act === 'reset') rebuild(true); },

    next() {
      ctx.fade(() => {
        const id = PRESET_IDS[(PRESET_IDS.indexOf(values.preset) + 1) % PRESET_IDS.length];
        Object.assign(values, PRESETS[id]);
        values.preset = id;
        ctx.setParam('preset', id);
        camera.set(HOME);
        rebuild(true);
      });
    },

    update(dt, s) {
      if (camera.moves !== seenMoves) {
        // the points are in screen space: a new view starts the buffer again (at once when paused)
        seenMoves = camera.moves;
        const keep = total;
        clear();
        if (!s.running && keep) addPoints(Math.min(keep, 2e6));
      }
      if (!s.running) return false;
      age += dt * values.rate;
      if (total >= budget()) {
        if (s.auto && s.autoNext) {
          const before = full;
          full += dt;
          if (before <= 5 && full > 5) this.next();
        }
        return false;
      }
      // a handful of points at first, so the figure comes out of the noise, then many more
      const want = Math.min(MAX_PER_FRAME * 4, Math.floor(1 + 0.6 * Math.exp(1.15 * age)) * values.rate);
      addPoints(Math.max(1, Math.round(want)));
      return true;
    },

    render() {
      ensureAccum();
      gl.viewport(0, 0, camera.width, camera.height);
      gl.useProgram(show.program);
      const u = show.u;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, accum.tex);
      gl.uniform1i(u.uAccum, 1);
      gl.uniform1f(u.uScale, floatOk ? 1 : 255);
      // assume the figure covers about a third of the view: early points show at full strength,
      // later the average density maps to a strong colour
      const mean = total / Math.max(1, camera.width * camera.height * 0.3);
      gl.uniform1f(u.uExposure, Math.min(50, 2.2 / Math.max(mean, 1e-6)));
      gl.uniform3f(u.uBg, ...colors.surfaceRgb);
      drawFullscreen(gl);
      // the vertices, as handles
      const d = [];
      for (const v of verts) d.push(v[0], v[1], v[0], v[1], 0, 0);
      handles.set(new Float32Array(d));
      const dpr = camera.width / (ctx.canvas.clientWidth || 1);
      const base = { view: viewMatrix(camera, camera.width, camera.height), res: [camera.width, camera.height], scale: camera.k };
      handles.draw({ ...base, minPx: 10 * dpr, solid: colors.lineRgb });
      handles.draw({ ...base, minPx: 5 * dpr, solid: colors.accentRgb });
    },

    pointerDown(info) {
      const dpr = camera.width / (ctx.canvas.clientWidth || 1);
      for (let i = 0; i < verts.length; i++) {
        const [sx, sy] = camera.toScreen(verts[i][0], verts[i][1]);
        if (Math.hypot(sx - info.px, sy - info.py) < 22 * dpr) { drag = i; return true; }
      }
      return false;
    },
    pointerMove(info) {
      if (drag < 0) return;
      verts[drag] = [info.wx, info.wy];
      rebuild(false);
    },
    pointerUp() { drag = -1; },

    readLink(raw) { presetFromLink(values, raw, PRESETS); verts = polygon(values.sides); pts = targets(verts, values); game = new ChaosGame(pts, verts.length, values.ratio, values.rule); },

    stats() { return `${num(total)} ${ctx.t('pts')}`; },
  };
}

export default { id: 'chaos', schema, texts, create, keys: [['k.vertex', 'h.vertex']] };
