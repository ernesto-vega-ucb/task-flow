pipeline {
    agent any

    environment {
        VM2_HOST = '192.168.100.20'
        VM2_USER = 'administrator'

        BACKEND_IMAGE = 'taskflow-backend:latest'
        FRONTEND_IMAGE = 'taskflow-frontend:latest'
    }

    stages {
        stage('1. Checkout (GitHub)') {
            steps {
                checkout scm
            }
        }

        stage('2. Build Docker Images (VM 1)') {
            steps {
                script {
                    echo '--- Construyendo imagen del Backend ---'
                    sh "docker build -t ${env.BACKEND_IMAGE} ./backend"

                    echo '--- Construyendo imagen del Frontend ---'
                    sh "docker build -t ${env.FRONTEND_IMAGE} ./frontend"
                }
            }
        }

        stage('3. Package & Transfer to VM 2') {
            steps {
                sh """
                    echo '--- Comprimiendo imágenes Docker ---'
                    docker save ${env.BACKEND_IMAGE} | gzip > backend-image.tar.gz
                    docker save ${env.FRONTEND_IMAGE} | gzip > frontend-image.tar.gz

                    echo '--- Creando directorio remoto en VM 2 ---'
                    ssh -o StrictHostKeyChecking=no ${env.VM2_USER}@${env.VM2_HOST} "mkdir -p /home/${env.VM2_USER}/taskflow-deploy"

                    echo '--- Transfiriendo imágenes y docker-compose.yml ---'
                    scp -o StrictHostKeyChecking=no backend-image.tar.gz frontend-image.tar.gz docker-compose.yml ${env.VM2_USER}@${env.VM2_HOST}:/home/${env.VM2_USER}/taskflow-deploy/

                    echo '--- Limpiando archivos temporales en VM 1 ---'
                    rm backend-image.tar.gz frontend-image.tar.gz
                """
            }
        }

        stage('4. Deploy with Docker Compose (VM 2)') {
            steps {
                sh """
                    ssh -o StrictHostKeyChecking=no ${env.VM2_USER}@${env.VM2_HOST} << 'EOF'
                        cd /home/administrator/taskflow-deploy

                        echo '--- Cargando nuevas imágenes en Docker ---'
                        gunzip -c backend-image.tar.gz | docker load
                        gunzip -c frontend-image.tar.gz | docker load

                        echo '--- Desplegando stack completo con Docker Compose ---'
                        docker compose up -d --remove-orphans

                        echo '--- Limpiando archivos .tar.gz temporales ---'
                        rm -f backend-image.tar.gz frontend-image.tar.gz

                        echo '--- ¡Despliegue con Docker Compose finalizado con éxito! ---'
                    EOF
                """
            }
        }
    }

    post {
        success {
            echo '¡Pipeline ejecutado con éxito!'
        }
        failure {
            echo '¡El pipeline ha fallado!'
        }
    }
}