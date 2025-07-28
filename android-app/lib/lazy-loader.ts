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
      // Use require for better test compatibility
      const { ReviewManager } = require('./review-manager');
      const instance = new ReviewManager();
      await instance.initialize();
      return instance;
    }, options);
  }

  /**
   * Lazy load the TriggerEngine
   */
  async getTriggerEngine(options: LazyLoadOptions = {}): Promise<ReviewTriggerEngine> {
    return this.loadComponent('triggerEngine', async () => {
      // Use require for better test compatibility
      const { ReviewTriggerEngine } = require('./trigger-engine');
      const instance = new ReviewTriggerEngine();
      await instance.initialize();
      return instance;
    }, options);
  }

  /**
   * Lazy load the StorageService
   */
  async getStorageService(options: LazyLoadOptions = {}): Promise<AsyncStorageService> {
    return this.loadComponent('storageService', async () => {
      // Use require for better test compatibility
      const { AsyncStorageService } = require('./storage-service');
      const instance = new AsyncStorageService();
      await instance.initialize();
      return instance;
    }, options);
  }

  /**
   * Lazy load the AnalyticsTracker
   */
  async getAnalyticsTracker(options: LazyLoadOptions = {}): Promise<AnalyticsTracker> {
    return this.loadComponent('analyticsTracker', async () => {
      // Use require for better test compatibility
      const { AnalyticsTracker } = require('./analytics-tracker');
      return new AnalyticsTracker();
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
   * Perform the actual preloading
   */
  private async performPreload(): Promise<void> {
    const preloadTasks = [
      this.getStorageService({ preload: true }),
      this.getAnalyticsTracker({ preload: true }),
      this.getTriggerEngine({ preload: true }),
      this.getReviewManager({ preload: true }),
    ];

    try {
      await Promise.all(preloadTasks);
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