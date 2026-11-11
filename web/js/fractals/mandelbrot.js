// Mandelbrot: automatic, endless zoom towards a point of interest. Panning or zooming by hand
// stops the autopilot; when you let go it carries on from where you are, drifting towards the
// detail. At the precision limit (10¹³) it fades out and flies to the next destination.
import { HEADER, FULLSCREEN_VS, createProgram, createTexture, drawFullscreen } from '../gl.js';
import { SHADE_GLSL, setShade, EscapeRenderer } from '../escape.js';
import {
  HOME, MAX_DEPTH, DESTINATIONS, maxIterations, chooseReference, referenceCandidates, driftTarget,
} from '../core/mandel.js';
import { paletteParam, cycleParam, yesNo } from '../schema.js';
import { num, sci } from '../i18n.js';

const ORBIT_W = 1024; // the reference orbit is a texture 1024 points wide
const DATA_W = 64;    // width of the small map the drift autopilot looks at

const FS = `${HEADER}
${SHADE_GLSL}
uniform sampler2D uOrbit;  // reference orbit Z(n), RG32F, ORBIT_W points per row
uniform int uRefLen;       // number of points in the orbit
uniform int uMaxIter;
uniform vec2 uRes;
uniform float uPx;         // world units per pixel
uniform vec2 uRot;         // cos, sin of the view rotation
uniform vec2 uOffset;      // centre of the view minus the reference point (small, so a float is fine)
uniform int uData;         // 1: write the escape time for the drift autopilot instead of a colour
out vec4 outColor;

vec2 orbit(int i) { return texelFetch(uOrbit, ivec2(i & ${ORBIT_W - 1}, i >> ${Math.log2(ORBIT_W)}), 0).xy; }

void main() {
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes) * uPx;
  vec2 dc = vec2(q.x * uRot.x - q.y * uRot.y, q.x * uRot.y + q.y * uRot.x) + uOffset;
  vec2 dz = vec2(0.0);
  int ref = 0;
  float mu = -1.0;
  for (int i = 0; i < uMaxIter; i++) {
    vec2 Z = orbit(ref);
    // δ ← 2·Z·δ + δ² + δc
    dz = vec2(2.0 * (Z.x * dz.x - Z.y * dz.y) + dz.x * dz.x - dz.y * dz.y,
              2.0 * (Z.x * dz.y + Z.y * dz.x) + 2.0 * dz.x * dz.y) + dc;
    ref++;
    vec2 z = orbit(ref) + dz;
    float r2 = dot(z, z);
    if (r2 > 65536.0) { mu = smoothMu(i, r2); break; }
    // rebasing: back to the start of the reference orbit when the pixel gets closer to 0 than
    // to the reference, or when the reference runs out
    if (r2 < dot(dz, dz) || ref >= uRefLen - 1) { dz = z; ref = 0; }
  }
  if (uData == 1) {
    float v = mu < 0.0 ? 0.0 : clamp(mu / float(uMaxIter), 0.0, 1.0) * 65535.0;
    outColor = vec4(floor(v / 256.0) / 255.0, mod(v, 256.0) / 255.0, mu < 0.0 ? 0.0 : 1.0, 1.0);
  } else {
    outColor = vec4(shade(mu), 1.0);
  }
}`;

const sup = (n) => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);

const schema = [
  { key: 'dest', type: 'select', group: 'g.auto', label: 'dest', def: 'seahorse', options: DESTINATIONS.map((d) => ({ v: d.id, k: `dest.${d.id}` })) },
  { key: 'mode', type: 'modes', group: 'g.auto', label: 'mode', def: 'dest', options: [{ v: 'dest', k: 'mode.dest' }, { v: 'drift', k: 'mode.drift' }] },
  { key: 'speed', type: 'range', group: 'g.auto', label: 'speed', min: 1.1, max: 3, step: 0.05, def: 1.5, fmt: (v) => `×${num(v, 2)}/s` },
  { key: 'spin', type: 'range', group: 'g.auto', label: 'spin', min: -15, max: 15, step: 0.5, def: 2, fmt: (v) => `${num(v, 1)}°/s` },
  { key: 'depth', type: 'range', group: 'g.auto', label: 'depth', min: 4, max: MAX_DEPTH, step: 1, def: MAX_DEPTH, fmt: (v) => `10${sup(v)}` },
  { type: 'buttons', group: 'g.auto', items: [{ act: 'mark', k: 'mark', title: 't.mark', wide: true }] },
  paletteParam('atardecer'),
  cycleParam(6),
  { key: 'density', type: 'range', group: 'g.color', label: 'density', min: 0.1, max: 10, step: 0.01, log: true, def: 1, fmt: (v) => `×${num(v, 2)}` },
  { key: 'iter', type: 'range', group: 'g.render', label: 'iter', min: 0.25, max: 4, step: 0.01, log: true, def: 1, fmt: (v) => `×${num(v, 2)}` },
  { key: 'julia', type: 'modes', group: 'g.render', label: 'julia', def: true, options: yesNo },
];

