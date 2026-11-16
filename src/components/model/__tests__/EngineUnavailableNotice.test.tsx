import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EngineUnavailableNotice } from '../EngineUnavailableNotice';

describe('EngineUnavailableNotice', () => {
  it('says simulations are unavailable and can be dismissed', () => {
    const onDismiss = vi.fn();
    render(<EngineUnavailableNotice onDismiss={onDismiss} />);
    expect(screen.getByText("Simulations aren't available on this server yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
