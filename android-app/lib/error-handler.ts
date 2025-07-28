/**
 * Comprehensive error handling and recovery system for in-app review
 * 
 * This service provides centralized error handling, retry mechanisms,
 * fallback strategies, and recovery procedures for all review system components.
 */

import {
    ReviewError,
    ReviewErrorType,
    ReviewContext,
    ReviewResult,
    ReviewAction,
} from './types/review-types';
import { getAnalyticsTracker } from './analytics-tracker';

/**
 * Configuration for error handling behavior
 */
export interface ErrorHandlerConfig {
    maxRetryAttempts: number;
    baseRetryDelayMs: number;
    maxRetryDelayMs: number;
    exponentialBackoffMultiplier: number;
    enableFallbacks: boolean;
    enableInMemoryFallback: boolean;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
    debugMode: boolean;
}

/**
 * Default error handler configuration
 */
const DEFAULT_ERROR_CONFIG: ErrorHandlerConfig = {
    maxRetryAttempts: 3,
    baseRetryDelayMs: 1000,
    maxRetryDelayMs: 30000,
    exponentialBackoffMultiplier: 2,
    enableFallbacks: true,
    enableInMemoryFallback: true,
    rateLimitWindowMs: 60000, // 1 minute
    rateLimitMaxRequests: 5,
    debugMode: false,
};

/**
 * Rate limiting tracker for API calls
 */
interface RateLimitTracker {
    requests: Date[];
    lastReset: Date;
}

/**
 * Recovery strategy result
 */
interface RecoveryResult {
    success: boolean;
    action: ReviewAction;
    error?: string;
    fallbackUsed?: string;
}

/**
 * Retry attempt information
 */
interface RetryAttempt {
    attemptNumber: number;
    error: ReviewError;
    timestamp: Date;
    nextRetryDelay: number;
}

/**
 * Comprehensive error handler for the review system
 */
export class ErrorHandler {
    private config: ErrorHandlerConfig;
    private analyticsTracker = getAnalyticsTracker();
    private rateLimitTrackers = new Map<string, RateLimitTracker>();
    private retryAttempts = new Map<string, RetryAttempt[]>();
    private inMemoryFallbackData = new Map<string, any>();

    constructor(config: Partial<ErrorHandlerConfig> = {}) {
        this.config = { ...DEFAULT_ERROR_CONFIG, ...config };
        this.analyticsTracker.setDebugMode(this.config.debugMode);
    }

    /**
     * Handle a review error with appropriate recovery strategy
     */
    async handleReviewError(error: ReviewError, context?: ReviewContext): Promise<RecoveryResult> {
        try {
            this.logError(error, context);
            this.analyticsTracker.trackError(error);

            // Check if we should attempt recovery
            const recoveryStrategy = this.determineRecoveryStrategy(error);
            
            if (recoveryStrategy === 'none') {
                return {
                    success: false,
                    action: ReviewAction.ERROR,
                    error: error.message,
                };
            }

            // Execute recovery strategy
            const result = await this.executeRecoveryStrategy(error, recoveryStrategy, context);
            
            // Track recovery attempt
            this.analyticsTracker.trackFallbackUsed(
                recoveryStrategy,
                error.message,
                context
            );

            return result;

        } catch (recoveryError) {
            this.logError({
                type: ReviewErrorType.UNKNOWN_ERROR,
                message: 'Error recovery failed',
                originalError: recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError)),
                timestamp: new Date(),
            });

