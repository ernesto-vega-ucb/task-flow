pipeline {
    agent any

    // -------------------------------------------------------------------------
    // VARIABLES DE CONFIGURACIÓN
    // VM1 = Jenkins (con acceso a internet) | VM2 = Servidor destino (SIN acceso a internet)
    // -------------------------------------------------------------------------
    environment {
        // Conexión SSH hacia VM2
        VM2_IP          = '192.168.100.20'        // Cambiar por la IP real de VM2
        VM2_USER        = 'administrator'         // Cambiar por el usuario SSH de VM2
        REMOTE_DIR      = '/home/administrator/taskflow-deploy'

        // Credencial SSH configurada en Jenkins
        SSH_CRED_ID     = 'vm2-ssh-key'

        // Imágenes Docker
        POSTGRES_IMAGE  = 'postgres:16-alpine'
        BACKEND_IMAGE   = 'taskflow-backend'
        FRONTEND_IMAGE  = 'taskflow-frontend'

        // Archivos comprimidos (.tar.gz) para transferencia
        POSTGRES_TAR_GZ = 'postgres-16-alpine.tar.gz'
        BACKEND_TAR_GZ  = 'taskflow-backend.tar.gz'
        FRONTEND_TAR_GZ = 'taskflow-frontend.tar.gz'

        // Archivo compose a transferir
        COMPOSE_FILE    = 'docker-compose.yml'
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
                    echo "[OK] Código obtenido correctamente."
                    echo "[INFO] Rama: ${env.GIT_BRANCH ?: 'N/A'} | Commit: ${env.GIT_COMMIT?.take(7) ?: 'N/A'}"
                }
            }
        }

        // ETAPA 2: BUILD & PULL EN VM1
        stage('Build & Pull en VM 1') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 2: BUILD & PULL EN VM1"
                    echo "=========================================="
                    echo "[INFO] VM1 cuenta con acceso a internet para preparar las imágenes..."
                }
                sh """
                    echo "[VM1] Limpiando imágenes locales viejas (opcional)..."
                    docker image prune -f || true

                    echo "[VM1] Descargando imagen base de PostgreSQL: ${POSTGRES_IMAGE}"
                    docker pull ${POSTGRES_IMAGE}

                    echo "[VM1] Construyendo imagen Docker del backend: ${BACKEND_IMAGE}"
                    docker build -t ${BACKEND_IMAGE} ./backend

                    echo "[VM1] Construyendo imagen Docker del frontend: ${FRONTEND_IMAGE}"
                    docker build -t ${FRONTEND_IMAGE} ./frontend

                    echo "[VM1] Verificando imágenes generadas/obtenidas:"
                    docker images | grep -E 'postgres|taskflow-backend|taskflow-frontend'
                    echo "[OK] Build & Pull finalizados en VM1."
                """
            }
        }

        // ETAPA 3: PACKAGE & TRANSFER
        stage('Package & Transfer') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 3: PACKAGE & TRANSFER"
                    echo "=========================================="
                    echo "[INFO] Comprimiendo imágenes y transfiriendo a VM2..."
                }
                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh """
                        echo "[VM1] Comprimiendo imágenes en archivos .tar.gz..."
                        docker save ${POSTGRES_IMAGE} | gzip -c > ${POSTGRES_TAR_GZ}
                        docker save ${BACKEND_IMAGE}  | gzip -c > ${BACKEND_TAR_GZ}
                        docker save ${FRONTEND_IMAGE} | gzip -c > ${FRONTEND_TAR_GZ}

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

                        echo "[VM1] Estado tras limpieza:"
                        ls -lh *.tar.gz 2>/dev/null || echo "[VM1] No hay archivos .tar.gz locales pendientes."
                        echo "[OK] Package & Transfer completado."
                    """
                }
            }
        }

        // ETAPA 4: CLEAN & DEPLOY EN VM2
        stage('Clean & Deploy en VM 2') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 4: CLEAN & DEPLOY EN VM2"
                    echo "=========================================="
                    echo "[INFO] Ejecutando despliegue offline en ${VM2_USER}@${VM2_IP}"
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

                            # ----------------------------------------
                            # 1. LIMPIAR CONTENEDORES ANTERIORES
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] LIMPIANDO CONTENEDORES ANTERIORES"
                            echo "=========================================="
                            docker compose down --remove-orphans || true

                            # ----------------------------------------
                            # 2. CARGAR IMÁGENES DESDE .TAR.GZ
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] CARGANDO IMÁGENES DESDE ARCHIVOS .TAR.GZ"
                            echo "=========================================="
                            echo "[VM2] Cargando ${POSTGRES_TAR_GZ}..."
                            gunzip -c ${POSTGRES_TAR_GZ} | docker load
                            echo "[VM2] ${POSTGRES_IMAGE} cargado correctamente."

                            echo "[VM2] Cargando ${BACKEND_TAR_GZ}..."
                            gunzip -c ${BACKEND_TAR_GZ} | docker load
                            echo "[VM2] ${BACKEND_IMAGE} cargado correctamente."

                            echo "[VM2] Cargando ${FRONTEND_TAR_GZ}..."
                            gunzip -c ${FRONTEND_TAR_GZ} | docker load
                            echo "[VM2] ${FRONTEND_IMAGE} cargado correctamente."

                            # ----------------------------------------
                            # 3. LEVANTAR STACK CON DOCKER COMPOSE
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] LEVANTANDO STACK CON DOCKER COMPOSE"
                            echo "=========================================="
                            docker compose up -d --remove-orphans

                            # ----------------------------------------
                            # 4. LIMPIEZA REMOTA
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] LIMPIEZA DE ARCHIVOS TEMPORALES Y HUÉRFANAS"
                            echo "=========================================="
                            rm -f ${POSTGRES_TAR_GZ} ${BACKEND_TAR_GZ} ${FRONTEND_TAR_GZ}
                            docker image prune -f

                            # ----------------------------------------
                            # 5. VERIFICACIÓN
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
            echo "[INFO] Stack levantado en VM2 sin acceso a internet"
            echo "[INFO] Directorio remoto: ${REMOTE_DIR}"
            echo "[INFO] Frontend: http://${VM2_IP}:3000"
            echo "[INFO] Backend API: http://${VM2_IP}:8080/api"
            echo "[INFO] Health Check: http://${VM2_IP}:8080/api/health"
            echo "=========================================="
        }

        failure {
            echo "=========================================="
            echo "❌ PIPELINE FALLIDO"
            echo "=========================================="
            echo "[ERROR] El despliegue automatizado de TaskFlow ha fallado."
            echo "[ERROR] Revisar logs: conexión SSH, espacio en disco, permisos Docker o errores de build."
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
