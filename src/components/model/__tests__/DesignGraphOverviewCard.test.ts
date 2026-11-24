import { describe, expect, it } from 'vitest';
import type { DesignExplorationGraph, DesignNode } from '../../../types/designExploration';
import { projectDesignGraphOverview } from '../designGraphOverview';

const node = (id: string, x?: number, y?: number): DesignNode => ({
  id,
  name: id === 'baseline' ? 'Baseline' : id,
  timestamp: new Date('2026-01-01T00:00:00Z'),
  buildings: [],
  metrics: { globalWarmingPotential: 0, spatialDaylightAutonomy: 0 },
  position: x === undefined || y === undefined ? undefined : { x, y },
});

describe('projectDesignGraphOverview', () => {
  it('centers a single baseline node', () => {
    const graph: DesignExplorationGraph = {
      nodes: [node('baseline', 0, 0)],
      edges: [],
      currentNodeId: 'baseline',
    };

    const geometry = projectDesignGraphOverview(graph);
    expect(geometry.projectedNodes[0]).toMatchObject({
      x: 84,
      y: 56,
      isCurrent: true,
      name: 'Baseline',
    });
  });

  it('centers a horizontal two-node history without vertical drift', () => {
    const graph: DesignExplorationGraph = {
      nodes: [node('baseline', 0, 0), node('option-1', 150, 0)],
      edges: [{ from: 'baseline', to: 'option-1' }],
      currentNodeId: 'option-1',
    };

    const geometry = projectDesignGraphOverview(graph);
    expect(geometry.projectedNodes.map((item) => item.y)).toEqual([56, 56]);
    expect((geometry.projectedNodes[0].x + geometry.projectedNodes[1].x) / 2).toBeCloseTo(84);
    expect(geometry.projectedEdges).toHaveLength(1);
  });
});