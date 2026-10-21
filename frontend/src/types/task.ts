export type TaskStatus = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA';

export interface Task {
  id: number;
  titulo: string;
  descripcion: string | null;
  estado: TaskStatus;
  fechaCreacion: string;
}

export interface TaskCreateRequest {
  titulo: string;
  descripcion?: string;
  estado: TaskStatus;
}

export interface TaskUpdateRequest {
  titulo: string;
  descripcion?: string;
  estado: TaskStatus;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En Progreso',
  COMPLETADA: 'Completada',
};

export const ALL_STATUSES: TaskStatus[] = ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA'];
