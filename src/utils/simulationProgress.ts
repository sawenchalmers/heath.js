import type { SimulationTaskState } from '../components/model/SimulationProgressCard';

/** Whether any of the studies is still on its way (not yet complete, failed or skipped). */
export const isSimulationInProgress = (...tasks: SimulationTaskState[]): boolean =>
  tasks.some(task => task.status === 'preparing' || task.status === 'queued' || task.status === 'running');
