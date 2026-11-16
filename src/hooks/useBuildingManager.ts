import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { Point3D, BuildingData, BuildingConfig, BuildingModel, BuildingTooltipData, DEFAULT_BUILDING_COLOR } from '../types/building';
import { createShapeFromPoints, calculateCentroid, ensureCounterClockwise } from '../utils/geometry';
import { getThemeColorAsHex } from '../utils/themeColors';
import { WindowService } from '../services/WindowService';
import { BuildingService } from '../services/BuildingService';
import { logger } from '../utils/logger';
import { clampWwr, DEFAULT_FACADE_PARAMETERS } from '../services/FacadeGeometry';
import { calculateBuildingMetrics, validateFootprint } from '../utils/buildingMetrics';
import { buildingConfigFromModel, cloneBuildingModels } from '../utils/buildingModel';

interface BuildingStats {
  count: number;
  totalGrossFloorArea: number;
  totalFloors: number;
}

const mergeBuildingConfig = (building: BuildingData, config: BuildingConfig): BuildingData => ({
  ...building,
  floors: config.floors,
  floorHeight: config.floorHeight,
  color: config.color,
  name: config.name ?? building.name,
  description: config.description ?? building.description,
  window_to_wall_ratio: clampWwr(config.window_to_wall_ratio),
  window_overhang: config.window_overhang ?? false,
  window_overhang_depth: config.window_overhang_depth ?? 0,
  wall_construction: config.wall_construction,
  floor_construction: config.floor_construction,
  roof_construction: config.roof_construction,
  window_construction: config.window_construction,
  structural_system: config.structural_system,
  building_program: config.building_program,
  hvac_system: config.hvac_system,
  natural_ventilation: config.natural_ventilation
});

