import React from 'react';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { isSimulationInProgress } from '../../utils/simulationProgress';

export type SimulationTaskStatus = 'preparing' | 'queued' | 'running' | 'complete' | 'failed' | 'skipped';

export interface SimulationTaskState {
  status: SimulationTaskStatus;
  message?: string;
}

interface SimulationProgressCardProps {
  daylight: SimulationTaskState;
  energy: SimulationTaskState;
  onRetry?: () => void;
  onDismiss: () => void;
}

const TaskRow = ({ label, task }: { label: string; task: SimulationTaskState }) => {
  const done = task.status === 'complete' || task.status === 'skipped';
  const failed = task.status === 'failed';
  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100">
        {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : failed ? <AlertCircle className="h-3.5 w-3.5 text-rose-600" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold text-slate-800">{label}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${failed ? 'text-rose-600' : done ? 'text-emerald-600' : 'text-blue-600'}`}>{task.status}</span>
        </div>
        {task.message && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{task.message}</p>}
      </div>
    </div>
  );
};

export const SimulationProgressCard: React.FC<SimulationProgressCardProps> = ({ daylight, energy, onRetry, onDismiss }) => {
  const hasFailure = daylight.status === 'failed' || energy.status === 'failed';
  const inProgress = isSimulationInProgress(daylight, energy);
  return (
    <aside className="model-progress-card absolute z-40 w-[296px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg" aria-live="polite">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div>
          <div className="text-[12px] font-semibold text-slate-900">Simulation progress</div>
          <div className="text-[10px] text-slate-500">Results appear as each study finishes.</div>
        </div>
        {inProgress
          ? <button type="button" onClick={onDismiss} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900" title="Stop the studies that are running">Cancel</button>
          : <button type="button" onClick={onDismiss} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close" title="Close"><X className="h-4 w-4" /></button>}
      </div>
      <div className="divide-y divide-slate-100">
        <TaskRow label="Daylight" task={daylight} />
        <TaskRow label="Energy" task={energy} />
      </div>
      {hasFailure && onRetry && <button type="button" onClick={onRetry} className="mt-1 h-8 w-full rounded-md bg-slate-900 text-[11px] font-semibold text-white hover:bg-slate-700">Retry failed studies</button>}
    </aside>
  );
};
