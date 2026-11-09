# ---- Etapa 1: Build + Tests con Maven (quality gate) ----
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app

# Copiar el pom y descargar dependencias primero (mejora caché de capas)
COPY pom.xml .
RUN mvn -B dependency:go-offline

# Copiar el código fuente
COPY src ./src

# Ejecuta tests automáticamente usando perfil 'test' (H2 en memoria).
# Si los tests fallan, el RUN aborta el build de la imagen.
RUN mvn -B clean package -Dspring.profiles.active=test

# ---- Etapa 2: Imagen de runtime ligera (JRE) ----
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Usuario no root por seguridad
RUN addgroup -S taskflow && adduser -S taskflow -G taskflow
USER taskflow

COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
