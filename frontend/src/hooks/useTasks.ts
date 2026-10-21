import { useCallback, useEffect, useState } from 'react';
import { taskApi } from '../services/taskApi';
import type { Task, TaskCreateRequest, TaskStatus, TaskUpdateRequest } from '../types/task';

interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  filter: TaskStatus | 'TODOS';
  setFilter: (f: TaskStatus | 'TODOS') => void;
  refresh: () => Promise<void>;
  createTask: (data: TaskCreateRequest) => Promise<void>;
  updateTask: (id: number, data: TaskUpdateRequest) => Promise<void>;
  updateStatus: (id: number, estado: TaskStatus) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskStatus | 'TODOS'>('TODOS');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const estado = filter === 'TODOS' ? undefined : filter;
      const data = await taskApi.getAll(estado);
      setTasks(data);
    } catch (e) {
      setError('No se pudieron cargar las tareas. ¿Está el backend activo?');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTask = async (data: TaskCreateRequest) => {
    await taskApi.create(data);
    await refresh();
  };

  const updateTask = async (id: number, data: TaskUpdateRequest) => {
    await taskApi.update(id, data);
    await refresh();
  };

  const updateStatus = async (id: number, estado: TaskStatus) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    await taskApi.update(id, {
      titulo: task.titulo,
      descripcion: task.descripcion ?? undefined,
      estado,
    });
    await refresh();
  };

  const deleteTask = async (id: number) => {
    await taskApi.remove(id);
    await refresh();
  };

  return {
    tasks,
    loading,
    error,
    filter,
    setFilter,
    refresh,
    createTask,
    updateTask,
    updateStatus,
    deleteTask,
  };
}
