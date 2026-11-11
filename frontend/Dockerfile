# ---- Etapa 1: Build de la app React (con quality gates) ----
FROM node:20-alpine AS build
WORKDIR /app

# Copiar dependencias primero para cache
COPY package.json package-lock.json* ./
RUN npm ci

# Copiar el código fuente
COPY . .

# Argumentos de build (inyectados por Jenkins / docker build)
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ARG VITE_APP_VERSION=v1.0.local
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

# Quality gate: linter/validación TypeScript (si falla, aborta el build)
RUN npm run lint

# Build de producción
RUN npm run build

# ---- Etapa 2: Servir estáticos con Nginx (gateway) ----
# Usar tag estable con Alpine actualizado para reducir vulnerabilidades
FROM nginx:stable-alpine

# Parche de seguridad DevSecOps: Actualizar libxslt para mitigar CVE-2026-87636 y CVE-2026-9947
RUN apk update && apk upgrade --no-cache libxslt

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Versión global en RUNTIME: el entrypoint de nginx (docker-entrypoint.d)
# genera /version.js en cada arranque con la APP_VERSION que docker-compose
# inyecta al contenedor. La UI la lee (window.__APP_VERSION__) con fallback
# al valor horneado en build (VITE_APP_VERSION).
# IMPORTANTE — dos trampas de scripts en imágenes Linux (ambas ocurrieron):
#   1) El entrypoint de nginx IGNORA los *.sh sin bit de ejecutable
#      ("Ignoring $f, not executable"): commiteado desde Windows el modo
#      llega como 100644 y el mecanismo falla SILENCIOSAMENTE en producción
#      (VM2 quedó sirviendo v1.0.local).
#   2) Finales de línea CRLF rompen el shebang ("...not found"): con set -e
#      del entrypoint, el contenedor MORIRÍA al arrancar.
# El RUN siguiente corrige ambos DENTRO de la imagen (independiente del
# checkout que hizo git): elimina \r, fuerza el bit de ejecutable y ASSERTA
# con test -x: si algo falla, el BUILD falla aquí (no en producción).
COPY docker-entrypoint.d/ /docker-entrypoint.d/
RUN cd /docker-entrypoint.d && \
    for f in *.sh; do tr -d '\r' < "$f" > "$f.tmp" && mv "$f.tmp" "$f"; done && \
    chmod +x *.sh && \
    test -x /docker-entrypoint.d/30-app-version.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
