import React, { useEffect, useMemo, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { designExplorationService } from '../../services/DesignExplorationService';
import type { DesignExplorationGraph } from '../../types/designExploration';
import { OVERVIEW_HEIGHT, OVERVIEW_WIDTH, projectDesignGraphOverview } from './designGraphOverview';

interface DesignGraphOverviewCardProps {
  onOpenGraph: () => void;
}

export const DesignGraphOverviewCard: React.FC<DesignGraphOverviewCardProps> = ({ onOpenGraph }) => {
  const [graph, setGraph] = useState<DesignExplorationGraph>(designExplorationService.getGraph());

  useEffect(() => {
    const handleGraphUpdate = (updatedGraph: DesignExplorationGraph) => {
      setGraph(updatedGraph);
    };

    designExplorationService.addListener(handleGraphUpdate);
    return () => {
      designExplorationService.removeListener(handleGraphUpdate);
    };
  }, []);

  const geometry = useMemo(() => projectDesignGraphOverview(graph), [graph]);
  const optionLabel = `${graph.nodes.length} ${graph.nodes.length === 1 ? 'option' : 'options'}`;

  return (
    <aside className="model-graph-overview absolute z-40 w-[204px] rounded-xl border border-slate-200 bg-white p-2.5 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Design history</div>
          <div className="text-[10px] text-slate-500">{optionLabel}</div>
        </div>
        <button
          type="button"
          onClick={onOpenGraph}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
          aria-label="Open design history"
          title="Open design history"
        >
          <Maximize2 className="h-3 w-3" />
          Open
        </button>
      </div>

      <svg
        width={OVERVIEW_WIDTH}
        height={OVERVIEW_HEIGHT}
        className="block w-full rounded border border-slate-200 bg-slate-50"
        aria-label="Design graph overview"
      >
        <g>
          {geometry.projectedEdges.map((edge, index) => (
            <line
              key={`edge-${index}`}
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              stroke="#94a3b8"
              strokeWidth={1}
            />
          ))}
        </g>
        <g>
          {geometry.projectedNodes.map((node) => (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={node.isCurrent ? 4.5 : 3.5}
              fill={node.isCurrent ? '#10b981' : '#64748b'}
              stroke="#ffffff"
              strokeWidth={1}
            >
              <title>{node.name}{node.isCurrent ? ' (current)' : ''}</title>
            </circle>
          ))}
        </g>
        {geometry.projectedNodes.length === 1 && (
          <text
            x={geometry.projectedNodes[0].x}
            y={geometry.projectedNodes[0].y + 17}
            textAnchor="middle"
            fill="#64748b"
            fontSize="9"
          >
            {geometry.projectedNodes[0].name}
          </text>
        )}
      </svg>
    </aside>
  );
};
