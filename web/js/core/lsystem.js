// L-systems: a rewriting grammar plus a turtle. Every generation each symbol of the string is
// replaced by its rule; then a turtle reads the string: draw forward, turn, remember and return
// to a position ([ and ]). Pure module.

export const MAX_SEGMENTS = 400000;

export const PRESETS = {
  koch: { axiom: 'F--F--F', rules: 'F=F+F--F+F', angle: 60, iter: 4, draw: 'F', heading: 0 },
  island: { axiom: 'F+F+F+F', rules: 'F=F+F-F-FF+F+F-F', angle: 90, iter: 3, draw: 'F', heading: 0 },
  hilbert: { axiom: 'A', rules: 'A=+BF-AFA-FB+; B=-AF+BFB+FA-', angle: 90, iter: 6, draw: 'F', heading: 0 },
  peano: { axiom: 'X', rules: 'X=XFYFX+F+YFXFY-F-XFYFX; Y=YFXFY-F-XFYFX+F+YFXFY', angle: 90, iter: 3, draw: 'F', heading: 0 },
  gosper: { axiom: 'A', rules: 'A=A-B--B+A++AA+B-; B=+A-BB--B-A++A+B', angle: 60, iter: 4, draw: 'AB', heading: 0 },
  arrowhead: { axiom: 'A', rules: 'A=B-A-B; B=A+B+A', angle: 60, iter: 7, draw: 'AB', heading: 0 },
  terdragon: { axiom: 'F', rules: 'F=F+F-F', angle: 120, iter: 8, draw: 'F', heading: 0 },
  plant: { axiom: 'X', rules: 'X=F+[[X]-X]-F[-FX]+X; F=FF', angle: 25, iter: 6, draw: 'F', heading: 65 },
  bush: { axiom: 'F', rules: 'F=FF+[+F-F-F]-[-F+F+F]', angle: 22.5, iter: 4, draw: 'F', heading: 90 },
};

/** "A=xyz; B=uvw" → Map of symbol → replacement. */
export function parseRules(text) {
  const rules = new Map();
  for (const part of String(text).split(/[;,\n]/)) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k.length === 1) rules.set(k, part.slice(i + 1).trim());
  }
  return rules;
}

/**
 * Rewrites the axiom `iter` times. Stops early (and says so) before the string holds more than
 * maxDraw drawing symbols. Returns { text, iter }.
 */
export function expand(axiom, rules, iter, drawSymbols, maxDraw = MAX_SEGMENTS) {
  let s = axiom;
  let done = 0;
  for (let i = 0; i < iter; i++) {
    // count what the next generation would draw before building it
    let draws = 0;
    for (const ch of s) {
      const r = rules.get(ch);
      if (r === undefined) { if (drawSymbols.includes(ch)) draws++; }
      else for (const c of r) if (drawSymbols.includes(c)) draws++;
      if (draws > maxDraw) break;
    }
    if (draws > maxDraw) break;
    let out = '';
    const parts = [];
    for (const ch of s) {
      const r = rules.get(ch);
      parts.push(r === undefined ? ch : r);
      if (parts.length > 4096) { out += parts.join(''); parts.length = 0; }
    }
    s = out + parts.join('');
    done++;
  }
  return { text: s, iter: done };
}

/**
 * Turtle: F-like symbols (drawSymbols) draw a step, f moves without drawing, + and − turn,
 * | turns around, [ and ] push and pop the position. Returns { data, count, box } with 6 floats
 * per segment (ax, ay, bx, by, t, w), t going from 0 to 1 along the path.
 */
export function turtle(text, angleDeg, drawSymbols, headingDeg = 0) {
  let n = 0;
  for (const ch of text) if (drawSymbols.includes(ch)) n++;
  const data = new Float32Array(n * 6);
  const turn = (angleDeg * Math.PI) / 180;
  let x = 0, y = 0, a = (headingDeg * Math.PI) / 180;
  const stack = [];
  let i = 0;
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
  for (const ch of text) {
    if (drawSymbols.includes(ch) || ch === 'f') {
      const nx = x + Math.cos(a), ny = y + Math.sin(a);
      if (ch !== 'f') {
        data.set([x, y, nx, ny, n > 1 ? i / (n - 1) : 0, 0], i * 6);
        i++;
      }
      x = nx;
      y = ny;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    } else if (ch === '+') a += turn;
    else if (ch === '-') a -= turn;
    else if (ch === '|') a += Math.PI;
    else if (ch === '[') stack.push([x, y, a]);
    else if (ch === ']' && stack.length) [x, y, a] = stack.pop();
  }
  return { data, count: i, box: [x0, y0, x1, y1] };
}
