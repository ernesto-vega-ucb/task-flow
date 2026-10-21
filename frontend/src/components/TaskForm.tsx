import { useEffect, useState, type FormEvent } from 'react';
import type { Task, TaskCreateRequest, TaskStatus } from '../types/task';
import { ALL_STATUSES, TASK_STATUS_LABELS } from '../types/task';

interface TaskFormProps {
  task: Task | null; // null => crear, objeto => editar
  onClose: () => void;
  onSubmit: (data: TaskCreateRequest) => Promise<void>;
}

export function TaskForm({ task, onClose, onSubmit }: TaskFormProps) {
  const [titulo, setTitulo] = useState(task?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(task?.descripcion ?? '');
  const [estado, setEstado] = useState<TaskStatus>(task?.estado ?? 'PENDIENTE');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmed = titulo.trim();
    if (!trimmed) {
      setFormError('El título es obligatorio.');
      return;
    }
    if (trimmed.length > 100) {
      setFormError('El título no puede superar los 100 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        titulo: trimmed,
        descripcion: descripcion.trim() || undefined,
        estado,
      });
      onClose();
    } catch {
      setFormError('No se pudo guardar la tarea. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
      >
        <h2 id="task-form-title" className="modal__title">
          {task ? 'Editar tarea' : 'Nueva tarea'}
        </h2>

        <form onSubmit={handleSubmit} className="task-form">
          <div className="task-form__field">
            <label htmlFor="titulo" className="task-form__label">
              Título *
            </label>
            <input
              id="titulo"
              type="text"
              className="task-form__input"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </div>

          <div className="task-form__field">
            <label htmlFor="descripcion" className="task-form__label">
              Descripción
            </label>
            <textarea
              id="descripcion"
              className="task-form__textarea"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
            />
          </div>

          <div className="task-form__field">
            <label htmlFor="estado" className="task-form__label">
              Estado
            </label>
            <select
              id="estado"
              className="task-form__select"
              value={estado}
              onChange={(e) => setEstado(e.target.value as TaskStatus)}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {formError && <p className="task-form__error">{formError}</p>}

          <div className="task-form__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Guardando…' : task ? 'Guardar cambios' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
