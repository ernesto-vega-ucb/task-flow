pipeline {
    agent any

    // -------------------------------------------------------------------------
    // VARIABLES DE CONFIGURACIÓN
    // Modifica estos valores según tu entorno (VM1 = Jenkins con internet, VM2 = Destino sin internet)
    // -------------------------------------------------------------------------
    environment {
        // IP y acceso a VM2
        VM2_IP          = '192.168.100.XX'  // Cambiar por la IP real de VM2
        VM2_USER        = 'usuario'          // Cambiar por el usuario SSH de VM2
        REMOTE_DIR      = '/home/usuario/taskflow'

        // Credencial SSH configurada en Jenkins
        SSH_CRED_ID     = 'vm2-ssh-key'

        // Imagen de PostgreSQL a transferir (debe coincidir con la del docker-compose.yml)
        POSTGRES_IMAGE  = 'postgres:16-alpine'
        POSTGRES_TAR    = 'postgres-16-alpine.tar'
    }

    // -------------------------------------------------------------------------
    // ETAPAS DEL PIPELINE
    // -------------------------------------------------------------------------
    stages {

        // ETAPA 1: CHECKOUT DEL CÓDIGO DESDE GITHUB
        stage('Checkout') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 1: CHECKOUT DEL CÓDIGO"
                    echo "=========================================="
                    echo "[INFO] Obteniendo código desde el repositorio vinculado al Job..."
                }
                // Descarga el código usando la configuración SCM del job
                checkout scm
                script {
                    echo "[OK] Código obtenido correctamente."
                    echo "[INFO] Rama: ${env.GIT_BRANCH ?: 'N/A'} | Commit: ${env.GIT_COMMIT?.take(7) ?: 'N/A'}"
                }
            }
        }

        // ETAPA 2: DESCARGAR Y PREPARAR IMAGEN POSTGRES EN VM1 (CON INTERNET)
        stage('Prepare Postgres Image on VM1') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 2: PREPARAR IMAGEN POSTGRES EN VM1"
                    echo "=========================================="
                    echo "[INFO] VM1 tiene acceso a internet. Descargando/guardando ${POSTGRES_IMAGE}..."
                }
                sh """
                    echo "[VM1] Verificando si la imagen ${POSTGRES_IMAGE} existe localmente..."
                    if ! docker image inspect ${POSTGRES_IMAGE} > /dev/null 2>&1; then
                        echo "[VM1] Imagen no encontrada. Descargando desde Docker Hub..."
                        docker pull ${POSTGRES_IMAGE}
                    else
                        echo "[VM1] Imagen ya existe localmente."
                    fi
                    
                    echo "[VM1] Guardando imagen como archivo tar..."
                    docker save -o ${POSTGRES_TAR} ${POSTGRES_IMAGE}
                    
                    echo "[VM1] Tamaño del archivo generado:"
                    ls -lh ${POSTGRES_TAR}
                    echo "[OK] Imagen preparada para transferencia."
                """
            }
        }

        // ETAPA 3: SINCRONIZACIÓN CON VM2 (CÓDIGO + IMAGEN POSTGRES)
        stage('Sync to Remote VM (VM 2)') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 3: SINCRONIZACIÓN CON VM2"
                    echo "=========================================="
                    echo "[INFO] Copiando monorepo + imagen PostgreSQL hacia ${VM2_USER}@${VM2_IP}:${REMOTE_DIR}"
                }

                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh """
                        echo "[INFO] Creando directorio remoto..."
                        ssh -o StrictHostKeyChecking=no ${VM2_USER}@${VM2_IP} "mkdir -p ${REMOTE_DIR}"

                        echo "[INFO] Sincronizando carpetas backend/ y frontend/..."
                        rsync -avz --delete \\
                              -e "ssh -o StrictHostKeyChecking=no" \\
                              ./backend/ ${VM2_USER}@${VM2_IP}:${REMOTE_DIR}/backend/ \\
                        && rsync -avz --delete \\
                              -e "ssh -o StrictHostKeyChecking=no" \\
                              ./frontend/ ${VM2_USER}@${VM2_IP}:${REMOTE_DIR}/frontend/

                        echo "[INFO] Sincronizando docker-compose.yml, .env.example..."
                        rsync -avz \\
                              -e "ssh -o StrictHostKeyChecking=no" \\
                              ./docker-compose.yml ${VM2_USER}@${VM2_IP}:${REMOTE_DIR}/ \\
                        && rsync -avz \\
                              -e "ssh -o StrictHostKeyChecking=no" \\
                              ./.env.example ${VM2_USER}@${VM2_IP}:${REMOTE_DIR}/ 2>/dev/null || true

                        echo "[INFO] Transfiriendo imagen PostgreSQL a VM2 (sin acceso a internet)..."
                        scp -o StrictHostKeyChecking=no ${POSTGRES_TAR} ${VM2_USER}@${VM2_IP}:${REMOTE_DIR}/

                        echo "[OK] Sincronización y transferencia completadas."
                    """
                }
            }
        }

        // ETAPA 4: CARGAR IMAGEN, BUILD & DEPLOY EN VM2
        stage('Load Image & Deploy on VM 2') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 4: CARGAR IMAGEN Y DESPLEGAR EN VM2"
                    echo "=========================================="
                    echo "[INFO] Ejecutando despliegue en ${VM2_USER}@${VM2_IP}"
                }

                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${VM2_USER}@${VM2_IP} << 'EOF'
                            set -e
                            echo "=========================================="
                            echo "[VM2] INICIANDO DESPLIEGUE OFFLINE"
                            echo "=========================================="
                            cd ${REMOTE_DIR}

                            # Crear .env si no existe
                            if [ ! -f .env ] && [ -f .env.example ]; then
                                echo "[VM2] Copiando .env.example a .env"
                                cp .env.example .env
                            fi

                            # ----------------------------------------
                            # 1. CARGAR IMAGEN POSTGRES DESDE TAR
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] CARGANDO IMAGEN POSTGRES"
                            echo "=========================================="
                            if [ -f ${POSTGRES_TAR} ]; then
                                echo "[VM2] Importando ${POSTGRES_TAR} a Docker..."
                                docker load -i ${POSTGRES_TAR}
                                echo "[VM2] Imagen ${POSTGRES_IMAGE} cargada correctamente."
                                echo "[VM2] Eliminando archivo tar temporal en VM2..."
                                rm -f ${POSTGRES_TAR}
                            else
                                echo "[VM2][WARN] No se encontró ${POSTGRES_TAR}. Verificando si la imagen ya existe..."
                            fi

                            # Verificar imagen
                            docker image inspect ${POSTGRES_IMAGE} > /dev/null 2>&1 && echo "[VM2][OK] ${POSTGRES_IMAGE} disponible" || echo "[VM2][ERROR] ${POSTGRES_IMAGE} NO DISPONIBLE"

                            # ----------------------------------------
                            # 2. DETENER STACK ANTERIOR
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] DETENIENDO STACK ANTERIOR"
                            echo "=========================================="
                            docker compose down || true

                            # ----------------------------------------
                            # 3. CONSTRUIR Y LEVANTAR NUEVOS CONTENEDORES
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] CONSTRUYENDO Y LEVANTANDO CONTENEDORES"
                            echo "=========================================="
                            echo "[VM2] Esto construirá backend/frontend y levantará PostgreSQL (desde imagen local cargada)..."
                            docker compose up -d --build

                            # ----------------------------------------
                            # 4. VERIFICACIÓN
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] ESTADO DE SERVICIOS"
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

        // ETAPA 5: LIMPIEZA EN VM1
        stage('Cleanup on VM1') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 5: LIMPIEZA"
                    echo "=========================================="
                    echo "[INFO] Eliminando archivo tar temporal en VM1..."
                }
                sh """
                    rm -f ${POSTGRES_TAR}
                    echo "[OK] Limpieza completada."
                """
            }
        }
    }

    // -------------------------------------------------------------------------
    // BLOQUES POST: MANEJO DE ÉXITO Y FALLO
    // -------------------------------------------------------------------------
    post {
        success {
            echo "=========================================="
            echo "✅ PIPELINE EXITOSO - TaskFlow Desplegado (OFFLINE)"
            echo "=========================================="
            echo "[INFO] Imagen PostgreSQL transferida desde VM1 y cargada en VM2"
            echo "[INFO] Stack levantado: db (Postgres) + backend + frontend"
            echo "[INFO] Frontend: http://${VM2_IP}:3000"
            echo "[INFO] Backend API: http://${VM2_IP}:8080/api"
            echo "[INFO] Health Check: http://${VM2_IP}:8080/api/health"
            echo "=========================================="
        }

        failure {
            echo "=========================================="
            echo "❌ PIPELINE FALLIDO"
            echo "=========================================="
            echo "[ERROR] El despliegue ha fallado."
            echo "[ERROR] Verifica: conexión SSH, espacio en disco, permisos Docker, y que VM2 NO requiera pull a internet."
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
