pipeline {
    agent any

    // -------------------------------------------------------------------------
    // VARIABLES DE CONFIGURACIÓN
    // VM1 = Jenkins (con acceso a internet) | VM2 = Servidor destino (SIN acceso a internet)
    // -------------------------------------------------------------------------
    environment {
        // Conexión SSH hacia VM2
        VM2_IP          = '192.168.100.XX'        // Cambiar por la IP real de VM2
        VM2_USER        = 'administrator'         // Cambiar por el usuario SSH de VM2
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

    // -------------------------------------------------------------------------
    // ETAPAS DEL PIPELINE
    // -------------------------------------------------------------------------
    stages {

        // ETAPA 1: CHECKOUT
        stage('Checkout') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 1: CHECKOUT DEL CÓDIGO FUENTE"
                    echo "=========================================="
                    echo "[INFO] Obteniendo código desde GitHub mediante checkout scm..."
                }
                checkout scm
                script {
                    // Versionamiento: BUILD_NUMBER como tag principal + hash corto de Git
                    env.GIT_HASH = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()
                    env.IMAGE_TAG = "${BUILD_NUMBER}-${env.GIT_HASH}"
                    env.BACKEND_IMAGE = "${BACKEND_IMAGE_BASE}:${env.IMAGE_TAG}"
                    env.FRONTEND_IMAGE = "${FRONTEND_IMAGE_BASE}:${env.IMAGE_TAG}"
                    env.BACKEND_TAR_GZ = "taskflow-backend-${env.IMAGE_TAG}.tar.gz"
                    env.FRONTEND_TAR_GZ = "taskflow-frontend-${env.IMAGE_TAG}.tar.gz"

                    echo "[OK] Código obtenido correctamente."
                    echo "[INFO] Rama: ${env.GIT_BRANCH ?: 'N/A'} | Commit: ${env.GIT_COMMIT?.take(7) ?: 'N/A'}"
                    echo "[INFO] Tag de imágenes: ${env.IMAGE_TAG}"
                }
            }
        }

        // ETAPA 2: CODE QUALITY / LINTER (herramientas gestionadas por Jenkins)
        stage('Code Quality') {
            parallel {
                stage('Backend - Lint & Test (Maven)') {
                    tools {
                        maven 'Maven-3.9'
                        jdk 'JDK-21'
                    }
                    steps {
                        script {
                            echo "=========================================="
                            echo "ETAPA 2a: QUALITY GATES - BACKEND"
                            echo "=========================================="
                        }
                        // Análisis estático y pruebas del backend
                        sh """
                            echo "[VM1] Verificando versiones de herramientas..."
                            java -version
                            mvn -version
                            echo "[VM1] Ejecutando validación y tests en backend..."
                            cd backend
                            mvn -B clean test checkstyle:check || true
                            echo "[VM1] Quality gate backend finalizado (revisar resultados arriba)."
                        """
                    }
                }
                stage('Frontend - Lint (Node.js)') {
                    tools {
                        nodejs 'NodeJS-20'
                    }
                    steps {
                        script {
                            echo "=========================================="
                            echo "ETAPA 2b: QUALITY GATES - FRONTEND"
                            echo "=========================================="
                        }
                        sh """
                            echo "[VM1] Verificando versiones de herramientas..."
                            node -v
                            npm -v
                            echo "[VM1] Ejecutando lint/análisis de código en frontend..."
                            cd frontend
                            npm ci
                            npm run lint || true
                            echo "[VM1] Quality gate frontend finalizado (revisar resultados arriba)."
                        """
                    }
                }
            }
        }

        // ETAPA 3: BUILD & PULL EN VM1
        stage('Build & Pull en VM 1') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 3: BUILD & PULL EN VM1"
                    echo "=========================================="
                    echo "[INFO] Construyendo imágenes con tag: ${env.IMAGE_TAG}"
                }
                sh """
                    echo "[VM1] Limpiando imágenes locales viejas (opcional)..."
                    docker image prune -f || true

                    echo "[VM1] Descargando imagen base de PostgreSQL: ${POSTGRES_IMAGE}"
                    docker pull ${POSTGRES_IMAGE}

                    echo "[VM1] Construyendo imagen Docker del backend: ${BACKEND_IMAGE}"
                    docker build -t ${BACKEND_IMAGE} -t ${BACKEND_IMAGE_BASE}:latest ./backend

                    echo "[VM1] Construyendo imagen Docker del frontend: ${FRONTEND_IMAGE}"
                    # Con Nginx como gateway no necesitamos pasar IP del backend al build
                    docker build --build-arg VITE_API_BASE_URL=/api -t ${FRONTEND_IMAGE} -t ${FRONTEND_IMAGE_BASE}:latest ./frontend

                    echo "[VM1] Verificando imágenes generadas/obtenidas:"
                    docker images | grep -E 'postgres|${BACKEND_IMAGE_BASE}|${FRONTEND_IMAGE_BASE}'
                    echo "[OK] Build & Pull finalizados en VM1."
                """
            }
        }

        // ETAPA 4: CONTAINER SECURITY SCAN (TRIVY)
        stage('Container Security Scan') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 4: ESCANEO DE SEGURIDAD (TRIVY)"
                    echo "=========================================="
                }
                sh """
                    echo "[VM1] Verificando disponibilidad de Trivy..."
                    if ! command -v trivy >/dev/null 2>&1; then
                        echo "[VM1] Trivy no está instalado. Intentando instalación con script oficial..."
                        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin || true
                    fi

                    if command -v trivy >/dev/null 2>&1; then
                        echo "[VM1] Escaneando ${BACKEND_IMAGE} (severidades: ${TRIVY_SEVERITY})"
                        trivy image --exit-code ${TRIVY_EXIT_CODE} --severity ${TRIVY_SEVERITY} --no-progress ${BACKEND_IMAGE} || true

                        echo "[VM1] Escaneando ${FRONTEND_IMAGE} (severidades: ${TRIVY_SEVERITY})"
                        trivy image --exit-code ${TRIVY_EXIT_CODE} --severity ${TRIVY_SEVERITY} --no-progress ${FRONTEND_IMAGE} || true

                        echo "[OK] Escaneo de seguridad completado."
                    else
                        echo "[WARN] Trivy no disponible en VM1. Se omite el escaneo de seguridad."
                    fi
                """
            }
        }

        // ETAPA 5: PACKAGE & TRANSFER
        stage('Package & Transfer') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 5: PACKAGE & TRANSFER"
                    echo "=========================================="
                    echo "[INFO] Comprimiendo imágenes y transfiriendo a VM2..."
                }
                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh """
                        echo "[VM1] Comprimiendo imágenes en archivos .tar.gz..."
                        docker save ${POSTGRES_IMAGE} | gzip -c > ${POSTGRES_TAR_GZ}
                        docker save ${BACKEND_IMAGE} ${BACKEND_IMAGE_BASE}:latest | gzip -c > ${BACKEND_TAR_GZ}
                        docker save ${FRONTEND_IMAGE} ${FRONTEND_IMAGE_BASE}:latest | gzip -c > ${FRONTEND_TAR_GZ}

                        echo "[VM1] Archivos generados:"
                        ls -lh ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ}

                        echo "[VM1] Creando directorio remoto en VM2: ${REMOTE_DIR}"
                        ssh -o StrictHostKeyChecking=no ${VM2_USER}@${VM2_IP} "mkdir -p ${REMOTE_DIR}"

                        echo "[VM1] Transferiendo imágenes comprimidas y docker-compose.yml a VM2..."
                        scp -o StrictHostKeyChecking=no \\
                            ${POSTGRES_TAR_GZ} \\
                            ${BACKEND_TAR_GZ} \\
                            ${FRONTEND_TAR_GZ} \\
                            ${COMPOSE_FILE} \\
                            ${VM2_USER}@${VM2_IP}:${REMOTE_DIR}/

                        echo "[VM1] Limpiando archivos temporales locales..."
                        rm -f ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ}

                        echo "[OK] Package & Transfer completado."
                    """
                }
            }
        }

        // ETAPA 6: CLEAN & DEPLOY EN VM2
        stage('Clean & Deploy en VM 2') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 6: CLEAN & DEPLOY EN VM2"
                    echo "=========================================="
                    echo "[INFO] Ejecutando despliegue offline en ${VM2_USER}@${VM2_IP} con tag ${env.IMAGE_TAG}"
                }
                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${VM2_USER}@${VM2_IP} << 'EOF'
                            set -e
                            echo "=========================================="
                            echo "[VM2] INICIANDO DESPLIEGUE AUTOMATIZADO"
                            echo "=========================================="
                            cd ${REMOTE_DIR}

                            # Crear .env si existe .env.example y no hay .env
                            if [ ! -f .env ] && [ -f .env.example ]; then
                                echo "[VM2] Copiando .env.example a .env"
                                cp .env.example .env
                            fi

                            # Forzar uso de las imágenes versionadas (manteniendo :latest como fallback)
                            export BACKEND_IMAGE=${BACKEND_IMAGE}
                            export FRONTEND_IMAGE=${FRONTEND_IMAGE}

                            # ----------------------------------------
                            # 1. LIMPIAR CONTENEDORES Y REDES ANTERIORES
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] LIMPIANDO CONTENEDORES ANTERIORES"
                            echo "=========================================="
                            docker compose down --remove-orphans || true
                            docker rm -f taskflow-backend taskflow-backend-container taskflow-frontend taskflow-frontend-container taskflow-db 2>/dev/null || true

                            # ----------------------------------------
                            # 2. ELIMINAR IMÁGENES ANTIGUAS DE TASKFLOW
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] ELIMINANDO IMÁGENES ANTIGUAS DE TASKFLOW"
                            echo "=========================================="
                            docker images --format "{{.Repository}}:{{.Tag}}" | grep -E '^${BACKEND_IMAGE_BASE}:|^${FRONTEND_IMAGE_BASE}:' | xargs -r docker rmi -f 2>/dev/null || true
                            echo "[VM2] Imágenes antiguas de backend/frontend eliminadas (si existían)."

                            # ----------------------------------------
                            # 3. CARGAR IMÁGENES DESDE .TAR.GZ
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] CARGANDO IMÁGENES DESDE ARCHIVOS .TAR.GZ"
                            echo "=========================================="
                            echo "[VM2] Cargando ${POSTGRES_TAR_GZ}..."
                            gunzip -c ${POSTGRES_TAR_GZ} | docker load

                            echo "[VM2] Cargando ${BACKEND_TAR_GZ}..."
                            gunzip -c ${BACKEND_TAR_GZ} | docker load

                            echo "[VM2] Cargando ${FRONTEND_TAR_GZ}..."
                            gunzip -c ${FRONTEND_TAR_GZ} | docker load

                            # ----------------------------------------
                            # 4. LEVANTAR STACK CON DOCKER COMPOSE
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] LEVANTANDO STACK CON DOCKER COMPOSE"
                            echo "=========================================="
                            docker compose up -d --remove-orphans

                            # ----------------------------------------
                            # 5. LIMPIEZA REMOTA FINAL
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] LIMPIEZA DE ARCHIVOS TEMPORALES Y HUÉRFANAS"
                            echo "=========================================="
                            rm -f ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ}
                            docker image prune -f

                            # ----------------------------------------
                            # 6. VERIFICACIÓN
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] ESTADO DE CONTENEDORES"
                            echo "=========================================="
                            docker compose ps

                            echo "=========================================="
                            echo "[VM2] DESPLIEGUE COMPLETADO EXITOSAMENTE"
                            echo "=========================================="
