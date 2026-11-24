import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

const Harness = ({ onSun }: { onSun: () => void }) => {
  const noop = () => undefined;
  useKeyboardShortcuts({
    onDrawBuilding: noop, onToggleGrid: noop, onToggleSnap: noop, onToggleFPS: noop,
    onShowConfig: noop, onExport: noop, onClearAll: noop, onEscape: noop,
    onUndoLastPoint: noop, onSaveConfiguration: noop, onImportConfiguration: noop,
    onToggleSunController: onSun, isDrawing: false, isInitialized: true,
  });
  return <input aria-label="Editor field" />;
};

describe('model keyboard shortcuts', () => {
  it('leaves Ctrl/Cmd+R untouched and opens sun controls with unmodified U', () => {
    const onSun = vi.fn();
    render(<Harness onSun={onSun} />);
    const refresh = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true });
    expect(window.dispatchEvent(refresh)).toBe(true);
    expect(refresh.defaultPrevented).toBe(false);
    fireEvent.keyDown(window, { key: 'u' });
    expect(onSun).toHaveBeenCalledOnce();
  });

  it('suppresses shortcuts while editing fields', () => {
    const onSun = vi.fn();
    const { getByLabelText } = render(<Harness onSun={onSun} />);
    fireEvent.keyDown(getByLabelText('Editor field'), { key: 'u' });
    expect(onSun).not.toHaveBeenCalled();
  });
});
