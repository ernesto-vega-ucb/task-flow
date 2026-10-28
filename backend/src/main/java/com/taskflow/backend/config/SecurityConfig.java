package com.taskflow.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Configuración base de seguridad.
 *
 * Actualmente desactiva CSRF, habilita CORS mediante CorsConfigurationSource
 * y permite el acceso público a toda la API REST para facilitar pruebas
 * entre frontend/backend en desarrollo.
 *
 * En el futuro, aquí se registrarán los filtros JWT (ej.
 * UsernamePasswordAuthenticationFilter) y se aplicarán reglas por roles.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/health", "/api/health/**").permitAll()
                        .requestMatchers("/api/tasks", "/api/tasks/**").permitAll()
                        .requestMatchers("/api/**").permitAll()
                        .anyRequest().permitAll()
                )
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable);

        // Futuro: añadir .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
        return http.build();
    }
}
