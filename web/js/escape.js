// Escape-time pieces shared by the Mandelbrot and Julia tabs: the colouring (smooth iteration
// count through the palette, with cycling) and a direct 32-bit shader for Julia sets and for the
// small Mandelbrot in the corner. The deep Mandelbrot has its own shader (perturbation).
import { HEADER, FULLSCREEN_VS, createProgram, drawFullscreen } from './gl.js';

/** GLSL: uniforms and shade(mu) → colour; mu < 0 means inside the set. */
export const SHADE_GLSL = `
uniform sampler2D uPalette;
uniform float uDensity;  // palette turns per 40 iterations
uniform float uShift;    // palette offset, grows with the colour cycling
uniform vec3 uInside;
vec3 shade(float mu) {
  if (mu < 0.0) return uInside;
  return texture(uPalette, vec2(mu * uDensity / 40.0 + uShift, 0.5)).rgb;
}
// smooth iteration count from the iteration i and |z|² past the bailout (never negative:
// a negative value means "inside")
float smoothMu(int i, float r2) {
  return max(0.0, float(i) + 1.0 - log2(0.5 * log2(r2)));
}
`;

const ESCAPE_FS = `${HEADER}
${SHADE_GLSL}
uniform vec4 uRect;      // drawn area: origin (from the bottom-left) and size, in pixels
uniform vec2 uCenter;
uniform float uPx;       // world units per pixel
uniform vec2 uRot;       // cos, sin of the view rotation
uniform int uJulia;      // 1: Julia set of uC; 0: Mandelbrot
uniform vec2 uC;
uniform int uMaxIter;
out vec4 outColor;
void main() {
  vec2 q = gl_FragCoord.xy - uRect.xy - 0.5 * uRect.zw;
  vec2 p = vec2(q.x * uRot.x - q.y * uRot.y, q.x * uRot.y + q.y * uRot.x) * uPx + uCenter;
  vec2 z = uJulia == 1 ? p : vec2(0.0);
  vec2 c = uJulia == 1 ? uC : p;
  float mu = -1.0;
  for (int i = 0; i < uMaxIter; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    float r2 = dot(z, z);
    if (r2 > 65536.0) { mu = smoothMu(i, r2); break; }
  }
  outColor = vec4(shade(mu), 1.0);
}`;

/** Sets the colouring uniforms of a program that includes SHADE_GLSL. */
export function setShade(gl, u, palette, { density, shift, inside }) {
  palette.bind(0);
  gl.uniform1i(u.uPalette, 0);
  gl.uniform1f(u.uDensity, density);
  gl.uniform1f(u.uShift, shift);
  gl.uniform3f(u.uInside, inside[0], inside[1], inside[2]);
}

export class EscapeRenderer {
  constructor(gl) {
    this.gl = gl;
    this.prog = createProgram(gl, FULLSCREEN_VS, ESCAPE_FS);
  }

  /**
   * Draws into rect {x, y, w, h} (device pixels from the top-left of the canvas, or the whole
   * canvas when null). o: center [x, y], h (world height of the rect), r (rotation), julia (bool),
   * c [x, y], maxIter, and the shade options (palette, density, shift, inside).
   */
  draw(rect, o) {
    const gl = this.gl;
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const r = rect || { x: 0, y: 0, w: W, h: H };
    const y0 = H - r.y - r.h;
    const u = this.prog.u;
    if (rect) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(r.x, y0, r.w, r.h);
    }
    gl.viewport(r.x, y0, r.w, r.h);
    gl.useProgram(this.prog.program);
    gl.uniform4f(u.uRect, r.x, y0, r.w, r.h);
    gl.uniform2f(u.uCenter, o.center[0], o.center[1]);
    gl.uniform1f(u.uPx, o.h / r.h);
    gl.uniform2f(u.uRot, Math.cos(o.r || 0), Math.sin(o.r || 0));
    gl.uniform1i(u.uJulia, o.julia ? 1 : 0);
    gl.uniform2f(u.uC, o.c ? o.c[0] : 0, o.c ? o.c[1] : 0);
    gl.uniform1i(u.uMaxIter, o.maxIter);
    setShade(gl, u, o.palette, o);
    drawFullscreen(gl);
    if (rect) gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, W, H);
  }
}
