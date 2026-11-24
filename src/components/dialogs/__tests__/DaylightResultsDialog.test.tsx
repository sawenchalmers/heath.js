import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DaylightResultsDialog } from '../DaylightResultsDialog';
import type { DaylightRunSummary } from '../../../types/daylight';

const makeResult = (overrides: Partial<DaylightRunSummary> = {}): DaylightRunSummary => ({
  status: 'complete',
  sensorCount: 1,
  meanDF: 12,
  sda: 60,
  points: [{ x: 0, y: 0, z: 0, value: 12 }],
  sensorGrids: [{
    identifier: 'grid-floor-1',
    full_identifier: 'building-room-floor-1-grid',
    room_identifier: 'building-room-floor-1',
    floor_number: 1,
    start_sensor_index: 0,
    sensor_count: 1
  }],
  startedAt: '2025-01-01T00:00:00.000Z',
  ...overrides
});

describe('DaylightResultsDialog', () => {
  it('renders a result selector when multiple results are available', () => {
    const handleSelect = vi.fn();

    render(
      <DaylightResultsDialog
        isOpen
        onClose={() => undefined}
        buildingName="Building A"
        result={makeResult()}
        availableResults={[
          { id: 'building-a', name: 'Building A' },
          { id: 'building-b', name: 'Building B' }
        ]}
        selectedBuildingId="building-a"
        onSelectBuildingResult={handleSelect}
        onApplyVisualization={() => undefined}
      />
    );

    const selector = screen.getByRole('combobox', { name: /result building/i });
    expect(selector).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'building-b' } });

    expect(handleSelect).toHaveBeenCalledWith('building-b');
  });

  it('shows only one sensor grid range at a time in the plan view', () => {
    const result = makeResult({
      sensorCount: 4,
      points: [
        { x: 0, y: 0.75, z: 0, value: 1 },
        { x: 1, y: 0.75, z: 0, value: 2 },
        { x: 0, y: 3.75, z: 0, value: 10 },
        { x: 1, y: 3.75, z: 0, value: 20 }
      ],
      sensorGrids: [
        {
          identifier: 'grid-floor-1',
          full_identifier: 'room-floor-1-grid',
          room_identifier: 'room-floor-1',
          floor_number: 1,
          start_sensor_index: 0,
          sensor_count: 2
        },
        {
          identifier: 'grid-floor-2',
          full_identifier: 'room-floor-2-grid',
          room_identifier: 'room-floor-2',
          floor_number: 2,
          start_sensor_index: 2,
          sensor_count: 2
        }
      ]
    });

    render(
      <DaylightResultsDialog
        isOpen
        onClose={() => undefined}
        buildingName="Building A"
        result={result}
        onApplyVisualization={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^daylight$/i }));
    expect(screen.getByText(/room range: 1\.00–2\.00%/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: /plan view floor/i }), {
      target: { value: '1' }
    });

    expect(screen.getByText(/room range: 10\.00–20\.00%/i)).toBeInTheDocument();
  });
});
