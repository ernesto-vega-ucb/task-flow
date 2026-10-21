import type { TaskStatus } from '../types/task';
import { ALL_STATUSES, TASK_STATUS_LABELS } from '../types/task';

type FilterValue = TaskStatus | 'TODOS';

interface FilterBarProps {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  onRefresh: () => void;
  onNew: () => void;
}

export function FilterBar({ value, onChange, onRefresh, onNew }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-bar__group">
        <label htmlFor="filter-status" className="filter-bar__label">
          Filtrar por estado:
        </label>
        <select
          id="filter-status"
          className="filter-bar__select"
          value={value}
          onChange={(e) => onChange(e.target.value as FilterValue)}
        >
          <option value="TODOS">Todos</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-bar__actions">
        <button type="button" className="btn btn--secondary" onClick={onRefresh}>
          Actualizar
        </button>
        <button type="button" className="btn btn--primary" onClick={onNew}>
          + Nueva tarea
        </button>
      </div>
    </div>
  );
}
