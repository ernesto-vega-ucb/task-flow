#!/bin/sh
# ================================================================
# TaskFlow — Versión global de la plataforma en runtime.
# La imagen base de nginx ejecuta los scripts *.sh de /docker-entrypoint.d/
# en cada arranque del contenedor: aquí se genera /version.js con la
# APP_VERSION que docker-compose inyecta como variable de entorno.
# Así la UI muestra SIEMPRE la versión global desplegada, incluso cuando
# el frontend no se recompiló (imagen reutilizada / re-etiquetada).
# ================================================================
set -e
echo "window.__APP_VERSION__ = '${APP_VERSION:-v1.0.local}';" > /usr/share/nginx/html/version.js
