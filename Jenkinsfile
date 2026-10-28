pipeline {
    agent any

    environment {
        VM2_HOST = '192.168.100.20'             // <--- Reemplaza con la IP real de la VM 2
        VM2_USER = 'administrator'             // <--- Reemplaza con tu usuario SSH en la VM 2
        VM2_SSH_CREDENTIAL_ID = 'vm2-ssh-key' // <--- ID de la credencial SSH en Jenkins

        // Nombres de las imágenes
        BACKEND_IMAGE = 'taskflow-backend:latest'
        FRONTEND_IMAGE = 'taskflow-frontend:latest'
    }

    stages {
        stage('1. Checkout (GitHub)') {
            steps {
                // Descarga el código actualizado de GitHub
                checkout scm
            }
        }

        stage('2. Build Docker Images (VM 1)') {
            steps {
                script {
                    echo '--- Construyendo imagen del Backend en Jenkins ---'
                    sh "docker build -t ${env.BACKEND_IMAGE} ./backend"

                    echo '--- Construyendo imagen del Frontend en Jenkins ---'
                    sh "docker build -t ${env.FRONTEND_IMAGE} ./frontend"
                }
            }
        }

        stage('3. Package & Transfer Images (VM 1 -> VM 2)') {
            steps {
                sshagent(credentials: [env.VM2_SSH_CREDENTIAL_ID]) {
                    sh """
                        echo '--- Guardando y comprimiendo imágenes Docker ---'
                        docker save ${env.BACKEND_IMAGE} | gzip > backend-image.tar.gz
                        docker save ${env.FRONTEND_IMAGE} | gzip > frontend-image.tar.gz

                        echo '--- Transfiriendo archivos .tar.gz a la VM 2 ---'
                        ssh -o StrictHostKeyChecking=no ${env.VM2_USER}@${env.VM2_HOST} "mkdir -p /tmp/docker-deploy"
                        scp -o StrictHostKeyChecking=no backend-image.tar.gz frontend-image.tar.gz ${env.VM2_USER}@${env.VM2_HOST}:/tmp/docker-deploy/

                        echo '--- Limpiando archivos temporales en VM 1 ---'
                        rm backend-image.tar.gz frontend-image.tar.gz
                    """
                }
            }
        }

        stage('4. Deploy & Run Containers (VM 2)') {
            steps {
                sshagent(credentials: [env.VM2_SSH_CREDENTIAL_ID]) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${env.VM2_USER}@${env.VM2_HOST} << 'EOF'
                            echo '--- Cargando nuevas imágenes en el Docker de VM 2 ---'
                            gunzip -c /tmp/docker-deploy/backend-image.tar.gz | docker load
                            gunzip -c /tmp/docker-deploy/frontend-image.tar.gz | docker load

                            echo '--- Deteniendo y removiendo contenedores antiguos ---'
                            docker stop taskflow-backend-container taskflow-frontend-container || true
                            docker rm taskflow-backend-container taskflow-frontend-container || true

                            echo '--- Desplegando nuevo Backend ---'
                            docker run -d --name taskflow-backend-container -p 8080:8080 ${env.BACKEND_IMAGE}

                            echo '--- Desplegando nuevo Frontend ---'
                            docker run -d --name taskflow-frontend-container -p 80:80 ${env.FRONTEND_IMAGE}

                            echo '--- Limpiando archivos .tar.gz temporales en VM 2 ---'
                            rm -rf /tmp/docker-deploy

                            echo '--- ¡Despliegue completado con éxito! ---'
                        EOF
                    """
                }
            }
        }
    }

    post {
        always {
            echo '--- Limpieza de imágenes locales en Jenkins (Opcional) ---'
            // sh "docker rmi ${env.BACKEND_IMAGE} ${env.FRONTEND_IMAGE} || true"
        }
        success {
            echo '¡Pipeline ejecutado exitosamente! Tu aplicación está activa en la VM 2.'
        }
        failure {
            echo '¡El pipeline de CI/CD ha fallado durante la ejecución!'
        }
    }
}