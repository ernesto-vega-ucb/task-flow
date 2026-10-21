import type { Task, TaskStatus } from '../types/task';
import { TaskCard } from './TaskCard';

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: TaskStatus) => void;
}

export function TaskList({ tasks, loading, error, onEdit, onDelete, onStatusChange }: TaskListProps) {
  if (loading) {
    return <p className="feedback feedback--loading">Cargando tareas…</p>;
  }

  if (error) {
    return <p className="feedback feedback--error">{error}</p>;
  }

  if (tasks.length === 0) {
    return <p className="feedback feedback--empty">No hay tareas. ¡Crea la primera!</p>;
  }

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}
