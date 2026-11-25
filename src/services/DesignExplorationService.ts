import { DaylightRunMetadata, DesignNode, DesignExplorationGraph, DesignMetrics, EnergyRunMetadata } from '../types/designExploration';
import { BuildingModel } from '../types/building';
import { DaylightRunSummary } from '../types/daylight';
import { cloneBuildingModels } from '../utils/buildingModel';

export class DesignExplorationService {
  private graph: DesignExplorationGraph = {
    nodes: [],
    edges: [],
    currentNodeId: undefined
  };

  private listeners: Array<(graph: DesignExplorationGraph) => void> = [];

  constructor() {
    // Don't load from storage - start fresh each session
    this.createBaselineNode();
  }

  // Create the initial baseline node
  private createBaselineNode() {
    if (this.graph.nodes.length === 0) {
      const baselineNode: DesignNode = {
        id: 'baseline',
        timestamp: new Date(),
        name: 'Baseline',
        buildings: [],
        metrics: this.generateBaseMetrics(),
        position: { x: 0, y: 0 }
      };
      this.graph.nodes.push(baselineNode);
      this.graph.currentNodeId = 'baseline';
    }
  }

  // Generate baseline metrics — GWP and energy are computed elsewhere; SDA starts at 0
  private generateBaseMetrics(): DesignMetrics {
    return {
      globalWarmingPotential: 0,
      spatialDaylightAutonomy: 0,
    };
  }

  // Save current configuration as a new node
  saveConfiguration(
    buildings: readonly BuildingModel[],
    name?: string,
    metricsOverride?: Partial<DesignMetrics>,
    daylightRun?: DaylightRunMetadata,
    daylightResultsByBuildingId?: Record<string, DaylightRunSummary>
  ): DesignNode {
    const nodeId = `node_${Date.now()}`;
    const parentId = this.graph.currentNodeId;
    const baseMetrics = this.generateBaseMetrics();
    
    const newNode: DesignNode = {
      id: nodeId,
      timestamp: new Date(),
      name: name || `Design ${this.graph.nodes.length}`,
      buildings: cloneBuildingModels(buildings),
      metrics: {
        ...baseMetrics,
        ...(metricsOverride || {})
      },
      daylightRun,
      daylightResultsByBuildingId: daylightResultsByBuildingId ? { ...daylightResultsByBuildingId } : undefined,
      parentId: parentId,
      position: this.calculateNodePosition(parentId)
    };

    this.graph.nodes.push(newNode);
    
    if (parentId) {
      this.graph.edges.push({ from: parentId, to: nodeId });
    }

    this.graph.currentNodeId = nodeId;
    this.notifyListeners();
    
    return this.cloneNode(newNode);
  }

  updateNode(
    nodeId: string,
    updates: {
      metrics?: Partial<DesignMetrics>;
      daylightRun?: DaylightRunMetadata;
      daylightResultsByBuildingId?: Record<string, DaylightRunSummary>;
      energyRun?: EnergyRunMetadata;
    }
  ): DesignNode | null {
    const node = this.graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return null;
    }

    if (updates.metrics) {
      node.metrics = {
        ...node.metrics,
        ...updates.metrics
      };
    }

    if (updates.daylightRun) {
      node.daylightRun = updates.daylightRun;
    }

    if (updates.daylightResultsByBuildingId) {
      node.daylightResultsByBuildingId = {
        ...(node.daylightResultsByBuildingId || {}),
        ...updates.daylightResultsByBuildingId
      };
    }

    if (updates.energyRun) {
      node.energyRun = { ...node.energyRun, ...updates.energyRun };
    }

    this.notifyListeners();
    return node;
  }

  updateNodeSnapshot(
    nodeId: string,
    updates: {
      /** Renames the node, e.g. the baseline when a session's first run is stored on it (#32 review). */
      name?: string;
      buildings?: readonly BuildingModel[];
      metrics?: Partial<DesignMetrics>;
      daylightRun?: DaylightRunMetadata;
      daylightResultsByBuildingId?: Record<string, DaylightRunSummary>;
      energyRun?: EnergyRunMetadata;
    }
  ): DesignNode | null {
    const node = this.graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return null;
    }

    if (updates.name) {
      node.name = updates.name;
    }

    if (updates.buildings) {
      node.buildings = cloneBuildingModels(updates.buildings);
    }

    if (updates.metrics) {
      node.metrics = {
        ...node.metrics,
        ...updates.metrics
      };
    }

    if (updates.daylightRun) {
      node.daylightRun = updates.daylightRun;
    }

    if (updates.daylightResultsByBuildingId) {
      node.daylightResultsByBuildingId = {
        ...(updates.daylightResultsByBuildingId || {})
      };
    }

    if (updates.energyRun) {
      node.energyRun = { ...node.energyRun, ...updates.energyRun };
    }

    this.notifyListeners();
    return node;
  }

  // Calculate position for new node in graph layout
  private calculateNodePosition(parentId?: string): { x: number; y: number } {
    if (!parentId) return { x: 0, y: 0 };
    
    const parent = this.graph.nodes.find(n => n.id === parentId);
    if (!parent || !parent.position) return { x: 0, y: 0 };

    // Simple layout: place children in a circle around parent
    const childrenCount = this.graph.edges.filter(e => e.from === parentId).length;
    const angle = (childrenCount * Math.PI * 2) / 8; // Max 8 children in circle
    const radius = 150;
    
    return {
      x: parent.position.x + Math.cos(angle) * radius,
      y: parent.position.y + Math.sin(angle) * radius
    };
  }

  private cloneNode(node: DesignNode): DesignNode {
    return {
      ...node,
      timestamp: new Date(node.timestamp),
      buildings: cloneBuildingModels(node.buildings),
      metrics: { ...node.metrics },
      daylightRun: node.daylightRun ? { ...node.daylightRun } : undefined,
      daylightResultsByBuildingId: node.daylightResultsByBuildingId
        ? { ...node.daylightResultsByBuildingId }
        : undefined,
      energyRun: node.energyRun ? { ...node.energyRun } : undefined,
      position: node.position ? { ...node.position } : undefined,
    };
  }

  // Reinstate a configuration
  reinstateConfiguration(nodeId: string): DesignNode | null {
    const node = this.graph.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    this.graph.currentNodeId = nodeId;
    // Don't persist to storage - graph resets on page reload
    this.notifyListeners();
    
    return this.cloneNode(node);
  }

  // Get current graph
  getGraph(): DesignExplorationGraph {
    return {
      nodes: this.graph.nodes.map(node => this.cloneNode(node)),
      edges: this.graph.edges.map(edge => ({ ...edge })),
      currentNodeId: this.graph.currentNodeId,
    };
  }

  // Get current node
  getCurrentNode(): DesignNode | null {
    if (!this.graph.currentNodeId) return null;
    const node = this.graph.nodes.find(n => n.id === this.graph.currentNodeId);
    return node ? this.cloneNode(node) : null;
  }

  // Add listener for graph changes
  addListener(callback: (graph: DesignExplorationGraph) => void) {
    this.listeners.push(callback);
  }

  // Remove listener
  removeListener(callback: (graph: DesignExplorationGraph) => void) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  // Notify all listeners
  private notifyListeners() {
    this.listeners.forEach(callback => callback(this.getGraph()));
  }
}

export const designExplorationService = new DesignExplorationService();
