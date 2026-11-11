// Drawing pieces shared by the tabs: the palette as a texture, and a batch of thick line
// segments drawn with instancing (one quad per segment, any width, square or flat ends).
import { HEADER, createProgram, createTexture, IDENTITY } from './gl.js';
import { gradientPixels } from './core/palettes.js';

/** The current palette as a 256×1 texture that repeats, for the shaders. */
export class PaletteTexture {
  constructor(gl) {
    this.gl = gl;
    this.tex = createTexture(gl, {
      width: 256, height: 1, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE,
      filter: gl.LINEAR, wrap: gl.REPEAT,
    });
    this.pixels = null;
  }
  set(stops) {
    const gl = this.gl;
    this.pixels = gradientPixels(stops, 256);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
  }
  /** [r, g, b] in 0..1 at t (repeats every 1). */
  sample(t) {
    const i = ((Math.floor((t - Math.floor(t)) * 256) % 256) + 256) % 256;
    const p = this.pixels;
    return [p[i * 4] / 255, p[i * 4 + 1] / 255, p[i * 4 + 2] / 255];
  }
  bind(unit = 0) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }
}

const SEG_VS = `${HEADER}
layout(location = 0) in vec2 aCorner;   // x: 0 at A, 1 at B; y: -1 or 1 across
layout(location = 1) in vec2 aA;
layout(location = 2) in vec2 aB;
layout(location = 3) in float aT;       // position in the palette
layout(location = 4) in float aW;       // width in world units
uniform mat3 uView;    // world -> canvas pixels
uniform mat3 uModel;   // extra transform in world (a rotated copy)
uniform vec2 uRes;
uniform float uScale;  // world units -> pixels, for the widths
uniform float uMinPx;  // minimum width in pixels
uniform float uCap;    // 1: square ends (half a width past each end), 0: flat ends
uniform float uTShift;
uniform float uGrow;   // 0..1: how much of each segment is drawn, from A
out float vT;
void main() {
  mat3 m = uView * uModel;
  vec2 a = (m * vec3(aA, 1.0)).xy;
  vec2 b = (m * vec3(aB, 1.0)).xy;
  b = mix(a, b, uGrow);
  float w = max(aW * uScale, uMinPx);
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float ext = uCap * 0.5 * w;
  vec2 p = mix(a - dir * ext, b + dir * ext, aCorner.x) + nrm * (aCorner.y * 0.5 * w);
  gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0);
  vT = aT + uTShift;
}`;

const SEG_FS = `${HEADER}
uniform sampler2D uPalette;
uniform vec4 uSolid;   // when uSolid.a > 0, that colour instead of the palette
uniform float uAlpha;
in float vT;
out vec4 outColor;
void main() {
  vec3 c = uSolid.a > 0.0 ? uSolid.rgb : texture(uPalette, vec2(vT, 0.5)).rgb;
  outColor = vec4(c, uAlpha);
}`;

const FLOATS = 6; // ax, ay, bx, by, t, w

let shared = null;
function sharedProgram(gl) {
  if (shared && shared.gl === gl) return shared;
  const prog = createProgram(gl, SEG_VS, SEG_FS);
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
  shared = { gl, prog, corners };
  return shared;
}

/**
 * A list of segments on the GPU. `data` holds FLOATS numbers per segment:
 * ax, ay, bx, by, t (palette position), w (width in world units, 0 = use uMinPx).
 */
export class SegmentBatch {
  constructor(gl) {
    this.gl = gl;
    const { corners } = sharedProgram(gl);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    this.count = 0;
    this.capacity = 0;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const stride = FLOATS * 4;
    const attrs = [[1, 2, 0], [2, 2, 8], [3, 1, 16], [4, 1, 20]];
    for (const [loc, size, offset] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
  }

  /** Uploads the first `count` segments of `data`. */
  set(data, count = data.length / FLOATS) {
    this.count = count;
    if (count <= 0) return; // (a length of 0 in bufferSubData would mean "the whole array")
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (count > this.capacity) {
      this.capacity = Math.max(Math.ceil(count * 1.25), 16);
      gl.bufferData(gl.ARRAY_BUFFER, this.capacity * FLOATS * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * FLOATS);
    this.count = count;
  }

  /**
   * Draws the first `count` segments. o: view (mat3), res [w, h], scale (px per world unit),
   * palette (PaletteTexture), and optionally model, minPx, cap, tShift, solid [r,g,b], alpha, grow.
   */
  draw(o, count = this.count) {
    if (count <= 0) return;
    const gl = this.gl;
    const { prog } = sharedProgram(gl);
    const u = prog.u;
    gl.useProgram(prog.program);
    gl.uniformMatrix3fv(u.uView, false, o.view);
    gl.uniformMatrix3fv(u.uModel, false, o.model || IDENTITY);
    gl.uniform2f(u.uRes, o.res[0], o.res[1]);
    gl.uniform1f(u.uScale, o.scale);
    gl.uniform1f(u.uMinPx, o.minPx ?? 1);
    gl.uniform1f(u.uCap, o.cap ?? 1);
    gl.uniform1f(u.uTShift, o.tShift || 0);
    gl.uniform1f(u.uGrow, o.grow ?? 1);
    gl.uniform1f(u.uAlpha, o.alpha ?? 1);
    gl.uniform4f(u.uSolid, ...(o.solid || [0, 0, 0]), o.solid ? 1 : 0);
    if (o.palette) {
      o.palette.bind(0);
      gl.uniform1i(u.uPalette, 0);
    }
    const blend = (o.alpha ?? 1) < 1;
    if (blend) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Math.min(count, this.count));
    gl.bindVertexArray(null);
    if (blend) gl.disable(gl.BLEND);
  }
}
SegmentBatch.FLOATS = FLOATS;

