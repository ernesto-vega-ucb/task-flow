package com.taskflow.backend.service.impl;

import com.taskflow.backend.dto.TaskCreateRequest;
import com.taskflow.backend.dto.TaskResponse;
import com.taskflow.backend.dto.TaskUpdateRequest;
import com.taskflow.backend.exception.TaskNotFoundException;
import com.taskflow.backend.model.Task;
import com.taskflow.backend.model.TaskStatus;
import com.taskflow.backend.repository.TaskRepository;
import com.taskflow.backend.service.TaskService;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class TaskServiceImpl implements TaskService {

    private final TaskRepository taskRepository;

    public TaskServiceImpl(TaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<TaskResponse> findAll(TaskStatus estado) {
        List<Task> tasks = estado != null
                ? taskRepository.findByEstadoOrderByFechaCreacionDesc(estado)
                : taskRepository.findAllByOrderByFechaCreacionDesc();
        return tasks.stream().map(TaskResponse::from).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TaskResponse> findById(Long id) {
        return taskRepository.findById(id).map(TaskResponse::from);
    }

    @Override
    public TaskResponse create(TaskCreateRequest request) {
        Task task = new Task(request.getTitulo(), request.getDescripcion(), request.getEstado());
        Task saved = taskRepository.save(task);
        return TaskResponse.from(saved);
    }

    @Override
    public TaskResponse update(Long id, TaskUpdateRequest request) {
        Task task = taskRepository.findById(id)
                .orElseThrow(() -> new TaskNotFoundException(id));
        task.setTitulo(request.getTitulo());
        task.setDescripcion(request.getDescripcion());
        task.setEstado(request.getEstado());
        Task updated = taskRepository.save(task);
        return TaskResponse.from(updated);
    }

    @Override
    public void delete(Long id) {
        if (!taskRepository.existsById(id)) {
            throw new TaskNotFoundException(id);
        }
        taskRepository.deleteById(id);
    }
}
