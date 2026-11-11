pipeline {
    agent any

    // -------------------------------------------------------------------------
    // VARIABLES DE CONFIGURACIÓN
    // VM1 = Jenkins (con acceso a internet) | VM2 = Servidor destino (SIN internet)
    // VM2_IP / VM2_USER se obtienen de parámetros del job de Jenkins
    // (params.VM2_IP / params.VM2_USER), NO de este environment.
    // -------------------------------------------------------------------------
    environment {
        // Directorio remoto en VM2
        REMOTE_DIR      = '/home/administrator/taskflow-deploy'

        // Credencial SSH configurada en Jenkins
        SSH_CRED_ID     = 'vm2-ssh-key'

        // Imágenes Docker base
        POSTGRES_IMAGE      = 'postgres:16-alpine'
        BACKEND_IMAGE_BASE  = 'taskflow-backend'
        FRONTEND_IMAGE_BASE = 'taskflow-frontend'

        // Archivos comprimidos (.tar.gz) para transferencia
        POSTGRES_TAR_GZ = 'postgres-16-alpine.tar.gz'

        // Configuración a transferir (siempre)
        COMPOSE_FILE    = 'docker-compose.yml'

        // Escaneo de seguridad (Trivy)
        TRIVY_SEVERITY  = 'HIGH,CRITICAL'
        // '1' hace fallar el pipeline si encuentra vulnerabilidades o si el escaneo falla
        TRIVY_EXIT_CODE = '1'
        // Caché en workspace para evitar 'no space left on device' en /tmp
        TRIVY_CACHE_DIR = "${WORKSPACE}/.trivy-cache"

        // Estado de versiones por componente (persistido en el workspace)
        BACKEND_VERSION_FILE  = '.taskflow-backend-version'
        FRONTEND_VERSION_FILE = '.taskflow-frontend-version'
        POSTGRES_HASH_FILE    = '.taskflow-postgres-hash'

        // Healthcheck del backend en VM2 (se ejecuta DENTRO del contenedor,
        // por eso el backend responde en localhost:8080)
        BACKEND_HEALTH_URL  = 'http://localhost:8080/api/health'
        HEALTH_TIMEOUT_SECS = '30'
    }

    stages {

        // =====================================================================
        // ETAPA 1: CHECKOUT + DETECCIÓN DE CAMBIOS + VERSIONADO CONDICIONAL
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

                    // ---------------------------------------------------------
                    // 1) Detección de cambios por componente: git diff HEAD~1
                    // ---------------------------------------------------------
                    def hasPrev = sh(script: 'git rev-parse --verify HEAD~1 >/dev/null 2>&1 && echo yes || echo no',
                                     returnStdout: true).trim()

                    def files
                    if (hasPrev == 'yes') {
                        def changedFiles = sh(script: 'git diff --name-only HEAD~1', returnStdout: true).trim()
                        echo "[INFO] Archivos cambiados (HEAD~1):\n${changedFiles ?: '(ninguno)'}"
                        files = changedFiles ? (changedFiles.split('\\r?\\n') as List) : []
                    } else {
                        // Primer build o historial shallow (sin HEAD~1): cambio global
                        echo '[INFO] Sin commit previo (HEAD~1): se trata como cambio global.'
                        files = ['backend/', 'frontend/', 'docker-compose.yml']
                    }

                    // BACKEND_CHANGED / FRONTEND_CHANGED: SOLO si cambia su código fuente
                    env.BACKEND_CHANGED  = files.any { it.startsWith('backend/') }  ? 'true' : 'false'
                    env.FRONTEND_CHANGED = files.any { it.startsWith('frontend/') } ? 'true' : 'false'

                    // ---------------------------------------------------------
                    // 2) PostgreSQL: cambia SOLO si cambia su bloque de config
                    //    en el compose o la versión de imagen (hash persistido)
                    // ---------------------------------------------------------
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

                    // ---------------------------------------------------------
                    // 3) Versionado condicional independiente: incrementa la
                    //    versión EXCLUSIVA del componente que cambió; si no
                    //    cambió, reutiliza la versión/tag existente.
                    // ---------------------------------------------------------
                    sh '''
                        set -e

                        latest_version() {
                            # $1 = componente (backend|frontend), $2 = archivo de estado
                            {
                                git tag -l "$1-v*" 2>/dev/null | sed "s/^$1-v//" | sed "s/-.*$//"
                                if [ -f "$2" ]; then sed "s/^v//; s/-.*$//" "$2"; fi
                            } | grep -E "^[0-9]+\\.[0-9]+\\.[0-9]+$" | sort -V | tail -n 1
                            return 0
                        }

                        bump_patch() { echo "$1" | awk -F. '{ $NF = $NF + 1; OFS = "."; print $1, $2, $3 }'; }

                        resolve() {
                            # $1 componente, $2 archivo estado, $3 changed, $4 archivo tag resuelto
                            CUR=$(latest_version "$1" "$2")
                            CUR=${CUR:-1.0.0}
                            if [ "$3" = "true" ]; then
                                NEW="v$(bump_patch "$CUR")"
                                echo "$NEW" > "$2"
                                git tag "$1-$NEW" 2>/dev/null || true
                                echo "$NEW" > "$4"
                                echo "[INFO] $1 CAMBIÓ: versión $CUR -> $NEW"
                            else
                                echo "v$CUR" > "$4"
                                echo "[INFO] $1 sin cambios: reutiliza versión v$CUR (no se incrementa)"
                            fi
                        }

                        resolve backend  "$BACKEND_VERSION_FILE"  "$BACKEND_CHANGED"  .backend-tag
                        resolve frontend "$FRONTEND_VERSION_FILE" "$FRONTEND_CHANGED" .frontend-tag
                    '''

                    // Resultados de las detecciones/versiones
                    env.POSTGRES_CHANGED = readFile('.postgres-changed').trim()
                    env.BACKEND_TAG      = readFile('.backend-tag').trim()
                    env.FRONTEND_TAG     = readFile('.frontend-tag').trim()

                    // La versión visible de la app = versión exclusiva del frontend
                    env.APP_VERSION = env.FRONTEND_TAG

                    env.BACKEND_IMAGE  = "${BACKEND_IMAGE_BASE}:${env.BACKEND_TAG}"
                    env.FRONTEND_IMAGE = "${FRONTEND_IMAGE_BASE}:${env.FRONTEND_TAG}"
                    env.BACKEND_TAR_GZ  = "taskflow-backend-${env.BACKEND_TAG}.tar.gz"
                    env.FRONTEND_TAR_GZ = "taskflow-frontend-${env.FRONTEND_TAG}.tar.gz"

                    // Target SSH a partir de los parámetros del job
                    env.VM2_SSH_TARGET = "${params.VM2_USER}@${params.VM2_IP}"

                    echo "=========================================="
                    echo "[INFO] Backend changed:  ${env.BACKEND_CHANGED}  -> ${env.BACKEND_IMAGE}"
                    echo "[INFO] Frontend changed: ${env.FRONTEND_CHANGED} -> ${env.FRONTEND_IMAGE}"
                    echo "[INFO] Postgres changed: ${env.POSTGRES_CHANGED} -> ${POSTGRES_IMAGE}"
                    echo "[INFO] App version: ${env.APP_VERSION}"
                    echo "=========================================="
                }
            }
        }

        // =====================================================================
        // ETAPA 2: BUILD DE IMÁGENES (solo componentes cambiados)
        // Los quality gates (tests H2 / lint+tsc / vite build) están encapsulados
        // dentro de los Dockerfiles multi-etapa.
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
                        docker build -t "$BACKEND_IMAGE" -t "$BACKEND_IMAGE_BASE:latest" ./backend
                    else
                        echo "[VM1] Backend SIN cambios: build omitido, se reutiliza $BACKEND_IMAGE"
                    fi

                    if [ "$FRONTEND_CHANGED" = "true" ]; then
                        echo "[VM1] Frontend cambió: build Vite (lint+tsc en Dockerfile) + imagen $FRONTEND_IMAGE"
                        docker build \
                            --build-arg VITE_API_BASE_URL=/api \
                            --build-arg VITE_APP_VERSION="$APP_VERSION" \
                            -t "$FRONTEND_IMAGE" -t "$FRONTEND_IMAGE_BASE:latest" ./frontend
                    else
                        echo "[VM1] Frontend SIN cambios: build omitido, se reutiliza $FRONTEND_IMAGE"
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
                        trivy image --cache-dir "$TRIVY_CACHE_DIR" --exit-code "$TRIVY_EXIT_CODE" \
                            --severity "$TRIVY_SEVERITY" --no-progress "$BACKEND_IMAGE"
                    else
                        echo "[VM1] Trivy backend omitido (sin cambios)."
                    fi

                    if [ "$FRONTEND_CHANGED" = "true" ]; then
                        echo "[VM1] Escaneando $FRONTEND_IMAGE (severidades: $TRIVY_SEVERITY)"
                        trivy image --cache-dir "$TRIVY_CACHE_DIR" --exit-code "$TRIVY_EXIT_CODE" \
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
        // Solo se empaquetan/transfieren las imágenes que cambiaron o que
        // falten en VM2 (PostgreSQL solo si cambió su config/versión).
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

                        # ¿Qué imágenes ya tiene VM2?
                        VM2_HAS_PG=$(ssh $SSH_OPTS "$VM2_SSH_TARGET" "docker image inspect $POSTGRES_IMAGE >/dev/null 2>&1 && echo yes || echo no")
                        VM2_HAS_BACKEND=$(ssh $SSH_OPTS "$VM2_SSH_TARGET" "docker image inspect $BACKEND_IMAGE >/dev/null 2>&1 && echo yes || echo no")
                        VM2_HAS_FRONTEND=$(ssh $SSH_OPTS "$VM2_SSH_TARGET" "docker image inspect $FRONTEND_IMAGE >/dev/null 2>&1 && echo yes || echo no")
                        echo "[INFO] VM2 ya tiene: postgres=$VM2_HAS_PG backend=$VM2_HAS_BACKEND frontend=$VM2_HAS_FRONTEND"

                        TRANSFER=""

                        # ----- PostgreSQL: solo si cambió su config/versión o falta en VM2 -----
                        if [ "$POSTGRES_CHANGED" = "true" ] || [ "$VM2_HAS_PG" = "no" ]; then
                            echo "[VM1] Preparando imagen PostgreSQL..."
                            docker image inspect "$POSTGRES_IMAGE" >/dev/null 2>&1 || docker pull "$POSTGRES_IMAGE"
                            docker save "$POSTGRES_IMAGE" | gzip -c > "$POSTGRES_TAR_GZ"
                            TRANSFER="$TRANSFER $POSTGRES_TAR_GZ"
                        else
                            echo "[VM1] PostgreSQL sin cambios y presente en VM2: transferencia omitida."
                        fi

                        # ----- Backend: solo si cambió (imagen nueva) o falta en VM2 -----
                        if [ "$BACKEND_CHANGED" = "true" ] || [ "$VM2_HAS_BACKEND" = "no" ]; then
                            if ! docker image inspect "$BACKEND_IMAGE" >/dev/null 2>&1; then
                                echo "[VM1] $BACKEND_IMAGE no existe en VM1 (caché perdido): reconstruyendo..."
                                docker build -t "$BACKEND_IMAGE" -t "$BACKEND_IMAGE_BASE:latest" ./backend
                            fi
                            docker save "$BACKEND_IMAGE" "$BACKEND_IMAGE_BASE:latest" | gzip -c > "$BACKEND_TAR_GZ"
                            TRANSFER="$TRANSFER $BACKEND_TAR_GZ"
                        else
                            echo "[VM1] Backend sin cambios y presente en VM2: transferencia omitida."
                        fi

                        # ----- Frontend: solo si cambió (imagen nueva) o falta en VM2 -----
                        if [ "$FRONTEND_CHANGED" = "true" ] || [ "$VM2_HAS_FRONTEND" = "no" ]; then
                            if ! docker image inspect "$FRONTEND_IMAGE" >/dev/null 2>&1; then
                                echo "[VM1] $FRONTEND_IMAGE no existe en VM1 (caché perdido): reconstruyendo..."
                                docker build \
                                    --build-arg VITE_API_BASE_URL=/api \
                                    --build-arg VITE_APP_VERSION="$APP_VERSION" \
                                    -t "$FRONTEND_IMAGE" -t "$FRONTEND_IMAGE_BASE:latest" ./frontend
                            fi
                            docker save "$FRONTEND_IMAGE" "$FRONTEND_IMAGE_BASE:latest" | gzip -c > "$FRONTEND_TAR_GZ"
                            TRANSFER="$TRANSFER $FRONTEND_TAR_GZ"
                        else
                            echo "[VM1] Frontend sin cambios y presente en VM2: transferencia omitida."
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
        //  - Antes de reemplazar el stack, preserva la versión actual como
        //    contenedores en espera (proyecto 'taskflow-previous').
        //  - Despliega el stack actualizado (solo recrea los servicios cuyos
        //    imágenes/config cambiaron).
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
# TaskFlow — Despliegue resiliente en VM2 (offline)
# Recibe variables por entorno desde el pipeline de Jenkins.
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
echo " Backend : $BACKEND_IMAGE (changed=$BACKEND_CHANGED)"
echo " Frontend: $FRONTEND_IMAGE (changed=$FRONTEND_CHANGED)"
echo " DB      : $POSTGRES_IMAGE (changed=$POSTGRES_CHANGED)"
echo "================================================="

