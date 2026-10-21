package com.taskflow.backend.dto;

import com.taskflow.backend.model.Task;
import com.taskflow.backend.model.TaskStatus;
import java.time.LocalDateTime;

public class TaskResponse {

    private Long id;
    private String titulo;
    private String descripcion;
    private TaskStatus estado;
    private LocalDateTime fechaCreacion;

    public TaskResponse() {
    }

    public static TaskResponse from(Task task) {
        TaskResponse response = new TaskResponse();
        response.id = task.getId();
        response.titulo = task.getTitulo();
        response.descripcion = task.getDescripcion();
        response.estado = task.getEstado();
        response.fechaCreacion = task.getFechaCreacion();
        return response;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTitulo() {
        return titulo;
    }

    public void setTitulo(String titulo) {
        this.titulo = titulo;
    }

    public String getDescripcion() {
        return descripcion;
    }

    public void setDescripcion(String descripcion) {
        this.descripcion = descripcion;
    }

    public TaskStatus getEstado() {
        return estado;
    }

    public void setEstado(TaskStatus estado) {
        this.estado = estado;
    }

    public LocalDateTime getFechaCreacion() {
        return fechaCreacion;
    }

    public void setFechaCreacion(LocalDateTime fechaCreacion) {
        this.fechaCreacion = fechaCreacion;
    }
}
