/**
 * Lazy loading utilities for review system components
 * Minimizes startup impact by loading components only when needed
 */

import { ReviewManager } from './review-manager';
import { ReviewTriggerEngine } from './trigger-engine';
import { AsyncStorageService } from './storage-service';
import { AnalyticsTracker } from './analytics-tracker';

// ============================================================================
// LAZY LOADING INTERFACES
// ============================================================================

interface LazyLoadedComponent<T> {
  instance: T | null;
  isLoading: boolean;
  isLoaded: boolean;
  loadPromise: Promise<T> | null;
}

interface LazyLoadOptions {
  preload?: boolean;
  timeout?: number;
  retryAttempts?: number;
}

// ============================================================================
// LAZY LOADER CLASS
// ============================================================================

/**
 * Manages lazy loading of review system components
 */
export class LazyLoader {
  private components: Map<string, LazyLoadedComponent<any>> = new Map();
  private loadingQueue: Set<string> = new Set();
  private preloadPromise: Promise<void> | null = null;

  constructor() {
    this.initializeComponents();
  }

  /**
   * Initialize component placeholders
   */
  private initializeComponents(): void {
    const componentNames = ['reviewManager', 'triggerEngine', 'storageService', 'analyticsTracker'];
    
    componentNames.forEach(name => {
      this.components.set(name, {
        instance: null,
        isLoading: false,
        isLoaded: false,
        loadPromise: null,
      });
    });
  }

  /**
   * Lazy load the ReviewManager
   */
  async getReviewManager(options: LazyLoadOptions = {}): Promise<ReviewManager> {
    return this.loadComponent('reviewManager', async () => {
      // Use require for better test compatibility, but still lazy load
      const { reviewManager } = require('./review-manager');
      
      // Initialize only if not already initialized
      if (!(reviewManager as any).isInitialized) {
        await reviewManager.initialize();
      }
      
      return reviewManager;
    }, options);
  }

  /**
   * Lazy load the TriggerEngine
   */
  async getTriggerEngine(options: LazyLoadOptions = {}): Promise<ReviewTriggerEngine> {
    return this.loadComponent('triggerEngine', async () => {
      // Use require for better test compatibility, but still lazy load
      const { triggerEngine } = require('./trigger-engine');
      
      // Initialize only if not already initialized
      if (!(triggerEngine as any).isInitialized) {
        await triggerEngine.initialize();
      }
      
      return triggerEngine;
    }, options);
  }

  /**
   * Lazy load the StorageService
   */
  async getStorageService(options: LazyLoadOptions = {}): Promise<AsyncStorageService> {
    return this.loadComponent('storageService', async () => {
      // Use require for better test compatibility, but still lazy load
      const { storageService } = require('./storage-service');
      
      // Initialize only if not already initialized
      if (!(storageService as any).isInitialized) {
        await storageService.initialize();
      }
      
      return storageService;
    }, options);
  }

  /**
   * Lazy load the AnalyticsTracker
   */
  async getAnalyticsTracker(options: LazyLoadOptions = {}): Promise<AnalyticsTracker> {
    return this.loadComponent('analyticsTracker', async () => {
      // Use require for better test compatibility, but still lazy load
      const { getAnalyticsTracker } = require('./analytics-tracker');
      return getAnalyticsTracker();
    }, options);
  }

  /**
   * Generic component loader with caching and error handling
   */
  private async loadComponent<T>(
    componentName: string,
    loader: () => Promise<T>,
    options: LazyLoadOptions = {}
  ): Promise<T> {
    const component = this.components.get(componentName);
    if (!component) {
      throw new Error(`Unknown component: ${componentName}`);
    }

    // Return cached instance if already loaded
    if (component.isLoaded && component.instance) {
      return component.instance;
    }

    // Return existing load promise if already loading
    if (component.isLoading && component.loadPromise) {
      return component.loadPromise;
    }

    // Start loading
    component.isLoading = true;
    this.loadingQueue.add(componentName);

    const { timeout = 10000, retryAttempts = 3 } = options;

    component.loadPromise = this.loadWithRetry(loader, retryAttempts, timeout);

    try {
      const instance = await component.loadPromise;
      
      component.instance = instance;
      component.isLoaded = true;
      component.isLoading = false;
      this.loadingQueue.delete(componentName);

      return instance;
    } catch (error) {
      component.isLoading = false;
      component.loadPromise = null;
      this.loadingQueue.delete(componentName);
      
      throw new Error(`Failed to load ${componentName}: ${error}`);
    }
  }

