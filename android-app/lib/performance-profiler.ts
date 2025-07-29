/**
 * Performance profiler for the review system
 * Monitors and optimizes performance metrics, identifies bottlenecks
 */

// ============================================================================
// PERFORMANCE INTERFACES
// ============================================================================

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
  category: PerformanceCategory;
}

interface PerformanceReport {
  totalDuration: number;
  operationCount: number;
  averageDuration: number;
  slowestOperations: PerformanceMetric[];
  categoryBreakdown: Record<PerformanceCategory, {
    count: number;
    totalDuration: number;
    averageDuration: number;
  }>;
  recommendations: string[];
}

interface MemorySnapshot {
  timestamp: Date;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

enum PerformanceCategory {
  STORAGE = 'storage',
  API = 'api',
  COMPUTATION = 'computation',
  RENDERING = 'rendering',
  NETWORK = 'network',
}

// ============================================================================
// PERFORMANCE PROFILER CLASS
// ============================================================================

/**
 * Comprehensive performance profiler for the review system
 */
export class PerformanceProfiler {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private completedMetrics: PerformanceMetric[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private isEnabled = false;
  private maxMetricsHistory = 1000;
  private maxMemorySnapshots = 100;
  private memoryMonitorInterval: ReturnType<typeof setInterval> | null = null;

  constructor(enabled = false) {
    this.isEnabled = enabled;
    // Only start memory monitoring if enabled and not in test environment
    if (enabled && typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
      this.startMemoryMonitoring();
    }
  }

  // ============================================================================
  // PROFILING METHODS
  // ============================================================================

  /**
   * Start profiling an operation
   */
  startProfiling(name: string, category: PerformanceCategory, metadata?: Record<string, any>): string {
    if (!this.isEnabled) return name;

    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      category,
      metadata,
    };

    this.metrics.set(name, metric);
    return name;
  }

  /**
   * End profiling an operation
   */
  endProfiling(name: string): number {
    if (!this.isEnabled) return 0;

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`PerformanceProfiler: No metric found for ${name}`);
      return 0;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    // Move to completed metrics
    this.completedMetrics.push(metric);
    this.metrics.delete(name);

    // Maintain history limit
    if (this.completedMetrics.length > this.maxMetricsHistory) {
      this.completedMetrics = this.completedMetrics.slice(-this.maxMetricsHistory);
    }

    return metric.duration;
  }

  /**
   * Profile a function execution
   */
  async profileFunction<T>(
    name: string,
    category: PerformanceCategory,
    fn: () => Promise<T> | T,
    metadata?: Record<string, any>
  ): Promise<T> {
    if (!this.isEnabled) {
      return await fn();
    }

    this.startProfiling(name, category, metadata);

    try {
      const result = await fn();
      return result;
    } finally {
      this.endProfiling(name);
    }
  }

