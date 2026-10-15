# Distancias Golf

PWA ligera para consultar con GPS las distancias de golf.

Incluye:

- Golf Costa de Azahar: recorridos rojo y verde.
- Club de Campo del Mediterráneo: 18 hoyos.
- Distancias a entrada, centro y fondo del green.
- Instalación como aplicación y funcionamiento sin conexión.
- Tema claro/oscuro automático con selección manual.

La aplicación estática se encuentra en `site/`.

Las geometrías de los greens de Costa de Azahar proceden de OpenStreetMap
y se conservan, junto con la metodología aplicada, en `data/`.

## Publicación

La instancia actual se sirve en `caddy.arinsaldev.com` mediante el proxy HTTPS
del servidor y el contenedor Nginx definido en `deploy/default.conf`.

También se incluye un `deploy/Caddyfile` por si se migra a Caddy directamente.