export const useBuildingManager = (
  scene: THREE.Scene | null, 
  camera: THREE.PerspectiveCamera | null,
  windowService: WindowService | null = null
) => {
  const [buildings, setBuildings] = useState<BuildingData[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(null);
  const [buildingTooltip, setBuildingTooltip] = useState<BuildingTooltipData | null>(null);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const buildingIdCounter = useRef(0);
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const buildingsRef = useRef<BuildingData[]>([]);
  const selectedBuildingIdRef = useRef<string | null>(null);
  const hoveredBuildingIdRef = useRef<string | null>(null);
  const selectedBuilding = useMemo(
    () => buildings.find(building => building.id === selectedBuildingId) ?? null,
    [buildings, selectedBuildingId]
  );
  const hoveredBuilding = useMemo(
    () => buildings.find(building => building.id === hoveredBuildingId) ?? null,
    [buildings, hoveredBuildingId]
  );
  // Keep buildingsRef in sync with buildings state
  useEffect(() => {
    buildingsRef.current = buildings;
    logger.debug('Buildings collection updated', { count: buildings.length, ids: buildings.map(b => b.id) }, 'BuildingManager');
  }, [buildings]);

  const refreshOutlineVisibility = useCallback((selectedId: string | null, hoveredId: string | null) => {
    buildingsRef.current.forEach(building => {
      if (building.footprintOutline) {
        building.footprintOutline.visible = building.id === selectedId || building.id === hoveredId;
      }
    });
  }, []);

  // Handle window resize for Line2 materials
  useEffect(() => {
    const handleResize = () => {
      if (!scene) return;
      
      // Update resolution for all Line2 materials in floor lines
      scene.traverse((child) => {
        if (child instanceof Line2 && child.userData.isFloorLine) {
          const material = child.material as LineMaterial;
          material.resolution.set(window.innerWidth, window.innerHeight);
        }
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [scene]);

  const createFootprintOutline = (points: Point3D[], scene: THREE.Scene): THREE.Mesh => {
    // Create a thin plane geometry that follows the building footprint
    const shape = new THREE.Shape();
    
    if (points.length > 0) {
      // Use points in original order with corrected coordinate mapping
      // Since we rotate the mesh by -PI/2 around X, we need to map coordinates correctly
      shape.moveTo(points[0].x, -points[0].z); // Negate Z to correct for rotation
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, -points[i].z); // Negate Z to correct for rotation
      }
      shape.lineTo(points[0].x, -points[0].z); // Close the shape
    }

    const geometry = new THREE.ShapeGeometry(shape);    const material = new THREE.MeshBasicMaterial({ 
      color: 0x2563EB,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    const footprint = new THREE.Mesh(geometry, material);
    footprint.rotation.x = -Math.PI / 2; // Lay flat on ground
    footprint.position.y = 0.05; // Slightly above ground
    footprint.visible = false;
    footprint.frustumCulled = false;
    
    scene.add(footprint);
    return footprint;
  };

  const createFloorLines = (points: Point3D[], floors: number, floorHeight: number, scene: THREE.Scene, buildingId: string): THREE.Group => {
    const floorGroup = new THREE.Group();
    floorGroup.userData = { buildingId, isFloorLines: true };    // Create lines for each floor level (starting from floor 1, not ground level)
    for (let floor = 1; floor < floors; floor++) {
      const yPosition = floor * floorHeight; // Floor lines at exact floor height
        // Create line geometry from building footprint points with slight inset to avoid z-fighting with facades
      const linePoints: THREE.Vector3[] = [];
      const insetDistance = -0.05; // Small inset to move lines away from building walls
      
      // Calculate centroid to determine inset direction
      const centroid = { x: 0, z: 0 };
      points.forEach(point => {
        centroid.x += point.x;
        centroid.z += point.z;
      });
      centroid.x /= points.length;
      centroid.z /= points.length;
      
      points.forEach(point => {
        // Calculate direction from point to centroid (inward direction)
        const dirX = centroid.x - point.x;
        const dirZ = centroid.z - point.z;
        const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
        
        // Normalize and apply inset
        const normalizedX = length > 0 ? dirX / length : 0;
        const normalizedZ = length > 0 ? dirZ / length : 0;
        
        const insetX = point.x + normalizedX * insetDistance;
        const insetZ = point.z + normalizedZ * insetDistance;
        
        linePoints.push(new THREE.Vector3(insetX, yPosition, insetZ));
      });
      // Close the line by adding the first point again (with same inset calculation)
      const firstPoint = points[0];
      const dirX = centroid.x - firstPoint.x;
      const dirZ = centroid.z - firstPoint.z;
      const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
      const normalizedX = length > 0 ? dirX / length : 0;
      const normalizedZ = length > 0 ? dirZ / length : 0;
      const insetX = firstPoint.x + normalizedX * insetDistance;
      const insetZ = firstPoint.z + normalizedZ * insetDistance;      linePoints.push(new THREE.Vector3(insetX, yPosition, insetZ));

      // Create thick line using Line2 for guaranteed width support
      const lineGeometry = new LineGeometry();
      const positions: number[] = [];
      
      // Convert Vector3 points to flat array of numbers
      linePoints.forEach(point => {
        positions.push(point.x, point.y, point.z);
      });
      
      lineGeometry.setPositions(positions);
      
      const lineMaterial = new LineMaterial({
        color: getThemeColorAsHex('--color-floor-lines', 0x888888),
        linewidth: 2, // This works reliably with Line2
        transparent: true,
        opacity: 0.9,
        depthWrite: true,
        depthTest: true
      });
      
      // Set resolution for the material (required for Line2)
      lineMaterial.resolution.set(window.innerWidth, window.innerHeight);

      const floorLine = new Line2(lineGeometry, lineMaterial);
      floorLine.userData = { buildingId, isFloorLine: true, floor };
      floorGroup.add(floorLine);
    }

    scene.add(floorGroup);
    return floorGroup;
  };
  const addBuilding = useCallback((mesh: THREE.Mesh, points: Point3D[], config: BuildingConfig) => {
    if (!scene) return;

    // Ensure points are in anti-clockwise order for consistent storage
    const normalizedPoints = ensureCounterClockwise(points);
    
    const metrics = calculateBuildingMetrics(normalizedPoints, config.floors, config.floorHeight);
    
    // Use existing building ID if it exists, otherwise create a new one
    const existingBuildingId = mesh.userData?.buildingId;
    let buildingId = existingBuildingId;
    if (!buildingId) {
      do { buildingId = `building_${++buildingIdCounter.current}`; }
      while (buildingsRef.current.some(building => building.id === buildingId));
    }
    
    // CRITICAL: Ensure proper userData configuration for raycasting
    mesh.userData = { 
      ...mesh.userData, // Preserve existing userData
      buildingId, 
      interactive: true, 
      clickable: true, 
      type: 'building',
      isBuilding: true // Add this flag
    };
    
    // Ensure mesh is properly configured for raycasting
    mesh.visible = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = true;
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
    
    // Ensure material is properly set up for interaction
    if (mesh.material) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.depthTest = true;
      material.transparent = false;
      material.side = THREE.FrontSide;
      material.needsUpdate = true;
    }

    const building: BuildingData = {
      id: buildingId,
      mesh,
      points: normalizedPoints,
      footprintArea: metrics.footprintArea,
      metrics,
      floors: config.floors,
      floorHeight: config.floorHeight,
      createdAt: new Date(),
      name: config.name ?? mesh.userData?.name ?? `Building ${buildingIdCounter.current}`,
      description: config.description ?? mesh.userData?.description ?? '',
      color: config.color ?? (mesh.material as THREE.MeshStandardMaterial).color.getHex(),
      footprintOutline: null,
      floorLines: null,
      window_to_wall_ratio: clampWwr(config.window_to_wall_ratio),
      window_overhang: config.window_overhang ?? false,
      window_overhang_depth: config.window_overhang_depth ?? 0,
      wall_construction: config.wall_construction,
      floor_construction: config.floor_construction,
      roof_construction: config.roof_construction,
      window_construction: config.window_construction,
      structural_system: config.structural_system,
      building_program: config.building_program,
      hvac_system: config.hvac_system,
      natural_ventilation: config.natural_ventilation
    };

    // Create footprint outline for selection with proper userData
    building.footprintOutline = createFootprintOutline(normalizedPoints, scene);
    building.footprintOutline.userData = { 
      buildingId, 
      isFootprint: true, 
      interactive: true,
      parentBuildingId: buildingId // Add parent reference
    };
    building.footprintOutline.visible = true;
    building.footprintOutline.frustumCulled = false;
    building.footprintOutline.matrixAutoUpdate = true;
    building.footprintOutline.updateMatrix();
    building.footprintOutline.updateMatrixWorld(true);

    // Create floor lines if building has more than 1 floor
    if (config.floors > 1) {
      building.floorLines = createFloorLines(normalizedPoints, config.floors, config.floorHeight, scene, buildingId);
    }    // Add windows to the building using WindowService (only if not already added)
    if (windowService && !windowService.getBuildingWindowCount(buildingId)) {
      windowService.addBuildingWindows(building, getWindowConfig());
      logger.debug('Added windows to building', { buildingId: building.id, windowCount: windowService.getBuildingWindowCount(building.id) }, 'BuildingManager');
    } else if (windowService && windowService.getBuildingWindowCount(buildingId) > 0) {
      logger.debug('Building already has windows', { buildingId: building.id, windowCount: windowService.getBuildingWindowCount(buildingId) }, 'BuildingManager');
    }

    // Ensure mesh is added to the scene and properly positioned
    if (!scene.children.includes(mesh)) {
      scene.add(mesh);
    }
    
    // Force scene update to ensure all matrices are current
    scene.updateMatrixWorld(true);

    // Debug: confirm mesh is in scene with proper configuration
    logger.debug('Adding building to scene', {
      id: building.id,
      meshUuid: mesh.uuid,
      meshVisible: mesh.visible,
      meshPosition: mesh.position,
      meshUserData: mesh.userData,
      footprintUuid: building.footprintOutline.uuid,
      footprintVisible: building.footprintOutline.visible,
      footprintUserData: building.footprintOutline.userData,
      floorLines: building.floorLines?.uuid,
      sceneChildren: scene.children.length,
      meshInScene: scene.children.includes(mesh),
      footprintInScene: scene.children.includes(building.footprintOutline)
    }, 'BuildingManager');

    // Update both state and ref synchronously
    const newBuildings = [...buildingsRef.current, building];
    buildingsRef.current = newBuildings;
    setBuildings(newBuildings);

    // Verify building was added
    logger.info('Building added successfully', {
      id: building.id,
      totalBuildings: newBuildings.length,
      buildingIds: newBuildings.map(b => b.id)
    }, 'BuildingManager');

    return building;
  }, [scene, windowService]);
  const applyBuildingVisual = useCallback((building: BuildingData, config: BuildingConfig): BuildingData => {
    if (!scene) return building;

    const visualOwner = buildingsRef.current.find(item => item.id === building.id) ?? building;
    const metrics = calculateBuildingMetrics(building.points, config.floors, config.floorHeight);
    const updatedBuilding = {
      ...mergeBuildingConfig(building, config),
      mesh: visualOwner.mesh,
      footprintArea: metrics.footprintArea,
      metrics,
    };
    const centroid = calculateCentroid(building.points);
    const shape = createShapeFromPoints(building.points, centroid);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: config.floors * config.floorHeight,
      bevelEnabled: false,
      steps: 1
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();

    visualOwner.mesh.geometry.dispose();
    visualOwner.mesh.geometry = geometry;
    visualOwner.mesh.position.set(centroid.x, 0, centroid.z);
    (visualOwner.mesh.material as THREE.MeshStandardMaterial).color.setHex(config.color);
    visualOwner.mesh.updateMatrix();
    visualOwner.mesh.updateMatrixWorld(true);

    if (visualOwner.footprintOutline) {
      scene.remove(visualOwner.footprintOutline);
      visualOwner.footprintOutline.geometry.dispose();
      (visualOwner.footprintOutline.material as THREE.Material).dispose();
    }
    updatedBuilding.footprintOutline = createFootprintOutline(building.points, scene);
    updatedBuilding.footprintOutline.userData = {
      buildingId: building.id,
      isFootprint: true,
      interactive: true,
      parentBuildingId: building.id,
    };
    updatedBuilding.footprintOutline.visible =
      selectedBuildingIdRef.current === building.id || hoveredBuildingIdRef.current === building.id;
    visualOwner.footprintOutline = updatedBuilding.footprintOutline;

    if (visualOwner.floorLines) {
      scene.remove(visualOwner.floorLines);
      visualOwner.floorLines.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) (child.material as THREE.Material).dispose();
      });
    }
    updatedBuilding.floorLines = config.floors > 1
      ? createFloorLines(building.points, config.floors, config.floorHeight, scene, building.id)
      : null;
    visualOwner.floorLines = updatedBuilding.floorLines;

    if (windowService) {
      windowService.updateBuildingWindows(updatedBuilding, getWindowConfig());
    }
    scene.updateMatrixWorld(true);
    return updatedBuilding;
  }, [scene, windowService]);

  const previewBuilding = useCallback((id: string, config: BuildingConfig, points?: Point3D[]) => {
    const canonical = buildingsRef.current.find(building => building.id === id);
    if (!canonical) return;
    applyBuildingVisual(points ? { ...canonical, points } : canonical, config);
  }, [applyBuildingVisual]);

  const restoreBuildingPreview = useCallback((id: string) => {
    const canonical = buildingsRef.current.find(building => building.id === id);
    if (!canonical) return;
    applyBuildingVisual(canonical, {
      floors: canonical.floors,
      floorHeight: canonical.floorHeight,
      color: canonical.color ?? getThemeColorAsHex('--color-building-default', DEFAULT_BUILDING_COLOR),
      name: canonical.name,
      description: canonical.description,
      window_to_wall_ratio: canonical.window_to_wall_ratio,
      window_overhang: canonical.window_overhang,
      window_overhang_depth: canonical.window_overhang_depth,
      wall_construction: canonical.wall_construction,
      floor_construction: canonical.floor_construction,
      roof_construction: canonical.roof_construction,
      window_construction: canonical.window_construction,
      structural_system: canonical.structural_system,
      building_program: canonical.building_program,
      hvac_system: canonical.hvac_system,
      natural_ventilation: canonical.natural_ventilation
    });
  }, [applyBuildingVisual]);

  const updateBuilding = useCallback((id: string, updates: Partial<BuildingData> & { config?: BuildingConfig }) => {
    const canonical = buildingsRef.current.find(building => building.id === id);
    if (!canonical) return undefined;

    const { config, ...dataUpdates } = updates;
    const updatedBuilding = config
      ? applyBuildingVisual({ ...canonical, ...dataUpdates }, config)
      : { ...canonical, ...dataUpdates };
    const nextBuildings = buildingsRef.current.map(building => building.id === id ? updatedBuilding : building);
    buildingsRef.current = nextBuildings;
    setBuildings(nextBuildings);
    return updatedBuilding;
  }, [applyBuildingVisual]);

  const getBuildings = useCallback((): BuildingData[] => [...buildingsRef.current], []);

  const selectBuilding = useCallback((building: BuildingData | null) => {
    // Selection is logical state. SceneAppearanceManager owns every material override.
    const buildingId = building?.id ?? null;
    selectedBuildingIdRef.current = buildingId;
    setSelectedBuildingId(buildingId);
    refreshOutlineVisibility(buildingId, hoveredBuildingIdRef.current);
  }, [refreshOutlineVisibility]);

  const hoverBuilding = useCallback((building: BuildingData | null) => {
    // Hover is deliberately material-free so it cannot corrupt editing/analysis snapshots.
    const buildingId = building?.id ?? null;
    hoveredBuildingIdRef.current = buildingId;
    setHoveredBuildingId(buildingId);
    if (scene) scene.userData.hoveredBuildingId = buildingId;
    refreshOutlineVisibility(selectedBuildingIdRef.current, buildingId);
  }, [scene, refreshOutlineVisibility]);

  const showBuildingTooltip = useCallback((building: BuildingData, screenPosition: { x: number; y: number }) => {
    setBuildingTooltip({
      building,
      position: screenPosition,
      visible: true
    });
  }, []);

  const hideBuildingTooltip = useCallback(() => {
    setBuildingTooltip(null);
  }, []);

  // Convert 3D world position to screen coordinates
  const worldToScreen = useCallback((worldPosition: THREE.Vector3, camera: THREE.PerspectiveCamera): { x: number; y: number } => {
    const vector = worldPosition.clone();
    vector.project(camera);
    
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (vector.y * -0.5 + 0.5) * window.innerHeight;
    
    return { x, y };
  }, []);
  const deleteBuilding = useCallback((id: string) => {
    if (!scene) return;

    // Hide tooltip if it's showing the building being deleted
    if (buildingTooltip?.building.id === id) {
      setBuildingTooltip(null);
    }

    setBuildings(prev => {
      const building = prev.find(b => b.id === id);
      if (building) {
        // Remove windows for this building
        if (windowService) {
          windowService.removeBuildingWindows(building.id);
        }

        // Remove main building mesh
        scene.remove(building.mesh);
        building.mesh.geometry.dispose();
        (building.mesh.material as THREE.Material).dispose();
        
        // Remove footprint outline
        if (building.footprintOutline) {
          scene.remove(building.footprintOutline);
          building.footprintOutline.geometry.dispose();
          (building.footprintOutline.material as THREE.Material).dispose();
        }

        // Remove floor lines
        if (building.floorLines) {
          scene.remove(building.floorLines);
          building.floorLines.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) (child.material as THREE.Material).dispose();
          });
        }

        // AGGRESSIVE CLEANUP: Remove ALL drawing elements that could be related
        const objectsToRemove = scene.children.filter(child => {
          const userData = child.userData || {};
          
          // Check for specific building ID associations
          const hasSpecificBuildingId = userData.buildingId === id || 
                                      userData.associatedBuildingId === id ||
                                      userData.targetBuildingId === id ||
                                      userData.parentBuildingId === id ||
                                      userData.drawingBuildingId === id ||
                                      userData.belongsToBuilding === id;

          // Check for drawing element types
          const isDrawingElement = userData.isDrawingElement || 
                                 userData.isFootprintLine || 
                                 userData.isFootprintPoint || 
                                 userData.isFootprintPreview || 
                                 userData.isPreviewLine || 
                                 userData.isPreviewPoint || 
                                 userData.isFloorLines || 
                                 userData.isFloorLine;

          // Check for generic drawing objects (Points, Lines that might be footprint elements)
          const objectMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
          const materialColor = objectMaterial && 'color' in objectMaterial
            ? (objectMaterial as THREE.Material & { color: THREE.Color }).color
            : null;
          const isGenericDrawingObject = (child instanceof THREE.Points && 
                                        (userData.type === 'footprint' || 
                                         userData.isPoint || 
                                         materialColor?.getHex() === getThemeColorAsHex('--color-drawing-footprint-point', 0xffff00))) || // Yellow points
                                       (child instanceof THREE.Line && 
                                        (userData.type === 'footprint' || 
                                         userData.isLine ||
                                         materialColor?.getHex() === getThemeColorAsHex('--color-drawing-footprint-line', 0x00ff00))); // Green lines

          // Check for any mesh that might be a preview
          const isPreviewMesh = child instanceof THREE.Mesh && 
                               (userData.type === 'footprint' || 
                                userData.isPreview ||
                                userData.isFootprint);

          return hasSpecificBuildingId || 
                 (isDrawingElement && userData.buildingId === id) ||
                 isGenericDrawingObject ||
                 isPreviewMesh;
        });

        logger.debug('Removing building objects', { 
          buildingId: id, 
          objectsCount: objectsToRemove.length,
          objects: objectsToRemove.map(obj => ({ 
            type: obj.constructor.name, 
            userData: obj.userData,
            uuid: obj.uuid 
          }))
        }, 'BuildingManager');

        objectsToRemove.forEach(obj => {
          scene.remove(obj);
          if (obj.geometry) {
            obj.geometry.dispose();
          }
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(mat => mat.dispose());
            } else {
              obj.material.dispose();
            }
          }
        });

        // NUCLEAR OPTION: If objects still remain, remove all Points and Lines without building associations
        const remainingDrawingObjects = scene.children.filter(child => 
          (child instanceof THREE.Points || child instanceof THREE.Line) &&
          !child.userData?.buildingId &&
          !child.userData?.isBuilding &&
          !child.userData?.isPermanent &&
          !child.userData?.isGrid &&
          !child.userData?.isHelper &&
          !child.userData?.isAxis &&
          child.userData?.type !== 'grid' &&
          child.userData?.type !== 'helper' &&
          child.userData?.type !== 'axis' &&
          !(child instanceof THREE.GridHelper) &&
          !(child instanceof THREE.AxesHelper)
        );

        if (remainingDrawingObjects.length > 0) {
          logger.debug('Removing orphaned drawing objects', { 
            objectsCount: remainingDrawingObjects.length 
          }, 'BuildingManager');
          remainingDrawingObjects.forEach(obj => {
            scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => mat.dispose());
              } else {
                obj.material.dispose();
              }
            }
          });
        }

        // FINAL CLEANUP: Remove ALL Points (spheres) that might be footprint markers, but preserve grid/helpers
        const allPoints = scene.children.filter(child => 
          child instanceof THREE.Points &&
          !child.userData?.isPermanent &&
          !child.userData?.isGrid &&
          !child.userData?.isHelper &&
          child.userData?.type !== 'grid' &&
          child.userData?.type !== 'helper'
        );
        logger.debug('Removing Points objects', { 
          pointsCount: allPoints.length 
        }, 'BuildingManager');
        allPoints.forEach(pointsObj => {
          scene.remove(pointsObj);
          if (pointsObj.geometry) pointsObj.geometry.dispose();
          if (pointsObj.material) {
            if (Array.isArray(pointsObj.material)) {
              pointsObj.material.forEach(mat => mat.dispose());
            } else {
              pointsObj.material.dispose();
            }
          }
        });
      }
      return prev.filter(b => b.id !== id);
    });

    // Update refs
    buildingsRef.current = buildingsRef.current.filter(b => b.id !== id);

    if (selectedBuildingIdRef.current === id) {
      selectedBuildingIdRef.current = null;
      setSelectedBuildingId(null);
    }
    if (hoveredBuildingIdRef.current === id) {
      hoveredBuildingIdRef.current = null;
      setHoveredBuildingId(null);
    }
  }, [scene, buildingTooltip, windowService]);  const clearAllBuildings = useCallback(() => {
    if (!scene) return;

    // Clear all windows at once - more efficient than removing per building
    if (windowService) {
      windowService.clearAllWindows();
    }

    buildingsRef.current.forEach(building => {
      scene.remove(building.mesh);
      building.mesh.geometry.dispose();
      (building.mesh.material as THREE.Material).dispose();
      
      // Remove footprint outline
      if (building.footprintOutline) {
        scene.remove(building.footprintOutline);
        building.footprintOutline.geometry.dispose();
        (building.footprintOutline.material as THREE.Material).dispose();
      }

      // Remove floor lines
      if (building.floorLines) {
        scene.remove(building.floorLines);
        building.floorLines.children.forEach(child => {
          // Use type assertions for THREE.js objects
          const obj = child as unknown as THREE.Mesh;
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(mat => mat.dispose());
            } else {
              (obj.material as THREE.Material).dispose();
            }
          }
        });
      }
    });

    // Only remove objects that are directly related to buildings
    // Avoid removing grid elements, axes, or other UI elements
    const objectsToRemove = scene.children.filter(child => {
      // Only remove objects explicitly marked as building-related
      return child.userData?.isBuilding || 
             child.userData?.buildingId ||
             child.userData?.isFootprintLine || 
             child.userData?.isFootprintPoint || 
             child.userData?.isPolygonFootprint ||
             child.userData?.isFloorLines ||
             child.userData?.isFloorLine;
      // Explicitly NOT removing all Lines and Points as they may be grid or other elements
    });

    objectsToRemove.forEach(obj => {
      scene.remove(obj);
      // Use type assertions for THREE.js objects
      const mesh = obj as unknown as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          (mesh.material as THREE.Material).dispose();
        }
      }
    });

    // Clear canonical refs before publishing the empty workspace.
    buildingsRef.current = [];
    selectedBuildingIdRef.current = null;
    hoveredBuildingIdRef.current = null;
    setBuildings([]);
    setSelectedBuildingId(null);
    setHoveredBuildingId(null);
    setBuildingTooltip(null);
    setWorkspaceRevision(previous => previous + 1);
  }, [scene, windowService]);

  const captureSnapshot = useCallback((): BuildingModel[] =>
    cloneBuildingModels(buildingsRef.current), []);

  const getBuilding = useCallback((buildingId: string): BuildingData | undefined =>
    buildingsRef.current.find(building => building.id === buildingId), []);

  const createBuilding = useCallback((points: Point3D[], config: BuildingConfig) => {
    if (!scene) return undefined;
    const error = validateFootprint(points, buildingsRef.current.map(building => building.points));
    if (error) throw new Error(error);
    const mesh = new BuildingService(scene).createBuilding(points, config);
    return addBuilding(mesh, points, config);
  }, [scene, addBuilding]);

  const replaceWorkspace = useCallback((models: readonly BuildingModel[]): BuildingData[] => {
    if (!scene) return [];

    const ids = new Set<string>();
    models.forEach((model, index) => {
      const error = validateFootprint(model.points, models.slice(0, index).map(other => other.points));
      if (error) throw new Error(error);
      if (ids.has(model.id)) throw new Error('Building IDs must be unique.');
      if (!Number.isInteger(model.floors) || model.floors < 1 || !Number.isFinite(model.floorHeight) || model.floorHeight <= 0) throw new Error('Invalid building height.');
      ids.add(model.id);
    });
    clearAllBuildings();
    const buildingService = new BuildingService(scene);

    models.forEach(model => {
      const config = buildingConfigFromModel(model);
      const mesh = buildingService.createBuilding(model.points, config);
      mesh.userData = {
        ...mesh.userData,
        buildingId: model.id,
        name: model.name,
        description: model.description,
      };
      const runtimeBuilding = addBuilding(mesh, model.points, config);
      if (runtimeBuilding) {
        runtimeBuilding.createdAt = new Date(model.createdAt);
      }
    });

    const rebuilt = [...buildingsRef.current];
    setBuildings(rebuilt);
    return rebuilt;
  }, [addBuilding, clearAllBuildings, scene]);

  const exportBuildings = useCallback(() => {
    const currentBuildings = buildingsRef.current;
    const exportData = {
      version: '2.1',
      createdAt: new Date().toISOString(),
      buildings: currentBuildings.map(building => ({
        id: building.id,
        name: building.name,
        description: building.description,
        points: building.points,
        footprintArea: building.metrics.footprintArea,
        grossFloorArea: building.metrics.grossFloorArea,
        floors: building.floors,
        floorHeight: building.floorHeight,
        color: building.color,
        totalHeight: building.floors * building.floorHeight,
        createdAt: building.createdAt.toISOString(),
        
        // Form properties
        window_to_wall_ratio: clampWwr(building.window_to_wall_ratio),
        window_overhang: building.window_overhang ?? false,
        window_overhang_depth: building.window_overhang_depth ?? 0,
        
        // Construction properties
        wall_construction: building.wall_construction ?? 'Default Wall',
        floor_construction: building.floor_construction ?? 'Default Floor',
        roof_construction: building.roof_construction ?? 'Default Roof',
        window_construction: building.window_construction ?? 'Default Window',

        // Structural properties
        structural_system: building.structural_system ?? 'Concrete',
        
        // Program properties
        building_program: building.building_program ?? 'Office',
        
        // HVAC properties
        hvac_system: building.hvac_system ?? 'Default HVAC',
        natural_ventilation: building.natural_ventilation ?? false
      }))
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `buildings_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }, []);

  // Handle building and footprint interaction via mouse events
  const handleBuildingInteraction = useCallback((event: MouseEvent, containerElement: HTMLElement) => {
    if (!scene || !camera) {
      logger.warn('Scene or camera not available for building interaction', {}, 'BuildingManager');
      return null;
    }
    // Too frequent
    console.log('Building interaction called', { 
      eventType: event.type, 
      buildingsCount: buildingsRef.current.length,
      sceneChildren: scene.children.length 
    });

    // Calculate mouse position
    const rect = containerElement.getBoundingClientRect();
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Too frequent
    console.log('Mouse position:', { x: mouse.current.x, y: mouse.current.y });

    // Update raycaster
    raycaster.current.setFromCamera(mouse.current, camera);

    // Get ALL meshes in the scene that could be interactive
    const interactiveMeshes: THREE.Mesh[] = [];
    
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Include building meshes and footprints
        if (child.userData.buildingId || 
            child.userData.isFootprint || 
            child.userData.isBuilding ||
            child.userData.interactive) {
          interactiveMeshes.push(child);
        }
      }
    });
    
    logger.debug('Interactive meshes found', { 
      meshesCount: interactiveMeshes.length,
      meshes: interactiveMeshes.map(m => ({ 
        uuid: m.uuid, 
        userData: m.userData,
        visible: m.visible,
        position: m.position
      }))
    }, 'BuildingManager');

    // Get intersections with ALL interactive meshes
    const intersects = raycaster.current.intersectObjects(interactiveMeshes, false);
    console.log('Intersections found:', intersects.length);

    if (intersects.length > 0) {
      // Sort by distance to get the closest intersection
      intersects.sort((a, b) => a.distance - b.distance);
      
      const intersectedMesh = intersects[0].object as THREE.Mesh;
      const intersectionPoint = intersects[0].point;

      console.log('Closest intersected mesh:', {
        uuid: intersectedMesh.uuid,
        userData: intersectedMesh.userData,
        position: intersectionPoint,
        distance: intersects[0].distance
      });

      // Get building ID from userData - handle both direct building meshes and footprints
      const buildingId = intersectedMesh.userData.buildingId || intersectedMesh.userData.parentBuildingId;
      
      if (buildingId) {
        // Find building in current state
        const building = buildingsRef.current.find(b => b.id === buildingId);
        console.log('Found building for ID:', buildingId, !!building);

        if (building) {
          containerElement.style.cursor = event.type === 'mousemove' ? 'pointer' : containerElement.style.cursor;
          if (event.type === 'click' || event.type === 'mouseup') {
            // Handle click - show tooltip
            console.log('Showing tooltip for building click:', building.id);
            const screenPos = worldToScreen(intersectionPoint, camera);
            showBuildingTooltip(building, screenPos);
            
            return {
              type: intersectedMesh.userData.isFootprint ? 'footprint' : 'building',
              building,
              action: 'tooltip'
            };
          } else if (event.type === 'mousemove') {
            // Handle hover - only if not already hovered
            if (building.id !== hoveredBuildingIdRef.current) {
              console.log('Hovering building:', building.id);
              hoverBuilding(building);
            }
            return {
              type: intersectedMesh.userData.isFootprint ? 'footprint' : 'building',
              building,
              action: 'hover'
            };
          }
        } else {
          console.warn('Building not found for ID:', buildingId);
        }
      } else {
        console.log('Intersected mesh has no buildingId or parentBuildingId');
      }
    } else {
      if (event.type === 'mousemove') containerElement.style.cursor = 'default';
      console.log('No intersections found');
      // No intersections - handle accordingly
      if (event.type === 'mousemove') {
        // Clear hover when not over any building
        if (hoveredBuildingIdRef.current) {
          console.log('Clearing hover');
          hoverBuilding(null);
        }
      } else if (event.type === 'click' || event.type === 'mouseup') {
        // Click on empty space - clear tooltip only
        setBuildingTooltip(null);
      }
    }

    return null;
  }, [scene, camera, hoverBuilding, showBuildingTooltip, worldToScreen]);

  const buildingStats: BuildingStats = useMemo(() => {
    const stats = {
      count: buildings.length,
      totalGrossFloorArea: buildings.reduce((sum, building) => sum + building.metrics.grossFloorArea, 0),
      totalFloors: buildings.reduce((sum, building) => sum + building.floors, 0)
    };
    
    logger.debug('Building stats recalculated', stats, 'BuildingManager');
    return stats;
  }, [buildings]);
  
  // Helper function to get window configuration from building data
  const getWindowConfig = () => ({
    windowWidth: DEFAULT_FACADE_PARAMETERS.windowWidth,
    windowHeight: DEFAULT_FACADE_PARAMETERS.windowHeight,
    windowSpacing: DEFAULT_FACADE_PARAMETERS.windowSpacing,
    offsetDistance: 0.1,
    frameThickness: 0.05
  });

  return {
    buildings,
    selectedBuilding,
    hoveredBuilding,
    buildingTooltip,
    addBuilding,
    updateBuilding,
    previewBuilding,
    restoreBuildingPreview,
    selectBuilding,
    hoverBuilding,
    deleteBuilding,
    clearAllBuildings,
    exportBuildings,
    getBuildings,
    getBuilding,
    captureSnapshot,
    replaceWorkspace,
    createBuilding,
    workspaceRevision,
    buildingStats,
    handleBuildingInteraction,
    showBuildingTooltip,
    hideBuildingTooltip
  };
};
