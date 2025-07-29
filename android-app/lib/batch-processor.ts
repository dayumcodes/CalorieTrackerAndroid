/**
 * Batch processor for storage operations
 * Optimizes performance by batching operations and processing them in background
 */

import { UserMetrics, ReviewSettings, UserAction } from './types/review-types';

// ============================================================================
// BATCH PROCESSOR INTERFACES
// ============================================================================

interface BatchOperation {
  id: string;
  type: 'update_metrics' | 'update_settings' | 'user_action';
  data: any;
  timestamp: Date;
  priority: number;
  retryCount: number;
}

interface BatchConfig {
  maxBatchSize: number;
  flushInterval: number;
  maxRetries: number;
  priorityThreshold: number;
  backgroundProcessing: boolean;
}

interface BatchStats {
  operationsProcessed: number;
  batchesProcessed: number;
  averageBatchSize: number;
  averageProcessingTime: number;
  failedOperations: number;
}

// ============================================================================
// BATCH PROCESSOR CLASS
// ============================================================================

/**
 * Handles batching and background processing of storage operations
 */
export class BatchProcessor {
  private operationQueue: BatchOperation[] = [];
  private isProcessing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private config: BatchConfig;
  private stats: BatchStats = {
    operationsProcessed: 0,
    batchesProcessed: 0,
    averageBatchSize: 0,
    averageProcessingTime: 0,
    failedOperations: 0,
  };
  private processingTimes: number[] = [];

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = {
      maxBatchSize: 10,
      flushInterval: 2000, // 2 seconds
      maxRetries: 3,
      priorityThreshold: 5,
      backgroundProcessing: true,
      ...config,
    };

    this.startFlushTimer();
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Add user metrics update to batch
   */
  batchUpdateUserMetrics(updates: Partial<UserMetrics>, priority: number = 1): string {
    return this.addOperation({
      type: 'update_metrics',
      data: updates,
      priority,
    });
  }

  /**
   * Add review settings update to batch
   */
  batchUpdateReviewSettings(updates: Partial<ReviewSettings>, priority: number = 1): string {
    return this.addOperation({
      type: 'update_settings',
      data: updates,
      priority,
    });
  }

  /**
   * Add user action to batch
   */
  batchUserAction(action: UserAction, priority: number = 1): string {
    return this.addOperation({
      type: 'user_action',
      data: action,
      priority,
    });
  }

  /**
   * Force flush all pending operations
   */
  async flush(): Promise<void> {
    if (this.operationQueue.length === 0) {
      return;
    }

    await this.processBatch();
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): {
    queueLength: number;
    isProcessing: boolean;
    highPriorityCount: number;
    oldestOperation: Date | null;
  } {
    const highPriorityCount = this.operationQueue.filter(
      op => op.priority >= this.config.priorityThreshold
    ).length;

    const oldestOperation = this.operationQueue.length > 0
      ? this.operationQueue[0].timestamp
      : null;

    return {
      queueLength: this.operationQueue.length,
      isProcessing: this.isProcessing,
      highPriorityCount,
      oldestOperation,
    };
  }

  /**
   * Get batch processing statistics
   */
  getStats(): BatchStats {
    return { ...this.stats };
  }

  /**
   * Clear all pending operations
   */
  clearQueue(): void {
    this.operationQueue = [];
  }

