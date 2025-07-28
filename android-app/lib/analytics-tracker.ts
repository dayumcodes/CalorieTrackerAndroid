/**
 * Analytics and tracking functionality for the in-app review system
 * This service handles logging review-related events, performance metrics,
 * and debugging information for optimization and monitoring.
 */

import {
  ReviewContext,
  ReviewAction,
  ReviewError,
  ReviewTrigger,
  ReviewErrorType,
  UserAction,
} from './types/review-types';

// ============================================================================
// ANALYTICS INTERFACES
// ============================================================================

/**
 * Analytics event for review system tracking
 */
export interface ReviewAnalyticsEvent {
  eventType: ReviewEventType;
  timestamp: Date;
  context?: ReviewContext;
  metadata?: Record<string, any>;
  sessionId: string;
  userId?: string;
}

/**
 * Performance metrics for review system optimization
 */
export interface ReviewPerformanceMetrics {
  promptDisplayTime: number; // milliseconds
  apiResponseTime: number; // milliseconds
  storageOperationTime: number; // milliseconds
  memoryUsage: number; // bytes
  triggerEvaluationTime: number; // milliseconds
}

/**
 * Debug log entry for development mode
 */
export interface ReviewDebugLog {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: any;
  sessionId: string;
}

/**
 * Types of review-related events to track
 */
export enum ReviewEventType {
  PROMPT_SHOWN = 'prompt_shown',
  PROMPT_DISMISSED = 'prompt_dismissed',
  REVIEW_COMPLETED = 'review_completed',
  REVIEW_ERROR = 'review_error',
  TRIGGER_EVALUATED = 'trigger_evaluated',
  USER_ACTION_RECORDED = 'user_action_recorded',
  PERFORMANCE_METRIC = 'performance_metric',
  FALLBACK_USED = 'fallback_used',
  API_CALL_MADE = 'api_call_made',
  STORAGE_OPERATION = 'storage_operation',
}

/**
 * Log levels for debugging
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

// ============================================================================
// ANALYTICS TRACKER IMPLEMENTATION
// ============================================================================

/**
 * Main analytics tracker for the review system
 */
export class AnalyticsTracker {
  private events: ReviewAnalyticsEvent[] = [];
  private performanceMetrics: ReviewPerformanceMetrics[] = [];
  private debugLogs: ReviewDebugLog[] = [];
  private sessionId: string;
  private isDebugMode: boolean = false;
  private maxEventHistory: number = 1000;
  private maxPerformanceHistory: number = 100;
  private maxDebugHistory: number = 500;

  constructor(debugMode: boolean = false) {
    this.sessionId = this.generateSessionId();
    this.isDebugMode = debugMode;
    this.log(LogLevel.INFO, 'AnalyticsTracker initialized', { sessionId: this.sessionId });
  }

  // ============================================================================
  // PUBLIC METHODS - Event Tracking
  // ============================================================================

  /**
   * Track when a review prompt is shown to the user
   */
  trackReviewPromptShown(context: ReviewContext): void {
    const startTime = Date.now();
    
    this.addEvent({
      eventType: ReviewEventType.PROMPT_SHOWN,
      timestamp: new Date(),
      context,
      metadata: {
        trigger: context.trigger,
        userAppOpenCount: context.userState.appOpenCount,
        userStreakDays: context.userState.streakDays,
        currentScreen: context.appState.currentScreen,
      },
      sessionId: this.sessionId,
    });

    // Track performance metric for prompt display
    const displayTime = Date.now() - startTime;
    this.trackPerformanceMetric({
      promptDisplayTime: displayTime,
      apiResponseTime: 0,
      storageOperationTime: 0,
      memoryUsage: this.getMemoryUsage(),
      triggerEvaluationTime: 0,
    });

    this.log(LogLevel.INFO, 'Review prompt shown', {
      trigger: context.trigger,
      displayTime,
      userState: context.userState,
    });
  }

  /**
   * Track user actions on review prompts
   */
  trackReviewAction(action: ReviewAction, context: ReviewContext): void {
    this.addEvent({
      eventType: this.getEventTypeForAction(action),
      timestamp: new Date(),
      context,
      metadata: {
        action,
        trigger: context.trigger,
        timeSincePrompt: this.getTimeSinceLastPrompt(),
      },
      sessionId: this.sessionId,
    });

    this.log(LogLevel.INFO, `Review action: ${action}`, {
      action,
      trigger: context.trigger,
      context,
    });
  }