# ----------------------------------------------------------------
# 0) Bootstrap de .env / deployed.env (primera ejecución)
# ----------------------------------------------------------------
[ -f .env ] || cp .env.example .env
if [ ! -f deployed.env ] && [ -f .env ]; then
    # 'deployed.env' representa la versión desplegada con éxito más
    # reciente: es la fuente del respaldo ':previous'.
    cp .env deployed.env
fi

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
# 2) Migración desde despliegues legacy (proyecto 'taskflow-deploy'
#    y contenedores con nombres fijos de esquemas anteriores)
# ----------------------------------------------------------------
LEGACY_RUNNING=$(docker ps --filter "label=com.docker.compose.project=taskflow-deploy" -q 2>/dev/null || true)
if [ -n "$LEGACY_RUNNING" ]; then
    echo "[VM2] Stack legacy detectado (proyecto 'taskflow-deploy'): deteniéndolo para migrar..."
    docker compose -f "$COMPOSE_FILE" -p taskflow-deploy down --remove-orphans 2>/dev/null || true
fi
docker rm -f taskflow-db taskflow-backend-container taskflow-frontend-container 2>/dev/null || true

# ----------------------------------------------------------------
# 3) Preservar la versión actual como respaldo ':previous'
#    (contenedores CREADOS y DETENIDOS, en espera)
# ----------------------------------------------------------------
STANDBY_RUNNING=$(docker ps --filter "label=com.docker.compose.project=taskflow-previous" -q 2>/dev/null || true)