  /**
   * Load component with retry logic
   */
  private async loadWithRetry<T>(
    loader: () => Promise<T>,
    maxAttempts: number,
    timeout: number
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await Promise.race([
          loader(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Load timeout')), timeout)
          )
        ]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxAttempts) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Failed to load component');
  }

  /**
   * Preload all components in background
   */
  async preloadComponents(): Promise<void> {
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    this.preloadPromise = this.performPreload();
    return this.preloadPromise;
  }

  /**
   * Smart preloading based on usage patterns
   */
  async smartPreload(usageHints: {
    likelyToTriggerReview?: boolean;
    frequentStorageAccess?: boolean;
    analyticsEnabled?: boolean;
  } = {}): Promise<void> {
    const { 
      likelyToTriggerReview = false, 
      frequentStorageAccess = true, 
      analyticsEnabled = true 
    } = usageHints;

    const preloadTasks: Promise<any>[] = [];

    // Always preload storage service for frequent access
    if (frequentStorageAccess) {
      preloadTasks.push(this.getStorageService({ preload: true, timeout: 3000 }));
    }

    // Preload analytics if enabled
    if (analyticsEnabled) {
      preloadTasks.push(this.getAnalyticsTracker({ preload: true, timeout: 2000 }));
    }

    // Preload review components if likely to be used
    if (likelyToTriggerReview) {
      preloadTasks.push(
        this.getTriggerEngine({ preload: true, timeout: 5000 }),
        this.getReviewManager({ preload: true, timeout: 7000 })
      );
    }

    try {
      await Promise.allSettled(preloadTasks);
    } catch (error) {
      console.warn('LazyLoader: Smart preload failed:', error);
    }
  }

  /**
   * Perform the actual preloading with intelligent prioritization
   */
  private async performPreload(): Promise<void> {
    // Preload in order of importance and dependency
    const preloadStages = [
      // Stage 1: Core dependencies (most critical)
      [
        this.getStorageService({ preload: true, timeout: 5000 }),
        this.getAnalyticsTracker({ preload: true, timeout: 3000 }),
      ],
      // Stage 2: Business logic (depends on core)
      [
        this.getTriggerEngine({ preload: true, timeout: 7000 }),
      ],
      // Stage 3: Orchestration (depends on everything)
      [
        this.getReviewManager({ preload: true, timeout: 10000 }),
      ],
    ];

    try {
      // Load each stage sequentially for better dependency management
      for (const stage of preloadStages) {
        await Promise.allSettled(stage);
        
        // Small delay between stages to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      console.warn('LazyLoader: Some components failed to preload:', error);
      // Don't throw - preloading is optional
    }
  }

  /**
   * Check if a component is loaded
   */
  isComponentLoaded(componentName: string): boolean {
    const component = this.components.get(componentName);
    return component?.isLoaded || false;
  }

  /**
   * Check if any components are currently loading
   */
  isLoading(): boolean {
    return this.loadingQueue.size > 0;
  }

  /**
   * Get loading status for all components
   */
  getLoadingStatus(): Record<string, { isLoaded: boolean; isLoading: boolean }> {
    const status: Record<string, { isLoaded: boolean; isLoading: boolean }> = {};
    
    this.components.forEach((component, name) => {
      status[name] = {
        isLoaded: component.isLoaded,
        isLoading: component.isLoading,
      };
    });

    return status;
  }

  /**
   * Clear all loaded components (for testing)
   */
  clearComponents(): void {
    this.components.forEach(component => {
      component.instance = null;
      component.isLoaded = false;
      component.isLoading = false;
      component.loadPromise = null;
    });
    
    this.loadingQueue.clear();
    this.preloadPromise = null;
  }

  /**
   * Get memory usage of loaded components
   */
  getMemoryUsage(): { componentCount: number; loadedCount: number } {
    let loadedCount = 0;
    
    this.components.forEach(component => {
      if (component.isLoaded) {
        loadedCount++;
      }
    });

    return {
      componentCount: this.components.size,
      loadedCount,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let lazyLoaderInstance: LazyLoader | null = null;

/**
 * Get the singleton lazy loader instance
 */
export function getLazyLoader(): LazyLoader {
  if (!lazyLoaderInstance) {
    lazyLoaderInstance = new LazyLoader();
  }
  return lazyLoaderInstance;
}

/**
 * Reset the lazy loader instance (for testing)
 */
export function resetLazyLoader(): void {
  lazyLoaderInstance = null;
}