import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { Point3D } from '../types/building';
import { getThemeColorAsHex } from '../utils/themeColors';

/** A marker or line with a running animation, which it can stop. */
type Animated = THREE.Object3D & { stopAnimation?: () => void };

export class DrawingService {
  private scene: THREE.Scene;
  private animationFrameIds: Map<THREE.Object3D, number> = new Map();
  
  // Reusable geometries and materials for better performance
  private static pointGeometry: THREE.SphereGeometry | null = null;
  private static previewGeometry: THREE.SphereGeometry | null = null;
  private static snapGeometry: THREE.SphereGeometry | null = null;
  
  private static pointMaterial: THREE.MeshLambertMaterial | null = null;
  private static previewMaterial: THREE.MeshLambertMaterial | null = null;
  private static snapMaterial: THREE.MeshBasicMaterial | null = null;
  private static lineMaterial: LineMaterial | null = null;
  private static previewLineMaterial: LineMaterial | null = null;
  
  // Add preview state tracking
  private previewState = {
    hasActivePreview: false,
    isClearing: false,
    sessionId: 0 // Add session tracking
  };
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initializeSharedResources();
  }

  // Method to update line material resolution when window resizes
  public updateResolution(width: number, height: number): void {
    if (DrawingService.lineMaterial) {
      DrawingService.lineMaterial.resolution.set(width, height);
    }
    if (DrawingService.previewLineMaterial) {
      DrawingService.previewLineMaterial.resolution.set(width, height);
    }
  }

  private initializeSharedResources(): void {
    if (!DrawingService.pointGeometry) {
      DrawingService.pointGeometry = new THREE.SphereGeometry(0.25, 12, 12);
      DrawingService.previewGeometry = new THREE.SphereGeometry(0.2, 12, 12);
      DrawingService.snapGeometry = new THREE.SphereGeometry(0.3, 16, 16); // Make it significantly larger
        DrawingService.pointMaterial = new THREE.MeshLambertMaterial({ 
        color: getThemeColorAsHex('--color-drawing-point', 0xff4444),
        emissive: getThemeColorAsHex('--color-drawing-point-emissive', 0xff0000),
        emissiveIntensity: 0.2
      });
      
      DrawingService.previewMaterial = new THREE.MeshLambertMaterial({ 
        color: getThemeColorAsHex('--color-drawing-preview', 0x00ff00),
        transparent: true,
        opacity: 0.7,
        emissive: getThemeColorAsHex('--color-drawing-preview-emissive', 0x004400),
        emissiveIntensity: 0.3
      });
      
      DrawingService.snapMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffff00, // Bright yellow
        transparent: true,
        opacity: 1.0 // Full opacity for maximum visibility
      });
      
      DrawingService.lineMaterial = new LineMaterial({
        color: getThemeColorAsHex('--color-drawing-line', 0x00ff88),
        linewidth: 3, // Increased line width for better visibility
        transparent: true,
        opacity: 1.0,
        dashed: false
      });
      // Set initial resolution (will be updated when canvas size is known)
      DrawingService.lineMaterial.resolution.set(1920, 1080);
      
      DrawingService.previewLineMaterial = new LineMaterial({
        color: getThemeColorAsHex('--color-drawing-preview-line', 0x88ff00),
        linewidth: 3, // Even thicker for preview lines
        transparent: true,
        opacity: 0.9,
        dashed: true,
        dashScale: 1.0,
        dashSize: 1.0,
        gapSize: 0.5
      });
      // Set initial resolution (will be updated when canvas size is known)
      DrawingService.previewLineMaterial.resolution.set(1920, 1080);
    }
  }

  createPointMarker(position: Point3D): THREE.Mesh {
    const marker = new THREE.Mesh(DrawingService.pointGeometry!, DrawingService.pointMaterial!);
    marker.position.set(position.x, position.y + 0.25, position.z);
    marker.castShadow = true;
    marker.receiveShadow = false;
    
    // CRITICAL: Configure for proper interaction detection
    marker.visible = true;
    marker.frustumCulled = false;
    marker.matrixAutoUpdate = true;
    marker.updateMatrix();
    marker.updateMatrixWorld(true);
    
    // Add userData for identification and cleanup
    marker.userData = {
      isDrawingElement: true,
      isPoint: true,
      type: 'footprint',
      isFootprintPoint: true
    };
    
    this.scene.add(marker);
    return marker;
  }

  createPreviewMarker(position: Point3D): THREE.Mesh {
    const marker = new THREE.Mesh(DrawingService.previewGeometry!, DrawingService.previewMaterial!);
    marker.position.set(position.x, position.y + 0.3, position.z); // Increase height for better visibility
    
    // Add userData for identification and cleanup
    marker.userData = {
      isDrawingElement: true,
      isPreviewPoint: true,
      type: 'footprint',
      isFootprintPreview: true,
      zOrder: 100 // Higher z-order for visibility
    };
    
    // Ensure it renders on top
    marker.renderOrder = 100;
    marker.frustumCulled = false; // Prevent culling issues
    
    this.scene.add(marker);
    return marker;
  }

  createSnapPreviewMarker(position: Point3D): THREE.Mesh {
    // Create a new material instance for animation with enhanced visibility
    const material = new THREE.MeshBasicMaterial({
      color: 0xffff00, // Bright yellow
      transparent: true,
      opacity: 1.0
    });
    
    const marker = new THREE.Mesh(DrawingService.snapGeometry!, material);
    marker.position.set(position.x, position.y + 0.6, position.z); // Much higher for snap markers
    
    // Add userData for identification and cleanup
    marker.userData = {
      isDrawingElement: true,
      isSnapPoint: true,
      type: 'footprint',
      isFootprintPreview: true,
      zOrder: 200 // Highest z-order
    };
    
    // Ensure it renders on top of everything
    marker.renderOrder = 200;
    marker.frustumCulled = false;
    
    this.scene.add(marker);
    
    // Enhanced pulsing animation with color and scale changes
    let isActive = true;
    const animate = () => {
      if (!isActive || !this.scene.children.includes(marker)) {
        return;
      }
      
      const time = Date.now() * 0.008; // Slightly faster animation
      
      // More dramatic scale animation
      const scale = 1 + Math.sin(time) * 0.4; // Larger scale variation
      marker.scale.setScalar(scale);
      
      // Color pulsing between bright yellow and orange
      const colorIntensity = 0.7 + Math.sin(time * 1.2) * 0.3;
      const r = 1.0;
      const g = colorIntensity;
      const b = 0.0;
      material.color.setRGB(r, g, b);
      
      // Opacity pulsing for extra visibility
      const opacity = 0.8 + Math.sin(time * 1.8) * 0.2;
      material.opacity = opacity;
      
      const frameId = requestAnimationFrame(animate);
      this.animationFrameIds.set(marker, frameId);
    };
    
    (marker as Animated).stopAnimation = () => { isActive = false; };
    animate();
    return marker;
  }

  createLine(from: Point3D, to: Point3D): Line2 {
    const points = [
      from.x, 0.5, from.z, // Raise the line well above ground
      to.x, 0.5, to.z
    ];
    
    const geometry = new LineGeometry();
    geometry.setPositions(points);
    
    const line = new Line2(geometry, DrawingService.lineMaterial!);
    line.computeLineDistances();
    
    // Add userData for identification and cleanup
    line.userData = {
      isDrawingElement: true,
      isLine: true,
      type: 'footprint',
      isFootprintLine: true
    };
    
    this.scene.add(line);
    return line;
  }

  createPreviewLine(from: Point3D, to: Point3D): Line2 {
    const points = [
      from.x, 0.7, from.z, // Even higher for preview lines visibility
      to.x, 0.7, to.z
    ];
    
    const geometry = new LineGeometry();
    geometry.setPositions(points);
    
    const line = new Line2(geometry, DrawingService.previewLineMaterial!);
    line.computeLineDistances();
    
    // Add userData for identification and cleanup
    line.userData = {
      isDrawingElement: true,
      isPreviewLine: true,
      type: 'footprint',
      isFootprintPreview: true,
      zOrder: 50
    };
    
    // Ensure proper rendering order
    line.renderOrder = 50;
    line.frustumCulled = false;
    
    // Add dash animation
    let isActive = true;
    const animate = () => {
      if (!isActive || !this.scene.children.includes(line)) {
        return;
      }
      
      const time = Date.now() * 0.002; // Slow animation for smooth dash movement
      if (line.material instanceof LineMaterial) {
        line.material.dashOffset = -time; // Animate dash offset
      }
      
      const frameId = requestAnimationFrame(animate);
      this.animationFrameIds.set(line, frameId);
    };
    
    (line as Animated).stopAnimation = () => { isActive = false; };
    animate();
    
    this.scene.add(line);
    return line;
  }

  clearMarkers(markers: THREE.Mesh[]): void {
    markers.forEach(marker => {
      this.scene.remove(marker);
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
    });
  }

  clearLines(lines: (THREE.Line | Line2)[]): void {
    lines.forEach(line => {
      // Stop any animations
      if (this.animationFrameIds.has(line)) {
        const frameId = this.animationFrameIds.get(line)!;
        cancelAnimationFrame(frameId);
        this.animationFrameIds.delete(line);
      }
      
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
  }

  clearPreviewMarker(marker: THREE.Mesh): void {
    // Prevent double-clearing during cleanup
    if (this.previewState.isClearing) return;
    
    // Stop any ongoing animations
    if (this.animationFrameIds.has(marker)) {
      const frameId = this.animationFrameIds.get(marker)!;
      cancelAnimationFrame(frameId);
      this.animationFrameIds.delete(marker);
    }
    
    // Stop animation if it's a snap marker
    (marker as Animated).stopAnimation?.();
    
    this.scene.remove(marker);
    // Only dispose geometry if it's not shared
    if (marker.geometry !== DrawingService.pointGeometry && 
        marker.geometry !== DrawingService.previewGeometry && 
        marker.geometry !== DrawingService.snapGeometry) {
      marker.geometry.dispose();
    }
    // Only dispose material if it's not shared
    if (marker.material !== DrawingService.pointMaterial && 
        marker.material !== DrawingService.previewMaterial &&
        marker.material !== DrawingService.snapMaterial) {
      (marker.material as THREE.Material).dispose();
    }
  }

  clearPreviewLine(line: THREE.Line | Line2): void {
    // Stop any animations
    if (this.animationFrameIds.has(line)) {
      const frameId = this.animationFrameIds.get(line)!;
      cancelAnimationFrame(frameId);
      this.animationFrameIds.delete(line);
    }
    
    // Stop animation if it's an animated line
    (line as Animated).stopAnimation?.();
    
    this.scene.remove(line);
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }

  clearAllDrawingElements(): void {
    this.previewState.isClearing = true;
    
    // Clear all animation frames
    this.animationFrameIds.forEach(frameId => {
      cancelAnimationFrame(frameId);
    });
    this.animationFrameIds.clear();
    
    // Find and remove all drawing-related objects from scene (but preserve shared resources)
    const objectsToRemove: THREE.Object3D[] = [];
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        // Check if it's a drawing element (markers, lines, footprints) but NOT a building mesh
        if ((child.userData.isDrawingElement || 
             child.userData.isFootprint ||
             child.userData.isFootprintPoint ||
             child.userData.isFootprintLine ||
             child.userData.isFootprintPreview ||
             child.userData.isPreviewPoint ||
             child.userData.isPreviewLine ||
             child.userData.isSnapPoint) &&
            !child.userData.isBuilding && // Don't remove actual building meshes
            !child.userData.buildingId) { // Don't remove objects that belong to completed buildings
          objectsToRemove.push(child);
        }
      }
    });
    
    objectsToRemove.forEach(obj => {
      this.scene.remove(obj);
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        // Only dispose geometry if it's NOT a shared resource
        if (obj.geometry !== DrawingService.pointGeometry && 
            obj.geometry !== DrawingService.previewGeometry &&
            obj.geometry !== DrawingService.snapGeometry) {
          obj.geometry.dispose();
        }
        
        // Only dispose material if it's NOT a shared resource
        if (obj.material !== DrawingService.pointMaterial && 
            obj.material !== DrawingService.previewMaterial &&
            obj.material !== DrawingService.snapMaterial &&
            obj.material !== DrawingService.lineMaterial &&
            obj.material !== DrawingService.previewLineMaterial) {
          (obj.material as THREE.Material).dispose();
        }
      }
    });
    
    // Reset preview state
    this.previewState.isClearing = false;
    this.previewState.hasActivePreview = false;
    this.previewState.sessionId++; // Increment session ID
  }

  // Add method to reset preview state
  resetPreviewState(): void {
    this.previewState.hasActivePreview = false;
    this.previewState.isClearing = false;
    this.previewState.sessionId++; // Increment session ID for new drawing session
    
    // Clear any remaining animation frames
    this.animationFrameIds.forEach(frameId => {
      cancelAnimationFrame(frameId);
    });
    this.animationFrameIds.clear();
  }

  updatePreviewMarker(marker: THREE.Mesh, position: Point3D): void {
    marker.position.set(position.x, position.y + 0.3, position.z); // Maintain consistent height
  }

  updatePreviewLine(line: THREE.Line | Line2, from: Point3D, to: Point3D): void {
    if (line instanceof Line2) {
      // Update Line2 geometry
      const points = [
        from.x, 0.7, from.z, // Keep consistent height - elevated
        to.x, 0.7, to.z
      ];
      
      const geometry = line.geometry as LineGeometry;
      geometry.setPositions(points);
      line.computeLineDistances(); // Required for dashed lines
    } else {
      // Update regular THREE.Line geometry
      const points = [
        new THREE.Vector3(from.x, 0.7, from.z), // Keep consistent height - elevated
        new THREE.Vector3(to.x, 0.7, to.z)
      ];
      
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints(points);
    }
  }
}