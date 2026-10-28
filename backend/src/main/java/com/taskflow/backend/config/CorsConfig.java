package com.taskflow.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.List;

@Configuration
public class CorsConfig {

    @Value("${taskflow.cors.allowed-origins:*}")
    private List<String> allowedOrigins;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // Si se usa "*" con allowCredentials(true) no está permitido por el navegador.
        // Para desarrollo dejamos allowCredentials en false para aceptar "*" o cualquier origen.
        if (allowedOrigins != null && allowedOrigins.size() == 1 && "*".equals(allowedOrigins.get(0))) {
            configuration.addAllowedOriginPattern("*");
            configuration.setAllowCredentials(false);
        } else if (allowedOrigins != null && !allowedOrigins.isEmpty()) {
            configuration.setAllowedOrigins(allowedOrigins);
            configuration.setAllowCredentials(true);
        } else {
            configuration.addAllowedOriginPattern("*");
            configuration.setAllowCredentials(false);
        }

        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Authorization", "Content-Type"));
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        // Aplicar CORS a toda la API
        source.registerCorsConfiguration("/api/**", configuration);
        // Aplicar también para cualquier ruta por seguridad
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
