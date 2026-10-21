import { useState } from 'react';
import { FilterBar } from './components/FilterBar';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { useTasks } from './hooks/useTasks';
import type { Task, TaskStatus } from './types/task';

type ModalState = { open: false } | { open: true; task: Task | null };

export default function App() {
  const {
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
  } = useTasks();

  const [modal, setModal] = useState<ModalState>({ open: false });

  const handleDelete = async (id: number) => {
    if (window.confirm('¿Seguro que quieres eliminar esta tarea?')) {
      await deleteTask(id);
    }
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">TaskFlow</h1>
        <p className="app__subtitle">Gestión de tareas simple y rápida</p>
      </header>

      <main className="app__main">
        <FilterBar
          value={filter}
          onChange={setFilter}
          onRefresh={() => void refresh()}
          onNew={() => setModal({ open: true, task: null })}
        />

        <TaskList
          tasks={tasks}
          loading={loading}
          error={error}
          onEdit={(task) => setModal({ open: true, task })}
          onDelete={(id) => void handleDelete(id)}
          onStatusChange={(id: number, status: TaskStatus) => void updateStatus(id, status)}
        />
      </main>

      {modal.open && (
        <TaskForm
          task={modal.task}
          onClose={() => setModal({ open: false })}
          onSubmit={async (data) => {
            if (modal.task) {
              await updateTask(modal.task.id, data);
            } else {
              await createTask(data);
            }
          }}
        />
      )}
    </div>
  );
}