  /**
   * Track errors in the review system
   */
  trackError(error: ReviewError): void {
    this.addEvent({
      eventType: ReviewEventType.REVIEW_ERROR,
      timestamp: new Date(),
      context: error.context,
      metadata: {
        errorType: error.type,
        errorMessage: error.message,
        originalError: error.originalError?.message,
        stack: error.originalError?.stack,
      },
      sessionId: this.sessionId,
    });

    this.log(LogLevel.ERROR, `Review error: ${error.type}`, {
      error: error.message,
      type: error.type,
      context: error.context,
    });
  }

  /**
   * Track trigger evaluation events
   */
  trackTriggerEvaluation(
    trigger: ReviewTrigger,
    shouldTrigger: boolean,
    reason: string,
    confidence: number,
    evaluationTime: number
  ): void {
    this.addEvent({
      eventType: ReviewEventType.TRIGGER_EVALUATED,
      timestamp: new Date(),
      metadata: {
        trigger,
        shouldTrigger,
        reason,
        confidence,
        evaluationTime,
      },
      sessionId: this.sessionId,
    });

    this.trackPerformanceMetric({
      promptDisplayTime: 0,
      apiResponseTime: 0,
      storageOperationTime: 0,
      memoryUsage: this.getMemoryUsage(),
      triggerEvaluationTime: evaluationTime,
    });

    this.log(LogLevel.DEBUG, 'Trigger evaluated', {
      trigger,
      shouldTrigger,
      reason,
      confidence,
      evaluationTime,
    });
  }

  /**
   * Track user actions recorded by the system
   */
  trackUserActionRecorded(action: UserAction): void {
    this.addEvent({
      eventType: ReviewEventType.USER_ACTION_RECORDED,
      timestamp: new Date(),
      metadata: {
        actionType: action.type,
        actionTimestamp: action.timestamp,
        metadata: action.metadata,
      },
      sessionId: this.sessionId,
    });

    this.log(LogLevel.DEBUG, 'User action recorded', {
      type: action.type,
      timestamp: action.timestamp,
    });
  }

  /**
   * Track API calls made to Google Play Services
   */
  trackApiCall(operation: string, responseTime: number, success: boolean, error?: string): void {
    this.addEvent({
      eventType: ReviewEventType.API_CALL_MADE,
      timestamp: new Date(),
      metadata: {
        operation,
        responseTime,
        success,
        error,
      },
      sessionId: this.sessionId,
    });

    this.trackPerformanceMetric({
      promptDisplayTime: 0,
      apiResponseTime: responseTime,
      storageOperationTime: 0,
      memoryUsage: this.getMemoryUsage(),
      triggerEvaluationTime: 0,
    });

    this.log(success ? LogLevel.INFO : LogLevel.WARN, `API call: ${operation}`, {
      operation,
      responseTime,
      success,
      error,
    });
  }

  /**
   * Track storage operations for performance monitoring
   */
  trackStorageOperation(operation: string, operationTime: number, success: boolean, error?: string): void {
    this.addEvent({
      eventType: ReviewEventType.STORAGE_OPERATION,
      timestamp: new Date(),
      metadata: {
        operation,
        operationTime,
        success,
        error,
      },
      sessionId: this.sessionId,
    });

    this.trackPerformanceMetric({
      promptDisplayTime: 0,
      apiResponseTime: 0,
      storageOperationTime: operationTime,
      memoryUsage: this.getMemoryUsage(),
      triggerEvaluationTime: 0,
    });

    this.log(success ? LogLevel.DEBUG : LogLevel.WARN, `Storage operation: ${operation}`, {
      operation,
      operationTime,
      success,
      error,
    });
  }

  /**
   * Track when fallback mechanisms are used
   */
  trackFallbackUsed(fallbackType: string, reason: string, context?: ReviewContext): void {
    this.addEvent({
      eventType: ReviewEventType.FALLBACK_USED,
      timestamp: new Date(),
      context,
      metadata: {
        fallbackType,
        reason,
      },
      sessionId: this.sessionId,
    });

    this.log(LogLevel.WARN, `Fallback used: ${fallbackType}`, {
      fallbackType,
      reason,
      context,
    });
  }

