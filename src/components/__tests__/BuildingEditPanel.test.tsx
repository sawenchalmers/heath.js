import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BuildingData } from '../../types/building';
import { createBuildingEditDraft, type BuildingEditDraft } from '../../hooks/useBuildingEditSession';
import type { WorkspaceEditor } from '../../hooks/useWorkspaceEditor';
import { BuildingEditPanel } from '../BuildingEditPanel';

vi.mock('../../services/EPSMService', () => ({
  getEPSMConstructionOptions: vi.fn(() => Promise.resolve({ wall: [], floor: [], roof: [], window: [] })),
  calculateEmbodiedCarbon: vi.fn(() => null)
}));

const makeBuilding = (id = 'building-a', floors = 3): BuildingData => ({
  id,
  mesh: { userData: {}, material: {} } as BuildingData['mesh'],
  points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 8 }, { x: 0, y: 0, z: 8 }],
  footprintArea: 80,
  metrics: { footprintArea: 80, grossFloorArea: 80 * floors, perimeter: 36, totalHeight: floors * 3 },
  floors,
  floorHeight: 3,
  color: 0x3b82f6,
  createdAt: new Date(),
  window_to_wall_ratio: 0.4,
  window_overhang: false,
  window_overhang_depth: 0.5
});

const ControlledPanel = ({
  initialDraft,
  onCommit,
  onCancel,
}: {
  initialDraft: BuildingEditDraft;
  onCommit: (draft: BuildingEditDraft) => void;
  onCancel: () => void;
}) => {
  const [draft, setDraft] = useState(initialDraft);
  const [baseDraft] = useState(initialDraft);
  return (
    <BuildingEditPanel
      draft={draft}
      baseDraft={baseDraft}
      onChange={setDraft}
      onReset={() => setDraft(baseDraft)}
      onCommit={() => onCommit(draft)}
      onCancel={onCancel}
    />
  );
};

const setup = (building = makeBuilding()) => {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ControlledPanel
      initialDraft={createBuildingEditDraft(building)}
      onCommit={onCommit}
      onCancel={onCancel}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /form & massing/i }));
  return { ...view, onCommit, onCancel };
};

describe('BuildingEditPanel controlled draft', () => {
  it('renders updates from the parent-owned draft', () => {
    setup();
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '8' } });
    expect((screen.getAllByRole('slider')[0] as HTMLInputElement).value).toBe('8');
    expect(screen.getByText('24.0 m')).toBeInTheDocument();
  });

  it('commits the latest controlled slider value', () => {
    const { onCommit } = setup();
    fireEvent.change(screen.getAllByRole('slider')[2], { target: { value: '0.83' } });
    fireEvent.pointerUp(screen.getAllByRole('slider')[2]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].window_to_wall_ratio).toBe(0.83);
  });

  it('keeps the canvas unobstructed and closes only through its close control', () => {
    const { onCancel } = setup();
    expect(screen.queryByTestId('building-edit-backdrop')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(done|cancel|reset)$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('accepts text fields on blur', () => {
    const { onCommit } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Courtyard' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByLabelText('Name'));
    expect(onCommit.mock.calls[0][0].name).toBe('Courtyard');
  });

  it('renders a reinstated same-id draft without retaining the previous floor value', () => {
    const callbacks = { onChange: vi.fn(), onReset: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() };
    const tenFloors = createBuildingEditDraft(makeBuilding('building-a', 10));
    const sixFloors = createBuildingEditDraft(makeBuilding('building-a', 6));
    const { rerender } = render(
      <BuildingEditPanel draft={tenFloors} baseDraft={tenFloors} {...callbacks} />
    );
    fireEvent.click(screen.getByRole('button', { name: /form & massing/i }));
    expect((screen.getAllByRole('slider')[0] as HTMLInputElement).value).toBe('10');

    rerender(<BuildingEditPanel draft={sixFloors} baseDraft={sixFloors} {...callbacks} />);
    expect((screen.getAllByRole('slider')[0] as HTMLInputElement).value).toBe('6');
  });
});


describe('building summary actions', () => {
  it('keeps results discoverable and routes building deletion independently of vertex selection', () => {
    const draft = createBuildingEditDraft(makeBuilding());
    const onViewResults = vi.fn(), deleteSelectedBuilding = vi.fn();
    const editor = { state: { tool: 'select', vertex: null }, deleteSelectedBuilding } as unknown as WorkspaceEditor;
    const props = { draft, baseDraft: draft, editor, onChange: vi.fn(), onReset: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn(), onViewResults };
    const { rerender } = render(<BuildingEditPanel {...props} hasResults={false} />);
    expect(screen.getByRole('button', { name: 'View results' })).toBeDisabled();
    expect(screen.getByText('80.0 m²')).toBeInTheDocument();
    expect(screen.getByText('No current results. Run studies to view analysis.')).toBeInTheDocument();
    rerender(<BuildingEditPanel {...props} hasResults />);
    fireEvent.click(screen.getByRole('button', { name: 'View results' }));
    expect(onViewResults).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Delete building' }));
    expect(deleteSelectedBuilding).toHaveBeenCalledOnce();
  });

  it('says why the results are hidden when an edit made them out of date', () => {
    const draft = createBuildingEditDraft(makeBuilding());
    const editor = { state: { tool: 'select', vertex: null } } as unknown as WorkspaceEditor;
    render(<BuildingEditPanel draft={draft} baseDraft={draft} editor={editor} onChange={vi.fn()} onReset={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} resultsChangedSince="Run 3" />);
    expect(screen.getByRole('status')).toHaveTextContent('The design has changed since the run “Run 3”, so its results are hidden.');
    expect(screen.queryByText('No current results. Run studies to view analysis.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View results' })).toBeDisabled();
  });
});
