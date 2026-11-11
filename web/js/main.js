// Fractal Designer: one tab per fractal family, all animated by default and all hands-on.
// The fractal moves on its own until you touch it, and when you let go it carries on by itself.
//
// This file is the shell shared by every tab: tabs, language and theme, the controls panel built
// from each tab's schema, the shared camera and its input, the state in the URL, the keyboard and
// the animation loop. Each tab lives in js/fractals/ and has the same shape (see README.md).

import { createContext, hexToRgb } from './gl.js';
import { Camera, Input } from './camera.js';
import { Panel } from './panel.js';
import { PaletteTexture } from './draw.js';
import { PALETTE_IDS, paletteStops } from './core/palettes.js';
import { parseHash, formatHash, readParams, changedParams, defaults, fmtNumber } from './core/state.js';
import { t, setLang, getLang, addTexts, LANG_KEY } from './i18n.js';

import mandelbrot from './fractals/mandelbrot.js';
import julia from './fractals/julia.js';
import dragon from './fractals/dragon.js';
import tree from './fractals/tree.js';
import chaos from './fractals/chaos.js';
import lsystem from './fractals/lsystem.js';

const TABS = [mandelbrot, julia, dragon, tree, chaos, lsystem];
const IDLE_MS = 4000;         // without touching it for this long, the autopilot takes over again
const MAX_DPR = 2;            // more device pixels than this cost a lot and show little
TABS.forEach((m) => addTexts(m.texts));

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const canvas = $('view');
const errorBox = $('error');
const Theme = window.Theme;

// ---- language and theme (they work even without WebGL2) ------------------
const themeBtns = document.querySelectorAll('.theme-btn');
const onLang = [];
const onTheme = [];

