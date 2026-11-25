import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { X, RotateCcw, Zap, Loader2 } from 'lucide-react';
import { DesignExplorationGraph, DesignNode } from '../types/designExploration';

/** A design option as d3's force layout sees it: the node plus the position the layout gives it. */
type GraphNode = DesignNode & d3.SimulationNodeDatum;
/** An edge between two options; the layout replaces the ids in source and target with the nodes. */
type GraphLink = d3.SimulationLinkDatum<GraphNode>;
import { designExplorationService } from '../services/DesignExplorationService';

interface DesignGraphDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onReinstateConfiguration: (nodeId: string) => void;
  onRunEnergySimulation?: (nodeId: string) => void;
  energySimAvailable?: boolean;
}

export const DesignGraphDialog: React.FC<DesignGraphDialogProps> = ({
  isOpen,
  onClose,
  onReinstateConfiguration,
  onRunEnergySimulation,
  energySimAvailable = false,
}) => {
  const GRAPH_WIDTH = 600;
  const GRAPH_HEIGHT = 400;

  const svgRef = useRef<SVGSVGElement>(null);
  const [graph, setGraph] = useState<DesignExplorationGraph>(designExplorationService.getGraph());
  const [selectedNode, setSelectedNode] = useState<DesignNode | null>(null);

  useEffect(() => {
    const handleGraphUpdate = (updatedGraph: DesignExplorationGraph) => {
      setGraph(updatedGraph);
    };

    designExplorationService.addListener(handleGraphUpdate);
    
    return () => {
      designExplorationService.removeListener(handleGraphUpdate);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !svgRef.current || graph.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = GRAPH_WIDTH;
    const height = GRAPH_HEIGHT;

    // Card dimensions
    const CW = 148; // card width
    const CH = 86;  // card height (name row + 3 stacked metric rows)
    const CHW = CW / 2;
    const CHH = CH / 2;
    // Collision radius ≈ half-diagonal + padding
    const collisionR = Math.sqrt(CHW * CHW + CHH * CHH) + 12;

    const fmt = (v: number | undefined, digits = 0) =>
      v != null ? v.toFixed(digits) : '—';

    // Transform edges to D3 link format
    const linkData: GraphLink[] = graph.edges.map(edge => ({
      source: edge.from,
      target: edge.to
    }));

    // Create force simulation
    const simulation = d3.forceSimulation<GraphNode>(graph.nodes as GraphNode[])
      .force("link", d3.forceLink<GraphNode, GraphLink>(linkData).id(d => d.id).distance(200))
      .force("charge", d3.forceManyBody().strength(-500))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(collisionR));

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Create container for zoomable content
    const container = svg.append("g");

    // Draw edges
    const linkElements = container.append("g")
      .selectAll("line")
      .data(linkData)
      .enter().append("line")
      .attr("stroke", "#334155")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.7);

    // Draw nodes
    const nodeElements = container.append("g")
      .selectAll("g")
      .data(graph.nodes)
      .enter().append("g")
      .style("cursor", "pointer")
      .on("click", (_event, d: DesignNode) => setSelectedNode(d));

    // Card background rect (re-selectable stroke for selected/current state)
    nodeElements.append("rect")
      .attr("x", -CHW)
      .attr("y", -CHH)
      .attr("width", CW)
      .attr("height", CH)
      .attr("rx", 8)
      .attr("fill", (d: DesignNode) =>
        d.id === graph.currentNodeId ? "#dcfce7" : "#ffffff")
      .attr("stroke", (d: DesignNode) =>
        d.id === selectedNode?.id ? "#3b82f6"
        : d.id === graph.currentNodeId ? "#22c55e"
        : "#cbd5e1")
      .attr("stroke-width", (d: DesignNode) =>
        d.id === selectedNode?.id || d.id === graph.currentNodeId ? 2 : 1);

    // Name row
    nodeElements.append("text")
      .text((d: DesignNode) => d.name.length > 18 ? d.name.slice(0, 17) + '…' : d.name)
      .attr("x", 0)
      .attr("y", -CHH + 16)
      .attr("text-anchor", "middle")
      .attr("fill", (d: DesignNode) => d.id === graph.currentNodeId ? "#166534" : "#0f172a")
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .style("pointer-events", "none");

    // Separator line
    nodeElements.append("line")
      .attr("x1", -CHW + 8).attr("x2", CHW - 8)
      .attr("y1", -CHH + 22).attr("y2", -CHH + 22)
      .attr("stroke", "#e2e8f0").attr("stroke-width", 1);

    // Metric badges via foreignObject
    nodeElements.each(function(d: DesignNode) {
      const g = d3.select(this);
      const fo = g.append("foreignObject")
        .attr("x", -CHW + 4)
        .attr("y", -CHH + 26)
        .attr("width", CW - 8)
        .attr("height", CH - 30);

      const sda   = d.metrics.spatialDaylightAutonomy;
      const enrg  = d.metrics.totalEnergy;
      const gwp   = d.metrics.globalWarmingPotential;

      const sdaStr  = sda  > 0 ? `${sda}%`              : '—';
      const enrgStr = enrg != null ? `${fmt(enrg)} kWh`  : '—';
      const gwpStr  = gwp  > 0 ? `${fmt(gwp)} kg/m²`     : '—';

      fo.append("xhtml:div")
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("gap", "3px")
        .style("height", "100%")
        .html(`
          <span title="Spatial daylight autonomy — higher is better" style="display:flex;align-items:center;gap:4px;background:#e0f2fe;color:#0c4a6e;font-size:9px;font-family:ui-sans-serif,system-ui,sans-serif;border-radius:4px;padding:2px 5px;white-space:nowrap">
            <span style="opacity:0.8">sDA</span><span style="margin-left:auto;font-weight:700">${sdaStr}</span>
          </span>
          <span title="Total energy demand (kWh/m²/year) — lower is better" style="display:flex;align-items:center;gap:4px;background:#dcfce7;color:#14532d;font-size:9px;font-family:ui-sans-serif,system-ui,sans-serif;border-radius:4px;padding:2px 5px;white-space:nowrap">
            <span style="opacity:0.8">Energy</span><span style="margin-left:auto;font-weight:700">${enrgStr}</span>
          </span>
          <span title="Global warming potential (kg CO₂e/m²) — lower is better" style="display:flex;align-items:center;gap:4px;background:#fff7ed;color:#9a3412;font-size:9px;font-family:ui-sans-serif,system-ui,sans-serif;border-radius:4px;padding:2px 5px;white-space:nowrap">
            <span style="opacity:0.8">GWP</span><span style="margin-left:auto;font-weight:700">${gwpStr}</span>
          </span>
        `);
    });

    // Update positions on simulation tick
    simulation.on("tick", () => {
      linkElements
        .attr("x1", d => (d.source as GraphNode).x ?? 0)
        .attr("y1", d => (d.source as GraphNode).y ?? 0)
        .attr("x2", d => (d.target as GraphNode).x ?? 0)
        .attr("y2", d => (d.target as GraphNode).y ?? 0);

      nodeElements.attr("transform", d => `translate(${(d as GraphNode).x},${(d as GraphNode).y})`);
    });

    return () => {
      simulation.stop();
    };

  }, [isOpen, graph, selectedNode]);

  const handleReinstateConfiguration = () => {
    if (selectedNode && selectedNode.id !== graph.currentNodeId) {
      onReinstateConfiguration(selectedNode.id);
      setSelectedNode(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-[16px] font-semibold text-slate-900">Compare design options</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-[28rem]">
          {/* Graph Canvas */}
          <div className="flex-1 relative">
            <svg
              ref={svgRef}
              width={GRAPH_WIDTH}
              height={GRAPH_HEIGHT}
              className="h-full w-full bg-slate-50"
            />
            <div className="absolute left-4 top-4 rounded-md border border-slate-200 bg-white/90 px-2.5 py-1 text-[11px] text-slate-500 shadow-sm">
              Use mouse wheel to zoom • Drag to pan • Click nodes to select
            </div>
          </div>

          {/* Node Details Panel */}
          <div className="flex min-w-0 w-[340px] shrink-0 flex-col border-l border-slate-200 bg-slate-50/60">
            {selectedNode ? (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <div className="space-y-2">
                  <h3 className="break-words text-[14px] font-semibold leading-tight text-slate-900">{selectedNode.name}</h3>
                  <p className="text-[11px] text-slate-500">
                    {selectedNode.timestamp.toLocaleDateString()} at {selectedNode.timestamp.toLocaleTimeString()}
                  </p>
                  {selectedNode.id === graph.currentNodeId && (
                    <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Current Design
                    </span>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                  <h4 className="text-[12px] font-semibold text-slate-800">Performance Metrics</h4>
                  
                  <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 items-start">
                    <span className="text-[11px] text-slate-500">Embodied Carbon:</span>
                    <span className="text-[11px] font-semibold text-amber-700 text-right break-words">
                      {selectedNode.metrics.globalWarmingPotential > 0
                        ? `${selectedNode.metrics.globalWarmingPotential.toFixed(1)} kg CO₂e/m²`
                        : <span className="text-slate-400 italic">not computed</span>
                      }
                    </span>

                    <span className="text-[11px] text-slate-500">Daylight Autonomy:</span>
                    <span className="text-[11px] font-semibold text-slate-800 text-right break-words">
                      {selectedNode.metrics.spatialDaylightAutonomy > 0
                        ? `${selectedNode.metrics.spatialDaylightAutonomy}%`
                        : <span className="text-slate-400 italic">not run</span>
                      }
                    </span>

                    {selectedNode.metrics.heatingDemand !== undefined && (
                      <>
                        <span className="text-[11px] text-slate-500">Heating Demand:</span>
                        <span className="text-[11px] font-semibold text-blue-700 text-right">
                          {selectedNode.metrics.heatingDemand.toFixed(1)} kWh/m²/yr
                        </span>
                      </>
                    )}
                    {selectedNode.metrics.coolingDemand !== undefined && (
                      <>
                        <span className="text-[11px] text-slate-500">Cooling Demand:</span>
                        <span className="text-[11px] font-semibold text-blue-700 text-right">
                          {selectedNode.metrics.coolingDemand.toFixed(1)} kWh/m²/yr
                        </span>
                      </>
                    )}
                    {selectedNode.metrics.totalEnergy !== undefined && (
                      <>
                        <span className="text-[11px] text-slate-500">Total Energy:</span>
                        <span className="text-[11px] font-semibold text-blue-700 text-right">
                          {selectedNode.metrics.totalEnergy.toFixed(1)} kWh/m²/yr
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {selectedNode.daylightRun && (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <h4 className="text-[12px] font-semibold text-slate-800">Daylight Run</h4>

                    <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 items-start">
                      <span className="text-[11px] text-slate-500">Status:</span>
                      <span className="text-[11px] font-semibold text-slate-800 capitalize text-right break-words">{selectedNode.daylightRun.status}</span>

                      {selectedNode.daylightRun.sensorCount !== undefined && (
                        <>
                          <span className="text-[11px] text-slate-500">Sensors:</span>
                          <span className="text-[11px] font-semibold text-slate-800 text-right">{selectedNode.daylightRun.sensorCount}</span>
                        </>
                      )}

                      {selectedNode.daylightRun.meanDF !== undefined && (
                        <>
                          <span className="text-[11px] text-slate-500">Mean DF:</span>
                          <span className="text-[11px] font-semibold text-slate-800 text-right">{selectedNode.daylightRun.meanDF.toFixed(2)}%</span>
                        </>
                      )}
                    </div>

                    {selectedNode.daylightRun.error && (
                      <div className="max-h-28 overflow-y-auto break-words rounded border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">
                        {selectedNode.daylightRun.error}
                      </div>
                    )}
                  </div>
                )}

                {/* Energy Simulation card */}
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[12px] font-semibold text-slate-800">Energy Simulation</h4>
                    {(!selectedNode.energyRun || selectedNode.energyRun.status === 'idle' || selectedNode.energyRun.status === 'failed') && (
                      <button
                        onClick={() => onRunEnergySimulation?.(selectedNode.id)}
                        disabled={!energySimAvailable}
                        className="flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500"
                        title={energySimAvailable ? 'Run EnergyPlus via EPSM' : 'Energy simulation backend not yet available'}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        <span>Run</span>
                      </button>
                    )}
                  </div>

                  {!selectedNode.energyRun || selectedNode.energyRun.status === 'idle' ? (
                    <p className="text-[11px] text-slate-500">
                      {energySimAvailable
                        ? 'Click Run to submit an EnergyPlus simulation via EPSM.'
                        : 'Energy simulation backend is not yet available.'}
                    </p>
                  ) : selectedNode.energyRun.status === 'queued' || selectedNode.energyRun.status === 'running' ? (
                    <div className="flex items-center gap-2 text-[11px] font-medium text-blue-700">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="capitalize">{selectedNode.energyRun.stage ?? selectedNode.energyRun.status}…</span>
                    </div>
                  ) : selectedNode.energyRun.status === 'failed' ? (
                    <div className="rounded border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">
                      {selectedNode.energyRun.error ?? 'Simulation failed'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 items-start">
                      <span className="text-[11px] text-slate-500">Status:</span>
                      <span className="text-[11px] font-semibold text-slate-800 capitalize text-right break-words">{selectedNode.energyRun.status}</span>
                      <span className="text-[11px] text-slate-500">Building:</span>
                      <span className="text-[11px] font-semibold text-slate-800 text-right break-words">
                        {(() => {
                          const simulated = selectedNode.buildings.find(building => building.id === selectedNode.energyRun?.buildingId);
                          return simulated ? simulated.name || 'Untitled building' : 'Not recorded';
                        })()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                  <h4 className="text-[12px] font-semibold text-slate-800">Snapshot</h4>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Buildings:</span>
                    <span className="font-semibold text-slate-800">{selectedNode.buildings.length}</span>
                  </div>
                </div>

                {selectedNode.id !== graph.currentNodeId && (
                  <button
                    onClick={handleReinstateConfiguration}
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Reinstate Configuration</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-16 px-5 text-center text-slate-500">
                <div className="mb-2 text-[14px] font-semibold text-slate-700">Select a node</div>
                <p className="text-[11px]">Click a node in the graph to view details and metrics.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-3">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{graph.nodes.length} {graph.nodes.length === 1 ? 'design option' : 'design options'} saved</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-4 rounded border border-emerald-500 bg-emerald-100"></div>
                <span>Current</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-4 rounded border border-slate-300 bg-white"></div>
                <span>Saved</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-4 rounded border border-blue-500 bg-white"></div>
                <span>Selected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
