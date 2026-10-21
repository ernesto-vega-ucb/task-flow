package com.taskflow.backend.service;

import com.taskflow.backend.dto.TaskCreateRequest;
import com.taskflow.backend.dto.TaskResponse;
import com.taskflow.backend.dto.TaskUpdateRequest;
import com.taskflow.backend.model.TaskStatus;
import java.util.List;
import java.util.Optional;

public interface TaskService {

    List<TaskResponse> findAll(TaskStatus estado);

    Optional<TaskResponse> findById(Long id);

    TaskResponse create(TaskCreateRequest request);

    TaskResponse update(Long id, TaskUpdateRequest request);

    void delete(Long id);
}
