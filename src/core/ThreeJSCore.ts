import * as THREE from 'three';
import { SceneManager } from './SceneManager';
import { CameraManager } from './CameraManager';
import type { CameraType, CameraView, ViewTransitionOptions } from './CameraManager';
import { RendererManager } from './RendererManager';
import { LightingManager } from './LightingManager';
import { EnvironmentManager } from './EnvironmentManager';
import { PerformanceManager } from './PerformanceManager';
import { ContextModelLoader } from '../services/ContextModelLoader';
import { WindowService } from '../services/WindowService';
import { DEFAULT_FACADE_PARAMETERS } from '../services/FacadeGeometry';
import { addThemeChangeListener, getThemeColorAsHex } from '../utils/themeColors';
import type { SunPosition } from '../utils/sunPosition';

export interface ThreeJSCoreConfig {
  container: HTMLElement;
  performanceMode?: boolean;
  enablePostProcessing?: boolean;
  showGrid?: boolean;
  enableErrorBoundary?: boolean;
}

export interface CoreEventMap {
  'initialized': void;
  'error': Error;
  'resize': { width: number; height: number };
  'dispose': void;
}

export type CoreEventListener<T extends keyof CoreEventMap> = (data: CoreEventMap[T]) => void;

export class ThreeJSCore {
  private container: HTMLElement;
  private config: ThreeJSCoreConfig;
  private eventListeners = new Map<keyof CoreEventMap, Set<(data: unknown) => void>>();
  
  private sceneManager: SceneManager;
  private cameraManager: CameraManager;
  private rendererManager: RendererManager;
  private lightingManager: LightingManager;
  private environmentManager: EnvironmentManager;
  private performanceManager: PerformanceManager;
  private contextModelLoader: ContextModelLoader;
  private windowService: WindowService;
  
  private animationId: number | null = null;
  private isInitialized = false;
  private isDisposed = false;
  private resizeObserver: ResizeObserver;
  private themeChangeCleanup: (() => void) | null = null;

