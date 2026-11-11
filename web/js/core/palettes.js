// Shared colour palettes: cyclic gradients built from the extended palette of the shared design
// system (the colours of the island). Every tab uses the same list. Pure module, no DOM.

// Extended palette of the shared design system ("Tokens" section).
export const ISLAND = {
  mar: '#2f7e96', rojo: '#d9442e', amarillo: '#f2b63d', bosque: '#4f8f47',
  flor: '#e9879a', tierra: '#6a4a33', prado: '#74b34e', cielo: '#62bcd6',
};

// Cyclic: the last stop blends back into the first, so palette cycling has no seam.
// "tinta" is built from the page tokens, so it follows the light/dark theme.
export const PALETTES = {
  isla: [ISLAND.mar, ISLAND.cielo, ISLAND.prado, ISLAND.amarillo, ISLAND.rojo, ISLAND.flor],
  atardecer: ['#1f2a33', ISLAND.mar, ISLAND.flor, ISLAND.rojo, ISLAND.amarillo, '#fff8e6', ISLAND.amarillo, ISLAND.rojo, ISLAND.tierra],
  mar: ['#12222b', ISLAND.mar, ISLAND.cielo, '#d9f2de', ISLAND.cielo, ISLAND.mar],
  // tierra lightened a little so it still reads on the dark theme
  bosque: ['#8d6a4b', ISLAND.bosque, ISLAND.prado, ISLAND.amarillo, ISLAND.flor],
  fuego: ['#1f2a33', ISLAND.rojo, ISLAND.amarillo, '#fff8e6', ISLAND.amarillo, ISLAND.rojo],
  tinta: null,
};
export const PALETTE_IDS = Object.keys(PALETTES);

/** Hex stops of a palette; `tokens` gives --ink and --surface for "tinta". */
export function paletteStops(id, tokens = { ink: '#1f2a33', surface: '#f7f2d6' }) {
  if (id === 'tinta' || !PALETTES[id]) {
    return id === 'tinta' ? [tokens.ink, tokens.surface] : PALETTES.isla;
  }
  return PALETTES[id];
}

function parse(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** n×1 RGBA8 pixels of a cyclic gradient through the stops (smoothstep between stops). */
export function gradientPixels(stops, n = 256) {
  const rgb = stops.map(parse);
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const f = (i / n) * rgb.length;
    const k = Math.floor(f);
    let u = f - k;
    u = u * u * (3 - 2 * u);
    const a = rgb[k % rgb.length], b = rgb[(k + 1) % rgb.length];
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(a[c] + (b[c] - a[c]) * u);
    out[i * 4 + 3] = 255;
  }
  return out;
}
