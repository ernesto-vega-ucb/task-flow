import type { Task, TaskStatus } from '../types/task';
import { ALL_STATUSES, TASK_STATUS_LABELS } from '../types/task';
import { StatusBadge } from './StatusBadge';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: TaskStatus) => void;
}

export function TaskCard({ task, onEdit, onDelete, onStatusChange }: TaskCardProps) {
  const fecha = new Date(task.fechaCreacion).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <article className="task-card">
      <header className="task-card__header">
        <h3 className="task-card__title">{task.titulo}</h3>
        <StatusBadge status={task.estado} />
      </header>

      {task.descripcion && <p className="task-card__description">{task.descripcion}</p>}

      <p className="task-card__date">Creada: {fecha}</p>

      <div className="task-card__footer">
        <select
          className="task-card__status-select"
          value={task.estado}
          onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
          aria-label={`Cambiar estado de ${task.titulo}`}
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <div className="task-card__buttons">
          <button type="button" className="btn btn--small btn--secondary" onClick={() => onEdit(task)}>
            Editar
          </button>
          <button
            type="button"
            className="btn btn--small btn--danger"
            onClick={() => onDelete(task.id)}
          >
            Eliminar
          </button>
        </div>
      </div>
    </article>
  );
}