  /**
   * Track configuration-related events
   */
  trackConfigEvent(eventType: string, metadata?: Record<string, any>): void {
    this.addEvent({
      eventType: ReviewEventType.USER_ACTION_RECORDED, // Use existing event type for config events
      timestamp: new Date(),
      metadata: {
        configEventType: eventType,
        ...metadata,
      },
      sessionId: this.sessionId,
    });

    this.log(LogLevel.INFO, `Config event: ${eventType}`, metadata);
  }

  // ============================================================================
  // PUBLIC METHODS - Performance Metrics
  // ============================================================================

  /**
   * Track performance metrics for optimization
   */
  trackPerformanceMetric(metrics: ReviewPerformanceMetrics): void {
    this.addPerformanceMetric(metrics);

    this.addEvent({
      eventType: ReviewEventType.PERFORMANCE_METRIC,
      timestamp: new Date(),
      metadata: metrics,
      sessionId: this.sessionId,
    });

    if (this.isDebugMode) {
      this.log(LogLevel.DEBUG, 'Performance metric recorded', metrics);
    }
  }

  /**
   * Get performance statistics for analysis
   */
  getPerformanceStats(): {
    averagePromptDisplayTime: number;
    averageApiResponseTime: number;
    averageStorageOperationTime: number;
    averageMemoryUsage: number;
    averageTriggerEvaluationTime: number;
    totalMetrics: number;
  } {
    if (this.performanceMetrics.length === 0) {
      return {
        averagePromptDisplayTime: 0,
        averageApiResponseTime: 0,
        averageStorageOperationTime: 0,
        averageMemoryUsage: 0,
        averageTriggerEvaluationTime: 0,
        totalMetrics: 0,
      };
    }

    const totals = this.performanceMetrics.reduce(
      (acc, metric) => ({
        promptDisplayTime: acc.promptDisplayTime + metric.promptDisplayTime,
        apiResponseTime: acc.apiResponseTime + metric.apiResponseTime,
        storageOperationTime: acc.storageOperationTime + metric.storageOperationTime,
        memoryUsage: acc.memoryUsage + metric.memoryUsage,
        triggerEvaluationTime: acc.triggerEvaluationTime + metric.triggerEvaluationTime,
      }),
      {
        promptDisplayTime: 0,
        apiResponseTime: 0,
        storageOperationTime: 0,
        memoryUsage: 0,
        triggerEvaluationTime: 0,
      }
    );

    const count = this.performanceMetrics.length;

    return {
      averagePromptDisplayTime: totals.promptDisplayTime / count,
      averageApiResponseTime: totals.apiResponseTime / count,
      averageStorageOperationTime: totals.storageOperationTime / count,
      averageMemoryUsage: totals.memoryUsage / count,
      averageTriggerEvaluationTime: totals.triggerEvaluationTime / count,
      totalMetrics: count,
    };
  }

  // ============================================================================
  // PUBLIC METHODS - Debug and Development
  // ============================================================================

  /**
   * Enable or disable debug mode
   */
  setDebugMode(enabled: boolean): void {
    const wasDebugMode = this.isDebugMode;
    this.isDebugMode = enabled;
    
    // Always log the debug mode change, but use the previous debug mode for console output
    const logEntry: ReviewDebugLog = {
      level: LogLevel.INFO,
      message: `Debug mode ${enabled ? 'enabled' : 'disabled'}`,
      timestamp: new Date(),
      context: undefined,
      sessionId: this.sessionId,
    };

    this.debugLogs.push(logEntry);

    // Maintain maximum history size
    if (this.debugLogs.length > this.maxDebugHistory) {
      this.debugLogs = this.debugLogs.slice(-this.maxDebugHistory);
    }

    // Console logging based on the previous or current debug mode
    if (enabled || wasDebugMode) {
      console.info(`[ReviewAnalytics:INFO] Debug mode ${enabled ? 'enabled' : 'disabled'}`, '');
    }
  }

  /**
   * Get all events for debugging
   */
  getEvents(): ReviewAnalyticsEvent[] {
    return [...this.events];
  }

  /**
   * Get debug logs for development
   */
  getDebugLogs(): ReviewDebugLog[] {
    return [...this.debugLogs];
  }

  /**
   * Get events filtered by type
   */
  getEventsByType(eventType: ReviewEventType): ReviewAnalyticsEvent[] {
    return this.events.filter(event => event.eventType === eventType);
  }