            return {
                success: false,
                action: ReviewAction.ERROR,
                error: 'Error recovery failed',
            };
        }
    }

    /**
     * Check if an operation should be retried
     */
    shouldRetry(error: ReviewError, operationId?: string): boolean {
        // Don't retry certain error types
        if (error.type === ReviewErrorType.API_RATE_LIMIT) {
            return false;
        }

        // Check retry attempts for this operation
        if (operationId) {
            const attempts = this.retryAttempts.get(operationId) || [];
            if (attempts.length >= this.config.maxRetryAttempts) {
                return false;
            }
        }

        // Retry network errors and unknown errors
        return error.type === ReviewErrorType.NETWORK_ERROR || 
               error.type === ReviewErrorType.UNKNOWN_ERROR;
    }

    /**
     * Get retry delay with exponential backoff
     */
    getRetryDelay(attemptCount: number): number {
        const delay = this.config.baseRetryDelayMs * 
                     Math.pow(this.config.exponentialBackoffMultiplier, attemptCount - 1);
        
        return Math.min(delay, this.config.maxRetryDelayMs);
    }

    /**
     * Check if an operation is rate limited
     */
    isRateLimited(operationId: string): boolean {
        const tracker = this.rateLimitTrackers.get(operationId);
        if (!tracker) {
            return false;
        }

        const now = new Date();
        const windowStart = new Date(now.getTime() - this.config.rateLimitWindowMs);

        // Clean old requests
        tracker.requests = tracker.requests.filter(req => req > windowStart);

        return tracker.requests.length >= this.config.rateLimitMaxRequests;
    }

    /**
     * Record an API request for rate limiting
     */
    recordApiRequest(operationId: string): void {
        let tracker = this.rateLimitTrackers.get(operationId);
        if (!tracker) {
            tracker = {
                requests: [],
                lastReset: new Date(),
            };
            this.rateLimitTrackers.set(operationId, tracker);
        }

        tracker.requests.push(new Date());
    }

    /**
     * Record a retry attempt
     */
    recordRetryAttempt(operationId: string, error: ReviewError): void {
        const attempts = this.retryAttempts.get(operationId) || [];
        const attemptNumber = attempts.length + 1;
        const nextRetryDelay = this.getRetryDelay(attemptNumber);

        const attempt: RetryAttempt = {
            attemptNumber,
            error,
            timestamp: new Date(),
            nextRetryDelay,
        };

        attempts.push(attempt);
        this.retryAttempts.set(operationId, attempts);

        if (this.config.debugMode) {
            console.log(`ErrorHandler: Retry attempt ${attemptNumber} for ${operationId}`, {
                error: error.message,
                nextRetryDelay,
            });
        }
    }

    /**
     * Clear retry attempts for an operation
     */
    clearRetryAttempts(operationId: string): void {
        this.retryAttempts.delete(operationId);
    }

    /**
     * Store data in in-memory fallback
     */
    setInMemoryFallback(key: string, data: any): void {
        if (this.config.enableInMemoryFallback) {
            this.inMemoryFallbackData.set(key, {
                data,
                timestamp: new Date(),
            });

            if (this.config.debugMode) {
                console.log(`ErrorHandler: Stored in-memory fallback for ${key}`);
            }
        }
    }

    /**
     * Retrieve data from in-memory fallback
     */
    getInMemoryFallback(key: string): any | null {
        if (!this.config.enableInMemoryFallback) {
            return null;
        }

        const fallback = this.inMemoryFallbackData.get(key);
        if (!fallback) {
            return null;
        }

        // Check if fallback data is still valid (within 1 hour)
        const maxAge = 60 * 60 * 1000; // 1 hour
        const age = Date.now() - fallback.timestamp.getTime();
        
        if (age > maxAge) {
            this.inMemoryFallbackData.delete(key);
            return null;
        }

        return fallback.data;
    }

    /**
     * Clear in-memory fallback data
     */
    clearInMemoryFallback(): void {
        this.inMemoryFallbackData.clear();
    }

    /**
     * Get error handler statistics
     */
    getErrorStats(): {
        totalErrors: number;
        errorsByType: Record<ReviewErrorType, number>;
        totalRetryAttempts: number;
        rateLimitedOperations: number;
        inMemoryFallbackSize: number;
    } {
        const errorsByType = Object.values(ReviewErrorType).reduce((acc, type) => {
            acc[type] = 0;
            return acc;
        }, {} as Record<ReviewErrorType, number>);

        // Count errors from analytics
        const errorEvents = this.analyticsTracker.getEventsByType('review_error' as any);
        errorEvents.forEach(event => {
            const errorType = event.metadata?.errorType as ReviewErrorType;
            if (errorType && errorsByType[errorType] !== undefined) {
                errorsByType[errorType]++;
            }
        });

        const totalRetryAttempts = Array.from(this.retryAttempts.values())
            .reduce((total, attempts) => total + attempts.length, 0);

        const rateLimitedOperations = Array.from(this.rateLimitTrackers.values())
            .filter(tracker => tracker.requests.length >= this.config.rateLimitMaxRequests)
            .length;

        return {
            totalErrors: errorEvents.length,
            errorsByType,
            totalRetryAttempts,
            rateLimitedOperations,
            inMemoryFallbackSize: this.inMemoryFallbackData.size,
        };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<ErrorHandlerConfig>): void {
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.debugMode !== undefined) {
            this.analyticsTracker.setDebugMode(newConfig.debugMode);
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): ErrorHandlerConfig {
        return { ...this.config };
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Determine the appropriate recovery strategy for an error
     */
    private determineRecoveryStrategy(error: ReviewError): string {
        if (!this.config.enableFallbacks) {
            return 'none';
        }

        switch (error.type) {
            case ReviewErrorType.PLAY_SERVICES_UNAVAILABLE:
                return 'play_store_fallback';
            
            case ReviewErrorType.NETWORK_ERROR:
                return 'retry_with_backoff';
            
            case ReviewErrorType.STORAGE_ERROR:
                return 'in_memory_fallback';
            
            case ReviewErrorType.API_RATE_LIMIT:
                return 'rate_limit_backoff';
            
            case ReviewErrorType.UNKNOWN_ERROR:
                return 'generic_fallback';
            
            default:
                return 'none';
        }
    }

    /**
     * Execute the determined recovery strategy
     */
    private async executeRecoveryStrategy(
        error: ReviewError,
        strategy: string,
        context?: ReviewContext
    ): Promise<RecoveryResult> {
        switch (strategy) {
            case 'play_store_fallback':
                return await this.executePlayStoreFallback(error, context);
            
            case 'retry_with_backoff':
                return await this.executeRetryWithBackoff(error, context);
            
            case 'in_memory_fallback':
                return await this.executeInMemoryFallback(error, context);
            
            case 'rate_limit_backoff':
                return await this.executeRateLimitBackoff(error, context);
            
            case 'generic_fallback':
                return await this.executeGenericFallback(error, context);
            
            default:
                return {
                    success: false,
                    action: ReviewAction.ERROR,
                    error: error.message,
                };
        }
    }

    /**
     * Execute Play Store fallback strategy
     */
    private async executePlayStoreFallback(
        error: ReviewError,
        context?: ReviewContext
    ): Promise<RecoveryResult> {
        try {
            // Import reviewDialog dynamically to avoid circular dependency
            const reviewDialogModule = await import('./review-dialog');
            const reviewDialog = reviewDialogModule.reviewDialog;
            
            // Attempt to open Play Store as fallback
            reviewDialog.openPlayStore();
            
            return {
                success: true,
                action: ReviewAction.COMPLETED,
                fallbackUsed: 'play_store_redirect',
            };
        } catch (fallbackError) {
            if (this.config.debugMode) {
                console.error('ErrorHandler: Play Store fallback failed:', fallbackError);
            }
            
            return {
                success: false,
                action: ReviewAction.NOT_AVAILABLE,
                error: 'Play Store fallback failed',
                fallbackUsed: 'play_store_redirect',
            };
        }
    }

    /**
     * Execute retry with exponential backoff strategy
     */
    private async executeRetryWithBackoff(
        error: ReviewError,
        context?: ReviewContext
    ): Promise<RecoveryResult> {
        // This is a placeholder - actual retry logic should be implemented
        // by the calling component using shouldRetry() and getRetryDelay()
        return {
            success: false,
            action: ReviewAction.ERROR,
            error: 'Retry should be handled by calling component',
            fallbackUsed: 'retry_with_backoff',
        };
    }

    /**
     * Execute in-memory fallback strategy
     */
    private async executeInMemoryFallback(
        error: ReviewError,
        context?: ReviewContext
    ): Promise<RecoveryResult> {
        try {
            // For storage errors, we can continue with in-memory data
            // The actual fallback data should be set by the storage service
            const fallbackData = this.getInMemoryFallback('storage_fallback');
            
            if (fallbackData) {
                return {
                    success: true,
                    action: ReviewAction.COMPLETED,
                    fallbackUsed: 'in_memory_storage',
                };
            } else {
                return {
                    success: false,
                    action: ReviewAction.ERROR,
                    error: 'No in-memory fallback data available',
                    fallbackUsed: 'in_memory_storage',
                };
            }
        } catch (fallbackError) {
            return {
                success: false,
                action: ReviewAction.ERROR,
                error: 'In-memory fallback failed',
                fallbackUsed: 'in_memory_storage',
            };
        }
    }

    /**
     * Execute rate limit backoff strategy
     */
    private async executeRateLimitBackoff(
        error: ReviewError,
        context?: ReviewContext
    ): Promise<RecoveryResult> {
        // Calculate backoff time based on rate limit window
        const backoffTime = this.config.rateLimitWindowMs;
        
        return {
            success: false,
            action: ReviewAction.ERROR,
            error: `Rate limited. Try again in ${Math.ceil(backoffTime / 1000)} seconds`,
            fallbackUsed: 'rate_limit_backoff',
        };
    }

    /**
     * Execute generic fallback strategy
     */
    private async executeGenericFallback(
        error: ReviewError,
        context?: ReviewContext
    ): Promise<RecoveryResult> {
        // For unknown errors, try the Play Store fallback as last resort
        return await this.executePlayStoreFallback(error, context);
    }

    /**
     * Log error with appropriate level and context
     */
    private logError(error: ReviewError, context?: ReviewContext): void {
        const logLevel = this.getLogLevelForError(error.type);
        const message = `${error.type}: ${error.message}`;
        
        if (this.config.debugMode) {
            const logMethod = logLevel === 'error' ? console.error :
                             logLevel === 'warn' ? console.warn :
                             console.log;
            
            logMethod(`ErrorHandler: ${message}`, {
                error,
                context,
                timestamp: error.timestamp,
            });
        }
    }

    /**
     * Get appropriate log level for error type
     */
    private getLogLevelForError(errorType: ReviewErrorType): 'error' | 'warn' | 'info' {
        switch (errorType) {
            case ReviewErrorType.PLAY_SERVICES_UNAVAILABLE:
            case ReviewErrorType.STORAGE_ERROR:
                return 'error';
            
            case ReviewErrorType.NETWORK_ERROR:
            case ReviewErrorType.API_RATE_LIMIT:
                return 'warn';
            
            case ReviewErrorType.UNKNOWN_ERROR:
            default:
                return 'info';
        }
    }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

// Export factory function for custom configurations
export const createErrorHandler = (config: Partial<ErrorHandlerConfig> = {}): ErrorHandler => {
    return new ErrorHandler(config);
};