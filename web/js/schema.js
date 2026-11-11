// Parameter entries that several tabs share, so the colour controls read the same everywhere.
import { PALETTE_IDS } from './core/palettes.js';
import { num } from './i18n.js';

export const paletteOptions = () => PALETTE_IDS.map((id) => ({ v: id, k: `pal.${id}` }));

/** Palette select (the shell sets the palette texture when it changes). */
export const paletteParam = (def = 'isla') => ({ key: 'palette', type: 'select', group: 'g.color', label: 'palette', def, options: paletteOptions });

/** Colour cycling speed, in palette turns per minute. */
export const cycleParam = (def = 6) => ({
  key: 'cycle', type: 'range', group: 'g.color', label: 'cycle', min: 0, max: 60, step: 1, def,
  fmt: (v) => `${num(v)}/min`,
});

export const yesNo = [{ v: true, k: 'yes' }, { v: false, k: 'no' }];

export const deg = (v) => `${num(v)}°`;
export const pct = (v) => `${num(v * 100)}%`;

/**
 * A link may name a preset and nothing else ("#dragon?preset=levy"): the preset's values fill in
 * what the link does not say.
 */
export function presetFromLink(values, raw, presets) {
  const p = presets[raw.preset];
  if (!p) return;
  for (const [k, v] of Object.entries(p)) if (!(k in raw)) values[k] = v;
}
