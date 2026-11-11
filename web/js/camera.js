// Shared camera controller: pan, zoom, rotation and smooth flights, plus the mouse, touch and
// wheel input that moves it. Every tab uses the same camera; the tabs only say where to look
// when nobody is touching (the autopilot).

const TAU = Math.PI * 2;
const wrapAngle = (a) => a - TAU * Math.round(a / TAU);
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/**
 * A view of the plane: centre (x, y), visible height h in world units and rotation r (radians,
 * counterclockwise). World y goes up. width and height are the canvas size in device pixels.
 */
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.h = 1;
    this.r = 0;
    this.minH = 1e-300;
    this.maxH = 1e300;
    this.width = 1;
    this.height = 1;
    this.version = 0; // grows on every change (view or size), so the tabs can tell when to redraw
    this.moves = 0;   // grows on every change of the view only
    this.flight = null;
  }

  /** Pixels per world unit. */
  get k() { return this.height / this.h; }

  get() { return { x: this.x, y: this.y, h: this.h, r: this.r }; }

  set(v) {
    if (v.x !== undefined) this.x = v.x;
    if (v.y !== undefined) this.y = v.y;
    if (v.h !== undefined) this.h = Math.min(this.maxH, Math.max(this.minH, v.h));
    if (v.r !== undefined) this.r = wrapAngle(v.r);
    this.version++;
    this.moves++;
  }

  setSize(width, height) {
    if (width === this.width && height === this.height) return false;
    this.width = width;
    this.height = height;
    this.version++;
    return true;
  }

  /** World point under a canvas pixel (device pixels from the top-left corner). */
  toWorld(px, py) {
    const dx = (px - this.width / 2) / this.k, dy = (this.height / 2 - py) / this.k;
    const c = Math.cos(this.r), s = Math.sin(this.r);
    return [this.x + c * dx - s * dy, this.y + s * dx + c * dy];
  }

  /** Canvas pixel (from the top-left) of a world point. */
  toScreen(wx, wy) {
    const dx = wx - this.x, dy = wy - this.y;
    const c = Math.cos(this.r), s = Math.sin(this.r);
    return [this.width / 2 + this.k * (c * dx + s * dy), this.height / 2 - this.k * (-s * dx + c * dy)];
  }

  /** Zooms by factor f (> 1 is closer) keeping the world point under (px, py) in place. */
  zoomAt(px, py, f) {
    const [wx, wy] = this.toWorld(px, py);
    const h = Math.min(this.maxH, Math.max(this.minH, this.h / f));
    const q = h / this.h;
    this.set({ x: wx - (wx - this.x) * q, y: wy - (wy - this.y) * q, h });
  }

  /** Moves the content by (dx, dy) canvas pixels, as a drag does. */
  pan(dx, dy) {
    const c = Math.cos(this.r), s = Math.sin(this.r);
    const ux = dx / this.k, uy = -dy / this.k;
    this.set({ x: this.x - (c * ux - s * uy), y: this.y - (s * ux + c * uy) });
  }

  /** Turns the view by da radians keeping the world point under (px, py) in place. */
  rotateAt(px, py, da) {
    const [wx, wy] = this.toWorld(px, py);
    const c = Math.cos(da), s = Math.sin(da);
    const ox = this.x - wx, oy = this.y - wy;
    this.set({ x: wx + c * ox - s * oy, y: wy + s * ox + c * oy, r: this.r + da });
  }

  /** Eases towards a target view; rate is 1/seconds. The height moves in log scale. */
  follow(t, dt, rate = 2.5) {
    const a = 1 - Math.exp(-rate * dt);
    const h = t.h === undefined ? this.h : Math.exp(Math.log(this.h) + (Math.log(t.h) - Math.log(this.h)) * a);
    this.set({
      x: t.x === undefined ? this.x : this.x + (t.x - this.x) * a,
      y: t.y === undefined ? this.y : this.y + (t.y - this.y) * a,
      h,
      r: t.r === undefined ? this.r : this.r + wrapAngle(t.r - this.r) * a,
    });
  }

  /** Smooth flight to a view (double click, "fit"). */
  flyTo(t, seconds = 0.7) {
    this.flight = { from: this.get(), to: { ...this.get(), ...t }, t: 0, seconds };
  }

  /** Advances the flight, if any. Returns true while flying. */
  stepFlight(dt) {
    const f = this.flight;
    if (!f) return false;
    f.t = Math.min(1, f.t + dt / f.seconds);
    const u = ease(f.t);
    const lh = Math.log(f.from.h) + (Math.log(f.to.h) - Math.log(f.from.h)) * u;
    this.set({
      x: f.from.x + (f.to.x - f.from.x) * u,
      y: f.from.y + (f.to.y - f.from.y) * u,
      h: Math.exp(lh),
      r: f.from.r + wrapAngle(f.to.r - f.from.r) * u,
    });
    if (f.t >= 1) this.flight = null;
    return true;
  }
}