function paintText() {
  root.lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
  document.querySelectorAll('.lang-switch button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === getLang()));
  document.querySelector('meta[name="description"]').content = t('desc');
  if (Theme) themeBtns.forEach((b) => { b.textContent = t(`theme.${Theme.mode()}`); });
  onLang.forEach((f) => f());
}

/** Colours of the page tokens, for what the canvas draws (it does not inherit CSS). */
const colors = {};
function readColors() {
  const css = getComputedStyle(root);
  for (const name of ['bg', 'surface', 'ink', 'muted', 'accent', 'second', 'line', 'shade']) {
    colors[name] = css.getPropertyValue(`--${name}`).trim();
    colors[`${name}Rgb`] = hexToRgb(colors[name] || '#000000');
  }
  colors.dark = Theme ? Theme.isDark() : matchMedia('(prefers-color-scheme: dark)').matches;
}

function syncTheme() {
  if (Theme) themeBtns.forEach((b) => { b.textContent = t(`theme.${Theme.mode()}`); });
  readColors();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = colors.bg;
  onTheme.forEach((f) => f());
}

if (Theme) {
  themeBtns.forEach((b) => b.addEventListener('click', () => Theme.cycle()));
  Theme.onChange(syncTheme);
} else {
  themeBtns.forEach((b) => { b.hidden = true; });
}
document.querySelectorAll('.lang-switch button').forEach((b) => {
  b.addEventListener('click', () => {
    setLang(b.dataset.lang);
    try { localStorage.setItem(LANG_KEY, getLang()); } catch (e) { /* no storage */ }
    paintText();
  });
});

// Give the keyboard back to the fractal after using a button or a list, so a later Space
// doesn't press that button again or open the list.
document.addEventListener('click', (e) => {
  const b = e.target.closest('button, summary');
  if (b) b.blur();
});
document.addEventListener('change', (e) => {
  if (e.target.matches('select, input[type="checkbox"], input[type="radio"]')) e.target.blur();
});

let errorKey = null;
function fail(code) {
  errorKey = code;
  errorBox.textContent = t(`e.${code}`);
  errorBox.hidden = false;
}
onLang.push(() => { if (errorKey) errorBox.textContent = t(`e.${errorKey}`); });

// ---- WebGL --------------------------------------------------------------
let gl;
try {
  gl = createContext(canvas);
} catch (e) {
  readColors();
  paintText();
  syncTheme();
  fail('nogl');
}

if (gl) start();

function start() {
  readColors();
  const camera = new Camera();
  const palette = new PaletteTexture(gl);
  const insetBox = $('inset');
  const insetLabel = $('inset-label');
  const stats = $('stats');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let running = !reducedMotion; // starts playing as soon as the page opens
  let autoNext = true;          // move on to the next variation (preset, destination) by itself
  let lastTouch = -Infinity;
  let dirty = true;
  let quality = 1;              // fraction of the device pixels the heavy tabs render

  const ctx = {
    gl, canvas, camera, palette, colors, t,
    get running() { return running; },
    /** Redraw on the next frame. */
    redraw() { dirty = true; },
    /** Fades the canvas out, runs fn, and fades it back in. */
    fade(fn) {
      if (reducedMotion) { fn(); dirty = true; return; }
      canvas.classList.add('fading');
      setTimeout(() => { fn(); dirty = true; canvas.classList.remove('fading'); }, 620);
    },
    /** Frame over a square of the canvas (device pixels from the top-left), or null to hide it. */
    inset(rect, label) {
      if (!rect) { insetBox.hidden = true; return; }
      const dpr = canvas.width / (canvas.clientWidth || 1);
      insetBox.hidden = false;
      insetBox.classList.toggle('right', rect.x > canvas.width / 2);
      insetBox.style.left = `${rect.x / dpr - 3}px`;
      insetBox.style.top = `${rect.y / dpr - 3}px`;
      insetBox.style.width = `${rect.w / dpr + 6}px`;
      insetBox.style.height = `${rect.h / dpr + 6}px`;
      insetLabel.textContent = label;
    },
    /** Square for an inset in a corner, in device pixels from the top-left. */
    insetRect(corner = 'br') {
      const dpr = canvas.width / (canvas.clientWidth || 1);
      const side = Math.round(Math.min(220, Math.max(96, Math.min(canvas.clientWidth, canvas.clientHeight) * 0.3)) * dpr);
      const m = Math.round(14 * dpr);
      const top = Math.round(36 * dpr); // room for the label above it
      return {
        x: corner.includes('l') ? m : canvas.width - side - m,
        y: corner.includes('t') ? top : canvas.height - side - m,
        w: side, h: side,
      };
    },
    /** Called by a tab when one of its parameters changes from the canvas (a drag on a handle). */
    setParam(key, v) {
      current.values[key] = v;
      panel.syncAll();
      dirty = true;
    },
  };

  // per tab: values of its parameters, its instance (created the first time) and its last view
  const tabs = TABS.map((mod) => ({ mod, values: defaults(mod.schema), inst: null, view: null }));
  let current = null;

  const panel = new Panel($('controls'), $('look'), {
    onChange(key, v) {
      if (key === 'palette') setPalette();
      current.inst.param(key, v);
      dirty = true;
      scheduleUrl();
    },
    onAction(act) {
      current.inst.action(act);
      dirty = true;
      scheduleUrl();
    },
  });

  function setPalette() {
    palette.set(paletteStops(current.values.palette, { ink: colors.ink, surface: colors.surface }));
  }

  // ---- tab bar ------------------------------------------------------------
  const tabBar = $('tabs');
  const tabBtns = tabs.map((tb, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.i18n = `tab.${tb.mod.id}`;
    b.textContent = t(`tab.${tb.mod.id}`);
    b.title = `${i + 1}`;
    b.addEventListener('click', () => switchTo(tb));
    tabBar.append(b);
    return b;
  });

  function paintKeys() {
    const rows = [
      ['k.drag', 'h.drag'], ['k.wheel', 'h.wheel'], ['k.pinch', 'h.pinch'], ['k.dbl', 'h.dbl'],
      ...(current ? current.mod.keys || [] : []),
      ['k.space', 'h.play'], ['N', 'h.next'], ['A', 'h.loop'], ['F', 'h.fit'], ['P', 'h.pal'], ['k.arrows', 'h.arrows'], ['1 … 6', 'h.tabs'],
    ];
    const dl = $('keys');
    dl.textContent = '';
    for (const [k, h] of rows) {
      const dt = document.createElement('dt');
      for (const part of k.split(' + ')) {
        if (dt.childNodes.length) dt.append(' + ');
        const kbd = document.createElement('kbd');
        if (part.startsWith('k.')) kbd.dataset.i18n = part;
        kbd.textContent = part.startsWith('k.') ? t(part) : part;
        dt.append(kbd);
      }
      const dd = document.createElement('dd');
      dd.dataset.i18n = h;
      dd.textContent = t(h);
      dl.append(dt, dd);
    }
  }

  function switchTo(tb, restored = null) {
    if (current === tb && !restored) return;
    if (current) {
      current.view = camera.get();
      current.inst.leave();
    }
    current = tb;
    tabBtns.forEach((b, i) => {
      b.setAttribute('aria-selected', tabs[i] === tb);
      b.tabIndex = tabs[i] === tb ? 0 : -1;
    });
    tabBtns[tabs.indexOf(tb)].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (!tb.inst) tb.inst = tb.mod.create(ctx, tb.values);
    const lim = tb.inst.limits || {};
    camera.minH = lim.minH ?? 1e-6;
    camera.maxH = lim.maxH ?? 1e6;
    camera.flight = null;
    const view = restored?.view || tb.view || tb.inst.home();
    camera.set({ r: 0, ...view });
    $('pitch').dataset.i18n = `pitch.${tb.mod.id}`;
    panel.build(tb.mod.schema, tb.values);
    setPalette();
    tb.inst.enter(!!(restored?.view || tb.view));
    insetBox.hidden = true;
    paintKeys();
    paintText();
    dirty = true;
    scheduleUrl();
  }

  // ---- URL ----------------------------------------------------------------
  let urlTimer = 0;
  function hashNow() {
    const tb = current;
    const entries = [];
    if (tb.mod.linkView) {
      const home = tb.inst.home();
      entries.push(['x', fmtNumber(camera.x)], ['y', fmtNumber(camera.y)], ['z', fmtNumber(home.h / camera.h, 6)]);
      if (Math.abs(camera.r) > 1e-4) entries.push(['r', fmtNumber((camera.r * 180) / Math.PI, 5)]);
    }
    if (tb.inst.linkState) entries.push(...tb.inst.linkState());
    entries.push(...changedParams(tb.mod.schema, tb.values));
    return formatHash(tb.mod.id, entries);
  }
  function scheduleUrl() {
    if (urlTimer) return;
    urlTimer = setTimeout(() => {
      urlTimer = 0;
      const h = hashNow();
      if (h !== location.hash) history.replaceState(null, '', location.pathname + location.search + h);
    }, 400);
  }

  /** Applies a hash: tab, parameters and, for the tabs that keep it, the exact view. */
  function applyHash(hash) {
    const { tab, values } = parseHash(hash);
    const tb = tabs.find((x) => x.mod.id === tab);
    if (!tb) return false;
    Object.assign(tb.values, defaults(tb.mod.schema), readParams(tb.mod.schema, values));
    if (!tb.inst) tb.inst = tb.mod.create(ctx, tb.values);
    let view = null;
    if (tb.mod.linkView && 'x' in values && 'y' in values) {
      const home = tb.inst.home();
      const z = parseFloat(values.z) || 1;
      view = { x: parseFloat(values.x) || 0, y: parseFloat(values.y) || 0, h: home.h / z, r: ((parseFloat(values.r) || 0) * Math.PI) / 180 };
      if (!Number.isFinite(view.x) || !Number.isFinite(view.y) || !Number.isFinite(view.h)) view = null;
    }
    if (tb.inst.readLink) tb.inst.readLink(values);
    switchTo(tb, { view });
    if (view) setRunning(false); // a link to an exact view opens still on that view
    return true;
  }

  // ---- actions ------------------------------------------------------------
  const playBtns = document.querySelectorAll('[data-act="play"]');
  function paintPlay() {
    for (const b of playBtns) {
      const label = b.querySelector('span');
      label.dataset.i18n = running ? 'pause' : 'play';
      label.textContent = t(label.dataset.i18n);
      b.dataset.running = running;
    }
  }
  onLang.push(paintPlay);
  function setRunning(on) {
    running = on;
    if (on) lastTouch = -Infinity; // Play hands the view back to the autopilot at once
    paintPlay();
    dirty = true;
  }

  const shareBtn = document.querySelector('[data-act="share"]');
  function share() {
    clearTimeout(urlTimer);
    urlTimer = 0;
    const h = hashNow();
    history.replaceState(null, '', location.pathname + location.search + h);
    const done = () => {
      shareBtn.dataset.i18n = 'copied';
      shareBtn.textContent = t('copied');
      setTimeout(() => { shareBtn.dataset.i18n = 'share'; shareBtn.textContent = t('share'); }, 1500);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, () => {});
  }

  function next() { current.inst.next(); lastTouch = -Infinity; dirty = true; scheduleUrl(); }
  function fit() {
    if (current.inst.fit) current.inst.fit();
    else camera.flyTo({ ...current.inst.home(), r: 0 });
    dirty = true;
  }
  function cyclePalette() {
    const i = PALETTE_IDS.indexOf(current.values.palette);
    current.values.palette = PALETTE_IDS[(i + 1) % PALETTE_IDS.length];
    setPalette();
    current.inst.param('palette', current.values.palette);
    panel.syncAll();
    dirty = true;
    scheduleUrl();
  }

  // Automatic change of variation: off, a tab stays on its preset or destination (and keeps
  // animating) instead of moving on when it is done. Play/pause stops everything; this does not.
  const loopBtns = document.querySelectorAll('[data-act="loop"]');
  function paintLoop() { loopBtns.forEach((b) => b.setAttribute('aria-pressed', autoNext)); }
  function toggleLoop() { autoNext = !autoNext; paintLoop(); }

  const ACTIONS = { play: () => setRunning(!running), next, fit, share, loop: toggleLoop };
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', ACTIONS[b.dataset.act]));

  // ---- input --------------------------------------------------------------
  const input = new Input(canvas, camera, {
    tab: () => current && current.inst,
    touched: () => { lastTouch = performance.now(); dirty = true; },
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const step = 0.15 * Math.min(canvas.width, canvas.height);
    const touch = () => { lastTouch = performance.now(); camera.flight = null; dirty = true; };
    if (k === ' ') { e.preventDefault(); setRunning(!running); }
    else if (k === 'n') next();
    else if (k === 'f') fit();
    else if (k === 'p') cyclePalette();
    else if (k === 'a') toggleLoop();
    else if (k >= '1' && k <= String(tabs.length)) switchTo(tabs[+k - 1]);
    else if (k === '+' || k === '=') { touch(); camera.zoomAt(canvas.width / 2, canvas.height / 2, 1.25); }
    else if (k === '-') { touch(); camera.zoomAt(canvas.width / 2, canvas.height / 2, 0.8); }
    else if (k === 'arrowleft') { e.preventDefault(); touch(); camera.pan(step, 0); }
    else if (k === 'arrowright') { e.preventDefault(); touch(); camera.pan(-step, 0); }
    else if (k === 'arrowup') { e.preventDefault(); touch(); camera.pan(0, step); }
    else if (k === 'arrowdown') { e.preventDefault(); touch(); camera.pan(0, -step); }
    else if (current.inst.key) current.inst.key(k, e);
  });

  // ---- canvas size ----------------------------------------------------------
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * (current.mod.adaptive ? quality : 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      camera.setSize(w, h);
      if (current.inst.resize) current.inst.resize();
      dirty = true;
    }
  }

  // Heavy tabs (Mandelbrot, Julia) lower their resolution when frames get slow, and raise it
  // again when there is room. Checked once a second, so the canvas is not resized every frame.
  let slowT = 0, slowFrames = 0, slowSum = 0;
  function adapt(dt, drew) {
    if (!current.mod.adaptive || !drew) return;
    slowSum += dt;
    slowFrames++;
    slowT += dt;
    if (slowT < 1) return;
    const avg = slowSum / slowFrames;
    if (avg > 1 / 34 && quality > 0.5) quality = Math.max(0.5, quality * 0.85);
    else if (avg < 1 / 52 && quality < 1) quality = Math.min(1, quality * 1.1);
    slowT = slowFrames = slowSum = 0;
  }

  // ---- loop -----------------------------------------------------------------
  let last = performance.now();
  let statT = 0;
  let seenVersion = -1;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    resizeCanvas();
    const flying = camera.stepFlight(dt);
    if (flying) lastTouch = now;
    const auto = running && !input.active && !flying && now - lastTouch > IDLE_MS;
    const changed = current.inst.update(dt, { running, auto, now, autoNext });
    let drew = false;
    if (changed || dirty || camera.version !== seenVersion) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      current.inst.render();
      seenVersion = camera.version;
      dirty = false;
      drew = true;
      scheduleUrl();
    }
    adapt(dt, drew);
    if (now - statT > 250) {
      statT = now;
      const mode = !running ? t('paused') : auto ? t('auto') : t('manual');
      stats.textContent = `${current.inst.stats()} · ${mode}`;
    }
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fail('lost');
  });

  onTheme.push(() => {
    if (!current) return;
    setPalette();
    if (current.inst.theme) current.inst.theme();
    dirty = true;
  });
  onLang.push(() => { if (current) { panel.refresh(); dirty = true; } });
  window.addEventListener('hashchange', () => applyHash(location.hash));

  // ---- start ----------------------------------------------------------------
  if (!applyHash(location.hash)) switchTo(tabs[0]);
  paintText();
  syncTheme();
  paintPlay();
  paintLoop();
  window.fractals = { ctx, tabs, get current() { return current; }, setRunning }; // handy from the console

  // The canvas only has its final size once the web fonts are in (they change the width of the
  // folded panel and the height of the bars). Waits for them, 1.5 s at most.
  const fontsReady = document.fonts && document.fonts.ready
    ? Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1500))])
    : Promise.resolve();
  fontsReady.then(() => {
    resizeCanvas();
    requestAnimationFrame((t0) => { last = t0; frame(t0); });
  });
}
