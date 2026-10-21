# ---- Etapa 1: Build con Maven ----
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app

# Copiar el pom y descargar dependencias primero (mejora caché de capas)
COPY pom.xml .
RUN mvn -B dependency:go-offline

# Copiar el código fuente y empaquetar el jar (sin tests para la imagen)
COPY src ./src
RUN mvn -B clean package -DskipTests

# ---- Etapa 2: Imagen de runtime con JRE ----
FROM eclipse-temurin:21-jre
WORKDIR /app

# Usuario no root por seguridad
RUN addgroup --system taskflow && adduser --system --ingroup taskflow taskflow
USER taskflow

COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
