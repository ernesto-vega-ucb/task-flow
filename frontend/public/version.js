// TaskFlow — Versión global de la plataforma.
// En desarrollo este archivo sirve un valor por defecto. En producción el
// entrypoint del contenedor (docker-entrypoint.d/30-app-version.sh) lo
// REGENERA en cada arranque con la APP_VERSION que docker-compose inyecta
// como variable de entorno, de modo que la UI siempre muestra la versión
// global desplegada, incluso cuando el frontend no se recompiló.
window.__APP_VERSION__ = 'v1.0.local';