const texts = {
  es: {
    'tab.mandelbrot': 'Mandelbrot',
    'pitch.mandelbrot': 'Zoom infinito hacia un punto del borde del conjunto. Muévete o acerca con la rueda: al soltar, el piloto sigue desde donde lo dejes.',
    'g.auto': 'Piloto automático', 'g.render': 'Cálculo',
    dest: 'Destino', mode: 'Modo', 'mode.dest': 'Destinos', 'mode.drift': 'Deriva',
    speed: 'Velocidad de zoom', spin: 'Giro de cámara', depth: 'Profundidad máxima',
    mark: 'Usar este punto como destino', 't.mark': 'El piloto hará zoom hacia el centro de la vista actual',
    density: 'Densidad de color', iter: 'Iteraciones', julia: 'Julia del punto bajo el cursor',
    'dest.seahorse': 'Valle del caballito de mar', 'dest.elephant': 'Valle de los elefantes', 'dest.spiral': 'Espiral de Misiurewicz',
    'dest.antenna': 'Minibrot de la antena', 'dest.triple': 'Valle de la triple espiral', 'dest.branch': 'Rama triple (M₃,₁)', 'dest.dendrite': 'Dendrita (c = i)',
    'dest.custom': 'Tu punto',
    iters: 'iter',
  },
  en: {
    'tab.mandelbrot': 'Mandelbrot',
    'pitch.mandelbrot': 'Endless zoom towards a point on the edge of the set. Pan, or zoom with the wheel: when you let go, the autopilot carries on from where you leave it.',
    'g.auto': 'Autopilot', 'g.render': 'Computation',
    dest: 'Destination', mode: 'Mode', 'mode.dest': 'Destinations', 'mode.drift': 'Drift',
    speed: 'Zoom speed', spin: 'Camera spin', depth: 'Maximum depth',
    mark: 'Use this point as destination', 't.mark': 'The autopilot will zoom towards the centre of the current view',
    density: 'Colour density', iter: 'Iterations', julia: 'Julia set of the point under the cursor',
    'dest.seahorse': 'Seahorse Valley', 'dest.elephant': 'Elephant Valley', 'dest.spiral': 'Misiurewicz spiral',
    'dest.antenna': 'Antenna minibrot', 'dest.triple': 'Triple Spiral Valley', 'dest.branch': 'Triple branch (M₃,₁)', 'dest.dendrite': 'Dendrite (c = i)',
    'dest.custom': 'Your point',
    iters: 'iter',
  },
};

