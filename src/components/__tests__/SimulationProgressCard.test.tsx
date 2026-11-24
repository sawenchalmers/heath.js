import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SimulationProgressCard } from '../model/SimulationProgressCard';

describe('SimulationProgressCard', () => {
  it('shows daylight complete while energy remains running without redundant daylight messaging', () => {
    render(<SimulationProgressCard daylight={{ status: 'complete', message: 'Daylight results are ready.' }} energy={{ status: 'running', message: 'Solving zones…' }} onDismiss={() => undefined} />);
    expect(screen.getByText('Daylight results are ready.')).toBeInTheDocument();
    expect(screen.getByText('Solving zones…')).toBeInTheDocument();
    expect(screen.queryByText(/running daylight/i)).not.toBeInTheDocument();
  });

  it('retains partial failures with retry and dismiss actions', () => {
    const retry = vi.fn(); const dismiss = vi.fn();
    render(<SimulationProgressCard daylight={{ status: 'complete' }} energy={{ status: 'failed', message: 'Choose another construction.' }} onRetry={retry} onDismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(retry).toHaveBeenCalledOnce(); expect(dismiss).toHaveBeenCalledOnce();
  });

  it('offers a Cancel button, and no close button, while either study is still on its way', () => {
    const dismiss = vi.fn();
    render(<SimulationProgressCard daylight={{ status: 'complete' }} energy={{ status: 'running' }} onDismiss={dismiss} />);
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
