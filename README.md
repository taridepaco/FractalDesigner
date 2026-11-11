# Fractal Designer

Fractales que se mueven solos hasta que los tocas. Una web estática (GitHub Pages, sin backend)
con una pestaña por familia de fractal, todas animadas por defecto y todas manipulables: cualquier
interacción (arrastrar, rueda, pellizco) para el piloto automático, y unos segundos después de
soltar sigue solo desde donde lo dejaste.

En vivo: https://taridepaco.github.io/FractalDesigner/

| Pestaña | Qué hace |
|---|---|
| Mandelbrot | Zoom infinito hasta 10¹³ hacia siete destinos del borde del conjunto (o en modo deriva, buscando el detalle), con giro de cámara, ciclado de paleta, fundido al llegar al límite y el Julia del punto bajo el cursor en una esquina. |
| Julia | El parámetro c recorre el borde del cardioide (o un círculo) y la forma muta sin parar. En la esquina, un Mandelbrot donde elegir c con el ratón. Presets: conejo de Douady, San Marcos, disco de Siegel… |
| Dragón | Copiar y rotar: la figura entera se copia y la copia gira alrededor de un pivote, desplegándose como una tira de papel doblada. Presets (Heighway, twindragon, cuatro dragones, curva C de Lévy, pliegues alternos, trípode, cruz) y editor de semilla, pivote, sentido, alternancia, copias, escala y simetría. |
| Árbol | Árboles que crecen y se mecen con el viento: profundidad, ramas por nudo, apertura, asimetría, ratios, aleatoriedad con semilla, gravedad o luz y flores. Presets: binario, Pitágoras, H, sauce, pino, baobab, coral. Se arrastra la punta de una de las primeras ramas. |
| Caos | El juego del caos: Sierpinski sale del ruido punto a punto. Polígonos de 3 a 8 lados, fracción del salto, reglas (no repetir vértice, no ir a un vecino), puntos medios y centro. Los vértices se arrastran. |
| L-system | Una gramática y una tortuga que dibuja en directo: Koch, isla de Koch, Hilbert, Peano, Gosper, punta de flecha de Sierpinski, terdragón, planta, arbusto. Las reglas se editan en el panel. |

El estado de cada pestaña va en la URL (`#mandelbrot?x=…&y=…&z=…`), así que un enlace abre la misma
vista; «Compartir» lo copia. Un enlace a una vista exacta del Mandelbrot o del Julia se abre en
pausa sobre esa vista.

Junto a «Siguiente» hay un interruptor de cambio automático (tecla A): encendido, cada pestaña pasa
sola a la siguiente variación (preset o destino) cuando termina; apagado, se queda en la actual sin
dejar de animarse (crecer, mecerse, ciclar colores…). Play/pausa, en cambio, lo para todo.

Teclado: espacio (play / pausa), N (siguiente), A (cambio automático), F (encajar), P (paleta),
flechas, + y −, 1 … 6 (pestañas).

## Diseño y despliegue

El aspecto es el del [sistema común de taridepaco](https://github.com/taridepaco/taridepaco.github.io):
`web/system.css` y `web/theme.js` son copias sin modificar de los de la portada (no se editan aquí),
y la página sigue la «página de simulador» de [GameOfLifer](https://github.com/taridepaco/GameOfLifer):
cabecera común, panel plegable a la izquierda (hoja que sube en el móvil), barra de mandos en el
móvil, tema claro/oscuro y español/inglés.

El despliegue también es el común: `deploy/build.sh`, `deploy/install.sh` y
`.github/workflows/pages.yml` son copias de los de la portada. Ver [DEPLOY.md](DEPLOY.md).

## Estructura

```
web/index.html            la página (cabecera, pestañas, panel, pantalla)
web/system.css            sistema común (copia, no se edita)
web/theme.js              tema claro/oscuro (copia, no se edita)
web/style.css             lo que el sistema común no cubre
web/js/main.js            pestañas, idioma y tema, bucle, piloto automático, URL, teclado
web/js/camera.js          cámara compartida: desplazar, zoom, giro, vuelos; ratón, táctil y rueda
web/js/panel.js           panel generado a partir del esquema de parámetros de cada pestaña
web/js/i18n.js            textos comunes en español e inglés
web/js/gl.js              ayudas de WebGL2
web/js/draw.js            paleta como textura y segmentos gruesos con instancing
web/js/escape.js          coloreado por tiempo de escape y shader directo de Julia
web/js/schema.js          parámetros compartidos (paleta, ciclado)
web/js/fractals/*.js      una pestaña por archivo
web/js/core/*.js          la parte matemática, sin navegador (con pruebas en web/tests/)
web/tests/                pruebas de web/js/core (no se publican)
deploy/                   construcción, pruebas, instalación y unidad de systemd
```

Todo se dibuja con WebGL2 en un único lienzo: el Mandelbrot y el Julia con un shader por píxel, y
los fractales geométricos (dragón, árboles, L-systems) como segmentos gruesos con instancing, así
que cientos de miles de líneas se dibujan sin esfuerzo. El juego del caos acumula los puntos en un
búfer de coma flotante de la GPU.

### El zoom profundo del Mandelbrot

La GPU solo tiene floats de 32 bits, que se acaban en un zoom de 10⁵. Por eso se usa la teoría de
perturbaciones: una órbita de referencia se calcula en JavaScript con doubles y cada píxel solo
itera su diferencia con ella, que cabe en 32 bits. Con el *rebasing* de Zhuoran basta una referencia
para toda la imagen. El límite pasa a ser el double del centro: unos 10¹³. Los destinos son puntos de
Misiurewicz encontrados con el método de Newton (y el punto clásico del valle del caballito de mar),
comprobados para que tengan detalle a 10³, 10⁶, 10⁹ y 10¹².

### Añadir una pestaña

Cada pestaña es un módulo de `web/js/fractals/` con la misma forma, y se añade a la lista `TABS` de
`main.js`:

```js
export default {
  id: 'nombre',              // también en la URL: #nombre?…
  schema: [ … ],             // parámetros: el panel y la URL salen de aquí (ver panel.js)
  texts: { es: { 'tab.nombre': …, 'pitch.nombre': …, … }, en: { … } },
  keys: [['k.algo', 'h.algo']],   // filas extra de la ayuda de teclas
  adaptive: false,           // true: baja la resolución si los fotogramas van lentos
  linkView: false,           // true: la URL guarda la vista exacta (x, y, z, r)
  create(ctx, values) {      // ctx: gl, camera, palette, colors, t, redraw, fade, inset, setParam…
    return {
      home(), enter(restored), leave(),
      param(key), action(act), next(), fit?(),
      update(dt, { running, auto }) → ¿ha cambiado algo?,   // auto: nadie lo está tocando
      render(), stats(),
      pointerDown?/pointerMove?/pointerUp?/hover?/tap?/doubleTap?(info),
      linkState?(), readLink?(raw),
    };
  },
};
```

## En local

```sh
python3 -m http.server 8000 --directory web       # y abrir http://localhost:8000
deploy/test.sh                                    # pruebas (Node 20 o más)
```

La versión anterior (un script de Python con matplotlib) está en el historial de git.