  /**
   * Update batch configuration
   */
  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart timer if interval changed
    if (newConfig.flushInterval !== undefined) {
      this.stopFlushTimer();
      this.startFlushTimer();
    }
  }

  /**
   * Destroy the batch processor
   */
  destroy(): void {
    this.stopFlushTimer();
    this.clearQueue();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Add operation to the batch queue
   */
  private addOperation(operation: Omit<BatchOperation, 'id' | 'timestamp' | 'retryCount'>): string {
    const id = this.generateOperationId();
    
    const batchOperation: BatchOperation = {
      id,
      timestamp: new Date(),
      retryCount: 0,
      ...operation,
    };

    // Insert operation based on priority
    this.insertByPriority(batchOperation);

    // Process immediately if high priority or queue is full
    if (operation.priority >= this.config.priorityThreshold || 
        this.operationQueue.length >= this.config.maxBatchSize) {
      this.scheduleProcessing();
    }

    return id;
  }

  /**
   * Insert operation into queue based on priority
   */
  private insertByPriority(operation: BatchOperation): void {
    let insertIndex = this.operationQueue.length;
    
    // Find insertion point based on priority (higher priority first)
    for (let i = 0; i < this.operationQueue.length; i++) {
      if (this.operationQueue[i].priority < operation.priority) {
        insertIndex = i;
        break;
      }
    }

    this.operationQueue.splice(insertIndex, 0, operation);
  }

  /**
   * Schedule batch processing
   */
  private scheduleProcessing(): void {
    if (this.isProcessing) {
      return;
    }

    if (this.config.backgroundProcessing) {
      // Use setTimeout for background processing
      setTimeout(() => this.processBatch(), 0);
    } else {
      // Process immediately
      this.processBatch();
    }
  }

  /**
   * Process a batch of operations
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Get batch to process
      const batchSize = Math.min(this.config.maxBatchSize, this.operationQueue.length);
      const batch = this.operationQueue.splice(0, batchSize);

      // Group operations by type for efficient processing
      const groupedOperations = this.groupOperationsByType(batch);

      // Process each group
      await Promise.all([
        this.processMetricsUpdates(groupedOperations.update_metrics || []),
        this.processSettingsUpdates(groupedOperations.update_settings || []),
        this.processUserActions(groupedOperations.user_action || []),
      ]);

      // Update statistics
      const processingTime = Date.now() - startTime;
      this.updateStats(batch.length, processingTime);

    } catch (error) {
      console.error('BatchProcessor: Error processing batch:', error);
      // Handle failed operations
      await this.handleBatchError(error);
    } finally {
      this.isProcessing = false;
      
      // Continue processing if there are more operations
      if (this.operationQueue.length > 0) {
        this.scheduleProcessing();
      }
    }
  }

  /**
   * Group operations by type for efficient processing
   */
  private groupOperationsByType(operations: BatchOperation[]): Record<string, BatchOperation[]> {
    const grouped: Record<string, BatchOperation[]> = {};
    
    operations.forEach(operation => {
      if (!grouped[operation.type]) {
        grouped[operation.type] = [];
      }
      grouped[operation.type].push(operation);
    });

    return grouped;
  }

  /**
   * Process user metrics updates with intelligent merging
   */
  private async processMetricsUpdates(operations: BatchOperation[]): Promise<void> {
    if (operations.length === 0) return;

    try {
      // Intelligent merging - handle special cases
      const mergedUpdates: Partial<UserMetrics> = {};
      let hasCounterUpdates = false;
      let hasTimestampUpdates = false;
      
      operations.forEach(operation => {
        const data = operation.data;
        
        // Handle counter fields (sum them up)
        if ('appOpenCount' in data || 'successfulFoodLogs' in data) {
          hasCounterUpdates = true;
          mergedUpdates.appOpenCount = (mergedUpdates.appOpenCount || 0) + (data.appOpenCount || 0);
          mergedUpdates.successfulFoodLogs = (mergedUpdates.successfulFoodLogs || 0) + (data.successfulFoodLogs || 0);
        }
        
        // Handle timestamp fields (use latest)
        if ('lastReviewPrompt' in data || 'lastAppOpen' in data) {
          hasTimestampUpdates = true;
          if (data.lastReviewPrompt && (!mergedUpdates.lastReviewPrompt || data.lastReviewPrompt > mergedUpdates.lastReviewPrompt)) {
            mergedUpdates.lastReviewPrompt = data.lastReviewPrompt;
          }
          if (data.lastAppOpen && (!mergedUpdates.lastAppOpen || data.lastAppOpen > mergedUpdates.lastAppOpen)) {
            mergedUpdates.lastAppOpen = data.lastAppOpen;
          }
        }
        
        // Handle other fields (overwrite)
        Object.keys(data).forEach(key => {
          if (!['appOpenCount', 'successfulFoodLogs', 'lastReviewPrompt', 'lastAppOpen'].includes(key)) {
            mergedUpdates[key as keyof UserMetrics] = data[key];
          }
        });
      });

      // Use require for better test compatibility
      const { storageService } = require('./storage-service');
      await storageService.updateUserMetrics(mergedUpdates);

      this.stats.operationsProcessed += operations.length;
    } catch (error) {
      await this.handleOperationErrors(operations, error);
    }
  }

  /**
   * Process review settings updates with conflict resolution
   */
  private async processSettingsUpdates(operations: BatchOperation[]): Promise<void> {
    if (operations.length === 0) return;

    try {
      // Sort operations by timestamp to handle conflicts properly
      const sortedOps = operations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Merge settings with last-write-wins for conflicts
      const mergedUpdates: Partial<ReviewSettings> = {};
      
      sortedOps.forEach(operation => {
        Object.assign(mergedUpdates, operation.data);
      });

      // Use require for better test compatibility
      const { storageService } = require('./storage-service');
      await storageService.updateReviewSettings(mergedUpdates);

      this.stats.operationsProcessed += operations.length;
    } catch (error) {
      await this.handleOperationErrors(operations, error);
    }
  }

  /**
   * Process user actions with optimized batch handling
   */
  private async processUserActions(operations: BatchOperation[]): Promise<void> {
    if (operations.length === 0) return;

    try {
      // Use require for better test compatibility
      const { getLazyLoader } = require('./lazy-loader');
      const lazyLoader = getLazyLoader();
      const triggerEngine = await lazyLoader.getTriggerEngine();
      
      // Group similar actions for batch processing
      const actionGroups = new Map<string, UserAction[]>();
      
      operations.forEach(operation => {
        const actionType = operation.data.type;
        if (!actionGroups.has(actionType)) {
          actionGroups.set(actionType, []);
        }
        actionGroups.get(actionType)!.push(operation.data);
      });

      // Process each group
      for (const [actionType, actions] of actionGroups) {
        if (actions.length === 1) {
          // Single action - process normally
          await triggerEngine.updateUserMetrics(actions[0]);
        } else {
          // Multiple similar actions - batch process if possible
          await this.processBatchedUserActions(triggerEngine, actions);
        }
      }

      this.stats.operationsProcessed += operations.length;
    } catch (error) {
      await this.handleOperationErrors(operations, error);
    }
  }

  /**
   * Process batched user actions of the same type
   */
  private async processBatchedUserActions(triggerEngine: any, actions: UserAction[]): Promise<void> {
    // For actions that can be batched (like app_open), aggregate them
    if (actions[0].type === 'app_open') {
      // Create a single aggregated action
      const aggregatedAction: UserAction = {
        type: 'app_open',
        timestamp: actions[actions.length - 1].timestamp, // Use latest timestamp
        metadata: {
          ...actions[actions.length - 1].metadata,
          batchCount: actions.length,
          timeRange: {
            start: actions[0].timestamp,
            end: actions[actions.length - 1].timestamp,
          },
        },
      };
      
      await triggerEngine.updateUserMetrics(aggregatedAction);
    } else {
      // For other actions, process individually
      for (const action of actions) {
        await triggerEngine.updateUserMetrics(action);
      }
    }
  }

  /**
   * Handle errors for specific operations
   */
  private async handleOperationErrors(operations: BatchOperation[], error: any): Promise<void> {
    console.error('BatchProcessor: Error processing operations:', error);

    // Retry failed operations
    for (const operation of operations) {
      if (operation.retryCount < this.config.maxRetries) {
        operation.retryCount++;
        this.insertByPriority(operation);
      } else {
        this.stats.failedOperations++;
        console.error(`BatchProcessor: Operation ${operation.id} failed after ${this.config.maxRetries} retries`);
      }
    }
  }

  /**
   * Handle batch processing errors
   */
  private async handleBatchError(error: any): Promise<void> {
    console.error('BatchProcessor: Batch processing error:', error);
    // In case of batch error, we've already handled individual operation errors
  }

  /**
   * Update processing statistics
   */
  private updateStats(batchSize: number, processingTime: number): void {
    this.stats.batchesProcessed++;
    this.processingTimes.push(processingTime);

    // Keep only recent processing times for average calculation
    if (this.processingTimes.length > 100) {
      this.processingTimes = this.processingTimes.slice(-100);
    }

    // Update averages
    this.stats.averageBatchSize = this.stats.operationsProcessed / this.stats.batchesProcessed;
    this.stats.averageProcessingTime = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
  }

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.operationQueue.length > 0) {
        this.scheduleProcessing();
      }
    }, this.config.flushInterval);
  }

  /**
   * Stop the flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `batch_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let batchProcessorInstance: BatchProcessor | null = null;

/**
 * Get the singleton batch processor instance
 */
export function getBatchProcessor(config?: Partial<BatchConfig>): BatchProcessor {
  if (!batchProcessorInstance) {
    batchProcessorInstance = new BatchProcessor(config);
  }
  return batchProcessorInstance;
}

/**
 * Reset the batch processor instance (for testing)
 */
export function resetBatchProcessor(): void {
  if (batchProcessorInstance) {
    batchProcessorInstance.destroy();
  }
  batchProcessorInstance = null;
}