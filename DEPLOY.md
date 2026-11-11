# Despliegue

Fractal Designer es una web estática. `deploy/build.sh` la construye en `dist/`, y ese mismo `dist/`
se publica en todos los sitios:

| Dónde | URL | Cómo se actualiza |
|---|---|---|
| GitHub Pages | https://taridepaco.github.io/FractalDesigner/ | Solo, con cada push a `main` (`.github/workflows/pages.yml`). |
| Servidor propio | `fractal.taridepaco.com.es` (por decidir) | A mano: `deploy/build.sh && sudo deploy/install.sh`. |

`deploy/build.sh`, `deploy/install.sh` y `.github/workflows/pages.yml` son comunes a todas las webs de
taridepaco y se copian de [taridepaco.github.io](https://github.com/taridepaco/taridepaco.github.io):
no se editan aquí. Lo propio de este proyecto es `deploy/test.sh` (las pruebas, que el workflow pasa
antes de construir) y `deploy/fractal.service`.

## Construir

```sh
deploy/build.sh                                   # web/ → dist/
python3 -m http.server 8000 --directory dist      # para probar el resultado
```

`dist/` no se sube a git. Todo salvo `index.html` va en `v/<hash>/`, un directorio con el nombre del
contenido, e `index.html` apunta ahí. Con cada cambio cambian las URLs, así que ninguna caché mezcla
dos versiones. Todas las rutas son relativas, así que `dist/` funciona igual en la raíz de un dominio
que bajo `/FractalDesigner/`. `web/tests/` no se publica.

## Pruebas

```sh
deploy/test.sh        # o npm test; necesita Node 20 o más, sin dependencias
```

Comprueban la parte matemática (`web/js/core/`): el estado en la URL, las órbitas de referencia y los
destinos del Mandelbrot, copiar y rotar, los árboles, los L-systems, el juego del caos y las paletas.
El workflow las pasa en cada PR y antes de publicar; si fallan, no se publica nada.

## GitHub Pages

- En cada PR, el workflow pasa las pruebas y construye la web, pero no la publica.
- En cada push a `main`, o a mano desde *Actions → Pages → Run workflow*, además publica `dist/`.

Configuración, una sola vez: *Settings → Pages → Build and deployment → Source: GitHub Actions*.

## Servidor propio (túnel de Cloudflare en WSL)

```
Navegador ── HTTPS ── Cloudflare ── túnel ──► cloudflared (WSL) ──► http://localhost:8008
                                                                    python3 -m http.server en 127.0.0.1
```

- **Servicio:** `deploy/fractal.service`. Usuario de sistema `fractal` y aislamiento de systemd.
- **Ficheros servidos:** `/opt/fractal`, una copia de `dist/`. Son de root y el servicio solo puede leerlos.
- **Puerto:** `8008` (el siguiente libre tras los de la portada), solo en `127.0.0.1`.

### Instalar o actualizar

Desde WSL, en la raíz del repo:

```sh
git pull
deploy/build.sh && sudo deploy/install.sh
```

`install.sh` crea el usuario y la unidad la primera vez. Después solo sustituye los ficheros y
reinicia el servicio.

### Primera vez: túnel y DNS

Sustituye `<túnel>` por el nombre de tu túnel (`cloudflared tunnel list`).

1. Comprueba que el puerto está libre con `ss -ltn | grep ':8008 ' || echo libre`. Si está ocupado,
   elige otro y cámbialo en `deploy/fractal.service` y en la entrada del túnel.
2. Añade la entrada en `/etc/cloudflared/config.yml` **antes** de la regla 404, sin tocar las demás:

   ```yaml
   ingress:
     # ...tus otras entradas...
     - hostname: fractal.taridepaco.com.es
       service: http://localhost:8008
     - service: http_status:404
   ```

3. Valida, crea el DNS (como tu usuario, sin sudo) y reinicia el túnel:

   ```sh
   cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml
   cloudflared tunnel route dns <túnel> fractal.taridepaco.com.es
   sudo systemctl restart cloudflared
   curl -sI https://fractal.taridepaco.com.es/ | head -1
   ```

### Retirar

1. Quita la entrada `fractal` de `/etc/cloudflared/config.yml` y ejecuta `sudo systemctl restart cloudflared`.
2. `sudo systemctl disable --now fractal && sudo rm /etc/systemd/system/fractal.service`
3. `sudo rm -rf /opt/fractal && sudo userdel fractal`
4. Borra el registro DNS de `fractal.taridepaco.com.es` en el panel de Cloudflare.

Los scripts de `deploy/` se quedan en el repo: sirven para volver a instalarlo en esta u otra máquina.
