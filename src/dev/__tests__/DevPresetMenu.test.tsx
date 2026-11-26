import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DevPresetMenu } from '../DevPresetMenu';
import { DEV_PRESETS } from '../presets';

describe('DevPresetMenu', () => {
  it('lists every preset, passes the picked one on, and shows an error when given one', () => {
    const onPick = vi.fn();
    const { rerender } = render(<DevPresetMenu onPick={onPick} onClose={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(DEV_PRESETS.length);
    fireEvent.click(screen.getByText(DEV_PRESETS[0].name));
    expect(onPick).toHaveBeenCalledWith(DEV_PRESETS[0]);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<DevPresetMenu onPick={onPick} onClose={vi.fn()} error={'Couldn\'t load "X": Missing footprint.'} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Missing footprint.');
  });
});
