import { useState, useRef, useCallback, useEffect } from 'react';
import { Point3D, DrawingState, BuildingConfig, BuildingData } from '../types/building';
import { DrawingService } from '../services/DrawingService';
import { BuildingService } from '../services/BuildingService';
import { TextService } from '../services/TextService';
import { getGroundIntersection, calculateDistance, snapToGrid } from '../utils/geometry';
import { logger } from '../utils/logger';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import * as THREE from 'three';

const SNAP_DISTANCE = 3.5; // Increased for easier snapping
const SNAP_PREVIEW_DISTANCE = 6.0; // Show snap preview at larger distance
const GRID_SIZE = 1.0;
const MOUSE_MOVE_THROTTLE = 8; // Smooth preview updates

// Direct preview state management - bypassing React state for immediate updates
interface PreviewState {
  marker: THREE.Mesh | null;
  line: (THREE.Line | Line2) | null;
  building: THREE.Mesh | null;
  lengthLabel: THREE.Sprite | null; // Add this line
  lastPosition: Point3D | null;
  lastUpdateTime: number;
  isUpdating: boolean; // Prevent overlapping updates
}

export const useDrawing = (
  scene: THREE.Scene | null,
  camera: THREE.Camera | null,
  groundPlane: THREE.Mesh | null,
  snapToGridEnabled: boolean = false,
  buildingConfig: BuildingConfig,
  addBuilding: (mesh: THREE.Mesh, points: Point3D[], config: BuildingConfig) => BuildingData | undefined
) => {
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    points: [],
    markers: [],  
    lines: [],
    lengthLabels: [], // Add this line
    previewMarker: null,
    previewLine: null,
    previewBuilding: null,
    previewLengthLabel: null, // Add this line
    snapToStart: false
  });

  const drawingServiceRef = useRef<DrawingService | null>(null);
  const buildingServiceRef = useRef<BuildingService | null>(null);
  const textServiceRef = useRef<TextService | null>(null);
  const mouseRef = useRef(new THREE.Vector2());
  
  // Enhanced preview state with position tracking and timing
  const previewStateRef = useRef<PreviewState>({
    marker: null,
    line: null,
    building: null,
    lengthLabel: null,
    lastPosition: null,
    lastUpdateTime: 0,
    isUpdating: false
  });

  // Initialize services when scene is available - use useEffect for proper timing
  useEffect(() => {
    if (scene && !drawingServiceRef.current) {
      logger.debug('Initializing drawing services', {}, 'DrawingHook');
      try {
        drawingServiceRef.current = new DrawingService(scene);
        buildingServiceRef.current = new BuildingService(scene);
        textServiceRef.current = new TextService(scene);
        
        // Set initial resolution for Line2 materials
        if (drawingServiceRef.current) {
          drawingServiceRef.current.updateResolution(window.innerWidth, window.innerHeight);
        }
        
        logger.debug('Drawing services initialized successfully', {}, 'DrawingHook');
        
        // Validate services immediately after creation
        if (!drawingServiceRef.current || !buildingServiceRef.current || !textServiceRef.current) {
          throw new Error('Service initialization failed - one or more services are null');
        }
      } catch (error) {
        logger.error('Failed to initialize drawing services', { error: error instanceof Error ? error.message : String(error) }, 'DrawingHook');
        // Clear refs if initialization failed
        drawingServiceRef.current = null;
        buildingServiceRef.current = null;
        textServiceRef.current = null;
      }
    }
  }, [scene]);

  // Add a separate effect to handle groundPlane availability
  useEffect(() => {
    if (groundPlane) {
      logger.info('Ground plane is now available for drawing', {}, 'DrawingHook');
    }
  }, [groundPlane]);

  // Handle window resize for Line2 materials
  useEffect(() => {
    const handleResize = () => {
      if (drawingServiceRef.current) {
        drawingServiceRef.current.updateResolution(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Enhanced validation function with detailed logging
  const validateServices = useCallback(() => {
    if (!scene) {
      logger.warn('Scene not available for drawing', {}, 'DrawingHook');
      return false;
    }
    if (!camera) {
      logger.warn('Camera not available for drawing', {}, 'DrawingHook');
      return false;
    }
    if (!groundPlane) {
      logger.warn('Ground plane not available for drawing', {}, 'DrawingHook');
      return false;
    }
    if (!drawingServiceRef.current) {
      logger.warn('DrawingService not initialized', {}, 'DrawingHook');
      return false;
    }
    if (!buildingServiceRef.current) {
      logger.warn('BuildingService not initialized', {}, 'DrawingHook');
      return false;
    }
    if (!textServiceRef.current) {
      logger.warn('TextService not initialized', {}, 'DrawingHook');
      return false;
    }
    return true;
  }, [scene, camera, groundPlane]);

  // Enhanced preview clearing with validation
  const clearAllPreviews = useCallback(() => {
    // Only validate scene and services for clearing - groundPlane not required for cleanup
    if (!scene || !drawingServiceRef.current || !buildingServiceRef.current || !textServiceRef.current) return;

    const preview = previewStateRef.current;
    
    // Clear in reverse order to avoid dependencies
    if (preview.building) {
      try {
        buildingServiceRef.current.clearPreviewBuilding(preview.building);
      } catch (error) {
        logger.warn('Error clearing preview building', { error: error instanceof Error ? error.message : String(error) }, 'DrawingHook');
        // Force remove from scene even if disposal fails
        scene.remove(preview.building);
      }
      preview.building = null;
    }
    
    if (preview.lengthLabel) {
      try {
        textServiceRef.current.clearLengthLabel(preview.lengthLabel);
      } catch (error) {
        console.warn('Error clearing length label:', error);
        scene.remove(preview.lengthLabel);
      }
      preview.lengthLabel = null;
    }
    
    if (preview.line) {
      try {
        drawingServiceRef.current.clearPreviewLine(preview.line);
      } catch (error) {
        console.warn('Error clearing preview line:', error);
        scene.remove(preview.line);
      }
      preview.line = null;
    }
    
    if (preview.marker) {
      try {
        drawingServiceRef.current.clearPreviewMarker(preview.marker);
      } catch (error) {
        console.warn('Error clearing preview marker:', error);
        scene.remove(preview.marker);
      }
      preview.marker = null;
    }

    // Reset position tracking
    preview.lastPosition = null;
    preview.isUpdating = false;

    // Minimal React state update - only when actually clearing
    setDrawingState(prev => prev.previewMarker || prev.previewLine || prev.previewBuilding || prev.previewLengthLabel ? ({
      ...prev,
      previewMarker: null,
      previewLine: null,
      previewBuilding: null,
      previewLengthLabel: null,
      snapToStart: false
    }) : prev);
  }, [scene]);

  const clearAllDrawingElements = useCallback(() => {
    if (!drawingServiceRef.current || !buildingServiceRef.current || !textServiceRef.current) return;

    // Clear all previews first
    clearAllPreviews();

    // Clear all drawing elements using the service
    drawingServiceRef.current.clearAllDrawingElements();
    
    // Clear all length labels
    setDrawingState(prev => {
      if (prev.lengthLabels.length > 0) {
        textServiceRef.current?.clearAllLabels(prev.lengthLabels);
      }
      return prev;
    });

    // Reset all service states
    if (drawingServiceRef.current.resetPreviewState) {
      drawingServiceRef.current.resetPreviewState();
    }
    if (buildingServiceRef.current.resetPreviewState) {
      buildingServiceRef.current.resetPreviewState();
    }
    if (textServiceRef.current.resetPreviewState) {
      textServiceRef.current.resetPreviewState();
    }

    // Reset drawing state completely
    setDrawingState({
      isDrawing: false,
      points: [],
      markers: [],
      lines: [],
      lengthLabels: [],
      previewMarker: null,
      previewLine: null,
      previewBuilding: null,
      previewLengthLabel: null,
      snapToStart: false
    });
  }, [clearAllPreviews]);

  // Cursor management effect with different states
  useEffect(() => {
    if (drawingState.isDrawing) {
      if (drawingState.snapToStart && drawingState.points.length > 2) {
        // Special cursor when snapping to start (close polygon) - use alias cursor for "close/finish"
        document.body.style.cursor = 'alias';
      } else {
        // Crosshair cursor when actively drawing
        document.body.style.cursor = 'crosshair';
      }
    } else {
      // Reset to default cursor when not drawing
      document.body.style.cursor = 'default';
    }

    // Cleanup function to reset cursor when component unmounts
    return () => {
      document.body.style.cursor = 'default';
    };
  }, [drawingState.isDrawing, drawingState.snapToStart, drawingState.points.length]);

  const startDrawing = useCallback(() => {
    // If already drawing, first clean up the current drawing session
    if (drawingState.isDrawing) {
      // Force complete cleanup before starting new drawing session
      clearAllDrawingElements();
    }
    
    // Force complete cleanup before starting new drawing session
    clearAllPreviews();
    
    // Reset service states to ensure clean preview creation
    try {
      if (drawingServiceRef.current?.resetPreviewState) {
        drawingServiceRef.current.resetPreviewState();
      }
      if (buildingServiceRef.current?.resetPreviewState) {
        buildingServiceRef.current.resetPreviewState();
      }
      if (textServiceRef.current?.resetPreviewState) {
        textServiceRef.current.resetPreviewState();
      }
    } catch (error) {
      console.warn('Error resetting service states on start:', error);
    }

    // Ensure preview state is completely fresh
    previewStateRef.current = {
      marker: null,
      line: null,
      building: null,
      lengthLabel: null,
      lastPosition: null,
      lastUpdateTime: 0,
      isUpdating: false
    };
    
    setDrawingState({
      isDrawing: true,
      points: [],
      markers: [],
      lines: [],
      lengthLabels: [],
      previewMarker: null,
      previewLine: null,
      previewBuilding: null,
      previewLengthLabel: null,
      snapToStart: false
    });

    // Remove frequent debug log - too noisy for production
    // logger.debug('Drawing started with fresh service states', {}, 'DrawingHook');
  }, [drawingState.isDrawing, clearAllPreviews, clearAllDrawingElements]);

  // Declare finishBuilding BEFORE addPoint to avoid circular dependency
  const finishBuilding = useCallback(() => {
    if (!drawingServiceRef.current || !buildingServiceRef.current || !textServiceRef.current || !scene) return;

    logger.info('Building creation started', { pointsCount: drawingState.points.length }, 'DrawingHook');

    // Clear all previews FIRST before any other operations
    clearAllPreviews();

    // Only create building if we have enough points
    if (drawingState.points.length >= 3) {
      try {
        // Create the building mesh with proper shadow configuration
        const buildingMesh = buildingServiceRef.current.createBuilding(drawingState.points, buildingConfig);
        
        // Ensure the mesh is properly configured for interaction AND shadows
        buildingMesh.userData.interactive = true;
        buildingMesh.userData.clickable = true;
        buildingMesh.castShadow = true;
        buildingMesh.receiveShadow = true;
        
        console.log('Building mesh created with shadow settings:', {
          castShadow: buildingMesh.castShadow,
          receiveShadow: buildingMesh.receiveShadow,
          material: buildingMesh.material.constructor.name,
          position: buildingMesh.position
        });
        
        // Add the building to the building manager
        const building = addBuilding(
          buildingMesh,
          drawingState.points,
          buildingConfig
        );

        if (!building) {
          logger.error('Failed to add building to building manager', {}, 'DrawingHook');
          return;
        }

        logger.info('Building created and added', { buildingId: building.id }, 'DrawingHook');

        // IMPORTANT: Associate all current drawing elements with this building ID
        const drawingElements = [...drawingState.markers, ...drawingState.lines, ...drawingState.lengthLabels];
        drawingElements.forEach(element => {
          if (element.userData) {
            element.userData.buildingId = building.id;
            element.userData.belongsToBuilding = building.id;
          }
        });

      } catch (error) {
        logger.error('Error creating building', { error: error instanceof Error ? error.message : String(error) }, 'DrawingHook');
      }
    }

    // Clear all existing drawing elements from scene before resetting state
    drawingServiceRef.current.clearMarkers(drawingState.markers);
    drawingServiceRef.current.clearLines(drawingState.lines);
    textServiceRef.current.clearAllLabels(drawingState.lengthLabels);

    // CRITICAL: Reset all service internal states to ensure clean slate for next building
    try {
      if (drawingServiceRef.current.resetPreviewState) {
        drawingServiceRef.current.resetPreviewState();
      }
      if (buildingServiceRef.current.resetPreviewState) {
        buildingServiceRef.current.resetPreviewState();
      }
      if (textServiceRef.current.resetPreviewState) {
        textServiceRef.current.resetPreviewState();
      }
    } catch (error) {
      console.warn('Error resetting service states:', error);
    }

    // Force complete reset of preview state reference - ensure no stale objects
    previewStateRef.current = {
      marker: null,
      line: null,
      building: null,
      lengthLabel: null,
      lastPosition: null,
      lastUpdateTime: 0,
      isUpdating: false
    };

    // Reset drawing state but keep services ready
    setDrawingState({
      isDrawing: false,
      points: [],
      markers: [],
      lines: [],
      lengthLabels: [],
      previewMarker: null,
      previewLine: null,
      previewBuilding: null,
      previewLengthLabel: null,
      snapToStart: false
    });

    console.log('finishBuilding completed, services reset for next drawing session');
  }, [drawingState.points, drawingState.markers, drawingState.lines, drawingState.lengthLabels, buildingConfig, scene, clearAllPreviews, addBuilding]);

  const addPoint = useCallback((event: MouseEvent, containerElement: HTMLElement) => {
    if (!validateServices()) {
      console.warn('Cannot add point - services not ready');
      return;
    }

    if (!drawingState.isDrawing || !camera || !groundPlane || !drawingServiceRef.current || !textServiceRef.current) {
      return;
    }

    // Calculate mouse coordinates
    const rect = containerElement.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Get intersection with ground
    let intersection = getGroundIntersection(mouseRef.current, camera, groundPlane);
    if (!intersection) {
      return;
    }

    // Apply grid snapping if enabled
    if (snapToGridEnabled) {
      intersection = snapToGrid(intersection, GRID_SIZE);
    }

    // Snap to start point if close enough
    const points = drawingState.points;
    if (points.length > 2) {
      const startPoint = points[0];
      const distance = calculateDistance(intersection, startPoint);
      if (distance < SNAP_DISTANCE) {
        intersection.x = startPoint.x;
        intersection.z = startPoint.z;
        // Finish building if snapping to start
        finishBuilding();
        return;
      }
    }

    // IMMEDIATELY clear all previews before adding point
    clearAllPreviews();

    // Create point marker
    const marker = drawingServiceRef.current.createPointMarker(intersection);

    // Create line to previous point if exists
    let line: (THREE.Line | Line2) | null = null;
    let lengthLabel: THREE.Sprite | null = null;
    if (drawingState.points.length > 0) {
      try {
        const previousPoint = drawingState.points[drawingState.points.length - 1];
        line = drawingServiceRef.current.createLine(previousPoint, intersection);
        
        // Create length label for the line
        const distance = calculateDistance(previousPoint, intersection);
        const midPoint = new THREE.Vector3(
          (previousPoint.x + intersection.x) / 2,
          Math.max(previousPoint.y, intersection.y) + 1.5,
          (previousPoint.z + intersection.z) / 2
        );
        const distanceText = textServiceRef.current.formatDistance(distance);
        lengthLabel = textServiceRef.current.createLengthLabel(distanceText, midPoint);
      } catch (error) {
        console.error('Error creating line:', error);
      }
    }

    setDrawingState(prev => ({
      ...prev,
      points: [...prev.points, intersection],
      markers: marker ? [...prev.markers, marker] : prev.markers,
      lines: line ? [...prev.lines, line] : prev.lines,
      lengthLabels: lengthLabel ? [...prev.lengthLabels, lengthLabel] : prev.lengthLabels,
      previewMarker: null,
      previewLine: null,
      previewBuilding: null,
      previewLengthLabel: null,
      snapToStart: false
    }));
  }, [drawingState.isDrawing, drawingState.points, camera, groundPlane, snapToGridEnabled, finishBuilding, clearAllPreviews, validateServices]);

  const stopDrawing = useCallback(() => {
    if (!drawingServiceRef.current || !buildingServiceRef.current || !textServiceRef.current) return;

    // Clear all previews first
    clearAllPreviews();

    setDrawingState(prev => {
      // Clear all existing elements from scene
      drawingServiceRef.current?.clearMarkers(prev.markers);
      drawingServiceRef.current?.clearLines(prev.lines);
      textServiceRef.current?.clearAllLabels(prev.lengthLabels);

      return {
        isDrawing: false,
        points: [],
        markers: [],
        lines: [],
        lengthLabels: [],
        previewMarker: null,
        previewLine: null,
        previewBuilding: null,
        previewLengthLabel: null,
        snapToStart: false
      };
    });
  }, [clearAllPreviews]);

  const undoLastPoint = useCallback(() => {
    if (!drawingServiceRef.current || !textServiceRef.current || drawingState.points.length === 0) return;

    // Clear previews immediately first
    clearAllPreviews();

    const newPoints = [...drawingState.points];
    const newMarkers = [...drawingState.markers];
    const newLines = [...drawingState.lines];
    const newLengthLabels = [...drawingState.lengthLabels];

    // Remove last point
    newPoints.pop();
    
    // Remove last marker
    const lastMarker = newMarkers.pop();
    if (lastMarker) {
      drawingServiceRef.current.clearMarkers([lastMarker]);
    }

    // Remove last line
    const lastLine = newLines.pop();
    if (lastLine) {
      drawingServiceRef.current.clearLines([lastLine]);
    }

    // Remove last length label
    const lastLengthLabel = newLengthLabels.pop();
    if (lastLengthLabel) {
      textServiceRef.current.clearLengthLabel(lastLengthLabel);
    }

    setDrawingState(prev => ({
      ...prev,
      points: newPoints,
      markers: newMarkers,
      lines: newLines,
      lengthLabels: newLengthLabels,
      previewMarker: null,
      previewLine: null,
      previewBuilding: null,
      previewLengthLabel: null,
      snapToStart: false
    }));
  }, [drawingState.points, drawingState.markers, drawingState.lines, drawingState.lengthLabels, clearAllPreviews]);

  // Enhanced updatePreview with better service validation and error recovery
  const updatePreview = useCallback((event: MouseEvent, containerElement: HTMLElement) => {
    // Early validation with detailed logging
    if (!validateServices()) {
      // Remove frequent debug logs - too noisy for production
      return;
    }

    // Additional check for drawing state
    if (!drawingState.isDrawing) {
      // Remove frequent debug logs
      return;
    }

    const now = performance.now();
    const preview = previewStateRef.current;
    
    // Standard throttling for smooth updates
    const throttleMs = MOUSE_MOVE_THROTTLE;
    
    // Prevent overlapping updates and throttle for performance
    if (preview.isUpdating || now - preview.lastUpdateTime < throttleMs) {
      return;
    }
    
    preview.isUpdating = true;
    preview.lastUpdateTime = now;

    // Use direct animation frame for immediate response
    requestAnimationFrame(() => {
      // Re-validate services inside the animation frame
      if (!drawingState.isDrawing || !camera || !groundPlane || 
          !drawingServiceRef.current || !buildingServiceRef.current || !textServiceRef.current) {
        preview.isUpdating = false;
        console.debug('updatePreview: Services became unavailable during execution');
        return;
      }

      try {
        // Calculate mouse coordinates
        const rect = containerElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          preview.isUpdating = false;
          return;
        }

        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Get ground intersection
        const intersection = getGroundIntersection(mouseRef.current, camera, groundPlane);
        if (!intersection) {
          preview.isUpdating = false;
          return;
        }

        // Apply snap to grid if enabled
        const snappedPosition = snapToGridEnabled ? snapToGrid(intersection, GRID_SIZE) : intersection;

        // Check for snap to start point with preview distance
        const points = drawingState.points;
        let snapToStart = false;
        let snapActive = false;
        let snapPreviewActive = false;
        
        if (points.length > 2) {
          const startPoint = points[0];
          const distance = calculateDistance(snappedPosition, startPoint);
          
          // Show snap preview at larger distance
          if (distance < SNAP_PREVIEW_DISTANCE) {
            snapPreviewActive = true;
            
            // Actually snap at closer distance
            if (distance < SNAP_DISTANCE) {
              snappedPosition.x = startPoint.x;
              snappedPosition.z = startPoint.z;
              snapToStart = true;
              snapActive = true;
            }
          }
        }

        // Update preview marker with forced recreation if needed
        try {
          if (snapPreviewActive && points.length > 2) {
            // Show yellow snap marker when near the start point
            if (preview.marker && !preview.marker.userData.isSnapPoint) {
              // Replace regular preview marker with snap marker
              drawingServiceRef.current.clearPreviewMarker(preview.marker);
              preview.marker = null;
            }
            
            // Force recreation if marker is null or invalid
            if (!preview.marker || !preview.marker.parent) {
              preview.marker = drawingServiceRef.current.createSnapPreviewMarker(snapActive ? snappedPosition : {
                x: points[0].x,
                y: snappedPosition.y,
                z: points[0].z
              });
              console.debug('Created/recreated snap preview marker');
            } else {
              drawingServiceRef.current.updatePreviewMarker(preview.marker, snapActive ? snappedPosition : {
                x: points[0].x,
                y: snappedPosition.y,
                z: points[0].z
              });
            }
          } else {
            // Show regular green preview marker
            if (preview.marker && preview.marker.userData.isSnapPoint) {
              // Replace snap marker with regular preview marker
              drawingServiceRef.current.clearPreviewMarker(preview.marker);
              preview.marker = null;
            }
            
            // Force recreation if marker is null or invalid
            if (!preview.marker || !preview.marker.parent) {
              preview.marker = drawingServiceRef.current.createPreviewMarker(snappedPosition);
              console.debug('Created/recreated regular preview marker');
            } else {
              drawingServiceRef.current.updatePreviewMarker(preview.marker, snappedPosition);
            }
          }
        } catch (markerError) {
          console.error('Error updating preview marker:', markerError);
          preview.marker = null; // Reset marker on error
          // Try to recreate on next frame
          try {
            preview.marker = drawingServiceRef.current.createPreviewMarker(snappedPosition);
            console.debug('Recovered by recreating preview marker');
          } catch (recoveryError) {
            console.error('Failed to recover preview marker:', recoveryError);
          }
        }

        // Update preview line and label with error handling
        try {
          if (points.length > 0) {
            const lastPoint = points[points.length - 1];
            
            // Update preview line with forced recreation if needed
            if (!preview.line || !preview.line.parent) {
              if (preview.line) {
                drawingServiceRef.current.clearPreviewLine(preview.line);
              }
              preview.line = drawingServiceRef.current.createPreviewLine(lastPoint, snappedPosition);
              console.debug('Created/recreated preview line');
            } else {
              drawingServiceRef.current.updatePreviewLine(preview.line, lastPoint, snappedPosition);
            }

            // Update preview length label with forced recreation if needed
            const distance = calculateDistance(lastPoint, snappedPosition);
            const midPoint = new THREE.Vector3(
              (lastPoint.x + snappedPosition.x) / 2,
              Math.max(lastPoint.y, snappedPosition.y) + 2.5,
              (lastPoint.z + snappedPosition.z) / 2
            );
            const distanceText = textServiceRef.current.formatDistance(distance);

            if (!preview.lengthLabel || !preview.lengthLabel.parent) {
              if (preview.lengthLabel) {
                textServiceRef.current.clearLengthLabel(preview.lengthLabel);
              }
              preview.lengthLabel = textServiceRef.current.createLengthLabel(distanceText, midPoint);
              console.debug('Created/recreated preview length label');
            } else {
              textServiceRef.current.updateLengthLabel(preview.lengthLabel, distanceText, midPoint);
            }
          } else {
            // Clear preview line and label if no points
            if (preview.line) {
              drawingServiceRef.current.clearPreviewLine(preview.line);
              preview.line = null;
            }
            if (preview.lengthLabel) {
              textServiceRef.current.clearLengthLabel(preview.lengthLabel);
              preview.lengthLabel = null;
            }
          }
        } catch (lineError) {
          console.error('Error updating preview line/label:', lineError);
          // Reset on error and try to recreate
          preview.line = null;
          preview.lengthLabel = null;
        }

        // Update preview building with error handling
        try {
          if (points.length >= 2) {
            const buildingPoints = [...points, snappedPosition];
            if (!preview.building || !preview.building.parent) {
              if (preview.building) {
                buildingServiceRef.current.clearPreviewBuilding(preview.building);
              }
              preview.building = buildingServiceRef.current.createPreviewBuilding(buildingPoints, buildingConfig);
              console.debug('Created/recreated preview building');
            } else {
              buildingServiceRef.current.updatePreviewBuilding(preview.building, buildingPoints, buildingConfig);
            }
          }
        } catch (buildingError) {
          console.error('Error updating preview building:', buildingError);
          preview.building = null; // Reset on error
        }

        // Update React state for snap to start
        if (drawingState.snapToStart !== snapToStart) {
          setDrawingState(prev => ({ ...prev, snapToStart }));
        }

        preview.lastPosition = snappedPosition;
      } catch (error) {
        console.error('Error in updatePreview:', error);
        // Clear all previews on error to prevent corruption
        clearAllPreviews();
      } finally {
        preview.isUpdating = false;
      }
    });
  }, [camera, groundPlane, drawingState.isDrawing, drawingState.points, drawingState.snapToStart, buildingConfig, snapToGridEnabled, clearAllPreviews, validateServices]);

  // Cleanup on unmount - ensure no orphaned objects
  useEffect(() => {
    return () => {
      // Final cleanup of all previews
      clearAllPreviews();
    };
  }, [clearAllPreviews]);

  return {
    drawingState,
    startDrawing,
    stopDrawing,
    addPoint,
    finishBuilding,
    updatePreview: updatePreview, // Use the direct version always
    undoLastPoint,
    clearAllDrawingElements
  };
};
