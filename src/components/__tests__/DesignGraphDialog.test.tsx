import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesignGraphDialog } from '../DesignGraphDialog';
import { designExplorationService } from '../../services/DesignExplorationService';
import type { BuildingModel } from '../../types/building';

const building = (id: string, name: string) => ({ id, name, points: [], floors: 3, floorHeight: 3 }) as unknown as BuildingModel;

describe('DesignGraphDialog energy cards', () => {
  it("names the building a node's energy study simulated", () => {
    designExplorationService.updateNodeSnapshot('baseline', {
      name: 'Run 1',
      buildings: [building('a', 'Building A'), building('b', 'Building B')],
      metrics: { heatingDemand: 40, coolingDemand: 5, totalEnergy: 45 },
      energyRun: { status: 'complete', buildingId: 'b' },
    });
    render(<DesignGraphDialog isOpen onClose={() => undefined} onReinstateConfiguration={() => undefined} />);

    fireEvent.click(screen.getAllByText('Run 1')[0]);

    expect(screen.getByText('Energy for:').nextElementSibling).toHaveTextContent('Building B');
    expect(screen.getByText('Building:').nextElementSibling).toHaveTextContent('Building B');
  });
});