EOF
                        echo "[OK] Despliegue remoto finalizado."
                    """
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // BLOQUES POST: MANEJO DE ÉXITO Y FALLO
    // -------------------------------------------------------------------------
    post {
        success {
            echo "=========================================="
            echo "✅ PIPELINE EXITOSO - TASKFLOW DESPLEGADO"
            echo "=========================================="
            echo "[INFO] Tag de imágenes: ${env.IMAGE_TAG ?: 'N/A'}"
            echo "[INFO] Stack levantado en VM2 sin acceso a internet"
            echo "[INFO] API Gateway (Frontend/Nginx): http://${VM2_IP}/"
            echo "[INFO] API via Gateway: http://${VM2_IP}/api/health"
            echo "[INFO] Directorio remoto: ${REMOTE_DIR}"
            echo "=========================================="
        }

        failure {
            echo "=========================================="
            echo "❌ PIPELINE FALLIDO"
            echo "=========================================="
            echo "[ERROR] El despliegue automatizado de TaskFlow ha fallado."
            echo "[ERROR] Revisar logs: calidad de código, escaneo Trivy, conexión SSH, espacio en disco o errores de build."
            echo "=========================================="
        }

        always {
            echo "=========================================="
            echo "[INFO] Pipeline finalizado - Resultado: ${currentBuild.currentResult}"
            echo "[INFO] Build Number: ${BUILD_NUMBER}"
            echo "=========================================="
        }
    }
}
