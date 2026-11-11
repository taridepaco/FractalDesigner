// Page texts in Spanish and English. Each tab adds its own texts with addTexts().

const TEXT = {
  es: {
    desc: 'Fractales que se mueven solos hasta que los tocas: zoom infinito en el Mandelbrot, dragones que se despliegan, árboles con viento, Julia, el juego del caos y L-systems.',
    kind: 'Generador',
    tabs: 'Fractales',
    panel: 'Controles',
    deck: 'Mandos principales',
    view: 'Fractal animado',
    'g.run': 'Animación', 'g.look': 'Aspecto', 'g.help': 'Manejo', 'g.color': 'Color',
    play: 'Play', pause: 'Pausa', next: 'Siguiente', fit: 'Encajar', share: 'Compartir', copied: '¡Copiado!',
    't.play': 'Reproducir / pausa (espacio)', 't.next': 'Siguiente (N)', 't.fit': 'Volver a encuadrar (F)',
    't.share': 'Copiar un enlace a esta vista exacta',
    'h.auto': 'Se mueve solo hasta que lo tocas; unos segundos después de soltarlo, sigue solo. El botón junto a Siguiente decide si pasa sola a la siguiente variación.',
    loop: 'Cambio automático', 't.loop': 'Pasar sola a la siguiente variación (A)', 'h.loop': 'cambio automático de variación',
    palette: 'Paleta', cycle: 'Ciclado de color', preset: 'Preset',
    'pal.isla': 'Isla', 'pal.atardecer': 'Atardecer', 'pal.mar': 'Mar', 'pal.bosque': 'Bosque', 'pal.fuego': 'Fuego', 'pal.tinta': 'Tinta',
    yes: 'Sí', no: 'No',
    'k.drag': 'Arrastrar', 'k.wheel': 'Rueda', 'k.pinch': 'Dos dedos', 'k.dbl': 'Doble clic', 'k.space': 'Espacio', 'k.arrows': 'Flechas',
    'h.drag': 'mover', 'h.wheel': 'zoom', 'h.pinch': 'zoom y giro', 'h.dbl': 'acercarse ahí', 'h.play': 'play / pausa',
    'h.next': 'siguiente', 'h.fit': 'encajar', 'h.pal': 'cambiar de paleta', 'h.tabs': 'cambiar de pestaña', 'h.arrows': 'mover',
    auto: 'auto', manual: 'manual', paused: 'pausa',
    'e.nogl': 'WebGL2 no está disponible en este navegador.',
    'e.lost': 'Se ha perdido el contexto de la GPU. Recarga la página.',
    'theme.auto': 'Tema: auto', 'theme.light': 'Tema: claro', 'theme.dark': 'Tema: oscuro',
  },
  en: {
    desc: 'Fractals that move on their own until you touch them: infinite Mandelbrot zoom, unfolding dragons, trees in the wind, Julia sets, the chaos game and L-systems.',
    kind: 'Generator',
    tabs: 'Fractals',
    panel: 'Controls',
    deck: 'Main controls',
    view: 'Animated fractal',
    'g.run': 'Animation', 'g.look': 'Appearance', 'g.help': 'How to use it', 'g.color': 'Colour',
    play: 'Play', pause: 'Pause', next: 'Next', fit: 'Fit', share: 'Share', copied: 'Copied!',
    't.play': 'Play / pause (space)', 't.next': 'Next (N)', 't.fit': 'Frame it again (F)',
    't.share': 'Copy a link to this exact view',
    'h.auto': 'It moves on its own until you touch it; a few seconds after you let go, it carries on. The button next to Next decides whether it moves on to the next variation by itself.',
    loop: 'Automatic change', 't.loop': 'Move on to the next variation by itself (A)', 'h.loop': 'automatic change of variation',
    palette: 'Palette', cycle: 'Colour cycling', preset: 'Preset',
    'pal.isla': 'Island', 'pal.atardecer': 'Sunset', 'pal.mar': 'Sea', 'pal.bosque': 'Forest', 'pal.fuego': 'Fire', 'pal.tinta': 'Ink',
    yes: 'Yes', no: 'No',
    'k.drag': 'Drag', 'k.wheel': 'Wheel', 'k.pinch': 'Two fingers', 'k.dbl': 'Double click', 'k.space': 'Space', 'k.arrows': 'Arrows',
    'h.drag': 'pan', 'h.wheel': 'zoom', 'h.pinch': 'zoom and turn', 'h.dbl': 'move closer there', 'h.play': 'play / pause',
    'h.next': 'next', 'h.fit': 'fit', 'h.pal': 'change palette', 'h.tabs': 'change tab', 'h.arrows': 'pan',
    auto: 'auto', manual: 'manual', paused: 'paused',
    'e.nogl': 'WebGL2 is not available in this browser.',
    'e.lost': 'The GPU context was lost. Reload the page.',
    'theme.auto': 'Theme: auto', 'theme.light': 'Theme: light', 'theme.dark': 'Theme: dark',
  },
};

export const LANG_KEY = 'taridepaco-lang'; // shared with the rest of taridepaco.github.io
let lang = document.documentElement.lang === 'en' ? 'en' : 'es';

export function getLang() { return lang; }
export function setLang(l) { lang = l === 'en' ? 'en' : 'es'; }

/** Adds a tab's texts: { es: {...}, en: {...} }. */
export function addTexts(texts) {
  for (const l of ['es', 'en']) Object.assign(TEXT[l], texts[l]);
}

/** Text for a key in the page language; {name} placeholders are filled from args. */
export function t(key, args) {
  const s = TEXT[lang][key] ?? TEXT.es[key] ?? key;
  return args ? s.replace(/\{(\w+)\}/g, (m, k) => (k in args ? String(args[k]) : m)) : s;
}

/** Number in the page language. */
export function num(v, digits = 0) {
  return v.toLocaleString(lang, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Big factors as "1,5·10⁶" (zoom levels). */
export function sci(v) {
  if (v < 1e4) return num(v, v < 10 ? 1 : 0);
  const e = Math.floor(Math.log10(v));
  const m = v / 10 ** e;
  const sup = String(e).replace(/[0-9-]/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(d)] ?? '⁻');
  return `${num(m, 1)}·10${sup}`;
}
