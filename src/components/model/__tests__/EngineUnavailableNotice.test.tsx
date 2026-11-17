import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_NOTICE_DURATION_MS, EngineUnavailableNotice, SIMULATIONS_UNAVAILABLE_MESSAGE } from '../EngineUnavailableNotice';

describe('EngineUnavailableNotice', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('says simulations are unavailable and can be dismissed', () => {
    const onDismiss = vi.fn();
    render(<EngineUnavailableNotice onDismiss={onDismiss} />);
    expect(screen.getByText(SIMULATIONS_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('dismisses itself after a few seconds, even when the parent re-renders with a new callback', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<EngineUnavailableNotice onDismiss={first} />);
    act(() => { vi.advanceTimersByTime(ENGINE_NOTICE_DURATION_MS - 1000); });
    rerender(<EngineUnavailableNotice onDismiss={latest} />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });
});
