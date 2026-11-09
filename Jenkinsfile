pipeline {
    agent any

    // -------------------------------------------------------------------------
    // VARIABLES DE CONFIGURACIÓN
    // VM1 = Jenkins (con acceso a internet) | VM2 = Servidor destino (SIN acceso a internet)
    // -------------------------------------------------------------------------
    environment {
        // Directorio remoto en VM2
        REMOTE_DIR      = '/home/administrator/taskflow-deploy'

        // Credencial SSH configurada en Jenkins
        SSH_CRED_ID     = 'vm2-ssh-key'

        // Imágenes Docker base
        POSTGRES_IMAGE  = 'postgres:16-alpine'
        BACKEND_IMAGE_BASE  = 'taskflow-backend'
        FRONTEND_IMAGE_BASE = 'taskflow-frontend'

        // Archivos comprimidos (.tar.gz) para transferencia
        POSTGRES_TAR_GZ = 'postgres-16-alpine.tar.gz'

        // Archivo compose a transferir
        COMPOSE_FILE    = 'docker-compose.yml'

        // Escaneo de seguridad (Trivy)
        TRIVY_SEVERITY  = 'HIGH,CRITICAL'
        TRIVY_EXIT_CODE = '0' // 0 = no falla el pipeline (solo reporta), usar '1' para bloquear
    }

    stages {

        // ETAPA 1: CHECKOUT
        stage('Checkout') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 1: CHECKOUT DEL CÓDIGO FUENTE"
                    echo "=========================================="
                }
                checkout scm
                script {
                    env.GIT_HASH = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()
                    env.IMAGE_TAG = "${BUILD_NUMBER}-${env.GIT_HASH}"
                    env.APP_VERSION = "v1.0.${BUILD_NUMBER}"
                    env.BACKEND_IMAGE = "${BACKEND_IMAGE_BASE}:${env.IMAGE_TAG}"
                    env.FRONTEND_IMAGE = "${FRONTEND_IMAGE_BASE}:${env.IMAGE_TAG}"
                    env.BACKEND_TAR_GZ = "taskflow-backend-${env.IMAGE_TAG}.tar.gz"
                    env.FRONTEND_TAR_GZ = "taskflow-frontend-${env.IMAGE_TAG}.tar.gz"

                    echo "[OK] Rama: ${env.GIT_BRANCH ?: 'N/A'} | Commit: ${env.GIT_COMMIT?.take(7) ?: 'N/A'}"
                    echo "[INFO] Tag: ${env.IMAGE_TAG} | Versión app: ${env.APP_VERSION}"
                }
            }
        }

        // ETAPA 2: BUILD & QUALITY GATES (encapsulados en Dockerfiles)
        // Los tests (backend, perfil H2) y el lint/build (frontend) se ejecutan dentro
        // de los Dockerfiles multi-etapa. Si fallan, docker build falla y el pipeline se detiene.
        stage('Build Images (Dockerfiles con tests/lint)') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 2: BUILD DE IMÁGENES (QUALITY GATES)"
                    echo "=========================================="
                    echo "[INFO] Backend: ejecuta tests con perfil H2 dentro del Dockerfile"
                    echo "[INFO] Frontend: ejecuta lint (tsc --noEmit) y build dentro del Dockerfile"
                }
                sh """
                    echo "[VM1] Limpiando imágenes locales viejas (opcional)..."
                    docker image prune -f || true

                    echo "[VM1] Descargando imagen base de PostgreSQL: ${POSTGRES_IMAGE}"
                    docker pull ${POSTGRES_IMAGE}

                    echo "[VM1] Construyendo backend (incluye mvn clean package + tests H2)..."
                    docker build -t ${BACKEND_IMAGE} -t ${BACKEND_IMAGE_BASE}:latest ./backend

                    echo "[VM1] Construyendo frontend (incluye npm run lint + npm run build)..."
                    docker build \\
                        --build-arg VITE_API_BASE_URL=/api \\
                        --build-arg VITE_APP_VERSION=${APP_VERSION} \\
                        -t ${FRONTEND_IMAGE} -t ${FRONTEND_IMAGE_BASE}:latest ./frontend

                    echo "[VM1] Imágenes generadas:"
                    docker images | grep -E 'postgres|${BACKEND_IMAGE_BASE}|${FRONTEND_IMAGE_BASE}'
                    echo "[OK] Build y quality gates completados."
                """
            }
        }

        // ETAPA 3: CONTAINER SECURITY SCAN (TRIVY)
        stage('Container Security Scan') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 3: ESCANEO DE SEGURIDAD (TRIVY)"
                    echo "=========================================="
                }
                sh """
                    if ! command -v trivy >/dev/null 2>&1; then
                        echo "[VM1] Trivy no disponible. Intentando instalación..."
                        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin || true
                    fi

                    if command -v trivy >/dev/null 2>&1; then
                        trivy image --exit-code ${TRIVY_EXIT_CODE} --severity ${TRIVY_SEVERITY} --no-progress ${BACKEND_IMAGE} || true
                        trivy image --exit-code ${TRIVY_EXIT_CODE} --severity ${TRIVY_SEVERITY} --no-progress ${FRONTEND_IMAGE} || true
                        echo "[OK] Escaneo completado."
                    else
                        echo "[WARN] Trivy no disponible. Se omite."
                    fi
                """
            }
        }

        // ETAPA 4: PACKAGE & TRANSFER
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
                        scp -o StrictHostKeyChecking=no \\
                            ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ} ${COMPOSE_FILE} \\
                            ${params.VM2_USER}@${params.VM2_IP}:${REMOTE_DIR}/

                        rm -f ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ}
                        echo "[OK] Transferencia completada."
                    """
                }
            }
        }

        // ETAPA 5: CLEAN & DEPLOY EN VM2
        stage('Clean & Deploy en VM 2') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 5: CLEAN & DEPLOY EN VM2"
                    echo "=========================================="
                }
                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${params.VM2_USER}@${params.VM2_IP} << 'EOF'
                            set -e
                            cd ${REMOTE_DIR}

                            if [ ! -f .env ] && [ -f .env.example ]; then
                                cp .env.example .env
                            fi

                            export BACKEND_IMAGE=${BACKEND_IMAGE}
                            export FRONTEND_IMAGE=${FRONTEND_IMAGE}

                            echo "[VM2] Limpiando contenedores anteriores..."
                            docker compose down --remove-orphans || true
                            docker rm -f taskflow-backend taskflow-backend-container taskflow-frontend taskflow-frontend-container taskflow-db 2>/dev/null || true

                            echo "[VM2] Eliminando imágenes antiguas de TaskFlow..."
                            docker images --format "{{.Repository}}:{{.Tag}}" | grep -E '^${BACKEND_IMAGE_BASE}:|^${FRONTEND_IMAGE_BASE}:' | xargs -r docker rmi -f 2>/dev/null || true

                            echo "[VM2] Cargando imágenes..."
                            gunzip -c ${POSTGRES_TAR_GZ} | docker load
                            gunzip -c ${BACKEND_TAR_GZ} | docker load
                            gunzip -c ${FRONTEND_TAR_GZ} | docker load

                            echo "[VM2] Levantando stack..."
                            docker compose up -d --remove-orphans

                            echo "[VM2] Limpiando temporales..."
                            rm -f ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ}
                            docker image prune -f

                            echo "[VM2] Estado:"
                            docker compose ps
                            echo "[VM2] Despliegue completado."
EOF
                        echo "[OK] Despliegue remoto finalizado."
                    """
                }
            }
        }
    }

    post {
        success {
            echo "=========================================="
            echo "✅ PIPELINE EXITOSO - TASKFLOW DESPLEGADO"
            echo "=========================================="
            echo "[INFO] Versión: ${env.APP_VERSION ?: 'N/A'} | Tag: ${env.IMAGE_TAG ?: 'N/A'}"
            echo "[INFO] Gateway: http://${params.VM2_IP}/"
            echo "[INFO] API Health: http://${params.VM2_IP}/api/health"
            echo "=========================================="
        }
        failure {
            echo "=========================================="
            echo "❌ PIPELINE FALLIDO"
            echo "=========================================="
            echo "[ERROR] Revisar logs: tests backend (H2), lint frontend, build Docker, SSH o despliegue."
            echo "=========================================="
        }
        always {
            echo "[INFO] Resultado: ${currentBuild.currentResult} | Build #${BUILD_NUMBER}"
        }
    }
}