/**
 * Mouse, touch and wheel on the canvas. One finger or the mouse pans (unless the tab takes the
 * pointer, for a handle), two fingers zoom and turn, the wheel zooms at the cursor and a double
 * click or double tap flies closer. `hooks.tab()` is the active tab; `hooks.touched()` is called
 * on every interaction.
 */
export class Input {
  constructor(canvas, camera, hooks) {
    this.canvas = canvas;
    this.camera = camera;
    this.hooks = hooks;
    this.pointers = new Map();
    this.mode = null; // 'pan' | 'pinch' | 'tab'
    this.lastTap = null;
    this.down = null;
    this.gesture = null;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e, true));
    canvas.addEventListener('pointerleave', (e) => { if (!this.pointers.size) this.tabCall('hover', null); });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  get active() { return this.pointers.size > 0; }

  /** Device pixels from the top-left of the canvas for an event. */
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    const s = this.canvas.width / (r.width || 1);
    return [(e.clientX - r.left) * s, (e.clientY - r.top) * s];
  }

  info(e) {
    const [px, py] = this.point(e);
    const [wx, wy] = this.camera.toWorld(px, py);
    return { px, py, wx, wy, e };
  }

  tabCall(name, arg) {
    const tab = this.hooks.tab();
    return tab && typeof tab[name] === 'function' ? tab[name](arg) : undefined;
  }

  onDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    const [px, py] = this.point(e);
    this.pointers.set(e.pointerId, [px, py]);
    this.hooks.touched();
    if (this.pointers.size === 1) {
      this.down = { px, py, t: performance.now(), moved: 0 };
      const button = e.pointerType === 'mouse' ? e.button : 0;
      if (button === 0 && !e.shiftKey && this.tabCall('pointerDown', this.info(e))) {
        this.mode = 'tab';
      } else {
        this.mode = 'pan';
        this.canvas.classList.add('panning');
      }
    } else if (this.pointers.size === 2) {
      if (this.mode === 'tab') this.tabCall('pointerUp', this.info(e));
      this.mode = 'pinch';
      this.gesture = this.measure();
      this.down = null;
    }
  }

  measure() {
    const [a, b] = [...this.pointers.values()];
    return {
      cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2,
      d: Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
      angle: Math.atan2(-(b[1] - a[1]), b[0] - a[0]),
    };
  }

  onMove(e) {
    const [px, py] = this.point(e);
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') this.tabCall('hover', this.info(e));
      return;
    }
    const [lx, ly] = this.pointers.get(e.pointerId);
    this.pointers.set(e.pointerId, [px, py]);
    this.hooks.touched();
    if (this.down) this.down.moved += Math.hypot(px - lx, py - ly);
    if (this.mode === 'pan') {
      this.camera.flight = null;
      this.camera.pan(px - lx, py - ly);
    } else if (this.mode === 'tab') {
      this.tabCall('pointerMove', this.info(e));
    } else if (this.mode === 'pinch' && this.pointers.size >= 2) {
      const g = this.measure(), p = this.gesture;
      this.camera.flight = null;
      this.camera.pan(g.cx - p.cx, g.cy - p.cy);
      this.camera.zoomAt(g.cx, g.cy, g.d / p.d);
      this.camera.rotateAt(g.cx, g.cy, -(g.angle - p.angle));
      this.gesture = g;
    }
    if (e.pointerType === 'mouse' && this.mode !== 'tab') this.tabCall('hover', this.info(e));
  }

  onUp(e, cancelled = false) {
    if (!this.pointers.has(e.pointerId)) return;
    const info = this.info(e);
    this.pointers.delete(e.pointerId);
    this.hooks.touched();
    if (this.mode === 'tab') this.tabCall('pointerUp', info);
    if (this.pointers.size === 1 && this.mode === 'pinch') {
      // back to one finger: keep panning with it
      this.mode = 'pan';
      return;
    }
    if (this.pointers.size > 0) return;
    this.canvas.classList.remove('panning');
    const d = this.down;
    const dpr = this.canvas.width / (this.canvas.getBoundingClientRect().width || 1);
    if (!cancelled && d && d.moved < 8 * dpr && performance.now() - d.t < 350) this.tap(info);
    this.mode = null;
    this.down = null;
  }

  tap(info) {
    const now = performance.now();
    const last = this.lastTap;
    const dpr = this.canvas.width / (this.canvas.getBoundingClientRect().width || 1);
    if (last && now - last.t < 400 && Math.hypot(info.px - last.px, info.py - last.py) < 30 * dpr) {
      this.lastTap = null;
      if (!this.tabCall('doubleTap', info)) {
        const [wx, wy] = this.camera.toWorld(info.px, info.py);
        this.camera.flyTo({ x: wx, y: wy, h: this.camera.h / 3 });
      }
    } else {
      this.lastTap = { t: now, px: info.px, py: info.py };
      this.tabCall('tap', info);
    }
  }

  onWheel(e) {
    e.preventDefault();
    this.hooks.touched();
    this.camera.flight = null;
    const [px, py] = this.point(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    this.camera.zoomAt(px, py, Math.exp(-e.deltaY * unit * 0.0015));
  }
}
