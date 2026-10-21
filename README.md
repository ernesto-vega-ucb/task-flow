# TaskFlow – Monorepo

Aplicación de gestión de tareas construida como monorepo con:

| Componente | Tecnologías |
|------------|-------------|
| **Backend** (`/backend`) | Java 21, Spring Boot 3.4, Spring Data JPA, PostgreSQL |
| **Frontend** (`/frontend`) | React 18, TypeScript, Vite, Axios |

---

## Estructura del proyecto

```
task-flow/
├── backend/          # API REST (Spring Boot + JPA + PostgreSQL)
│   ├── Dockerfile    # Build multistage (Maven → JRE 21)
│   └── src/main/java/com/taskflow/backend/
│       ├── config/       # CORS + Security (preparado para JWT futuro)
│       ├── controller/   # TaskController, HealthController
│       ├── dto/          # Requests/Responses validados
│       ├── exception/    # Manejo global de errores
│       ├── model/        # Entidad Task + enum TaskStatus
│       ├── repository/   # Spring Data JPA
│       ├── security/     # Placeholder para futura autenticación
│       └── service/      # Lógica de negocio (interfaz + impl)
├── frontend/         # SPA React con TypeScript
│   ├── Dockerfile    # Build multistage (Node → Nginx)
│   └── src/
│       ├── components/   # TaskList, TaskCard, TaskForm, FilterBar…
│       ├── context/      # AuthContext (placeholder para tokens)
│       ├── hooks/        # useTasks (estado y llamadas API)
│       ├── services/     # Cliente Axios centralizado
│       └── types/        # Interfaces TypeScript del dominio
├── docker-compose.yml  # Stack completo: DB + backend + frontend (provisional)
├── .env.example        # Variables configurables del compose
└── README.md
```

---

## Requisitos previos

- **Docker** y **Docker Compose** (forma recomendada de levantar el stack completo)
- **Java 21** (solo si ejecutas el backend en local sin Docker)
- **Maven 3.9+** (solo si ejecutas el backend en local sin Docker)
- **Node.js 20+** y **npm** (solo si ejecutas el frontend en local sin Docker)
- **PostgreSQL 15+** (solo si ejecutas la BD en local sin Docker)

---

## 1. Levantar todo con Docker Compose (recomendado)

> **Nota:** este `docker-compose.yml` es **provisional** para desarrollo local.
> En el futuro se migrará a **Kubernetes** dentro de un pipeline de CI/CD.

Levanta la base de datos, el backend y el frontend de una sola vez:

```bash
docker compose up --build -d
```

| Servicio | URL / Puerto |
|----------|--------------|
| Frontend | http://localhost:3000 |
| Backend (API) | http://localhost:8080/api |
| Health check | http://localhost:8080/api/health |
| PostgreSQL | localhost:5432 (expuesto para clientes externos) |

Verificar que todo funciona:

```bash
docker compose ps          # los tres servicios deben estar "running/healthy"
curl http://localhost:8080/api/health
```

Seguir logs:

```bash
docker compose logs -f backend
```

Detener:

```bash
docker compose down        # conserva los datos de la BD (volumen)
docker compose down -v     # detiene y ELIMINA los datos de la BD
```

### Configuración variable

Todos los valores tienen defaults; para personalizarlos copia `.env.example` a `.env` en la raíz:

```bash
cp .env.example .env
```

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `DB_NAME` | Nombre de la base de datos | `taskflow` |
| `DB_USERNAME` | Usuario de PostgreSQL | `taskflow` |
| `DB_PASSWORD` | Contraseña de PostgreSQL | `taskflow` |
| `DB_HOST_PORT` | Puerto expuesto de PostgreSQL | `5432` |
| `BACKEND_PORT` | Puerto expuesto del backend | `8080` |
| `FRONTEND_PORT` | Puerto expuesto del frontend | `3000` |
| `VITE_API_BASE_URL` | URL de la API usada por el navegador (se inyecta en el **build** del frontend) | `http://localhost:8080/api` |
| `CORS_ALLOWED_ORIGINS` | Orígenes permitidos por CORS | `http://localhost:3000,http://localhost:5173` |

> **Importante:** `VITE_API_BASE_URL` se inyecta en tiempo de **build** del frontend (Vite inlina las variables). Si cambias esta variable, reconstruye con `docker compose build frontend` (o `up --build`).

La base de datos usa un **volumen persistente** (`taskflow-db-data`), por lo que los datos sobreviven a `docker compose down` (aunque no a `down -v`).

