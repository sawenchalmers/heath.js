// The dev server's list of preset scenes for manual tests.
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { DEV_PRESETS, type DevPreset } from './presets';

/** A panel next to the left toolbar listing the presets; picking one loads it (replacing the scene), Esc closes it. */
export const DevPresetMenu: React.FC<{ onPick: (preset: DevPreset) => void; onClose: () => void }> = ({ onPick, onClose }) => {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  return (
    <div role="dialog" aria-label="Dev presets" className="absolute left-16 top-1/2 z-50 w-80 -translate-y-1/2 rounded-lg border border-amber-300 bg-white p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-slate-900">Dev presets</h2>
          <p className="text-[11px] text-slate-500">Dev server only. Loading one replaces the scene.</p>
        </div>
        <button type="button" aria-label="Close dev presets" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
        {DEV_PRESETS.map(preset => (
          <li key={preset.id}>
            <button type="button" onClick={() => onPick(preset)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-amber-50">
              <span className="block text-[12px] font-medium text-slate-800">{preset.name}</span>
              <span className="block text-[11px] text-slate-500">{preset.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
