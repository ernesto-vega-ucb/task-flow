package com.taskflow.backend.exception;

public class TaskNotFoundException extends RuntimeException {

    public TaskNotFoundException(Long id) {
        super("La tarea con id " + id + " no existe");
    }
}
