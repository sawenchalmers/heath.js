// Where the design history card draws each option: positions scaled into the card's small view.
import type { DesignExplorationGraph } from '../../types/designExploration';

export const OVERVIEW_WIDTH = 168;
export const OVERVIEW_HEIGHT = 112;
const OVERVIEW_PADDING = 10;

export const projectDesignGraphOverview = (graph: DesignExplorationGraph) => {
  if (graph.nodes.length === 0) {
    return {
      projectedNodes: [],
      projectedEdges: [],
    };
  }

  const fallbackRadius = 110;
  const fallbackNodes = graph.nodes.map((node, index) => {
    const theta = graph.nodes.length === 1
      ? 0
      : (index / graph.nodes.length) * Math.PI * 2;
    return {
      ...node,
      x: node.position?.x ?? (graph.nodes.length === 1 ? 0 : Math.cos(theta) * fallbackRadius),
      y: node.position?.y ?? (graph.nodes.length === 1 ? 0 : Math.sin(theta) * fallbackRadius),
    };
  });

  const minX = Math.min(...fallbackNodes.map((node) => node.x));
  const maxX = Math.max(...fallbackNodes.map((node) => node.x));
  const minY = Math.min(...fallbackNodes.map((node) => node.y));
  const maxY = Math.max(...fallbackNodes.map((node) => node.y));
  const worldWidth = maxX - minX;
  const worldHeight = maxY - minY;
  const availableWidth = OVERVIEW_WIDTH - OVERVIEW_PADDING * 2;
  const availableHeight = OVERVIEW_HEIGHT - OVERVIEW_PADDING * 2;
  const scaleCandidates = [
    worldWidth > 1e-6 ? availableWidth / worldWidth : Number.POSITIVE_INFINITY,
    worldHeight > 1e-6 ? availableHeight / worldHeight : Number.POSITIVE_INFINITY,
  ].filter(Number.isFinite);
  const scale = scaleCandidates.length > 0 ? Math.min(...scaleCandidates) : 1;
  const offsetX = (OVERVIEW_WIDTH - worldWidth * scale) / 2;
  const offsetY = (OVERVIEW_HEIGHT - worldHeight * scale) / 2;

  const projectedNodes = fallbackNodes.map((node) => ({
    id: node.id,
    name: node.name,
    isCurrent: node.id === graph.currentNodeId,
    x: offsetX + (node.x - minX) * scale,
    y: offsetY + (node.y - minY) * scale,
  }));

  const nodeById = new Map(projectedNodes.map((node) => [node.id, node]));
  const projectedEdges = graph.edges.flatMap((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    return from && to ? [{ from, to }] : [];
  });

  return {
    projectedNodes,
    projectedEdges,
  };
};