STANDBY_AVAILABLE=false
if [ -n "$STANDBY_RUNNING" ]; then
    # Estado post-rollback: la versión anterior corre como 'taskflow-previous'.
    echo "[VM2] Stack anterior activo (post-rollback): se preserva como respaldo ':previous'."
    $STANDBY stop
    STANDBY_AVAILABLE=true
elif [ -f deployed.env ]; then
    echo "[VM2] Preservando versión actual como respaldo 'taskflow-previous' (en espera)..."
    # Limpiar restos previos del proyecto standby y recrearlo con la config
    # de la última versión desplegada con éxito (deployed.env).
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
# 4) Escribir .env del nuevo despliegue (tags resueltos por Jenkins)
# ----------------------------------------------------------------
set_env_var() {
    if grep -q "^$1=" .env; then
        sed -i "s|^$1=.*|$1=$2|" .env
    else
        echo "$1=$2" >> .env
    fi
}
set_env_var BACKEND_IMAGE "$BACKEND_IMAGE"
set_env_var FRONTEND_IMAGE "$FRONTEND_IMAGE"
set_env_var POSTGRES_IMAGE "$POSTGRES_IMAGE"

# ----------------------------------------------------------------
# 5) Desplegar stack actualizado. Docker compose recrea ÚNICAMENTE
#    los servicios cuya imagen/config cambió (los demás siguen o
#    arrancan tal cual: por eso el build/transfer selectivo).
# ----------------------------------------------------------------
UP_OK=false
echo "[VM2] Desplegando stack actualizado (docker compose up -d)..."
if $ACTIVE up -d --remove-orphans; then
    UP_OK=true