  /**
   * Profile storage operations
   */
  async profileStorage<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    return this.profileFunction(
      `storage_${operation}`,
      PerformanceCategory.STORAGE,
      fn,
      { operation }
    );
  }

  /**
   * Profile API calls with enhanced monitoring
   */
  async profileApiCall<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
    const startMemory = this.takeMemorySnapshot();

    const result = await this.profileFunction(
      `api_${endpoint}`,
      PerformanceCategory.API,
      fn,
      { endpoint, startMemory: startMemory.heapUsed }
    );

    const endMemory = this.takeMemorySnapshot();
    const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

    // Log significant memory usage
    if (memoryDelta > 1024 * 1024) { // 1MB
      console.warn(`API call ${endpoint} used ${Math.round(memoryDelta / 1024 / 1024)}MB memory`);
    }

    return result;
  }

  /**
   * Profile computations
   */
  async profileComputation<T>(computation: string, fn: () => Promise<T> | T): Promise<T> {
    return this.profileFunction(
      `computation_${computation}`,
      PerformanceCategory.COMPUTATION,
      fn,
      { computation }
    );
  }

  // ============================================================================
  // MEMORY MONITORING
  // ============================================================================

  /**
   * Take a memory snapshot
   */
  takeMemorySnapshot(): MemorySnapshot {
    let memoryUsage;
    try {
      memoryUsage = process.memoryUsage();
      if (!memoryUsage) {
        throw new Error('memoryUsage is null');
      }
    } catch (error) {
      // Fallback for environments where process.memoryUsage is not available
      memoryUsage = {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        arrayBuffers: 0,
      };
    }

    const snapshot: MemorySnapshot = {
      timestamp: new Date(),
      heapUsed: memoryUsage.heapUsed || 0,
      heapTotal: memoryUsage.heapTotal || 0,
      external: memoryUsage.external || 0,
      rss: memoryUsage.rss || 0,
    };

    if (this.isEnabled) {
      this.memorySnapshots.push(snapshot);

      // Maintain history limit
      if (this.memorySnapshots.length > this.maxMemorySnapshots) {
        this.memorySnapshots = this.memorySnapshots.slice(-this.maxMemorySnapshots);
      }
    }

    return snapshot;
  }

  /**
   * Get memory usage trend
   */
  getMemoryTrend(): {
    current: MemorySnapshot;
    trend: 'increasing' | 'decreasing' | 'stable';
    changeRate: number;
  } {
    const current = this.takeMemorySnapshot();

    if (this.memorySnapshots.length < 2) {
      return {
        current,
        trend: 'stable',
        changeRate: 0,
      };
    }

    const recent = this.memorySnapshots.slice(-10);
    const first = recent[0];
    const last = recent[recent.length - 1];

    const changeRate = (last.heapUsed - first.heapUsed) / first.heapUsed;

    let trend: 'increasing' | 'decreasing' | 'stable';
    if (changeRate > 0.1) {
      trend = 'increasing';
    } else if (changeRate < -0.1) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    return {
      current,
      trend,
      changeRate,
    };
  }

  // ============================================================================
  // ANALYSIS AND REPORTING
  // ============================================================================

  /**
   * Generate performance report
   */
  generateReport(): PerformanceReport {
    const metrics = this.completedMetrics;

    if (metrics.length === 0) {
      return {
        totalDuration: 0,
        operationCount: 0,
        averageDuration: 0,
        slowestOperations: [],
        categoryBreakdown: {} as any,
        recommendations: ['No performance data available'],
      };
    }

    const totalDuration = metrics.reduce((sum, metric) => sum + (metric.duration || 0), 0);
    const averageDuration = totalDuration / metrics.length;

    // Find slowest operations
    const slowestOperations = [...metrics]
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);

    // Category breakdown
    const categoryBreakdown: Record<PerformanceCategory, {
      count: number;
      totalDuration: number;
      averageDuration: number;
    }> = {} as any;

    Object.values(PerformanceCategory).forEach(category => {
      const categoryMetrics = metrics.filter(m => m.category === category);
      const categoryTotal = categoryMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);

      categoryBreakdown[category] = {
        count: categoryMetrics.length,
        totalDuration: categoryTotal,
        averageDuration: categoryMetrics.length > 0 ? categoryTotal / categoryMetrics.length : 0,
      };
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics, categoryBreakdown);

    return {
      totalDuration,
      operationCount: metrics.length,
      averageDuration,
      slowestOperations,
      categoryBreakdown,
      recommendations,
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    metrics: PerformanceMetric[],
    categoryBreakdown: Record<PerformanceCategory, any>
  ): string[] {
    const recommendations: string[] = [];

    // Check for slow storage operations
    if (categoryBreakdown[PerformanceCategory.STORAGE].averageDuration > 100) {
      recommendations.push('Storage operations are slow. Consider implementing caching or batching.');
    }

    // Check for slow API calls
    if (categoryBreakdown[PerformanceCategory.API].averageDuration > 500) {
      recommendations.push('API calls are slow. Consider implementing request caching or timeout optimization.');
    }

    // Check for slow computations
    if (categoryBreakdown[PerformanceCategory.COMPUTATION].averageDuration > 50) {
      recommendations.push('Computations are slow. Consider optimizing algorithms or using background processing.');
    }

    // Check memory usage
    const memoryTrend = this.getMemoryTrend();
    if (memoryTrend.trend === 'increasing' && memoryTrend.changeRate > 0.2) {
      recommendations.push('Memory usage is increasing. Check for memory leaks or implement cleanup.');
    }

    // Check for frequent operations
    const operationCounts = new Map<string, number>();
    metrics.forEach(metric => {
      const baseName = metric.name.split('_')[0];
      operationCounts.set(baseName, (operationCounts.get(baseName) || 0) + 1);
    });

    operationCounts.forEach((count, operation) => {
      if (count > 100) {
        recommendations.push(`Operation "${operation}" is called frequently (${count} times). Consider optimization.`);
      }
    });

    // Check for optimization opportunities
    const storageOps = metrics.filter(m => m.category === PerformanceCategory.STORAGE);
    if (storageOps.length > 50) {
      recommendations.push('High storage operation frequency detected. Consider implementing batch processing.');
    }

    // Check for memory efficiency
    if (this.memorySnapshots.length > 10) {
      const recentSnapshots = this.memorySnapshots.slice(-10);
      const avgMemoryUsage = recentSnapshots.reduce((sum, s) => sum + s.heapUsed, 0) / recentSnapshots.length;

      if (avgMemoryUsage > 50 * 1024 * 1024) { // 50MB
        recommendations.push('High memory usage detected. Consider implementing memory optimization strategies.');
      }
    }

    // Check for caching opportunities
    const duplicateOperations = new Map<string, number>();
    metrics.forEach(metric => {
      const key = `${metric.category}_${metric.name}`;
      duplicateOperations.set(key, (duplicateOperations.get(key) || 0) + 1);
    });

    duplicateOperations.forEach((count, operation) => {
      if (count > 20) {
        recommendations.push(`Operation "${operation}" is repeated frequently. Consider caching results.`);
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Performance looks good! No specific recommendations.');
    }

    return recommendations;
  }

  /**
   * Get bottlenecks analysis
   */
  getBottlenecks(): {
    slowestOperations: Array<{
      name: string;
      duration: number;
      category: PerformanceCategory;
      frequency: number;
    }>;
    slowestCategories: Array<{
      category: PerformanceCategory;
      averageDuration: number;
      totalDuration: number;
      count: number;
    }>;
  } {
    const metrics = this.completedMetrics;

    // Analyze operation frequency and duration
    const operationStats = new Map<string, {
      totalDuration: number;
      count: number;
      category: PerformanceCategory;
    }>();

    metrics.forEach(metric => {
      const existing = operationStats.get(metric.name) || {
        totalDuration: 0,
        count: 0,
        category: metric.category,
      };

      existing.totalDuration += metric.duration || 0;
      existing.count += 1;
      operationStats.set(metric.name, existing);
    });

    // Find slowest operations
    const slowestOperations = Array.from(operationStats.entries())
      .map(([name, stats]) => ({
        name,
        duration: stats.totalDuration / stats.count,
        category: stats.category,
        frequency: stats.count,
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    // Analyze categories
    const categoryStats = new Map<PerformanceCategory, {
      totalDuration: number;
      count: number;
    }>();

    metrics.forEach(metric => {
      const existing = categoryStats.get(metric.category) || {
        totalDuration: 0,
        count: 0,
      };

      existing.totalDuration += metric.duration || 0;
      existing.count += 1;
      categoryStats.set(metric.category, existing);
    });

    const slowestCategories = Array.from(categoryStats.entries())
      .map(([category, stats]) => ({
        category,
        averageDuration: stats.totalDuration / stats.count,
        totalDuration: stats.totalDuration,
        count: stats.count,
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration);

    return {
      slowestOperations,
      slowestCategories,
    };
  }

  // ============================================================================
  // CONFIGURATION AND CONTROL
  // ============================================================================

  /**
   * Enable or disable profiling
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;

    if (enabled) {
      this.startMemoryMonitoring();
    } else {
      this.stopMemoryMonitoring();
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.completedMetrics = [];
    this.memorySnapshots = [];
  }

  /**
   * Get current profiling status
   */
  getStatus(): {
    enabled: boolean;
    activeMetrics: number;
    completedMetrics: number;
    memorySnapshots: number;
  } {
    return {
      enabled: this.isEnabled,
      activeMetrics: this.metrics.size,
      completedMetrics: this.completedMetrics.length,
      memorySnapshots: this.memorySnapshots.length,
    };
  }

  /**
   * Export profiling data
   */
  exportData(): {
    metrics: PerformanceMetric[];
    memorySnapshots: MemorySnapshot[];
    report: PerformanceReport;
    exportTimestamp: Date;
  } {
    return {
      metrics: [...this.completedMetrics],
      memorySnapshots: [...this.memorySnapshots],
      report: this.generateReport(),
      exportTimestamp: new Date(),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }

    this.memoryMonitorInterval = setInterval(() => {
      this.takeMemorySnapshot();
    }, 5000); // Every 5 seconds
  }

  /**
   * Stop memory monitoring
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }
  }

  /**
   * Cleanup on destruction
   */
  destroy(): void {
    this.stopMemoryMonitoring();
    this.clearMetrics();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let performanceProfilerInstance: PerformanceProfiler | null = null;

/**
 * Get the singleton performance profiler instance
 */
export function getPerformanceProfiler(enabled?: boolean): PerformanceProfiler {
  if (!performanceProfilerInstance) {
    performanceProfilerInstance = new PerformanceProfiler(enabled);
  }

  if (enabled !== undefined) {
    performanceProfilerInstance.setEnabled(enabled);
  }

  return performanceProfilerInstance;
}

/**
 * Reset the performance profiler instance (for testing)
 */
export function resetPerformanceProfiler(): void {
  if (performanceProfilerInstance) {
    performanceProfilerInstance.destroy();
  }
  performanceProfilerInstance = null;
}