  constructor(config: ThreeJSCoreConfig) {
    this.container = config.container;
    this.config = {
      enablePostProcessing: true,
      showGrid: true,
      enableErrorBoundary: true,
      ...config
    };

    try {
      // Initialize managers with dependency injection
      this.sceneManager = new SceneManager();
      
      const rect = this.container.getBoundingClientRect();
      this.cameraManager = new CameraManager(rect.width / rect.height);
        this.rendererManager = new RendererManager({
        antialias: true,
        shadows: true,
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0 // Adjusted for better balance
      });
      
      this.lightingManager = new LightingManager(
        this.sceneManager.getScene(),
        { 
          enableShadows: true,
          enableSky: false,
          shadowMapSize: 2048,
          sunLightIntensity: 1.75
        }
      );
      
      this.environmentManager = new EnvironmentManager(
        this.sceneManager.getScene(),
        { showGrid: this.config.showGrid }
      );
      
      this.performanceManager = new PerformanceManager();
      
      // Initialize context model loader
      this.contextModelLoader = new ContextModelLoader(this.sceneManager);

      // Initialize window service with default configuration
      this.windowService = new WindowService(this.sceneManager.getScene(), {
        windowWidth: DEFAULT_FACADE_PARAMETERS.windowWidth,
        windowHeight: DEFAULT_FACADE_PARAMETERS.windowHeight,
        windowSpacing: DEFAULT_FACADE_PARAMETERS.windowSpacing,
        offsetDistance: 0.1,
        frameThickness: 0.05,
        maxWindows: 50000
      });

      // Setup resize observer instead of window listener
      this.resizeObserver = new ResizeObserver(this.handleResize.bind(this));
      this.resizeObserver.observe(this.container);
      
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Cannot initialize disposed ThreeJSCore instance');
    }

    try {
      // Setup renderer size and add to container
      const rect = this.container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        throw new Error('Container has zero dimensions');
      }

      this.rendererManager.setSize(rect.width, rect.height);
      this.container.appendChild(this.rendererManager.getRenderer().domElement);
      
      // Initialize all managers with proper error handling
      await Promise.all([
        this.cameraManager.initializeControls(this.rendererManager.getRenderer()),
        this.lightingManager.initialize(),
        this.performanceManager.initialize(),
        this.contextModelLoader.loadContextModel() // Load the context model
      ]);
      
      this.environmentManager.initialize();
      
      // Initialize post-processing with error handling
      if (this.config.enablePostProcessing) {
        try {
          await this.rendererManager.initializeComposer(
            this.sceneManager.getScene(),
            this.cameraManager.getCamera(),
            true
          );
        } catch (error) {
          console.warn('Post-processing initialization failed, continuing without:', error);
        }
      }
      
      // Set up theme change listener
      this.setupThemeChangeListener();
      
      // Start animation loop
      this.startAnimationLoop();
      
      this.isInitialized = true;
      this.emit('initialized', undefined);
      
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to initialize ThreeJS core:', errorObj);
      this.emit('error', errorObj);
      throw errorObj;
    }
  }
  private setupThemeChangeListener(): void {
    // Clean up any existing listener
    if (this.themeChangeCleanup) {
      this.themeChangeCleanup();
      this.themeChangeCleanup = null;
    }
    
    // Add listener for the general theme change event
    this.themeChangeCleanup = addThemeChangeListener(() => {
      this.updateThemeColors();
    });
    
    // Add specific listener for ThreeJS theme update
    const handleThreeJSThemeUpdate = (event: CustomEvent) => {
      console.log(`ThreeJS responding to theme update: ${event.detail?.theme || 'unknown'}`);
      // Force immediate and complete update
      this.updateThemeColors();
      // Re-render the scene
      this.rendererManager.getRenderer().render(
        this.sceneManager.getScene(), 
        this.cameraManager.getCamera()
      );
    };
    
    window.addEventListener('threejs-theme-update', handleThreeJSThemeUpdate as EventListener);
    
    // Extend cleanup to remove this listener too
    const originalCleanup = this.themeChangeCleanup;
    this.themeChangeCleanup = () => {
      originalCleanup();
      window.removeEventListener('threejs-theme-update', handleThreeJSThemeUpdate as EventListener);
    };
  }  private updateThemeColors(): void {
    console.log("ThreeJSCore: Updating theme colors");
    
    // Get current theme
    document.documentElement.classList.remove('dark-theme');
    const isDarkTheme = false;    // Model workspace is intentionally light-only.
    try {
      this.sceneManager.updateThemeColors();
    } catch (e) {
      console.warn('Error updating scene colors:', e);
    }
    
    try {
      this.lightingManager.updateThemeColors();
    } catch (e) {
      console.warn('Error updating lighting colors:', e);
    }
    
    try {
      this.environmentManager.updateThemeColors();
    } catch (e) {
      console.warn('Error updating environment colors:', e);
    }
    
    try {
      this.performanceManager.updateThemeColors();
    } catch (e) {
      console.warn('Error updating performance manager colors:', e);
    }
    
    try {
      this.rendererManager.updateThemeColors();
    } catch (e) {
      console.warn('Error updating renderer colors:', e);
    }
    
    try {
      this.contextModelLoader.updateThemeColors();
    } catch (e) {
      console.warn('Error updating context model colors:', e);
    }
    
    
    // Additional global scene adjustments
    const scene = this.sceneManager.getScene();
    const renderer = this.rendererManager.getRenderer();
    
    // Update renderer clear color
    renderer.setClearColor(
      0xF4F6F8
    );
    
    // Enable fog with appropriate settings based on theme
    if (!scene.fog) {
      const fogColor = getThemeColorAsHex('--color-scene-fog', isDarkTheme ? 0x050a1c : 0xcccccc);
      scene.fog = new THREE.Fog(
        fogColor, 
        isDarkTheme ? 150 : 250,
        isDarkTheme ? 500 : 800
      );
    }
    
    // Force an immediate render to show changes
    renderer.render(scene, this.cameraManager.getCamera());
    
    console.log(`Theme updated to ${isDarkTheme ? 'dark' : 'light'} mode`);
  }

  private startAnimationLoop(): void {
    const animate = () => {
      if (this.isDisposed) return;
      
      this.animationId = requestAnimationFrame(animate);
      
      try {
        this.performanceManager.beginFrame();
        this.performanceManager.updateFPS();
        
        this.cameraManager.update();
        
        // Get the current camera for this frame
        const currentCamera = this.cameraManager.getCurrentCamera();
        
        this.rendererManager.render(
          this.sceneManager.getScene(),
          currentCamera
        );
        
        this.performanceManager.endFrame();
      } catch (error) {
        console.error('Animation loop error:', error);
        if (this.config.enableErrorBoundary) {
          this.emit('error', error instanceof Error ? error : new Error(String(error)));
        }
      }
    };
    
    animate();
  }

  private handleResize(): void {
    if (this.isDisposed) return;
    
    try {
      const rect = this.container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      
      this.cameraManager.updateAspect(rect.width / rect.height);
      this.rendererManager.setSize(rect.width, rect.height);
      this.emit('resize', { width: rect.width, height: rect.height });
    } catch (error) {
      console.error('Resize error:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Event system
  on<T extends keyof CoreEventMap>(event: T, listener: CoreEventListener<T>): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener as (data: unknown) => void);
  }

  off<T extends keyof CoreEventMap>(event: T, listener: CoreEventListener<T>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener as (data: unknown) => void);
    }
  }

  private emit<T extends keyof CoreEventMap>(event: T, data: CoreEventMap[T]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Event listener error for ${event}:`, error);
        }
      });
    }
  }

  // Public API
  getScene(): THREE.Scene {
    return this.sceneManager.getScene();
  }

  getCamera(): THREE.Camera {
    return this.cameraManager.getCamera();
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.rendererManager.getRenderer();
  }

  getGroundPlane(): THREE.Mesh | null {
    return this.environmentManager.getGroundPlane();
  }

  getWindowService(): WindowService {
    return this.windowService;
  }

  toggleGrid(): void {
    this.environmentManager.toggleGrid();
  }

  getGridVisibility(): boolean {
    return this.environmentManager.getGridVisibility();
  }

  setPlanMode(plan: boolean): void {
    this.cameraManager.setPlanMode(plan);
    this.updateComposerCamera();
  }

  setSpacePan(active: boolean): void { this.cameraManager.setSpacePan(active); }

  setCameraControlsEnabled(enabled: boolean): void {
    this.cameraManager.setControlsEnabled(enabled);
  }

  toggleFPSCounter(): void {
    this.performanceManager.toggleFPSCounter();
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  dispose(): void {
    if (this.isDisposed) return;
    
    this.isDisposed = true;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    this.resizeObserver.disconnect();
    
    // Clean up theme change listener
    if (this.themeChangeCleanup) {
      this.themeChangeCleanup();
      this.themeChangeCleanup = null;
    }
    
    // Dispose in reverse order of creation
    this.performanceManager.dispose();
    this.environmentManager.dispose();
    this.lightingManager.dispose();
    this.contextModelLoader.dispose(); // Dispose the context model loader
    this.windowService.dispose(); // Dispose the window service
    this.cameraManager.dispose();
    this.rendererManager.dispose();
    this.sceneManager.dispose();
    
    // Remove DOM element safely
    const canvas = this.rendererManager.getRenderer().domElement;
    if (canvas.parentNode === this.container) {
      this.container.removeChild(canvas);
    }
    
    // Clear event listeners
    this.eventListeners.clear();
    
    this.emit('dispose', undefined);
  }

  // Camera management methods
  switchCameraType(type: CameraType): void {
    try {
      this.cameraManager.switchCameraType(type);
      
      // Update post-processing composer with new camera if it exists
      if (this.rendererManager.getComposer()) {
        this.updateComposerCamera();
      }
    } catch (error) {
      console.error('Failed to switch camera type:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private updateComposerCamera(): void {
    try {
      // Reinitialize composer with new camera
      if (this.config.enablePostProcessing) {
        this.rendererManager.initializeComposer(
          this.sceneManager.getScene(),
          this.cameraManager.getCurrentCamera(),
          true
        ).catch(error => {
          console.warn('Failed to update composer camera:', error);
        });
      }
    } catch (error) {
      console.warn('Failed to update composer camera:', error);
    }
  }

  setCameraView(view: CameraView, options?: ViewTransitionOptions): void {
    try {
      this.cameraManager.setCameraView(view, options);
      
      // Update post-processing composer with new camera if it exists
      if (this.rendererManager.getComposer()) {
        this.updateComposerCamera();
      }
    } catch (error) {
      console.error('Failed to set camera view:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  fitCameraToObjects(objects: THREE.Object3D[], options?: ViewTransitionOptions): void {
    try {
      this.cameraManager.fitToObjects(objects, options);
    } catch (error) {
      console.error('Failed to fit camera to objects:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  fitShadowsToObjects(objects: THREE.Object3D[]): void {
    this.lightingManager.fitShadowCameraToObjects(objects);
  }

  fitCameraToScene(options?: ViewTransitionOptions): void {
    try {
      const objects: THREE.Object3D[] = [];
      this.getScene().traverse((object) => {
        if (object !== this.getScene() && 
            !object.userData.isGround && 
            object.type !== 'GridHelper' &&
            object.type !== 'DirectionalLight' &&
            object.type !== 'CameraHelper') {
          objects.push(object);
        }
      });
      this.cameraManager.fitToObjects(objects, options);
    } catch (error) {
      console.error('Failed to fit camera to scene:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
 }

  // Add object with proper shadow configuration
  addObject(object: THREE.Object3D, options: { castShadow?: boolean; receiveShadow?: boolean } = {}): void {
    const { castShadow = true, receiveShadow = true } = options;
    
    // Recursively configure shadows for all meshes in the object
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;
      }
    });
    
    this.sceneManager.addObject(object);
  }

  // Shadow debugging methods
  toggleShadowHelper(): void {
    this.lightingManager.toggleShadowHelper();
  }

  updateShadowQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): void {
    this.lightingManager.updateShadowQuality(quality);
  }

  updateSunPosition(x: number, y: number, z: number): void {
    this.lightingManager.updateSunPosition(x, y, z);
  }

  updateRealisticSunPosition(sunPosition: SunPosition): void {
    this.lightingManager.updateRealisticSunPosition(sunPosition);
  }

  setRealisticSunMode(enabled: boolean): void {
    this.lightingManager.setRealisticSunMode(enabled);
  }

  // Add new shadow debugging methods
  updateShadowBounds(minBounds?: number, maxBounds?: number): void {
    this.lightingManager.updateShadowBounds(minBounds, maxBounds);
  }

  getShadowInfo(): { enabled: boolean; mapSize: number; bounds: number; position: THREE.Vector3 | null } {
    return this.lightingManager.getShadowInfo();
  }

  debugShadows(): void {
    const info = this.getShadowInfo();
    console.log('=== Shadow Debug Info ===');
    console.log('Shadows enabled:', info.enabled);
    console.log('Shadow map size:', info.mapSize);
    console.log('Shadow camera bounds:', info.bounds);
    console.log('Sun position:', info.position);
    
    // Check ground plane shadow settings
    const ground = this.getGroundPlane();
    if (ground) {
      console.log('Ground receiveShadow:', ground.receiveShadow);
      console.log('Ground castShadow:', ground.castShadow);
      console.log('Ground material type:', ground.material.constructor.name);
    }
    
    // Show shadow helper for visual debugging
    this.toggleShadowHelper();
    
    // Adjust shadow bounds based on scene
    this.autoAdjustShadowBounds();
  }

  private autoAdjustShadowBounds(): void {
    // Calculate scene bounds to adjust shadow camera
    const box = new THREE.Box3();
    this.getScene().traverse((object) => {
      if (object !== this.getScene() && 
          !object.userData.isGround && 
          object.type !== 'GridHelper' &&
          object.type !== 'DirectionalLight' &&
          object.type !== 'CameraHelper') {
        const objBox = new THREE.Box3().setFromObject(object);
        if (!objBox.isEmpty()) {
          box.union(objBox);
        }
      }
    });
    
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      const bounds = Math.max(30, maxDimension * 1.5);
      this.updateShadowBounds(bounds, bounds * 2);
      console.log('Auto-adjusted shadow bounds to:', bounds);
    }
  }

  // New method to manually update theme colors
  refreshThemeColors(): void {
    this.updateThemeColors();
  }

  // Selective focus methods for building editing
  enableBuildingFocus(buildingId: string): void {
    this.setSceneAppearanceMode({ kind: 'editing', buildingId });
  }

  disableBuildingFocus(): void {
    this.setSceneAppearanceMode({ kind: 'normal' });
  }

  setSceneAppearanceMode(mode: import('./SceneAppearanceManager').SceneAppearanceMode): void {
    this.windowService.setEditingBuilding(mode.kind === 'editing' ? mode.buildingId : null);
    this.rendererManager.setSceneAppearanceMode(this.sceneManager.getScene(), mode);
  }

  getCurrentCameraType(): CameraType {
    return this.cameraManager.getCurrentCameraType();
  }
}

// Re-export types for external use
export type { CameraType, CameraView, ViewTransitionOptions };
export type { SceneAppearanceMode } from './SceneAppearanceManager';
