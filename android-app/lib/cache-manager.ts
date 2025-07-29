/**
 * Cache manager for review system data
 * Provides intelligent caching for review availability, user metrics, and settings
 */

import { UserMetrics, ReviewSettings } from './types/review-types';

// ============================================================================
// CACHE INTERFACES
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  ttl: number; // Time to live in milliseconds
  accessCount: number;
  lastAccessed: Date;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalSize: number;
  hitRate: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTtl: number;
  cleanupInterval: number;
  enableStats: boolean;
}

// ============================================================================
// CACHE MANAGER CLASS
// ============================================================================

/**
 * Intelligent cache manager for review system data
 */
export class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalSize: 0,
    hitRate: 0,
  };
  private config: CacheConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 100,
      defaultTtl: 5 * 60 * 1000, // 5 minutes
      cleanupInterval: 60 * 1000, // 1 minute
      enableStats: true,
      ...config,
    };

    this.startCleanupTimer();
  }

  // ============================================================================
  // CORE CACHE OPERATIONS
  // ============================================================================

  /**
   * Get data from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.recordMiss();
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.recordMiss();
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = new Date();
    this.recordHit();

    return entry.data;
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const actualTtl = ttl || this.config.defaultTtl;
    
    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: new Date(),
      ttl: actualTtl,
      accessCount: 0,
      lastAccessed: new Date(),
    };

    this.cache.set(key, entry);
    this.updateStats();
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.updateStats();
    }
    return deleted;
  }

  /**
   * Check if key exists in cache and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  // ============================================================================
  // SPECIALIZED CACHE METHODS
  // ============================================================================

  /**
   * Cache user metrics with optimized TTL
   */
  cacheUserMetrics(metrics: UserMetrics): void {
    // User metrics change frequently, shorter TTL
    this.set('user_metrics', metrics, 2 * 60 * 1000); // 2 minutes
  }

  /**
   * Get cached user metrics
   */
  getCachedUserMetrics(): UserMetrics | null {
    return this.get<UserMetrics>('user_metrics');
  }

  /**
   * Cache review settings with longer TTL
   */
  cacheReviewSettings(settings: ReviewSettings): void {
    // Settings change less frequently, longer TTL
    this.set('review_settings', settings, 10 * 60 * 1000); // 10 minutes
  }

  /**
   * Get cached review settings
   */
  getCachedReviewSettings(): ReviewSettings | null {
    return this.get<ReviewSettings>('review_settings');
  }

  /**
   * Cache review availability status
   */
  cacheReviewAvailability(isAvailable: boolean): void {
    // Review availability can change, moderate TTL
    this.set('review_availability', isAvailable, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Get cached review availability
   */
  getCachedReviewAvailability(): boolean | null {
    return this.get<boolean>('review_availability');
  }

  /**
   * Cache next eligible time for review
   */
  cacheNextEligibleTime(nextTime: Date | null): void {
    // Eligible time calculation is expensive, cache for longer
    this.set('next_eligible_time', nextTime, 15 * 60 * 1000); // 15 minutes
  }

  /**
   * Get cached next eligible time
   */
  getCachedNextEligibleTime(): Date | null {
    return this.get<Date | null>('next_eligible_time');
  }

  /**
   * Cache trigger evaluation result with intelligent TTL
   */
  cacheTriggerEvaluation(trigger: string, context: any, result: any): void {
    const key = `trigger_eval_${trigger}_${this.hashContext(context)}`;
    
    // Adjust TTL based on result confidence and trigger type
    let ttl = 30 * 1000; // Default 30 seconds
    
    if (result.confidence > 0.8) {
      ttl = 60 * 1000; // High confidence results cache longer
    } else if (result.confidence < 0.3) {
      ttl = 10 * 1000; // Low confidence results cache shorter
    }
    
    // Critical triggers cache shorter to ensure responsiveness
    if (trigger === 'milestone_achieved' || trigger === 'goal_completed') {
      ttl = Math.min(ttl, 15 * 1000);
    }
    
    this.set(key, result, ttl);
  }

  /**
   * Get cached trigger evaluation
   */
  getCachedTriggerEvaluation(trigger: string, context: any): any | null {
    const key = `trigger_eval_${trigger}_${this.hashContext(context)}`;
    return this.get(key);
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  /**
   * Set multiple cache entries at once with optimized batch processing
   */
  setBatch(entries: Array<{ key: string; data: any; ttl?: number }>): void {
    // Check if we need to evict entries before batch operation
    const newEntriesCount = entries.filter(({ key }) => !this.cache.has(key)).length;
    const availableSpace = this.config.maxSize - this.cache.size;
    
    if (newEntriesCount > availableSpace) {
      // Evict multiple entries at once for better performance
      const evictCount = newEntriesCount - availableSpace;
      this.evictMultiple(evictCount);
    }

    // Batch set operations
    entries.forEach(({ key, data, ttl }) => {
      this.set(key, data, ttl);
    });
  }

  /**
   * Get multiple cache entries at once
   */
  getBatch<T>(keys: string[]): Record<string, T | null> {
    const result: Record<string, T | null> = {};
    
    keys.forEach(key => {
      result[key] = this.get<T>(key);
    });

    return result;
  }

  /**
   * Delete multiple cache entries at once
   */
  deleteBatch(keys: string[]): number {
    let deletedCount = 0;
    
    keys.forEach(key => {
      if (this.delete(key)) {
        deletedCount++;
      }
    });

    return deletedCount;
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Manually trigger cache cleanup
   */
  cleanup(): void {
    const now = new Date();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.stats.evictions++;
    });

    this.updateStats();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get detailed cache information
   */
  getCacheInfo(): {
    size: number;
    maxSize: number;
    entries: Array<{
      key: string;
      size: number;
      age: number;
      accessCount: number;
      lastAccessed: Date;
    }>;
  } {
    const entries: Array<{
      key: string;
      size: number;
      age: number;
      accessCount: number;
      lastAccessed: Date;
    }> = [];

    const now = new Date();

    this.cache.forEach((entry, key) => {
      entries.push({
        key,
        size: this.estimateSize(entry.data),
        age: now.getTime() - entry.timestamp.getTime(),
        accessCount: entry.accessCount,
        lastAccessed: entry.lastAccessed,
      });
    });

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      entries: entries.sort((a, b) => b.accessCount - a.accessCount),
    };
  }

  /**
   * Optimize cache by removing least useful entries
   */
  optimize(): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by usefulness score (access count / age)
    entries.sort(([, a], [, b]) => {
      const scoreA = this.calculateUsefulnessScore(a);
      const scoreB = this.calculateUsefulnessScore(b);
      return scoreB - scoreA;
    });

    // Keep only the most useful entries
    const keepCount = Math.floor(this.config.maxSize * 0.8);
    const toKeep = entries.slice(0, keepCount);
    const toRemove = entries.slice(keepCount);

    this.cache.clear();
    toKeep.forEach(([key, entry]) => {
      this.cache.set(key, entry);
    });

    this.stats.evictions += toRemove.length;
    this.updateStats();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Check if cache entry has expired
   */
  private isExpired(entry: CacheEntry<any>): boolean {
    const now = Date.now();
    return (now - entry.timestamp.getTime()) > entry.ttl;
  }

  /**
   * Evict least recently used entry
   */
  private evictLeastRecentlyUsed(): void {
    this.evictMultiple(1);
  }

  /**
   * Evict multiple least recently used entries for better batch performance
   */
  private evictMultiple(count: number): void {
    if (count <= 0 || this.cache.size === 0) return;

    // Convert to array and sort by last accessed time
    const entries = Array.from(this.cache.entries());
    entries.sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

    // Remove the oldest entries
    const toEvict = entries.slice(0, Math.min(count, entries.length));
    toEvict.forEach(([key]) => {
      this.cache.delete(key);
      this.stats.evictions++;
    });
  }

  /**
   * Calculate usefulness score for cache optimization
   */
  private calculateUsefulnessScore(entry: CacheEntry<any>): number {
    const age = Date.now() - entry.timestamp.getTime();
    const ageInMinutes = age / (60 * 1000);
    
    // Score based on access frequency and recency
    return entry.accessCount / Math.max(1, ageInMinutes);
  }

  /**
   * Record cache hit
   */
  private recordHit(): void {
    if (this.config.enableStats) {
      this.stats.hits++;
      this.updateHitRate();
    }
  }

  /**
   * Record cache miss
   */
  private recordMiss(): void {
    if (this.config.enableStats) {
      this.stats.misses++;
      this.updateHitRate();
    }
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    if (this.config.enableStats) {
      this.stats.totalSize = this.cache.size;
    }
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSize: 0,
      hitRate: 0,
    };
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Estimate size of cached data
   */
  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }

  /**
   * Create hash of context for cache key
   */
  private hashContext(context: any): string {
    try {
      const str = JSON.stringify(context);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash.toString(36);
    } catch {
      return 'unknown';
    }
  }

  /**
   * Cleanup on destruction
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let cacheManagerInstance: CacheManager | null = null;

/**
 * Get the singleton cache manager instance
 */
export function getCacheManager(config?: Partial<CacheConfig>): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager(config);
  }
  return cacheManagerInstance;
}

/**
 * Reset the cache manager instance (for testing)
 */
export function resetCacheManager(): void {
  if (cacheManagerInstance) {
    cacheManagerInstance.destroy();
  }
  cacheManagerInstance = null;
}