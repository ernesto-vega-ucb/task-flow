package com.taskflow.backend.repository;

import com.taskflow.backend.model.Task;
import com.taskflow.backend.model.TaskStatus;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TaskRepository extends JpaRepository<Task, Long> {

    List<Task> findByEstadoOrderByFechaCreacionDesc(TaskStatus estado);

    List<Task> findAllByOrderByFechaCreacionDesc();
}