function create(ctx, values) {
  const { gl, camera, palette, colors } = ctx;
  const prog = createProgram(gl, FULLSCREEN_VS, FS);
  const escape = new EscapeRenderer(gl);
  let orbitTex = null, orbitRows = 0;
  let ref = null;          // { x, y, length, maxIter, full }
  let maxIter = 256;
  let shift = 0;           // palette offset (cycling)
  let target = null;       // { x, y }: the point the autopilot zooms towards
  let destIndex = DESTINATIONS.findIndex((d) => d.id === values.dest);
  let mode = values.mode;  // 'dest' | 'drift'
  let fading = false;
  let ownMoves = -1;       // camera.moves after our own moves, to notice the user's
  let adopt = false;       // take the current view as ours at the next autopilot step
  let resumeFromHere = false;
  let driftT = 0;
  let hoverC = null;
  const data = { fbo: null, tex: null, pbo: null, fence: null, stale: false, view: null, w: 0, h: 0, pixels: null };

  const zoomOf = () => HOME.h / camera.h;
  /** A map still on its way was asked for another view: it is read back, then ignored. */
  function discardDrift() {
    if (data.fence) data.stale = true;
  }
  const minH = HOME.h / 10 ** MAX_DEPTH;

  function startDestination(i) {
    destIndex = (i + DESTINATIONS.length) % DESTINATIONS.length;
    const d = DESTINATIONS[destIndex];
    values.dest = d.id;
    mode = values.mode;
    if (mode === 'drift') {
      // drift starts near a destination, a little off, so every run goes somewhere new
      const a = Math.random() * Math.PI * 2, rad = 1e-3 * (0.5 + Math.random());
      target = { x: d.x + rad * Math.cos(a), y: d.y + rad * Math.sin(a) };
    } else {
      target = { x: d.x, y: d.y };
    }
    camera.set({ ...HOME, r: camera.r });
    discardDrift();
    ownMoves = camera.moves;
    resumeFromHere = false;
    ref = null;
    ctx.setParam('dest', d.id);
  }

  function uploadOrbit(best) {
    const rows = Math.ceil(best.length / ORBIT_W);
    if (!orbitTex || rows > orbitRows) {
      if (orbitTex) gl.deleteTexture(orbitTex);
      orbitRows = Math.max(rows, 4);
      orbitTex = createTexture(gl, { width: ORBIT_W, height: orbitRows, internal: gl.RG32F, format: gl.RG, type: gl.FLOAT });
    }
    gl.bindTexture(gl.TEXTURE_2D, orbitTex);
    const full = Math.floor(best.length / ORBIT_W);
    if (full) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ORBIT_W, full, gl.RG, gl.FLOAT, best.orbit, 0);
    const rest = best.length - full * ORBIT_W;
    if (rest) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, full, rest, 1, gl.RG, gl.FLOAT, best.orbit, full * ORBIT_W * 2);
  }

  /** Makes sure the reference orbit covers the view and the iterations. */
  function ensureReference() {
    maxIter = maxIterations(zoomOf(), values.iter);
    const aspect = camera.width / camera.height;
    const inView = (p) => Math.abs(p.x - camera.x) < 0.6 * camera.h * aspect && Math.abs(p.y - camera.y) < 0.6 * camera.h;
    if (ref && ref.maxIter >= maxIter && ref.full && inView(ref)) return;
    if (ref && ref.maxIter === maxIter && !ref.full && inView(ref) && performance.now() - ref.time < 400) return;
    const preferred = [];
    if (target && inView(target)) preferred.push([target.x, target.y]);
    preferred.push([camera.x, camera.y]);
    const best = chooseReference(referenceCandidates(preferred, camera.x, camera.y, camera.h, aspect), maxIter);
    uploadOrbit(best);
    ref = { x: best.x, y: best.y, length: best.length, maxIter, full: best.length === maxIter + 1, time: performance.now() };
  }

  function drawSet(w, h, dataMode) {
    const u = prog.u;
    gl.useProgram(prog.program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, orbitTex);
    gl.uniform1i(u.uOrbit, 1);
    gl.uniform1i(u.uRefLen, ref.length);
    gl.uniform1i(u.uMaxIter, maxIter);
    gl.uniform2f(u.uRes, w, h);
    gl.uniform1f(u.uPx, camera.h / h);
    gl.uniform2f(u.uRot, Math.cos(camera.r), Math.sin(camera.r));
    gl.uniform2f(u.uOffset, camera.x - ref.x, camera.y - ref.y);
    gl.uniform1i(u.uData, dataMode ? 1 : 0);
    setShade(gl, u, palette, { density: values.density, shift, inside: colors.shadeRgb });
    drawFullscreen(gl);
  }

  /**
   * Asks the GPU for a small map of the view (the drift autopilot looks at it). The pixels come
   * back asynchronously through a pixel buffer and a fence, so the GPU never stalls.
   */
  function requestDrift() {
    if (data.fence) return;
    const w = DATA_W, h = Math.max(8, Math.round((DATA_W * camera.height) / camera.width));
    if (!data.fbo || data.w !== w || data.h !== h) {
      if (data.fbo) { gl.deleteFramebuffer(data.fbo); gl.deleteTexture(data.tex); gl.deleteBuffer(data.pbo); }
      data.tex = createTexture(gl, { width: w, height: h, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
      data.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, data.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, data.tex, 0);
      data.pbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, data.pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      data.w = w; data.h = h;
      data.pixels = new Uint8Array(w * h * 4);
    }
    ensureReference();
    gl.bindFramebuffer(gl.FRAMEBUFFER, data.fbo);
    gl.viewport(0, 0, w, h);
    drawSet(w, h, true);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, data.pbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, camera.width, camera.height);
    data.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    data.view = { x: camera.x, y: camera.y, h: camera.h, r: camera.r };
  }

  /** The world point the drift heads to, once the map asked for is back; otherwise null. */
  function pollDrift() {
    if (!data.fence) return null;
    const st = gl.clientWaitSync(data.fence, 0, 0);
    if (st !== gl.ALREADY_SIGNALED && st !== gl.CONDITION_SATISFIED) return null;
    gl.deleteSync(data.fence);
    data.fence = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, data.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, data.pixels);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    if (data.stale) { data.stale = false; return null; }
    const p = driftTarget(data.pixels, data.w, data.h);
    if (!p) return null;
    const v = data.view;
    const px = ((p[0] - data.w / 2) * v.h) / data.h, py = ((p[1] - data.h / 2) * v.h) / data.h;
    const c = Math.cos(v.r), s = Math.sin(v.r);
    return { x: v.x + c * px - s * py, y: v.y + s * px + c * py };
  }

  function autopilot(dt) {
    if (adopt) { adopt = false; ownMoves = camera.moves; }
    if (camera.moves !== ownMoves) resumeFromHere = true; // someone moved the view by hand
    if (resumeFromHere) {
      // carry on from where the user left it, drifting towards the detail
      resumeFromHere = false;
      mode = 'drift';
      target = { x: camera.x, y: camera.y };
      discardDrift();
      driftT = 1;
    }
    const limit = Math.max(minH, HOME.h / 10 ** values.depth);
    if (fading) return;
    if (camera.h <= limit * 1.0001) {
      fading = true;
      ctx.fade(() => {
        fading = false;
        startDestination(values.mode === 'drift' ? Math.floor(Math.random() * DESTINATIONS.length) : destIndex + 1);
      });
      return;
    }
    if (mode === 'drift') {
      driftT += dt;
      const p = pollDrift();
      if (p) target.next = p;
      if (driftT > 0.3) {
        driftT = 0;
        requestDrift();
      }
      if (target.next) {
        const a = 1 - Math.exp(-1.5 * dt);
        target.x += (target.next.x - target.x) * a;
        target.y += (target.next.y - target.y) * a;
      }
    }
    // zoom about the target (it stays put on the screen) while pulling it slowly to the centre
    const h = Math.max(limit, camera.h / Math.pow(values.speed, dt));
    const q = (h / camera.h) * Math.exp(-0.35 * dt);
    const dr = ((values.spin * Math.PI) / 180) * dt;
    const c = Math.cos(dr), s = Math.sin(dr);
    const ox = camera.x - target.x, oy = camera.y - target.y;
    camera.set({ x: target.x + (c * ox - s * oy) * q, y: target.y + (s * ox + c * oy) * q, h, r: camera.r + dr });
    ownMoves = camera.moves;
  }

  function insetJulia() {
    if (!values.julia) { ctx.inset(null); return; }
    const rect = ctx.insetRect('br');
    if (rect.w * 2.2 > camera.width || rect.h * 2.2 > camera.height) { ctx.inset(null); return; }
    const c = hoverC || [camera.x, camera.y];
    escape.draw(rect, {
      center: [0, 0], h: 3.1, r: 0, julia: true, c, maxIter: 200,
      palette, density: values.density, shift, inside: colors.shadeRgb,
    });
    const fmt = (v) => num(v, 4);
    ctx.inset(rect, `Julia · c = ${fmt(c[0])} ${c[1] < 0 ? '−' : '+'} ${fmt(Math.abs(c[1]))}i`);
  }

  return {
    limits: { minH, maxH: HOME.h * 4 },
    home: () => ({ ...HOME, r: 0 }),

    enter(restored) {
      if (target) adopt = true; // back from another tab: carry on as before
      else if (!restored) startDestination(Math.max(0, destIndex));
      else {
        // opened from a link to an exact view: when it plays, it drifts on from there
        target = { x: camera.x, y: camera.y };
        mode = 'drift';
        adopt = true;
      }
    },
    leave() { ctx.inset(null); },

    param(key) {
      if (key === 'dest') {
        const i = DESTINATIONS.findIndex((d) => d.id === values.dest);
        ctx.fade(() => startDestination(i));
      } else if (key === 'mode') {
        mode = values.mode;
        if (mode === 'drift') target = { x: camera.x, y: camera.y };
        else target = { ...DESTINATIONS[Math.max(0, destIndex)] };
      } else if (key === 'iter') {
        ref = null;
      }
    },

    action(act) {
      if (act === 'mark') {
        target = { x: camera.x, y: camera.y };
        mode = 'dest';
        adopt = true;
        resumeFromHere = false;
      }
    },

    next() { ctx.fade(() => startDestination(destIndex + 1)); },
    fit() {
      camera.flyTo({ ...HOME, r: 0 }, 0.9);
      target = { ...DESTINATIONS[Math.max(0, destIndex)] };
      mode = values.mode;
      adopt = true;
      resumeFromHere = false;
    },

    update(dt, s) {
      let changed = false;
      if (s.running && values.cycle > 0) {
        shift = (shift + (values.cycle / 60) * dt) % 1;
        changed = true;
      }
      if (s.auto) {
        autopilot(dt);
        changed = true;
      }
      return changed;
    },

    render() {
      ensureReference();
      gl.viewport(0, 0, camera.width, camera.height);
      drawSet(camera.width, camera.height, false);
      insetJulia();
    },

    hover(info) {
      hoverC = info ? [info.wx, info.wy] : null;
      if (values.julia) ctx.redraw();
    },

    stats() {
      return `zoom ×${sci(zoomOf())} · ${num(maxIter)} ${ctx.t('iters')}`;
    },
  };
}

export default { id: 'mandelbrot', schema, texts, create, adaptive: true, linkView: true };
