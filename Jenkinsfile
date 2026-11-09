pipeline {
    agent any

    // -------------------------------------------------------------------------
    // VARIABLES DE CONFIGURACIÓN
    // VM1 = Jenkins (con acceso a internet) | VM2 = Servidor destino (SIN acceso a internet)
    // -------------------------------------------------------------------------
    environment {
        REMOTE_DIR      = '/home/administrator/taskflow-deploy'
        SSH_CRED_ID     = 'vm2-ssh-key'

        POSTGRES_IMAGE  = 'postgres:16-alpine'
        BACKEND_IMAGE_BASE  = 'taskflow-backend'
        FRONTEND_IMAGE_BASE = 'taskflow-frontend'
        POSTGRES_TAR_GZ = 'postgres-16-alpine.tar.gz'
        COMPOSE_FILE    = 'docker-compose.yml'

        TRIVY_SEVERITY  = 'HIGH,CRITICAL'
        TRIVY_EXIT_CODE = '1'
        TRIVY_CACHE_DIR = "${WORKSPACE}/.trivy-cache"

        // Archivos de estado para reutilizar versiones cuando no hay cambios
        BACKEND_VERSION_FILE  = '.taskflow-backend-version'
        FRONTEND_VERSION_FILE = '.taskflow-frontend-version'
    }

    stages {

        stage('Checkout') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 1: CHECKOUT + DETECCIÓN DE CAMBIOS"
                    echo "=========================================="
                }
                checkout scm
                script {
                    env.GIT_HASH = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()

                    // Detectar cambios respecto al commit anterior (si existe)
                    def hasPrev = sh(script: "git rev-parse --verify HEAD~1 >/dev/null 2>&1 && echo yes || echo no", returnStdout: true).trim()
                    def changedFiles = ""
                    if (hasPrev == 'yes') {
                        changedFiles = sh(script: "git diff --name-only HEAD~1", returnStdout: true).trim()
                    } else {
                        // Primer build o historial shallow sin padre: tratar como cambio global
                        changedFiles = "backend/ frontend/ docker-compose.yml Jenkinsfile"
                    }
                    echo "[INFO] Archivos cambiados (HEAD~1):\n${changedFiles ?: '(ninguno)'}"

                    def files = changedFiles ? changedFiles.split("\\r?\\n") as List : []
                    env.BACKEND_CHANGED = files.any { it.startsWith('backend/') } ? 'true' : 'false'
                    env.FRONTEND_CHANGED = files.any { it.startsWith('frontend/') } ? 'true' : 'false'
                    // Infra/compartido: compose, jenkinsfile, gateway config fuera de componentes, etc.
                    env.SHARED_CHANGED = files.any {
                        it == 'docker-compose.yml' || it == 'Jenkinsfile' || it == '.env.example' ||
                        it.startsWith('.github/') || it.startsWith('infra/')
                    } ? 'true' : 'false'

                    // Si hay cambios compartidos o no se detectaron cambios de componentes pero sí otros archivos,
                    // forzar actualización de ambos para mantener consistencia de despliegue.
                    if (env.SHARED_CHANGED == 'true') {
                        env.BACKEND_CHANGED = 'true'
                        env.FRONTEND_CHANGED = 'true'
                    }
                    // Si no hay cambios de producción en ningún componente, reutilizar versiones actuales
                    env.ANY_PROD_CHANGE = (env.BACKEND_CHANGED == 'true' || env.FRONTEND_CHANGED == 'true') ? 'true' : 'false'

                    // Hashes por componente (estables mientras no cambie el contenido)
                    env.BACKEND_HASH = sh(script: "git log -1 --format=%h -- backend || echo ${env.GIT_HASH}", returnStdout: true).trim()
                    env.FRONTEND_HASH = sh(script: "git log -1 --format=%h -- frontend || echo ${env.GIT_HASH}", returnStdout: true).trim()

                    // Resolver versiones/tags (reutilizar si no hay cambios)
                    if (env.BACKEND_CHANGED == 'true') {
                        env.BACKEND_TAG = "v1.0.${BUILD_NUMBER}-${env.BACKEND_HASH}"
                        writeFile file: env.BACKEND_VERSION_FILE, text: env.BACKEND_TAG
                    } else {
                        env.BACKEND_TAG = fileExists(env.BACKEND_VERSION_FILE) ? readFile(env.BACKEND_VERSION_FILE).trim() : "v1.0.0-${env.BACKEND_HASH}"
                    }

                    if (env.FRONTEND_CHANGED == 'true') {
                        env.FRONTEND_TAG = "v1.0.${BUILD_NUMBER}-${env.FRONTEND_HASH}"
                        env.APP_VERSION = "v1.0.${BUILD_NUMBER}"
                        writeFile file: env.FRONTEND_VERSION_FILE, text: "${env.FRONTEND_TAG}\n${env.APP_VERSION}"
                    } else {
                        if (fileExists(env.FRONTEND_VERSION_FILE)) {
                            def lines = readFile(env.FRONTEND_VERSION_FILE).trim().split("\\r?\\n")
                            env.FRONTEND_TAG = lines.length > 0 ? lines[0].trim() : "v1.0.0-${env.FRONTEND_HASH}"
                            env.APP_VERSION = lines.length > 1 ? lines[1].trim() : "v1.0.${BUILD_NUMBER}"
                        } else {
                            env.FRONTEND_TAG = "v1.0.0-${env.FRONTEND_HASH}"
                            env.APP_VERSION = "v1.0.local"
                        }
                    }

                    env.BACKEND_IMAGE = "${BACKEND_IMAGE_BASE}:${env.BACKEND_TAG}"
                    env.FRONTEND_IMAGE = "${FRONTEND_IMAGE_BASE}:${env.FRONTEND_TAG}"
                    env.BACKEND_TAR_GZ = "taskflow-backend-${env.BACKEND_TAG}.tar.gz"
                    env.FRONTEND_TAR_GZ = "taskflow-frontend-${env.FRONTEND_TAG}.tar.gz"

                    echo "=========================================="
                    echo "[INFO] Backend changed:  ${env.BACKEND_CHANGED}"
                    echo "[INFO] Frontend changed: ${env.FRONTEND_CHANGED}"
                    echo "[INFO] Shared changed:   ${env.SHARED_CHANGED}"
                    echo "[INFO] Backend tag:      ${env.BACKEND_TAG}"
                    echo "[INFO] Frontend tag:     ${env.FRONTEND_TAG}"
                    echo "[INFO] App version:      ${env.APP_VERSION}"
                    echo "=========================================="
                }
            }
        }

        stage('Build Images (condicional)') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 2: BUILD DE IMÁGENES (QUALITY GATES)"
                    echo "=========================================="
                }
                sh """
                    docker image prune -f || true
                    docker pull ${POSTGRES_IMAGE}

                    if [ "${BACKEND_CHANGED}" = "true" ]; then
                        echo "[VM1] Construyendo backend (tests H2 en Dockerfile)..."
                        docker build -t ${BACKEND_IMAGE} -t ${BACKEND_IMAGE_BASE}:latest ./backend
                    else
                        echo "[VM1] Sin cambios en backend: reutilizando tag ${BACKEND_TAG} (no se reconstruye)."
                        # Asegurar que la imagen/tag exista localmente para empaquetar; si no, reconstruir por seguridad
                        if ! docker image inspect ${BACKEND_IMAGE} >/dev/null 2>&1; then
                            echo "[VM1] Imagen ${BACKEND_IMAGE} no encontrada localmente; reconstruyendo."
                            docker build -t ${BACKEND_IMAGE} -t ${BACKEND_IMAGE_BASE}:latest ./backend
                        fi
                        docker tag ${BACKEND_IMAGE} ${BACKEND_IMAGE_BASE}:latest || true
                    fi

                    if [ "${FRONTEND_CHANGED}" = "true" ]; then
                        echo "[VM1] Construyendo frontend (lint+build en Dockerfile)..."
                        docker build \\
                            --build-arg VITE_API_BASE_URL=/api \\
                            --build-arg VITE_APP_VERSION=${APP_VERSION} \\
                            -t ${FRONTEND_IMAGE} -t ${FRONTEND_IMAGE_BASE}:latest ./frontend
                    else
                        echo "[VM1] Sin cambios en frontend: reutilizando tag ${FRONTEND_TAG} (no se reconstruye)."
                        if ! docker image inspect ${FRONTEND_IMAGE} >/dev/null 2>&1; then
                            echo "[VM1] Imagen ${FRONTEND_IMAGE} no encontrada localmente; reconstruyendo."
                            docker build \\
                                --build-arg VITE_API_BASE_URL=/api \\
                                --build-arg VITE_APP_VERSION=${APP_VERSION} \\
                                -t ${FRONTEND_IMAGE} -t ${FRONTEND_IMAGE_BASE}:latest ./frontend
                        fi
                        docker tag ${FRONTEND_IMAGE} ${FRONTEND_IMAGE_BASE}:latest || true
                    fi

                    echo "[OK] Imágenes listas."
                    docker images | grep -E 'postgres|${BACKEND_IMAGE_BASE}|${FRONTEND_IMAGE_BASE}' || true
                """
            }
        }

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
                sh """
                    set -e
                    mkdir -p "${TRIVY_CACHE_DIR}"
                    export TRIVY_CACHE_DIR="${TRIVY_CACHE_DIR}"
                    export TMPDIR="${WORKSPACE}/.tmp-trivy"
                    mkdir -p "\$TMPDIR"
                    docker system prune -f || true

                    if ! command -v trivy >/dev/null 2>&1; then
                        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
                    fi
                    command -v trivy >/dev/null 2>&1 || { echo "[ERROR] Trivy no disponible"; exit 1; }

                    if [ "${BACKEND_CHANGED}" = "true" ]; then
                        trivy image --cache-dir "\$TRIVY_CACHE_DIR" --exit-code ${TRIVY_EXIT_CODE} --severity ${TRIVY_SEVERITY} --no-progress ${BACKEND_IMAGE}
                    else
                        echo "[VM1] Trivy backend omitido (sin cambios)."
                    fi
                    if [ "${FRONTEND_CHANGED}" = "true" ]; then
                        trivy image --cache-dir "\$TRIVY_CACHE_DIR" --exit-code ${TRIVY_EXIT_CODE} --severity ${TRIVY_SEVERITY} --no-progress ${FRONTEND_IMAGE}
                    else
                        echo "[VM1] Trivy frontend omitido (sin cambios)."
                    fi
                """
            }
        }

        stage('Package & Transfer') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 4: PACKAGE & TRANSFER"
                    echo "=========================================="
                }
                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh """
                        docker save ${POSTGRES_IMAGE} | gzip -c > ${POSTGRES_TAR_GZ}
                        docker save ${BACKEND_IMAGE} ${BACKEND_IMAGE_BASE}:latest | gzip -c > ${BACKEND_TAR_GZ}
                        docker save ${FRONTEND_IMAGE} ${FRONTEND_IMAGE_BASE}:latest | gzip -c > ${FRONTEND_TAR_GZ}

                        ls -lh ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ}
                        ssh -o StrictHostKeyChecking=no ${params.VM2_USER}@${params.VM2_IP} "mkdir -p ${REMOTE_DIR}"
                        scp -o StrictHostKeyChecking=no ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ} ${COMPOSE_FILE} ${params.VM2_USER}@${params.VM2_IP}:${REMOTE_DIR}/
                        rm -f ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ}
                        echo "[OK] Transferencia completada."
                    """
                }
            }
        }

        stage('Clean & Deploy en VM 2') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 5: CLEAN & DEPLOY EN VM2"
                    echo "=========================================="
                }
                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${params.VM2_USER}@${params.VM2_IP} << EOF
                            set -e
                            cd ${REMOTE_DIR}
                            [ ! -f .env ] && [ -f .env.example ] && cp .env.example .env || true

                            export BACKEND_IMAGE=${BACKEND_IMAGE}
                            export FRONTEND_IMAGE=${FRONTEND_IMAGE}

                            docker compose down --remove-orphans || true
                            docker rm -f taskflow-backend taskflow-backend-container taskflow-frontend taskflow-frontend-container taskflow-db 2>/dev/null || true
                            docker images --format "{{.Repository}}:{{.Tag}}" | grep -E '^${BACKEND_IMAGE_BASE}:|^${FRONTEND_IMAGE_BASE}:' | xargs -r docker rmi -f 2>/dev/null || true

                            gunzip -c ${POSTGRES_TAR_GZ} | docker load
                            gunzip -c ${BACKEND_TAR_GZ} | docker load
                            gunzip -c ${FRONTEND_TAR_GZ} | docker load

                            docker compose up -d --remove-orphans
                            rm -f ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ}
                            docker image prune -f
                            docker compose ps
EOF
                        echo "[OK] Despliegue remoto finalizado."
                    """
                }
            }
        }
    }

    post {
        success {
            echo "✅ PIPELINE EXITOSO | backend=${env.BACKEND_CHANGED} frontend=${env.FRONTEND_CHANGED} shared=${env.SHARED_CHANGED}"
            echo "[INFO] Backend: ${env.BACKEND_IMAGE} | Frontend: ${env.FRONTEND_IMAGE} | App: ${env.APP_VERSION}"
            echo "[INFO] Gateway: http://${params.VM2_IP}/"
        }
        failure {
            echo "❌ PIPELINE FALLIDO - revisar logs (build/tests/lint/trivy/ssh/deploy)."
        }
        always {
            echo "[INFO] Resultado: ${currentBuild.currentResult} | Build #${BUILD_NUMBER}"
        }
    }
}