else
    echo "[ERROR] 'docker compose up -d' FALLÓ al desplegar el stack nuevo."
fi

# ----------------------------------------------------------------
# 6) Healthcheck del backend: http://localhost:8080/api/health
#    (se ejecuta DENTRO del contenedor backend), máx. 30 segundos.
# ----------------------------------------------------------------
HEALTH_OK=false
if [ "$UP_OK" = "true" ]; then
    echo "[VM2] Healthcheck backend: $BACKEND_HEALTH_URL (hasta ${HEALTH_TIMEOUT_SECS}s)..."
    ELAPSED=0
    while [ "$ELAPSED" -lt "$HEALTH_TIMEOUT_SECS" ]; do
        CID=$(docker ps --filter "label=com.docker.compose.project=taskflow" \
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
# 7) ÉXITO -> eliminar respaldo | FALLO -> rollback + exit 1
# ----------------------------------------------------------------
if [ "$HEALTH_OK" = "true" ]; then
    echo "[VM2] Despliegue exitoso. Eliminando contenedores de espera ':previous'..."
    if [ "$STANDBY_AVAILABLE" = "true" ]; then
        $STANDBY down --remove-orphans 2>/dev/null || true
    fi

    # Registrar la versión desplegada (fuente del próximo respaldo)
    cp .env deployed.env

    # Limpieza de imágenes TaskFlow antiguas (conservando las actuales)
    docker images --format "{{.Repository}}:{{.Tag}}" \
        | grep -E "^${BACKEND_IMAGE_BASE}:|^${FRONTEND_IMAGE_BASE}:" \
        | grep -vE "^(${BACKEND_IMAGE}|${FRONTEND_IMAGE})$" \
        | xargs -r docker rmi -f 2>/dev/null || true
    docker image prune -f >/dev/null 2>&1 || true

    echo "[VM2] Estado final:"
    $ACTIVE ps
    echo "[OK] Despliegue completado: $BACKEND_IMAGE / $FRONTEND_IMAGE"
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
                             BACKEND_IMAGE='$BACKEND_IMAGE' FRONTEND_IMAGE='$FRONTEND_IMAGE' POSTGRES_IMAGE='$POSTGRES_IMAGE' \\
                             BACKEND_IMAGE_BASE='$BACKEND_IMAGE_BASE' FRONTEND_IMAGE_BASE='$FRONTEND_IMAGE_BASE' \\
                             POSTGRES_TAR_GZ='$POSTGRES_TAR_GZ' BACKEND_TAR_GZ='$BACKEND_TAR_GZ' FRONTEND_TAR_GZ='$FRONTEND_TAR_GZ' \\
                             BACKEND_CHANGED='$BACKEND_CHANGED' FRONTEND_CHANGED='$FRONTEND_CHANGED' POSTGRES_CHANGED='$POSTGRES_CHANGED' \\
                             BACKEND_HEALTH_URL='$BACKEND_HEALTH_URL' HEALTH_TIMEOUT_SECS='$HEALTH_TIMEOUT_SECS' \\
                             bash -s" < vm2-deploy.sh
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "✅ PIPELINE EXITOSO | backend=${env.BACKEND_CHANGED} (${env.BACKEND_TAG}) | frontend=${env.FRONTEND_CHANGED} (${env.FRONTEND_TAG}) | db=${env.POSTGRES_CHANGED}"
            echo "[INFO] Gateway: http://${params.VM2_IP}/ | Health: http://${params.VM2_IP}/api/health"
        }
        failure {
            echo "❌ PIPELINE FALLIDO — si el healthcheck falló, VM2 restauró automáticamente la versión ':previous'."
        }
        always {
            echo "[INFO] Resultado: ${currentBuild.currentResult} | Build #${BUILD_NUMBER}"
        }
    }
}
