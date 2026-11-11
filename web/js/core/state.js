// The state of the page in the URL hash, so a link opens the exact same view:
//   #mandelbrot?x=-0.7436438870371587&y=0.131825904205312&z=1.2e6&r=12.5&palette=mar
// x, y: centre; z: zoom relative to the tab's home view; r: rotation in degrees; then the
// parameters that differ from their default. Pure module, no DOM.

/** { tab, values: { key: string } } from a hash like "#tab?k=v&k2=v2". */
export function parseHash(hash) {
  const h = (hash || '').replace(/^#/, '');
  const q = h.indexOf('?');
  const tab = decodeURIComponent(q < 0 ? h : h.slice(0, q));
  const values = {};
  if (q >= 0) {
    for (const part of h.slice(q + 1).split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      const k = decodeURIComponent(i < 0 ? part : part.slice(0, i));
      values[k] = i < 0 ? '' : decodeURIComponent(part.slice(i + 1));
    }
  }
  return { tab, values };
}

/** Shortest text for a number that reads back as the same double (or `digits` significant). */
export function fmtNumber(v, digits = 17) {
  if (!Number.isFinite(v)) return '0';
  for (let d = 1; d <= digits; d++) {
    const s = v.toPrecision(d);
    if (+s === v || d === digits) return String(+s);
  }
  return String(v);
}

/** Hash for a tab and an ordered list of [key, value] (values already strings or numbers). */
export function formatHash(tab, entries) {
  const enc = (s) => encodeURIComponent(s).replace(/%2C/g, ',');
  const parts = entries.map(([k, v]) => `${enc(k)}=${enc(typeof v === 'number' ? fmtNumber(v) : String(v))}`);
  return `#${enc(tab)}${parts.length ? '?' + parts.join('&') : ''}`;
}

/**
 * Parameter values from hash strings, typed by the schema (numbers clamped to their range,
 * select and modes values checked against their options). Unknown keys are ignored.
 */
export function readParams(schema, raw) {
  const out = {};
  for (const def of schema) {
    if (!def.key || !(def.key in raw)) continue;
    const s = raw[def.key];
    if (def.type === 'range') {
      const v = parseFloat(s);
      if (Number.isFinite(v)) out[def.key] = Math.min(def.max, Math.max(def.min, v));
    } else if (def.type === 'select' || def.type === 'modes') {
      const opts = typeof def.options === 'function' ? def.options() : def.options;
      const hit = opts.find((o) => String(o.v) === s);
      if (hit) out[def.key] = hit.v;
    } else if (def.type === 'text') {
      out[def.key] = s.slice(0, 400);
    }
  }
  return out;
}

/** [key, value] pairs for the parameters that differ from their default. */
export function changedParams(schema, values) {
  const out = [];
  for (const def of schema) {
    if (!def.key || values[def.key] === undefined || values[def.key] === def.def) continue;
    const v = values[def.key];
    out.push([def.key, typeof v === 'number' ? fmtNumber(v, 6) : v]);
  }
  return out;
}

/** Default values of a schema. */
export function defaults(schema) {
  const out = {};
  for (const def of schema) if (def.key) out[def.key] = def.def;
  return out;
}
