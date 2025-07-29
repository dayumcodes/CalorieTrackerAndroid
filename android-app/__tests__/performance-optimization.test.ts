/**
 * Performance optimization tests for the review system
 * Tests lazy loading, caching, batching, and profiling functionality
 */

import { 
  getLazyLoader, 
  resetLazyLoader 
} from '../lib/lazy-loader';
import { 
  getCacheManager, 
  resetCacheManager 
} from '../lib/cache-manager';
import { 
  getBatchProcessor, 
  resetBatchProcessor 
} from '../lib/batch-processor';
import { 
  getPerformanceProfiler, 
  resetPerformanceProfiler 
} from '../lib/performance-profiler';
import { DEFAULT_USER_METRICS, DEFAULT_REVIEW_SETTINGS } from '../lib/types/review-types';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock performance.now for consistent testing
const mockPerformanceNow = jest.fn();
global.performance = { now: mockPerformanceNow } as any;

describe('Performance Optimizations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetLazyLoader();
    resetCacheManager();
    resetBatchProcessor();
    resetPerformanceProfiler();
    mockPerformanceNow.mockReturnValue(1000);
  });

  describe('LazyLoader', () => {
    it('should load components only when requested', async () => {
      const lazyLoader = getLazyLoader();
      
      // Initially no components should be loaded
      expect(lazyLoader.isComponentLoaded('reviewManager')).toBe(false);
      expect(lazyLoader.isComponentLoaded('storageService')).toBe(false);
      
      // Load a component
      const storageService = await lazyLoader.getStorageService();
      expect(storageService).toBeDefined();
      expect(lazyLoader.isComponentLoaded('storageService')).toBe(true);
    });

    it('should return cached instances on subsequent calls', async () => {
      const lazyLoader = getLazyLoader();
      
      const instance1 = await lazyLoader.getStorageService();
      const instance2 = await lazyLoader.getStorageService();
      
      expect(instance1).toBe(instance2);
    });

    it('should handle component loading errors gracefully', async () => {
      const lazyLoader = getLazyLoader();
      
      // Mock a loading error
      jest.doMock('../lib/storage-service', () => {
        throw new Error('Mock loading error');
      });
      
      await expect(lazyLoader.getStorageService()).rejects.toThrow('Failed to load storageService');
    });

    it('should preload components in background', async () => {
      const lazyLoader = getLazyLoader();
      
      // Start preloading
      const preloadPromise = lazyLoader.preloadComponents();
      
      // Should not throw even if some components fail
      await expect(preloadPromise).resolves.toBeUndefined();
    });

    it('should support smart preloading based on usage hints', async () => {
      const lazyLoader = getLazyLoader();
      
      // Test smart preloading with different usage patterns
      await lazyLoader.smartPreload({
        likelyToTriggerReview: true,
        frequentStorageAccess: true,
        analyticsEnabled: true,
      });
      
      // Should have preloaded components based on hints
      expect(lazyLoader.isComponentLoaded('storageService')).toBe(true);
      expect(lazyLoader.isComponentLoaded('analyticsTracker')).toBe(true);
    });

    it('should handle staged preloading for better dependency management', async () => {
      const lazyLoader = getLazyLoader();
      
      const startTime = Date.now();
      await lazyLoader.preloadComponents();
      const preloadTime = Date.now() - startTime;
      
      // Should complete staged preloading efficiently
      expect(preloadTime).toBeLessThan(2000);
    });

    it('should provide loading status information', async () => {
      const lazyLoader = getLazyLoader();
      
      const initialStatus = lazyLoader.getLoadingStatus();
      expect(initialStatus.storageService.isLoaded).toBe(false);
      expect(initialStatus.storageService.isLoading).toBe(false);
      
      // Start loading
      const loadPromise = lazyLoader.getStorageService();
      expect(lazyLoader.isLoading()).toBe(true);
      
      await loadPromise;
      
      const finalStatus = lazyLoader.getLoadingStatus();
      expect(finalStatus.storageService.isLoaded).toBe(true);
      expect(finalStatus.storageService.isLoading).toBe(false);
    });
  });

  describe('CacheManager', () => {
    it('should cache and retrieve data correctly', () => {
      const cacheManager = getCacheManager();
      
      const testData = { test: 'value' };
      cacheManager.set('test_key', testData);
      
      const retrieved = cacheManager.get('test_key');
      expect(retrieved).toEqual(testData);
    });

    it('should respect TTL for cache entries', async () => {
      const cacheManager = getCacheManager();
      
      const testData = { test: 'value' };
      cacheManager.set('test_key', testData, 100); // 100ms TTL
      
      // Should be available immediately
      expect(cacheManager.get('test_key')).toEqual(testData);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired
      expect(cacheManager.get('test_key')).toBeNull();
    });

    it('should cache user metrics with appropriate TTL', () => {
      const cacheManager = getCacheManager();
      
      const metrics = { ...DEFAULT_USER_METRICS, appOpenCount: 10 };
      cacheManager.cacheUserMetrics(metrics);
      
      const cached = cacheManager.getCachedUserMetrics();
      expect(cached).toEqual(metrics);
    });

    it('should cache review settings with longer TTL', () => {
      const cacheManager = getCacheManager();
      
      const settings = { ...DEFAULT_REVIEW_SETTINGS, debugMode: true };
      cacheManager.cacheReviewSettings(settings);
      
      const cached = cacheManager.getCachedReviewSettings();
      expect(cached).toEqual(settings);
    });

    it('should provide cache statistics', () => {
      const cacheManager = getCacheManager();
      
      cacheManager.set('key1', 'value1');
      cacheManager.set('key2', 'value2');
      
      // Access one key to generate hit
      cacheManager.get('key1');
      
      // Try to access non-existent key to generate miss
      cacheManager.get('nonexistent');
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.totalSize).toBe(2);
    });

    it('should handle batch operations efficiently', () => {
      const cacheManager = getCacheManager();
      
      const entries = [
        { key: 'key1', data: 'value1' },
        { key: 'key2', data: 'value2' },
        { key: 'key3', data: 'value3' },
      ];
      
      cacheManager.setBatch(entries);
      
      const results = cacheManager.getBatch(['key1', 'key2', 'key3']);
      expect(results.key1).toBe('value1');
      expect(results.key2).toBe('value2');
      expect(results.key3).toBe('value3');
    });

    it('should optimize cache with intelligent TTL based on confidence', () => {
      const cacheManager = getCacheManager();
      
      // High confidence result should cache longer
      const highConfidenceResult = {
        shouldTrigger: true,
        confidence: 0.9,
        reason: 'High confidence',
      };
      
      cacheManager.cacheTriggerEvaluation('app_open', { confidence: 0.9 }, highConfidenceResult);
      
      // Low confidence result should cache shorter
      const lowConfidenceResult = {
        shouldTrigger: false,
        confidence: 0.2,
        reason: 'Low confidence',
      };
      
      cacheManager.cacheTriggerEvaluation('app_open', { confidence: 0.2 }, lowConfidenceResult);
      
      // Both should be cached initially
      const highConfKey = `trigger_eval_app_open_${(cacheManager as any).hashContext({ confidence: 0.9 })}`;
      const lowConfKey = `trigger_eval_app_open_${(cacheManager as any).hashContext({ confidence: 0.2 })}`;
      
      expect(cacheManager.has(highConfKey)).toBe(true);
      expect(cacheManager.has(lowConfKey)).toBe(true);
    });

    it('should handle cache eviction with multiple entries efficiently', () => {
      const cacheManager = getCacheManager({ maxSize: 3 });
      
      // Fill cache beyond capacity
      const entries = [
        { key: 'key1', data: 'data1' },
        { key: 'key2', data: 'data2' },
        { key: 'key3', data: 'data3' },
        { key: 'key4', data: 'data4' },
        { key: 'key5', data: 'data5' },
      ];
      
      cacheManager.setBatch(entries);
      
      // Should have evicted older entries
      expect(cacheManager.getStats().evictions).toBeGreaterThan(0);
      expect(cacheManager.getStats().totalSize).toBe(3);
    });

    it('should evict least recently used entries when full', () => {
      const cacheManager = getCacheManager({ maxSize: 2 });
      
      cacheManager.set('key1', 'value1');
      cacheManager.set('key2', 'value2');
      
      // Access key1 to make it more recently used
      cacheManager.get('key1');
      
      // Add key3, should evict key2
      cacheManager.set('key3', 'value3');
      
      expect(cacheManager.get('key1')).toBe('value1');
      expect(cacheManager.get('key2')).toBeNull();
      expect(cacheManager.get('key3')).toBe('value3');
    });
  });

  describe('BatchProcessor', () => {
    it('should batch user metrics updates', async () => {
      const batchProcessor = getBatchProcessor();
      
      const update1 = { appOpenCount: 5 };
      const update2 = { successfulFoodLogs: 3 };
      
      const id1 = batchProcessor.batchUpdateUserMetrics(update1);
      const id2 = batchProcessor.batchUpdateUserMetrics(update2);
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      
      const status = batchProcessor.getQueueStatus();
      expect(status.queueLength).toBe(2);
    });

    it('should process high priority operations immediately', async () => {
      const batchProcessor = getBatchProcessor();
      
      const highPriorityUpdate = { lastReviewPrompt: new Date() };
      batchProcessor.batchUpdateUserMetrics(highPriorityUpdate, 10); // High priority
      
      // Give some time for processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const status = batchProcessor.getQueueStatus();
      expect(status.queueLength).toBe(0); // Should be processed immediately
    });

    it('should provide batch processing statistics', async () => {
      const batchProcessor = getBatchProcessor();
      
      batchProcessor.batchUpdateUserMetrics({ appOpenCount: 1 });
      batchProcessor.batchUpdateUserMetrics({ appOpenCount: 2 });
      
      await batchProcessor.flush();
      
      const stats = batchProcessor.getStats();
      expect(stats.operationsProcessed).toBeGreaterThan(0);
      expect(stats.batchesProcessed).toBeGreaterThan(0);
    });

    it('should handle batch configuration updates', () => {
      const batchProcessor = getBatchProcessor();
      
      batchProcessor.updateConfig({
        maxBatchSize: 20,
        flushInterval: 5000,
      });
      
      // Configuration should be updated (no direct way to test, but should not throw)
      expect(() => batchProcessor.batchUpdateUserMetrics({ appOpenCount: 1 })).not.toThrow();
    });

    it('should clear queue when requested', () => {
      const batchProcessor = getBatchProcessor();
      
      batchProcessor.batchUpdateUserMetrics({ appOpenCount: 1 });
      batchProcessor.batchUpdateUserMetrics({ appOpenCount: 2 });
      
      expect(batchProcessor.getQueueStatus().queueLength).toBe(2);
      
      batchProcessor.clearQueue();
      
      expect(batchProcessor.getQueueStatus().queueLength).toBe(0);
    });

    it('should intelligently merge counter operations', async () => {
      const batchProcessor = getBatchProcessor();
      
      // Mock storage service for testing
      const mockUpdateMetrics = jest.fn().mockResolvedValue(undefined);
      jest.doMock('../lib/storage-service', () => ({
        storageService: { updateUserMetrics: mockUpdateMetrics },
      }));

      // Add multiple counter updates
      batchProcessor.batchUpdateUserMetrics({ appOpenCount: 1 });
      batchProcessor.batchUpdateUserMetrics({ appOpenCount: 2 });
      batchProcessor.batchUpdateUserMetrics({ successfulFoodLogs: 1 });
      
      await batchProcessor.flush();
      
      // Should merge counter updates intelligently
      expect(mockUpdateMetrics).toHaveBeenCalledWith({
        appOpenCount: 3, // 1 + 2
        successfulFoodLogs: 1,
      });
    });

    it('should handle timestamp conflicts with last-write-wins', async () => {
      const batchProcessor = getBatchProcessor();
      
      const mockUpdateSettings = jest.fn().mockResolvedValue(undefined);
      jest.doMock('../lib/storage-service', () => ({
        storageService: { updateReviewSettings: mockUpdateSettings },
      }));

      // Add settings updates with conflicts
      batchProcessor.batchUpdateReviewSettings({ minimumAppOpens: 5 });
      batchProcessor.batchUpdateReviewSettings({ minimumAppOpens: 10 });
      
      await batchProcessor.flush();
      
      // Should use last-write-wins for conflicts
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        minimumAppOpens: 10, // Latest value
      });
    });
  });

  describe('PerformanceProfiler', () => {
    beforeEach(() => {
      mockPerformanceNow.mockReturnValue(1000);
    });

    it('should profile function execution time', async () => {
      const profiler = getPerformanceProfiler(true);
      
      mockPerformanceNow
        .mockReturnValueOnce(1000) // Start time
        .mockReturnValueOnce(1100); // End time
      
      const result = await profiler.profileFunction(
        'test_function',
        'computation' as any,
        async () => {
          return 'test_result';
        }
      );
      
      expect(result).toBe('test_result');
      
      const report = profiler.generateReport();
      expect(report.operationCount).toBe(1);
      expect(report.slowestOperations[0].name).toBe('test_function');
      expect(report.slowestOperations[0].duration).toBe(100);
    });

    it('should track storage operations', async () => {
      const profiler = getPerformanceProfiler(true);
      
      mockPerformanceNow
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1050);
      
      await profiler.profileStorage('getUserMetrics', async () => {
        return { ...DEFAULT_USER_METRICS };
      });
      
      const report = profiler.generateReport();
      expect(report.categoryBreakdown.storage.count).toBe(1);
      expect(report.categoryBreakdown.storage.averageDuration).toBe(50);
    });

    it('should track API calls', async () => {
      const profiler = getPerformanceProfiler(true);
      
      mockPerformanceNow
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1200);
      
      await profiler.profileApiCall('isAvailable', async () => {
        return true;
      });
      
      const report = profiler.generateReport();
      expect(report.categoryBreakdown.api.count).toBe(1);
      expect(report.categoryBreakdown.api.averageDuration).toBe(200);
    });

    it('should generate performance recommendations', async () => {
      const profiler = getPerformanceProfiler(true);
      
      // Simulate slow storage operation
      mockPerformanceNow
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1150); // 150ms - above threshold
      
      await profiler.profileStorage('slowOperation', async () => {
        return 'result';
      });
      
      const report = profiler.generateReport();
      expect(report.recommendations).toContain(
        expect.stringContaining('Storage operations are slow')
      );
    });

    it('should track memory usage trends', () => {
      const profiler = getPerformanceProfiler(true);
      
      // Mock process.memoryUsage
      const originalMemoryUsage = process.memoryUsage;
      const mockMemoryUsage = jest.fn()
        .mockReturnValue({
          heapUsed: 1000000,
          heapTotal: 2000000,
          external: 100000,
          rss: 3000000,
          arrayBuffers: 50000,
        })
        .mockReturnValueOnce({
          heapUsed: 1000000,
          heapTotal: 2000000,
          external: 100000,
          rss: 3000000,
          arrayBuffers: 50000,
        })
        .mockReturnValueOnce({
          heapUsed: 1200000, // Increased
          heapTotal: 2000000,
          external: 100000,
          rss: 3000000,
          arrayBuffers: 50000,
        })
        .mockReturnValueOnce({
          heapUsed: 1200000, // For trend calculation
          heapTotal: 2000000,
          external: 100000,
          rss: 3000000,
          arrayBuffers: 50000,
        });
      
      // Replace the global process.memoryUsage
      (global as any).process = {
        ...process,
        memoryUsage: mockMemoryUsage,
      };
      
      const snapshot1 = profiler.takeMemorySnapshot();
      const snapshot2 = profiler.takeMemorySnapshot();
      
      expect(snapshot1.heapUsed).toBe(1000000);
      expect(snapshot2.heapUsed).toBe(1200000);
      
      const trend = profiler.getMemoryTrend();
      expect(trend.trend).toBe('increasing');
      
      // Restore original function
      (global as any).process = {
        ...process,
        memoryUsage: originalMemoryUsage,
      };
    });

    it('should identify performance bottlenecks', async () => {
      const profiler = getPerformanceProfiler(true);
      
      // Create multiple operations with different durations
      mockPerformanceNow
        .mockReturnValueOnce(1000).mockReturnValueOnce(1100) // 100ms
        .mockReturnValueOnce(2000).mockReturnValueOnce(2300) // 300ms
        .mockReturnValueOnce(3000).mockReturnValueOnce(3050); // 50ms
      
      await profiler.profileStorage('fastOp', async () => 'result');
      await profiler.profileStorage('slowOp', async () => 'result');
      await profiler.profileComputation('mediumOp', async () => 'result');
      
      const bottlenecks = profiler.getBottlenecks();
      
      expect(bottlenecks.slowestOperations[0].name).toBe('storage_slowOp');
      expect(bottlenecks.slowestOperations[0].duration).toBe(300);
      
      expect(bottlenecks.slowestCategories[0].category).toBe('storage');
    });

    it('should export profiling data', async () => {
      const profiler = getPerformanceProfiler(true);
      
      mockPerformanceNow
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100);
      
      await profiler.profileFunction('test', 'computation' as any, async () => 'result');
      
      const exportedData = profiler.exportData();
      
      expect(exportedData.metrics).toHaveLength(1);
      expect(exportedData.report.operationCount).toBe(1);
      expect(exportedData.exportTimestamp).toBeInstanceOf(Date);
    });

    it('should handle disabled profiling gracefully', async () => {
      const profiler = getPerformanceProfiler(false); // Disabled
      
      const result = await profiler.profileFunction(
        'test',
        'computation' as any,
        async () => 'result'
      );
      
      expect(result).toBe('result');
      
      const report = profiler.generateReport();
      expect(report.operationCount).toBe(0);
    });

    it('should track memory usage during API calls', async () => {
      const profiler = getPerformanceProfiler(true);
      
      // Mock process.memoryUsage for memory tracking
      const originalMemoryUsage = process.memoryUsage;
      const mockMemoryUsage = jest.fn()
        .mockReturnValueOnce({
          heapUsed: 1000000,
          heapTotal: 2000000,
          external: 100000,
          rss: 3000000,
          arrayBuffers: 50000,
        })
        .mockReturnValueOnce({
          heapUsed: 1500000, // Increased by 500KB
          heapTotal: 2000000,
          external: 100000,
          rss: 3000000,
          arrayBuffers: 50000,
        });
      
      // Replace the global process.memoryUsage
      (global as any).process = {
        ...process,
        memoryUsage: mockMemoryUsage,
      };
      
      mockPerformanceNow
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100);
      
      const result = await profiler.profileApiCall('memory-test', async () => {
        return 'test-result';
      });
      
      expect(result).toBe('test-result');
      
      // Restore original function
      (global as any).process = {
        ...process,
        memoryUsage: originalMemoryUsage,
      };
    });

    it('should detect caching opportunities from repeated operations', async () => {
      const profiler = getPerformanceProfiler(true);
      
      // Simulate repeated operations
      for (let i = 0; i < 25; i++) {
        mockPerformanceNow
          .mockReturnValueOnce(1000 + i * 100)
          .mockReturnValueOnce(1010 + i * 100);
        
        await profiler.profileFunction('repeated-computation', 'computation' as any, async () => {
          return 'result';
        });
      }
      
      const report = profiler.generateReport();
      
      expect(report.recommendations).toContain(
        expect.stringContaining('repeated frequently')
      );
    });
  });

  describe('Integration Tests', () => {
    it('should work together for optimal performance', async () => {
      const lazyLoader = getLazyLoader();
      const cacheManager = getCacheManager();
      const batchProcessor = getBatchProcessor();
      const profiler = getPerformanceProfiler(true);
      
      // Simulate a complete workflow
      mockPerformanceNow
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1050);
      
      // Load storage service lazily
      const storageService = await lazyLoader.getStorageService();
      expect(storageService).toBeDefined();
      
      // Cache some data
      const testMetrics = { ...DEFAULT_USER_METRICS, appOpenCount: 5 };
      cacheManager.cacheUserMetrics(testMetrics);
      
      // Batch some updates
      batchProcessor.batchUpdateUserMetrics({ successfulFoodLogs: 3 });
      
      // Profile an operation
      await profiler.profileStorage('testOperation', async () => {
        return cacheManager.getCachedUserMetrics();
      });
      
      // Verify everything worked
      expect(lazyLoader.isComponentLoaded('storageService')).toBe(true);
      expect(cacheManager.getCachedUserMetrics()).toEqual(testMetrics);
      expect(batchProcessor.getQueueStatus().queueLength).toBe(1);
      expect(profiler.generateReport().operationCount).toBe(1);
    });

    it('should maintain performance under load', async () => {
      const cacheManager = getCacheManager();
      const batchProcessor = getBatchProcessor();
      const profiler = getPerformanceProfiler(true);
      
      const startTime = Date.now();
      
      // Simulate high load
      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(
          profiler.profileFunction(`operation_${i}`, 'computation' as any, async () => {
            cacheManager.set(`key_${i}`, `value_${i}`);
            batchProcessor.batchUpdateUserMetrics({ appOpenCount: i });
            return i;
          })
        );
      }
      
      await Promise.all(operations);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(totalTime).toBeLessThan(5000); // 5 seconds
      
      // Verify all operations completed
      const report = profiler.generateReport();
      expect(report.operationCount).toBe(100);
      
      const cacheStats = cacheManager.getStats();
      expect(cacheStats.totalSize).toBe(100);
      
      const batchStats = batchProcessor.getStats();
      expect(batchStats.operationsProcessed).toBeGreaterThan(0);
    });
  });
});