pipeline {
    agent any

    // -------------------------------------------------------------------------
    // VARIABLES DE CONFIGURACIÓN
    // Modifica estos valores según tu entorno (VM1 = Jenkins, VM2 = Destino)
    // -------------------------------------------------------------------------
    environment {
        // IP pública o privada de la VM 2 (Servidor de despliegue con Docker)
        VM2_IP          = '192.168.100.XX'  // Cambiar por la IP real de VM2
        
        // Usuario SSH para conectar a VM2
        VM2_USER        = 'usuario'          // Cambiar por el usuario real (ej: ubuntu, deploy)
        
        // Directorio de trabajo remoto en VM2 donde se copiará el monorepo
        REMOTE_DIR      = '/home/usuario/taskflow'
        
        // ID de la credencial SSH configurada en Jenkins (SSH Username with private key)
        SSH_CRED_ID     = 'vm2-ssh-key'
        
        // Nombres de contenedores e imágenes Docker
        BACKEND_IMAGE   = 'taskflow-backend'
        FRONTEND_IMAGE  = 'taskflow-frontend'
        BACKEND_CONTAINER = 'taskflow-backend'
        FRONTEND_CONTAINER = 'taskflow-frontend'
        
        // Puertos de exposición en VM2
        BACKEND_PORT    = '8080'
        FRONTEND_PORT   = '80'
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
                    echo "[INFO] Rama/Commit: ${env.GIT_BRANCH ?: 'N/A'} - ${env.GIT_COMMIT?.take(7) ?: 'N/A'}"
                }
            }
        }

        // ETAPA 2: SINCRONIZACIÓN CON VM2
        stage('Sync to Remote VM (VM 2)') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 2: SINCRONIZACIÓN A VM2"
                    echo "=========================================="
                    echo "[INFO] Conectando a ${VM2_USER}@${VM2_IP}..."
                    echo "[INFO] Destino remoto: ${REMOTE_DIR}"
                }
                
                // Uso de sshagent para autenticación segura con la clave privada
                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh """
                        echo "[INFO] Creando directorio remoto si no existe..."
                        ssh -o StrictHostKeyChecking=no ${VM2_USER}@${VM2_IP} "mkdir -p ${REMOTE_DIR}"
                        
                        echo "[INFO] Sincronizando carpetas backend/ y frontend/ con rsync..."
                        # Sincronización optimizada con rsync (elimina archivos obsoletos)
                        rsync -avz --delete \\
                              -e "ssh -o StrictHostKeyChecking=no" \\
                              ./backend/ ${VM2_USER}@${VM2_IP}:${REMOTE_DIR}/backend/ \\
                        && rsync -avz --delete \\
                              -e "ssh -o StrictHostKeyChecking=no" \\
                              ./frontend/ ${VM2_USER}@${VM2_IP}:${REMOTE_DIR}/frontend/
                        
                        echo "[OK] Sincronización completada correctamente."
                    """
                }
            }
        }

        // ETAPA 3: BUILD & DEPLOY EN VM2
        stage('Build & Deploy on VM 2') {
            steps {
                script {
                    echo "=========================================="
                    echo "ETAPA 3: BUILD & DEPLOY EN VM2"
                    echo "=========================================="
                    echo "[INFO] Ejecutando despliegue remoto en ${VM2_USER}@${VM2_IP}"
                }
                
                // Conexión SSH a VM2 para construir y desplegar contenedores
                sshagent(credentials: ["${SSH_CRED_ID}"]) {
                    sh """
                        echo "[INFO] Conectando y desplegando en VM2..."
                        ssh -o StrictHostKeyChecking=no ${VM2_USER}@${VM2_IP} << 'EOF'
                            set -e
                            echo "=========================================="
                            echo "[VM2] INICIANDO DESPLIEGUE"
                            echo "=========================================="
                            cd ${REMOTE_DIR}
                            
                            # ----------------------------------------
                            # 1. DETENER Y ELIMINAR CONTENEDORES ANTERIORES
                            # ----------------------------------------
                            echo "[VM2] Verificando contenedores existentes..."
                            if [ \$(docker ps -a -q -f name=${BACKEND_CONTAINER}) ]; then
                                echo "[VM2] Deteniendo y eliminando contenedor ${BACKEND_CONTAINER}..."
                                docker stop ${BACKEND_CONTAINER} || true
                                docker rm ${BACKEND_CONTAINER} || true
                            else
                                echo "[VM2] No existe contenedor previo de ${BACKEND_CONTAINER}"
                            fi
                            
                            if [ \$(docker ps -a -q -f name=${FRONTEND_CONTAINER}) ]; then
                                echo "[VM2] Deteniendo y eliminando contenedor ${FRONTEND_CONTAINER}..."
                                docker stop ${FRONTEND_CONTAINER} || true
                                docker rm ${FRONTEND_CONTAINER} || true
                            else
                                echo "[VM2] No existe contenedor previo de ${FRONTEND_CONTAINER}"
                            fi
                            
                            # ----------------------------------------
                            # 2. CONSTRUIR IMÁGENES DOCKER
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] CONSTRUYENDO IMAGEN BACKEND"
                            echo "=========================================="
                            docker build -t ${BACKEND_IMAGE} ./backend
                            echo "[VM2] Imagen ${BACKEND_IMAGE} construida correctamente."
                            
                            echo "=========================================="
                            echo "[VM2] CONSTRUYENDO IMAGEN FRONTEND"
                            echo "=========================================="
                            docker build -t ${FRONTEND_IMAGE} ./frontend
                            echo "[VM2] Imagen ${FRONTEND_IMAGE} construida correctamente."
                            
                            # ----------------------------------------
                            # 3. LEVANTAR NUEVOS CONTENEDORES
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] LEVANTANDO CONTENEDORES"
                            echo "=========================================="
                            
                            echo "[VM2] Iniciando contenedor ${BACKEND_CONTAINER} en puerto ${BACKEND_PORT}:8080..."
                            docker run -d \\
                                --name ${BACKEND_CONTAINER} \\
                                --restart unless-stopped \\
                                -p ${BACKEND_PORT}:8080 \\
                                ${BACKEND_IMAGE}
                            echo "[VM2] Contenedor backend iniciado."
                            
                            echo "[VM2] Iniciando contenedor ${FRONTEND_CONTAINER} en puerto ${FRONTEND_PORT}:80..."
                            docker run -d \\
                                --name ${FRONTEND_CONTAINER} \\
                                --restart unless-stopped \\
                                -p ${FRONTEND_PORT}:80 \\
                                ${FRONTEND_IMAGE}
                            echo "[VM2] Contenedor frontend iniciado."
                            
                            # ----------------------------------------
                            # 4. VERIFICACIÓN
                            # ----------------------------------------
                            echo "=========================================="
                            echo "[VM2] ESTADO DE CONTENEDORES"
                            echo "=========================================="
                            docker ps --filter "name=taskflow" --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"
                            
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
            echo "✅ PIPELINE EXITOSO"
            echo "=========================================="
            echo "[INFO] TaskFlow ha sido desplegado correctamente en VM2 (${VM2_IP})"
            echo "[INFO] Frontend: http://${VM2_IP}:${FRONTEND_PORT}"
            echo "[INFO] Backend API: http://${VM2_IP}:${BACKEND_PORT}/api"
            echo "[INFO] Health Check: http://${VM2_IP}:${BACKEND_PORT}/api/health"
            echo "=========================================="
        }
        
        failure {
            echo "=========================================="
            echo "❌ PIPELINE FALLIDO"
            echo "=========================================="
            echo "[ERROR] El despliegue de TaskFlow ha fallado."
            echo "[ERROR] Revisa los logs de las etapas anteriores para más detalles."
            echo "[ERROR] Posibles causas: conexión SSH, permisos Docker, construcción de imágenes o puertos ocupados."
            echo "=========================================="
        }
        
        always {
            echo "=========================================="
            echo "[INFO] Pipeline finalizado - ${currentBuild.currentResult}"
            echo "[INFO] Build Number: ${BUILD_NUMBER}"
            echo "=========================================="
        }
    }
}
