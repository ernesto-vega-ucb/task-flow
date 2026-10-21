import type { TaskStatus } from '../types/task';
import { TASK_STATUS_LABELS } from '../types/task';

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}
