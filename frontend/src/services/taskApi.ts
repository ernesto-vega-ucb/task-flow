import axios, { type AxiosInstance } from 'axios';
import type { Task, TaskCreateRequest, TaskStatus, TaskUpdateRequest } from '../types/task';

/**
 * Cliente HTTP centralizado.
 *
 * Futuro: el interceptor adjuntará automáticamente el token de autenticación
 * (Authorization: Bearer <token>) leyéndolo de localStorage o de un contexto.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  // Placeholder para futura autenticación:
  // const token = localStorage.getItem('authToken');
  // if (token) {
  //   config.headers.Authorization = `Bearer ${token}`;
  // }
  return config;
});

export const taskApi = {
  getAll: (estado?: TaskStatus): Promise<Task[]> => {
    const params = estado ? { estado } : {};
    return apiClient.get<Task[]>('/tasks', { params }).then((r) => r.data);
  },

  getById: (id: number): Promise<Task> =>
    apiClient.get<Task>(`/tasks/${id}`).then((r) => r.data),

  create: (data: TaskCreateRequest): Promise<Task> =>
    apiClient.post<Task>('/tasks', data).then((r) => r.data),

  update: (id: number, data: TaskUpdateRequest): Promise<Task> =>
    apiClient.put<Task>(`/tasks/${id}`, data).then((r) => r.data),

  remove: (id: number): Promise<void> =>
    apiClient.delete(`/tasks/${id}`).then(() => undefined),
};
