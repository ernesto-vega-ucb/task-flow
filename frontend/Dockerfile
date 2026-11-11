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

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
