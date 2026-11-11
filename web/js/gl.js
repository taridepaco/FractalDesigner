// Small WebGL2 helpers shared by every tab: context, programs, textures and a fullscreen pass.

/** WebGL2 context for the canvas, or an error with a code the page can translate. */
export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw Object.assign(new Error('WebGL2 not available'), { code: 'nogl' });
  return gl;
}

// Every fragment shader declares highp int as well as highp float: without it many phones
// compute integers with 16 bits (see "Lienzo y tamaño del mundo" in the shared design system).
export const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

/** Vertex shader for a pass that covers the viewport with one triangle (no attributes). */
export const FULLSCREEN_VS = `${HEADER}
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`shader: ${log}\n${src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')}`);
  }
  return s;
}

/** Linked program with its uniform locations in `u` (by name, arrays without "[0]"). */
export function createProgram(gl, vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { program: p, u };
}

/** 2D texture with NEAREST or LINEAR filtering. */
export function createTexture(gl, { width, height, internal, format, type, data = null, filter = gl.NEAREST, wrap = gl.CLAMP_TO_EDGE }) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, data);
  return tex;
}

let emptyVAO = null;
/** Draws the fullscreen triangle with whatever program is in use. */
export function drawFullscreen(gl) {
  if (!emptyVAO) emptyVAO = gl.createVertexArray();
  gl.bindVertexArray(emptyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** [r, g, b] in 0..1 from "#rrggbb". */
export function hexToRgb(hex) {
  const h = hex.trim().replace('#', '');
  const v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/**
 * World → canvas pixels (origin bottom-left, as gl_FragCoord) for a camera, as a column-major
 * mat3. Inverse of Camera.toWorld.
 */
export function viewMatrix(cam, width, height) {
  const k = height / cam.h;
  const c = Math.cos(cam.r), s = Math.sin(cam.r);
  const tx = -k * (c * cam.x + s * cam.y) + width / 2;
  const ty = -k * (-s * cam.x + c * cam.y) + height / 2;
  return new Float32Array([k * c, -k * s, 0, k * s, k * c, 0, tx, ty, 1]);
}

/** Column-major mat3 for a rotation by `angle` and a uniform scale about the point (px, py). */
export function rotationAbout(px, py, angle, scale = 1) {
  const c = Math.cos(angle) * scale, s = Math.sin(angle) * scale;
  return new Float32Array([c, s, 0, -s, c, 0, px - c * px + s * py, py - s * px - c * py, 1]);
}

export const IDENTITY = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/** a × b for column-major mat3 (apply b first, then a). */
export function mul3(a, b) {
  const o = new Float32Array(9);
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
    }
  }
  return o;
}