  /**
   * Get events within a time range
   */
  getEventsInTimeRange(startTime: Date, endTime: Date): ReviewAnalyticsEvent[] {
    return this.events.filter(
      event => event.timestamp >= startTime && event.timestamp <= endTime
    );
  }

  /**
   * Clear all analytics data
   */
  clearAnalyticsData(): void {
    this.events = [];
    this.performanceMetrics = [];
    this.debugLogs = [];
    this.log(LogLevel.INFO, 'Analytics data cleared');
  }

  /**
   * Export analytics data for external analysis
   */
  exportAnalyticsData(): {
    events: ReviewAnalyticsEvent[];
    performanceMetrics: ReviewPerformanceMetrics[];
    debugLogs: ReviewDebugLog[];
    sessionId: string;
    exportTimestamp: Date;
  } {
    return {
      events: [...this.events],
      performanceMetrics: [...this.performanceMetrics],
      debugLogs: [...this.debugLogs],
      sessionId: this.sessionId,
      exportTimestamp: new Date(),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Add an event to the analytics history
   */
  private addEvent(event: ReviewAnalyticsEvent): void {
    this.events.push(event);
    
    // Maintain maximum history size
    if (this.events.length > this.maxEventHistory) {
      this.events = this.events.slice(-this.maxEventHistory);
    }
  }

  /**
   * Add a performance metric to the history
   */
  private addPerformanceMetric(metric: ReviewPerformanceMetrics): void {
    this.performanceMetrics.push(metric);
    
    // Maintain maximum history size
    if (this.performanceMetrics.length > this.maxPerformanceHistory) {
      this.performanceMetrics = this.performanceMetrics.slice(-this.maxPerformanceHistory);
    }
  }

  /**
   * Add a debug log entry
   */
  private log(level: LogLevel, message: string, context?: any): void {
    const logEntry: ReviewDebugLog = {
      level,
      message,
      timestamp: new Date(),
      context,
      sessionId: this.sessionId,
    };

    this.debugLogs.push(logEntry);

    // Maintain maximum history size
    if (this.debugLogs.length > this.maxDebugHistory) {
      this.debugLogs = this.debugLogs.slice(-this.maxDebugHistory);
    }

    // Console logging in debug mode
    if (this.isDebugMode) {
      const logMethod = level === LogLevel.ERROR ? console.error :
                       level === LogLevel.WARN ? console.warn :
                       level === LogLevel.INFO ? console.info :
                       console.log;
      
      logMethod(`[ReviewAnalytics:${level.toUpperCase()}] ${message}`, context || '');
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `review_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get the event type for a review action
   */
  private getEventTypeForAction(action: ReviewAction): ReviewEventType {
    switch (action) {
      case ReviewAction.COMPLETED:
        return ReviewEventType.REVIEW_COMPLETED;
      case ReviewAction.DISMISSED:
        return ReviewEventType.PROMPT_DISMISSED;
      case ReviewAction.ERROR:
        return ReviewEventType.REVIEW_ERROR;
      default:
        return ReviewEventType.PROMPT_DISMISSED;
    }
  }

  /**
   * Get time since last prompt was shown
   */
  private getTimeSinceLastPrompt(): number {
    const lastPromptEvent = this.events
      .filter(event => event.eventType === ReviewEventType.PROMPT_SHOWN)
      .pop();
    
    if (!lastPromptEvent) {
      return 0;
    }

    return Date.now() - lastPromptEvent.timestamp.getTime();
  }

  /**
   * Get current memory usage (simplified for React Native)
   */
  private getMemoryUsage(): number {
    // In a real implementation, you might use a React Native memory monitoring library
    // For now, we'll return a placeholder value
    return 0;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton instance of the analytics tracker
 */
let analyticsTrackerInstance: AnalyticsTracker | null = null;

/**
 * Get the singleton analytics tracker instance
 */
export function getAnalyticsTracker(debugMode?: boolean): AnalyticsTracker {
  if (!analyticsTrackerInstance) {
    analyticsTrackerInstance = new AnalyticsTracker(debugMode);
  }
  
  if (debugMode !== undefined) {
    analyticsTrackerInstance.setDebugMode(debugMode);
  }
  
  return analyticsTrackerInstance;
}

/**
 * Reset the analytics tracker instance (for testing)
 */
export function resetAnalyticsTracker(): void {
  analyticsTrackerInstance = null;
}