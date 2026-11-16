import React from 'react';
import { CloudOff, X } from 'lucide-react';

/** Why a study didn't start: the engine didn't answer. Shown in the notice and on design graph nodes. */
export const SIMULATIONS_UNAVAILABLE_MESSAGE = "Simulations aren't available on this server yet.";

/** Tells the user that "Run studies" didn't start because the engine doesn't answer. */
export const EngineUnavailableNotice: React.FC<{ onDismiss: () => void }> = ({ onDismiss }) => (
  <aside className="model-progress-card absolute z-40 w-[296px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg" role="status">
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100">
        <CloudOff className="h-3.5 w-3.5 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-slate-900">{SIMULATIONS_UNAVAILABLE_MESSAGE}</div>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">You can still draw, edit, import and export buildings.</p>
      </div>
      <button type="button" onClick={onDismiss} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss"><X className="h-4 w-4" /></button>
    </div>
  </aside>
);
