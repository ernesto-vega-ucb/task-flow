pipeline {
    agent any

    // -------------------------------------------------------------------------
    // VARIABLES DE CONFIGURACIÓN
    // VM1 = Jenkins (con acceso a internet) | VM2 = Servidor destino (SIN internet)
    // VM2_IP / VM2_USER se obtienen de parámetros del job de Jenkins
    // (params.VM2_IP / params.VM2_USER), NO de este environment.
    //
    // VERSIONADO GLOBAL: una ÚNICA versión de la plataforma (APP_VERSION,
    // ej. v1.1.0) almacenada en '.env' (raíz del repo, gitignored).
    // Imágenes: taskflow-backend:<APP_VERSION> y taskflow-frontend:<APP_VERSION>.
    // La UI renderiza esa misma versión (VITE_APP_VERSION en el build del
    // frontend). No existen versiones independientes por componente.
    // -------------------------------------------------------------------------
    environment {
        // Directorio remoto en VM2
        REMOTE_DIR      = '/home/administrator/taskflow-deploy'

        // Credencial SSH configurada en Jenkins
        SSH_CRED_ID     = 'vm2-ssh-key'

        // Imagen de PostgreSQL (solo se recarga si cambia su config/versión)
        POSTGRES_IMAGE  = 'postgres:16-alpine'
        POSTGRES_TAR_GZ = 'postgres-16-alpine.tar.gz'

        // Configuración a transferir (siempre)
        COMPOSE_FILE    = 'docker-compose.yml'

        // Estado persistido en el workspace (sobrevive a 'checkout scm'):
        //   .taskflow-app-version   -> última APP_VERSION global resuelta
        //   .taskflow-postgres-hash -> hash de la config de PostgreSQL
        APP_VERSION_FILE   = '.taskflow-app-version'
        POSTGRES_HASH_FILE = '.taskflow-postgres-hash'

        // Healthcheck del backend en VM2 (se ejecuta DENTRO del contenedor,
        // por eso el backend responde en localhost:8080)
        BACKEND_HEALTH_URL  = 'http://localhost:8080/api/health'
        HEALTH_TIMEOUT_SECS = '30'

        // Escaneo de seguridad (Trivy)
        TRIVY_SEVERITY  = 'HIGH,CRITICAL'
        // '1' hace fallar el pipeline si encuentra vulnerabilidades o si el escaneo falla
        TRIVY_EXIT_CODE = '1'
        // Caché en workspace para evitar 'no space left on device' en /tmp
        TRIVY_CACHE_DIR = "${WORKSPACE}/.trivy-cache"
    }

    stages {

        // =====================================================================
        // ETAPA 1: CHECKOUT + DETECCIÓN DE CAMBIOS + VERSIÓN GLOBAL (APP_VERSION)
        // =====================================================================
        stage('Checkout & Change Detection') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 1: CHECKOUT + DETECCIÓN DE CAMBIOS"
                    echo "=========================================="
                }
                checkout scm
                script {
                    env.GIT_HASH = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()

                    // -------------------------------------------------------------
                    // 0) Limpieza del esquema anterior (versionado por componente)
                    //    y bootstrap de .env (gitignored) desde .env.example
                    // -------------------------------------------------------------
                    sh '''
                        set -e
                        rm -f .taskflow-backend-version .taskflow-frontend-version .backend-tag .frontend-tag
                        git tag -l 'backend-v*' 'frontend-v*' | xargs -r git tag -d >/dev/null 2>&1 || true
                        if [ ! -f .env ]; then
                            echo "[INFO] .env no existe en el workspace: se crea desde .env.example"
                            cp .env.example .env
                        fi
                    '''

                    // -------------------------------------------------------------
                    // 1) Detección de cambios con Git Diff por componente (exacto):
                    //      git diff --name-only HEAD~1 -- backend/
                    //      git diff --name-only HEAD~1 -- frontend/
                    // -------------------------------------------------------------
                    sh '''
                        set -e
                        if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
                            BACKEND_DIFF=$(git diff --name-only HEAD~1 -- backend/ || true)
                            FRONTEND_DIFF=$(git diff --name-only HEAD~1 -- frontend/ || true)
                        else
                            # Primer build del repo (no existe HEAD~1): cambio global
                            BACKEND_DIFF="backend/"
                            FRONTEND_DIFF="frontend/"
                        fi

                        if [ -n "$BACKEND_DIFF" ];  then echo true  > .backend-changed;  else echo false > .backend-changed;  fi
                        if [ -n "$FRONTEND_DIFF" ]; then echo true > .frontend-changed; else echo false > .frontend-changed; fi

                        echo "[INFO] git diff --name-only HEAD~1 -- backend/ :"
                        echo "${BACKEND_DIFF:-(sin cambios)}"
                        echo "[INFO] git diff --name-only HEAD~1 -- frontend/:"
                        echo "${FRONTEND_DIFF:-(sin cambios)}"
                    '''
                    env.BACKEND_CHANGED  = readFile('.backend-changed').trim()
                    env.FRONTEND_CHANGED = readFile('.frontend-changed').trim()

                    // -------------------------------------------------------------
                    // 2) PostgreSQL: cambia SOLO si cambia su bloque de config
                    //    en el compose o su versión de imagen (hash persistido)
                    // -------------------------------------------------------------
                    sh '''
                        set -e
                        DB_BLOCK=$(awk '
                            /^  db:/ { p=1 }
                            p && !/^  db:/ && (/^  [A-Za-z0-9_-]+:/ || /^[A-Za-z]/) { p=0 }
                            p
                        ' "$COMPOSE_FILE")
                        DB_HASH=$(printf '%s\\n%s\\n' "$DB_BLOCK" "$POSTGRES_IMAGE" | sha256sum | cut -d" " -f1)
                        if [ -f "$POSTGRES_HASH_FILE" ] && [ "$(cat "$POSTGRES_HASH_FILE")" = "$DB_HASH" ]; then
                            echo false > .postgres-changed
                        else
                            echo "$DB_HASH" > "$POSTGRES_HASH_FILE"
                            echo true > .postgres-changed
                        fi
                    '''
                    env.POSTGRES_CHANGED = readFile('.postgres-changed').trim()

                    // -------------------------------------------------------------
                    // 3) VERSIÓN GLOBAL (APP_VERSION) con incremento condicional:
                    //    - LATEST = máximo entre .env, archivo de estado y
                    //      tags locales 'app-v*' (persisten en el workspace).
                    //    - Si cambió backend/ O frontend/ (o ambos) -> se
                    //      incrementa el parche (v1.1.0 -> v1.1.1).
                    //    - Si NINGUNO cambió -> NO se incrementa, NO se
                    //      compila nada y NO se generan imágenes nuevas.
                    // -------------------------------------------------------------
                    sh '''
                        set -e

                        latest_app_version() {
                            {
                                if [ -f .env ]; then
                                    sed -n 's/^APP_VERSION=//p' .env | grep -E '^v[0-9]+\\.[0-9]+\\.[0-9]+$' || true
                                fi
                                if [ -f "$APP_VERSION_FILE" ]; then
                                    grep -E '^v[0-9]+\\.[0-9]+\\.[0-9]+$' "$APP_VERSION_FILE" || true
                                fi
                                git tag -l 'app-v*' 2>/dev/null | sed 's/^app-//' || true
                            } | sort -V | tail -n 1
                            return 0
                        }

                        set_env_var() {
                            if grep -q "^$1=" .env; then
                                sed -i "s|^$1=.*|$1=$2|" .env
                            else
                                echo "$1=$2" >> .env
                            fi
                        }

                        CURRENT=$(latest_app_version)
                        CURRENT=${CURRENT:-v1.1.0}

                        if [ "$BACKEND_CHANGED" = "true" ] || [ "$FRONTEND_CHANGED" = "true" ]; then
                            CUR_NUM=${CURRENT#v}
                            NEW_NUM=$(echo "$CUR_NUM" | awk -F. '{ $NF = $NF + 1; OFS = "."; print $1, $2, $3 }')
                            NEW="v$NEW_NUM"
                            echo "$NEW" > "$APP_VERSION_FILE"
                            git tag "app-$NEW" 2>/dev/null || true
                            echo true > .version-bumped
                            echo "[INFO] Cambios detectados (backend=$BACKEND_CHANGED, frontend=$FRONTEND_CHANGED):"
                            echo "[INFO] APP_VERSION incrementada: $CURRENT -> $NEW"
                        else
                            NEW="$CURRENT"
                            echo "$CURRENT" > "$APP_VERSION_FILE"
                            echo false > .version-bumped
                            echo "[INFO] Sin cambios en backend/ ni en frontend/:"
                            echo "[INFO] APP_VERSION se mantiene en $CURRENT (sin builds ni imágenes nuevas)."
                        fi

                        set_env_var APP_VERSION "$NEW"

                        echo "$CURRENT" > .app-version-previous
                        echo "$NEW"     > .app-version-resolved
                    '''
                    env.APP_VERSION          = readFile('.app-version-resolved').trim()
                    env.PREVIOUS_APP_VERSION = readFile('.app-version-previous').trim()
                    env.VERSION_BUMPED       = readFile('.version-bumped').trim()

                    // Imágenes y tars derivados de la versión global única
                    env.BACKEND_IMAGE   = "taskflow-backend:${env.APP_VERSION}"
                    env.FRONTEND_IMAGE  = "taskflow-frontend:${env.APP_VERSION}"
                    env.BACKEND_TAR_GZ  = "taskflow-backend-${env.APP_VERSION}.tar.gz"
                    env.FRONTEND_TAR_GZ = "taskflow-frontend-${env.APP_VERSION}.tar.gz"

                    // Target SSH a partir de los parámetros del job
                    env.VM2_SSH_TARGET = "${params.VM2_USER}@${params.VM2_IP}"

                    echo "=========================================="
                    echo "[INFO] Commit: ${env.GIT_HASH}"
                    echo "[INFO] APP_VERSION (global): ${env.APP_VERSION} (incremento=${env.VERSION_BUMPED})"
                    echo "[INFO] Backend changed:  ${env.BACKEND_CHANGED}  -> ${env.BACKEND_IMAGE}"
                    echo "[INFO] Frontend changed: ${env.FRONTEND_CHANGED} -> ${env.FRONTEND_IMAGE}"
                    echo "[INFO] Postgres changed: ${env.POSTGRES_CHANGED} -> ${POSTGRES_IMAGE}"
                    echo "=========================================="
                }
            }
        }

        // =====================================================================
        // ETAPA 2: BUILD DE IMÁGENES (solo componentes cambiados)
        // Los quality gates (tests H2 / lint / vite build) están encapsulados
        // dentro de los Dockerfiles multi-etapa.
        // El componente que NO cambió no se compila: VM2 reutiliza su imagen
        // existente re-etiquetada con la nueva APP_VERSION (docker tag).
        // =====================================================================
        stage('Build Images (condicional)') {
            when {
                expression { env.BACKEND_CHANGED == 'true' || env.FRONTEND_CHANGED == 'true' }
            }
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 2: BUILD DE IMÁGENES (QUALITY GATES)"
                    echo "=========================================="
                }
                sh '''
                    set -e
                    docker image prune -f || true

                    if [ "$BACKEND_CHANGED" = "true" ]; then
                        echo "[VM1] Backend cambió: build Maven (tests H2 en Dockerfile) + imagen $BACKEND_IMAGE"
                        docker build -t "$BACKEND_IMAGE" ./backend
                    else
                        echo "[VM1] Backend SIN cambios: build omitido. VM2 reutiliza su imagen (retag a $BACKEND_IMAGE)."
                    fi

                    if [ "$FRONTEND_CHANGED" = "true" ]; then
                        echo "[VM1] Frontend cambió: build Vite (lint en Dockerfile) + imagen $FRONTEND_IMAGE"
                        docker build \\
                            --build-arg VITE_API_BASE_URL=/api \\
                            --build-arg VITE_APP_VERSION="$APP_VERSION" \\
                            -t "$FRONTEND_IMAGE" ./frontend
                    else
                        echo "[VM1] Frontend SIN cambios: build omitido. VM2 reutiliza su imagen (retag a $FRONTEND_IMAGE)."
                    fi
                '''
            }
        }

        // =====================================================================
        // ETAPA 3: ESCANEO DE SEGURIDAD (solo imágenes nuevas)
        // =====================================================================
        stage('Container Security Scan') {
            when {
                expression { env.BACKEND_CHANGED == 'true' || env.FRONTEND_CHANGED == 'true' }
            }
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 3: ESCANEO DE SEGURIDAD (TRIVY)"
                    echo "=========================================="
                }
                sh '''
                    set -e
                    mkdir -p "$TRIVY_CACHE_DIR" "$WORKSPACE/.tmp-trivy"
                    export TMPDIR="$WORKSPACE/.tmp-trivy"
                    docker system prune -f || true

                    if ! command -v trivy >/dev/null 2>&1; then
                        echo "[VM1] Trivy no disponible. Instalando..."
                        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
                    fi
                    command -v trivy >/dev/null 2>&1 || { echo "[ERROR] Trivy no disponible"; exit 1; }

                    if [ "$BACKEND_CHANGED" = "true" ]; then
                        echo "[VM1] Escaneando $BACKEND_IMAGE (severidades: $TRIVY_SEVERITY)"
                        trivy image --cache-dir "$TRIVY_CACHE_DIR" --exit-code "$TRIVY_EXIT_CODE" \\
                            --severity "$TRIVY_SEVERITY" --no-progress "$BACKEND_IMAGE"
                    else
                        echo "[VM1] Trivy backend omitido (sin cambios)."
                    fi

                    if [ "$FRONTEND_CHANGED" = "true" ]; then
                        echo "[VM1] Escaneando $FRONTEND_IMAGE (severidades: $TRIVY_SEVERITY)"
                        trivy image --cache-dir "$TRIVY_CACHE_DIR" --exit-code "$TRIVY_EXIT_CODE" \\
                            --severity "$TRIVY_SEVERITY" --no-progress "$FRONTEND_IMAGE"
                    else
                        echo "[VM1] Trivy frontend omitido (sin cambios)."
                    fi

                    echo "[OK] Escaneo completado sin vulnerabilidades bloqueantes."
                '''
            }
        }

        // =====================================================================
        // ETAPA 4: PACKAGE & TRANSFER (condicional)
        // Solo se empaquetan/transfieren las imágenes de los componentes que
        // CAMBIARON (si no cambió, VM2 retaggea su imagen existente) y
        // PostgreSQL solo si cambió su config/versión o falta en VM2.
        // La configuración (compose + .env.example) siempre viaja.
        // =====================================================================
        stage('Package & Transfer') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 4: PACKAGE & TRANSFER (CONDICIONAL)"
                    echo "=========================================="
                }
                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh '''
                        set -e
                        SSH_OPTS="-o StrictHostKeyChecking=no"

                        # ¿VM2 ya tiene la imagen de PostgreSQL?
                        VM2_HAS_PG=$(ssh $SSH_OPTS "$VM2_SSH_TARGET" "docker image inspect $POSTGRES_IMAGE >/dev/null 2>&1 && echo yes || echo no")

                        TRANSFER=""

                        # ----- PostgreSQL: solo si cambió su config/versión o falta en VM2 -----
                        if [ "$POSTGRES_CHANGED" = "true" ] || [ "$VM2_HAS_PG" = "no" ]; then
                            echo "[VM1] Preparando imagen PostgreSQL ($POSTGRES_IMAGE)..."
                            docker image inspect "$POSTGRES_IMAGE" >/dev/null 2>&1 || docker pull "$POSTGRES_IMAGE"
                            docker save "$POSTGRES_IMAGE" | gzip -c > "$POSTGRES_TAR_GZ"
                            TRANSFER="$TRANSFER $POSTGRES_TAR_GZ"
                        else
                            echo "[VM1] PostgreSQL sin cambios y presente en VM2: transferencia omitida."
                        fi

                        # ----- Backend: SOLO si cambió (si no, VM2 reutiliza su imagen) -----
                        if [ "$BACKEND_CHANGED" = "true" ]; then
                            if ! docker image inspect "$BACKEND_IMAGE" >/dev/null 2>&1; then
                                echo "[VM1] $BACKEND_IMAGE no existe en VM1 (caché perdido): reconstruyendo..."
                                docker build -t "$BACKEND_IMAGE" ./backend
                            fi
                            docker save "$BACKEND_IMAGE" | gzip -c > "$BACKEND_TAR_GZ"
                            TRANSFER="$TRANSFER $BACKEND_TAR_GZ"
                        else
                            echo "[VM1] Backend sin cambios: ni build ni transferencia (VM2 reutiliza su imagen)."
                        fi

                        # ----- Frontend: SOLO si cambió (si no, VM2 reutiliza su imagen) -----
                        if [ "$FRONTEND_CHANGED" = "true" ]; then
                            if ! docker image inspect "$FRONTEND_IMAGE" >/dev/null 2>&1; then
                                echo "[VM1] $FRONTEND_IMAGE no existe en VM1 (caché perdido): reconstruyendo..."
                                docker build \\
                                    --build-arg VITE_API_BASE_URL=/api \\
                                    --build-arg VITE_APP_VERSION="$APP_VERSION" \\
                                    -t "$FRONTEND_IMAGE" ./frontend
                            fi
                            docker save "$FRONTEND_IMAGE" | gzip -c > "$FRONTEND_TAR_GZ"
                            TRANSFER="$TRANSFER $FRONTEND_TAR_GZ"
                        else
                            echo "[VM1] Frontend sin cambios: ni build ni transferencia (VM2 reutiliza su imagen)."
                        fi

                        # ----- La configuración (compose + .env.example) siempre viaja -----
                        ssh $SSH_OPTS "$VM2_SSH_TARGET" "mkdir -p $REMOTE_DIR"
                        scp $SSH_OPTS $TRANSFER "$COMPOSE_FILE" .env.example "$VM2_SSH_TARGET:$REMOTE_DIR/"

                        rm -f "$POSTGRES_TAR_GZ" "$BACKEND_TAR_GZ" "$FRONTEND_TAR_GZ"
                        echo "[OK] Transferencia completada: ${TRANSFER:- solo configuración}."
                    '''
                }
            }
        }

        // =====================================================================
        // ETAPA 5: DEPLOY EN VM2 (STANDBY ':previous' + HEALTHCHECK + ROLLBACK)
        //
        //  - Los componentes SIN cambios se re-etiquetan en VM2 con la nueva
        //    APP_VERSION (docker tag) ANTES de tocar el stack activo.
        //  - Antes de reemplazar el stack, preserva la versión actual como
        //    contenedores en espera (proyecto 'taskflow-previous' = ':previous').
        //  - Despliega el stack actualizado (proyecto 'taskflow').
        //  - Healthcheck del backend durante 30s (localhost:8080/api/health).
        //  - ÉXITO: elimina el respaldo ':previous'.
        //  - FALLO: detiene el stack nuevo, restaura el respaldo ':previous'
        //    y aborta el pipeline con FAILURE.
        // =====================================================================
        stage('Deploy en VM2 (standby + rollback)') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 5: DEPLOY VM2 (STANDBY + ROLLBACK)"
                    echo "=========================================="
                }
                writeFile file: 'vm2-deploy.sh', text: '''#!/usr/bin/env bash
# ================================================================
# TaskFlow — Despliegue resiliente en VM2 (offline, versión global)
# Recibe variables por entorno desde el pipeline de Jenkins.
#
# APP_VERSION es la ÚNICA versión global de la plataforma. El
# componente que NO cambió no se transfiere: su imagen existente en
# VM2 se re-etiqueta (docker tag) con la nueva APP_VERSION.
# ================================================================
set -euo pipefail

cd "$REMOTE_DIR"

COMPOSE_FILE=docker-compose.yml
ACTIVE="docker compose -f $COMPOSE_FILE -p taskflow"
STANDBY="docker compose -f $COMPOSE_FILE -p taskflow-previous"
HEALTH_INTERVAL=3

echo "================================================="
echo " TaskFlow — Deploy en VM2"
echo "================================================="
echo " APP_VERSION (global): $APP_VERSION"
echo " Backend : taskflow-backend:$APP_VERSION (changed=$BACKEND_CHANGED)"
echo " Frontend: taskflow-frontend:$APP_VERSION (changed=$FRONTEND_CHANGED)"
echo " DB      : $POSTGRES_IMAGE (changed=$POSTGRES_CHANGED)"
echo "================================================="

# ----------------------------------------------------------------
# 0) Bootstrap de .env / deployed.env (primera ejecución).
#    'deployed.env' = copia del último .env desplegado con ÉXITO:
#    es la fuente del respaldo ':previous'.
# ----------------------------------------------------------------
[ -f .env ] || cp .env.example .env
if [ ! -f deployed.env ] && [ -f .env ]; then
    cp .env deployed.env
fi
# Limpiar variables legacy del esquema anterior (por componente)
sed -i '/^BACKEND_IMAGE=/d; /^FRONTEND_IMAGE=/d' .env 2>/dev/null || true

# ----------------------------------------------------------------
# 1) Cargar imágenes transferidas (solo las que llegaron)
# ----------------------------------------------------------------
for t in "$POSTGRES_TAR_GZ" "$BACKEND_TAR_GZ" "$FRONTEND_TAR_GZ"; do
    if [ -f "$t" ]; then
        echo "[VM2] docker load <- $t"
        gunzip -c "$t" | docker load
        rm -f "$t"
    fi
done

# ----------------------------------------------------------------
# 2) RETAG de componentes SIN cambios: re-etiquetar la imagen
#    existente en VM2 con la nueva APP_VERSION (misma imagen,
#    nuevo tag). Se ejecuta ANTES de tocar el stack activo: si
#    falla, la versión en producción queda intacta.
# ----------------------------------------------------------------
retag_if_needed() {
    # $1 = componente (backend|frontend), $2 = cambió (true|false)
    local comp="$1" changed="$2"
    local target="taskflow-${comp}:${APP_VERSION}"

    if docker image inspect "$target" >/dev/null 2>&1; then
        echo "[VM2] $comp: imagen $target ya presente (transferida o retaggeada antes)."
        return 0
    fi

    if [ "$changed" = "true" ]; then
        echo "[ERROR] $comp CAMBIÓ pero su imagen $target no existe en VM2 (falló build/transfer)."
        return 1
    fi

    # Buscar la imagen existente del componente (la que corre en producción)
    local src="" cid proj
    for proj in taskflow taskflow-previous; do
        cid=$(docker ps --filter "label=com.docker.compose.project=$proj" \\
                     --filter "label=com.docker.compose.service=$comp" -q 2>/dev/null | head -n 1 || true)
        if [ -n "$cid" ]; then
            src=$(docker inspect -f '{{.Config.Image}}' "$cid" 2>/dev/null || true)
            [ -n "$src" ] && break
        fi
    done

    if [ -z "$src" ] && [ -f deployed.env ]; then
        local prev_ver
        prev_ver=$(sed -n 's/^APP_VERSION=//p' deployed.env | head -n 1 || true)
        if [ -n "$prev_ver" ] && docker image inspect "taskflow-${comp}:${prev_ver}" >/dev/null 2>&1; then
            src="taskflow-${comp}:${prev_ver}"
        fi
    fi

    if [ -z "$src" ] && docker image inspect "taskflow-${comp}:latest" >/dev/null 2>&1; then
        src="taskflow-${comp}:latest"
    fi

    if [ -z "$src" ]; then
        echo "[ERROR] No existe ninguna imagen de taskflow-$comp en VM2 para retaggear como $target."
        echo "[ERROR] El stack activo NO fue modificado. Abortando."
        return 1
    fi

    echo "[VM2] $comp sin cambios: retag $src -> $target (misma imagen, nueva versión global)."
    docker tag "$src" "$target"
}

echo "[VM2] Asegurando imágenes para la versión global $APP_VERSION..."
retag_if_needed backend "$BACKEND_CHANGED"
retag_if_needed frontend "$FRONTEND_CHANGED"

# ----------------------------------------------------------------
# 3) Migración desde despliegues legacy (proyecto 'taskflow-deploy'
#    y contenedores con nombres fijos de esquemas anteriores)
# ----------------------------------------------------------------
LEGACY_RUNNING=$(docker ps --filter "label=com.docker.compose.project=taskflow-deploy" -q 2>/dev/null || true)
if [ -n "$LEGACY_RUNNING" ]; then
    echo "[VM2] Stack legacy detectado (proyecto 'taskflow-deploy'): deteniéndolo para migrar..."
    docker compose -f "$COMPOSE_FILE" -p taskflow-deploy down --remove-orphans 2>/dev/null || true
fi
docker rm -f taskflow-db taskflow-backend-container taskflow-frontend-container 2>/dev/null || true

# ----------------------------------------------------------------
# 4) Preservar la versión actual como respaldo ':previous'
#    (contenedores CREADOS y DETENIDOS, en espera, desde deployed.env)
# ----------------------------------------------------------------
STANDBY_RUNNING=$(docker ps --filter "label=com.docker.compose.project=taskflow-previous" -q 2>/dev/null || true)

STANDBY_AVAILABLE=false
if [ -n "$STANDBY_RUNNING" ]; then
    # Estado post-rollback: la versión anterior corre como 'taskflow-previous'.
    echo "[VM2] Stack ':previous' EN EJECUCIÓN (post-rollback): se conserva como respaldo."
    STANDBY_AVAILABLE=true
elif [ -f deployed.env ]; then
    echo "[VM2] Preservando versión actual como respaldo 'taskflow-previous' (en espera)..."
    $STANDBY down --remove-orphans 2>/dev/null || true
    if $STANDBY --env-file deployed.env create; then
        STANDBY_AVAILABLE=true
        echo "[VM2] Respaldo ':previous' creado (detenido, en espera)."
    else
        echo "[WARN] No se pudo crear el respaldo ':previous': se despliega SIN rollback automático."
    fi
else
    echo "[VM2] Primer despliegue: no existe versión anterior que respaldar."
fi

# ----------------------------------------------------------------
# 5) Escribir .env del nuevo despliegue (versión global única)
# ----------------------------------------------------------------
set_env_var() {
    if grep -q "^$1=" .env; then
        sed -i "s|^$1=.*|$1=$2|" .env
    else
        echo "$1=$2" >> .env
    fi
}
set_env_var APP_VERSION "$APP_VERSION"
set_env_var POSTGRES_IMAGE "$POSTGRES_IMAGE"

# ----------------------------------------------------------------
# 6) Desplegar stack actualizado (proyecto 'taskflow'). Compose recrea
#    solo los servicios cuya imagen/config cambió; los contenedores
#    del respaldo están detenidos (sin conflicto de puertos).
# ----------------------------------------------------------------
if [ "$STANDBY_AVAILABLE" = "true" ] && [ -n "$STANDBY_RUNNING" ]; then
    echo "[VM2] Deteniendo el respaldo ':previous' en ejecución (libera puertos para el nuevo stack)..."
    $STANDBY stop
fi

UP_OK=false
echo "[VM2] Desplegando stack actualizado: versión global $APP_VERSION..."
if $ACTIVE up -d --remove-orphans; then
    UP_OK=true
else
    echo "[ERROR] 'docker compose up -d' FALLÓ al desplegar el stack nuevo."
fi

# ----------------------------------------------------------------
# 7) Healthcheck del backend: http://localhost:8080/api/health
#    (se ejecuta DENTRO del contenedor backend), máx. 30 segundos.
# ----------------------------------------------------------------
HEALTH_OK=false
if [ "$UP_OK" = "true" ]; then
    echo "[VM2] Healthcheck backend: $BACKEND_HEALTH_URL (hasta ${HEALTH_TIMEOUT_SECS}s)..."
    ELAPSED=0
    while [ "$ELAPSED" -lt "$HEALTH_TIMEOUT_SECS" ]; do
        CID=$(docker ps --filter "label=com.docker.compose.project=taskflow" \\
                     --filter "label=com.docker.compose.service=backend" -q 2>/dev/null || true)
        if [ -n "$CID" ] && docker exec "$CID" wget -q -T 3 -O /dev/null "$BACKEND_HEALTH_URL" 2>/dev/null; then
            HEALTH_OK=true
            echo "[VM2] Healthcheck OK (HTTP 200) tras ${ELAPSED}s."
            break
        fi
        sleep "$HEALTH_INTERVAL"
        ELAPSED=$((ELAPSED + HEALTH_INTERVAL))
    done
else
    echo "[VM2] Se omite healthcheck: el stack nuevo no llegó a levantarse."
fi

# ----------------------------------------------------------------
# 8) ÉXITO -> eliminar respaldo | FALLO -> rollback + exit 1
# ----------------------------------------------------------------
if [ "$HEALTH_OK" = "true" ]; then
    echo "[VM2] Despliegue exitoso. Eliminando contenedores de espera ':previous'..."
    if [ "$STANDBY_AVAILABLE" = "true" ]; then
        $STANDBY down --remove-orphans 2>/dev/null || true
    fi

    # Registrar la versión desplegada (fuente del próximo respaldo)
    cp .env deployed.env

    # Limpieza de imágenes taskflow antiguas (conservando la versión actual)
    docker images --format "{{.Repository}}:{{.Tag}}" \\
        | grep -E "^taskflow-(backend|frontend):" \\
        | grep -vE "^taskflow-(backend|frontend):${APP_VERSION}$" \\
        | xargs -r docker rmi -f 2>/dev/null || true
    docker image prune -f >/dev/null 2>&1 || true

    echo "[VM2] Estado final:"
    $ACTIVE ps
    echo "[OK] Despliegue completado: versión global $APP_VERSION"
else
    echo "[ERROR] Healthcheck backend FALLÓ tras ${HEALTH_TIMEOUT_SECS}s (contenedor no arranca o no responde HTTP 200)."
    echo "[VM2] Deteniendo el stack nuevo y restaurando la versión anterior..."
    $ACTIVE down --remove-orphans 2>/dev/null || true
    if [ "$STANDBY_AVAILABLE" = "true" ]; then
        echo "[VM2] Restaurando versión anterior desde el respaldo ':previous'..."
        $STANDBY --env-file deployed.env up -d
        echo "[ROLLBACK] Versión anterior restaurada y en ejecución:"
        $STANDBY ps
    else
        echo "[ROLLBACK] No existía respaldo ':previous'; el stack nuevo quedó detenido."
    fi
    exit 1
fi
'''
                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no "$VM2_SSH_TARGET" \\
                            "REMOTE_DIR='$REMOTE_DIR' \\
                             APP_VERSION='$APP_VERSION' \\
                             POSTGRES_IMAGE='$POSTGRES_IMAGE' \\
                             POSTGRES_TAR_GZ='$POSTGRES_TAR_GZ' \\
                             BACKEND_TAR_GZ='$BACKEND_TAR_GZ' \\
                             FRONTEND_TAR_GZ='$FRONTEND_TAR_GZ' \\
                             BACKEND_CHANGED='$BACKEND_CHANGED' \\
                             FRONTEND_CHANGED='$FRONTEND_CHANGED' \\
                             POSTGRES_CHANGED='$POSTGRES_CHANGED' \\
                             BACKEND_HEALTH_URL='$BACKEND_HEALTH_URL' \\
                             HEALTH_TIMEOUT_SECS='$HEALTH_TIMEOUT_SECS' \\
                             bash -s" < vm2-deploy.sh
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "✅ PIPELINE EXITOSO | APP_VERSION=${env.APP_VERSION} (incremento=${env.VERSION_BUMPED}) | backend=${env.BACKEND_CHANGED} | frontend=${env.FRONTEND_CHANGED} | db=${env.POSTGRES_CHANGED}"
            echo "[INFO] Gateway: http://${params.VM2_IP}/ | Health: http://${params.VM2_IP}/api/health"
        }
        failure {
            script {
                // Si el pipeline falló después de incrementar APP_VERSION, se
                // revierte el incremento para que la versión rastree lo que
                // realmente llegó a producción (VM2 restauró ':previous').
                if (env.VERSION_BUMPED == 'true' && env.PREVIOUS_APP_VERSION && env.APP_VERSION) {
                    echo "❌ PIPELINE FALLIDO — revirtiendo APP_VERSION ${env.APP_VERSION} -> ${env.PREVIOUS_APP_VERSION} (la versión de producción es la restaurada ':previous')."
                    sh '''
                        set -e
                        echo "$PREVIOUS_APP_VERSION" > "$APP_VERSION_FILE"
                        if grep -q "^APP_VERSION=" .env; then
                            sed -i "s|^APP_VERSION=.*|APP_VERSION=$PREVIOUS_APP_VERSION|" .env
                        else
                            echo "APP_VERSION=$PREVIOUS_APP_VERSION" >> .env
                        fi
                        git tag -d "app-$APP_VERSION" 2>/dev/null || true
                    '''
                    echo "[INFO] APP_VERSION restaurada a ${env.PREVIOUS_APP_VERSION} en .env / estado / tags del workspace."
                } else {
                    echo "❌ PIPELINE FALLIDO — no hubo incremento de versión que revertir (VM2 conserva el stack ':previous' si el healthcheck falló)."
                }
            }
        }
        always {
            echo "[INFO] Resultado: ${currentBuild.currentResult} | Build #${BUILD_NUMBER}"
        }
    }
}