El backend espera a que PostgreSQL esté **sano** (healthcheck `pg_isready`) antes de arrancar, y Hibernate crea/actualiza el esquema automáticamente (`ddl-auto: update`).

---

## 2. Ejecutar componentes por separado (sin Compose)

### Base de datos (PostgreSQL)

Crea la base de datos para desarrollo local:

```sql
CREATE DATABASE taskflow;
```

O levanta un contenedor temporal:

```bash
docker run -d --name taskflow-postgres \
  -e POSTGRES_DB=taskflow \
  -e POSTGRES_USER=taskflow \
  -e POSTGRES_PASSWORD=taskflow \
  -p 5432:5432 \
  postgres:16-alpine
```

### Backend (`/backend`)

#### Compilar y ejecutar en local

```bash
cd backend
mvn clean spring-boot:run
```

La API estará disponible en `http://localhost:8080`.

#### Variables de entorno (opcionales, tienen valores por defecto)

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `DB_HOST` | Host de PostgreSQL | `localhost` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |
| `DB_NAME` | Nombre de la base | `taskflow` |
| `DB_USERNAME` | Usuario | `taskflow` |
| `DB_PASSWORD` | Contraseña | `taskflow` |
| `SERVER_PORT` | Puerto del servidor | `8080` |
| `CORS_ALLOWED_ORIGINS` | Orígenes CORS (coma) | `http://localhost:5173,http://localhost:3000` |

#### Ejecutar tests

```bash
cd backend
mvn test
```

#### Construir el JAR

```bash
cd backend
mvn clean package -DskipTests
# El JAR queda en target/taskflow-backend-0.1.0-SNAPSHOT.jar
```

#### Construir la imagen Docker

```bash
cd backend
docker build -t taskflow-backend:latest .
docker run -p 8080:8080 \
  -e DB_HOST=host.docker.internal \
  -e DB_USERNAME=taskflow \
  -e DB_PASSWORD=taskflow \
  taskflow-backend:latest
```

> En Windows/macOS usa `host.docker.internal` para alcanzar PostgreSQL en el host; en Linux usa la IP de la red o `--network host`.

#### Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/health` | Estado de la aplicación |
| `GET` | `/api/tasks` | Listar tareas (`?estado=PENDIENTE\|EN_PROGRESO\|COMPLETADA`) |
| `GET` | `/api/tasks/{id}` | Obtener una tarea |
| `POST` | `/api/tasks` | Crear tarea |
| `PUT` | `/api/tasks/{id}` | Actualizar tarea |
| `DELETE` | `/api/tasks/{id}` | Eliminar tarea |

**Ejemplo de creación:**

```bash
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"titulo": "Mi primera tarea", "descripcion": "Detalle opcional", "estado": "PENDIENTE"}'
```

---

## 3. Frontend (`/frontend`)

### Configurar variables de entorno

Copia el archivo de ejemplo y ajusta si es necesario:

```bash
cd frontend
cp .env.example .env
```

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `VITE_API_BASE_URL` | URL base de la API | `http://localhost:8080/api` |

### Compilar y ejecutar en local

```bash
cd frontend
npm install
npm run dev
```

La interfaz estará disponible en `http://localhost:5173`.

### Build de producción

```bash
cd frontend
npm run build
# Los estáticos quedan en dist/
```

### Construir la imagen Docker

```bash
cd frontend
docker build --build-arg VITE_API_BASE_URL=http://localhost:8080/api -t taskflow-frontend:latest .
docker run -p 3000:80  taskflow-frontend:latest
```

La app quedará en `http://localhost:3000`.

> **Importante:** `VITE_API_BASE_URL` se inyecta en tiempo de build (Vite inlina las variables). Si cambia la URL de la API en producción, reconstruye la imagen con el nuevo `--build-arg`.

---

## Arquitectura preparada para autenticación futura

Ambos lados dejan puntos de extensión claros:

- **Backend:** `SecurityConfig` (Spring Security desactivado pero cableado) y paquete `security/` reservado para el filtro JWT. Al añadir autenticación solo hay que registrar el filtro y cambiar las reglas `authorizeHttpRequests`.
- **Frontend:** `AuthContext` gestiona el token (localStorage) y `taskApi.ts` incluye un interceptor Axios con el código placeholder listo para adjuntar `Authorization: Bearer <token>`.

---

## Roadmap (futuro)

- Migrar el despliegue a **Kubernetes** en un entorno CI/CD (el docker-compose actual es provisional)
- Autenticación JWT (login/registro)
- Paginación y ordenación en el listado
- Pipelines de CI/CD
