import React from 'react';
import { CloudSun, Download, FlaskConical, Pencil, Play, Trash2, Upload } from 'lucide-react';

interface LeftToolbarProps {
  isDrawing: boolean;
  isInitialized: boolean;
  hasBuildings: boolean;
  hasSelection?: boolean;
  onStartDrawing: () => void;
  onExport: () => void;
  onClearAll: () => void;
  onSaveConfiguration: () => void;
  /** Studies are running: Run studies is unavailable until they finish or are cancelled. */
  isRunning?: boolean;
  onImportConfiguration: () => void;
  onToggleSunController: () => void;
  /** Opens the dev presets; only given on the dev server, so the button only shows there. */
  onOpenDevPresets?: () => void;
}

const Tool = ({ icon: Icon, label, shortcut, onClick, disabled, active }: { icon: React.ElementType; label: string; shortcut?: string; onClick: () => void; disabled?: boolean; active?: boolean }) => (
  <button type="button" aria-label={label} title={`${label}${shortcut ? ` (${shortcut})` : ''}`} onClick={onClick} disabled={disabled} className={`model-tool relative flex h-10 w-10 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${active ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}><Icon className="h-[18px] w-[18px]" /></button>
);

export const LeftToolbar: React.FC<LeftToolbarProps> = ({ isDrawing, isInitialized, hasBuildings, hasSelection, onStartDrawing, onExport, onClearAll, onSaveConfiguration, isRunning = false, onImportConfiguration, onToggleSunController, onOpenDevPresets }) => (
  <nav className="model-tool-rail absolute left-2 top-1/2 z-40 -translate-y-1/2 rounded-lg border border-slate-200/90 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm" aria-label="Model tools">
    <div className="flex flex-col gap-1">
      <Tool icon={Pencil} label="Draw building" shortcut="D" onClick={onStartDrawing} disabled={!isInitialized || isDrawing} active={isDrawing} />
      <Tool icon={Play} label={isRunning ? 'Run studies (studies are running)' : 'Run studies'} shortcut="Ctrl+S" onClick={onSaveConfiguration} disabled={!isInitialized || !hasBuildings || isRunning} />
      <div className="mx-1 h-px bg-slate-200" />
      <Tool icon={Upload} label="Import" shortcut="I" onClick={onImportConfiguration} disabled={!isInitialized} />
      <Tool icon={Download} label="Export" shortcut="Ctrl+E" onClick={onExport} disabled={!hasBuildings} />
      <Tool icon={Trash2} label="Delete selection" shortcut="Delete" onClick={onClearAll} disabled={!hasSelection} />
      <div className="mx-1 h-px bg-slate-200" />
      <Tool icon={CloudSun} label="Sun position" shortcut="U" onClick={onToggleSunController} disabled={!isInitialized} />
      {onOpenDevPresets && <>
        <div className="mx-1 h-px bg-slate-200" />
        <Tool icon={FlaskConical} label="Dev presets" onClick={onOpenDevPresets} disabled={!isInitialized} />
      </>}
    </div>
  </nav>
);
