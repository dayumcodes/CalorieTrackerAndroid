/**
 * ReviewManager orchestration service for in-app review system
 * 
 * Central service that coordinates all components and manages the review prompt flow.
 * This is the main entry point for triggering reviews and recording user actions.
 */

import {
    ReviewManager as IReviewManager,
    ReviewContext,
    UserAction,
    ReviewResult,
    ReviewAction,
    ReviewError,
    ReviewErrorType,
    UserMetrics,
    ReviewSettings,
} from './types/review-types';
import { getAnalyticsTracker } from './analytics-tracker';
import { errorHandler } from './error-handler';
import { getLazyLoader } from './lazy-loader';
import { getPerformanceProfiler, PerformanceCategory } from './performance-profiler';

/**
 * Configuration for ReviewManager
 */
interface ReviewManagerConfig {
    debugMode?: boolean;
    enableAnalytics?: boolean;
    maxRetryAttempts?: number;
    retryDelayMs?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ReviewManagerConfig = {
    debugMode: false,
    enableAnalytics: true,
    maxRetryAttempts: 3,
    retryDelayMs: 1000,
};

/**
 * Central ReviewManager implementation that orchestrates all review components
 */
export class ReviewManager implements IReviewManager {
    private config: ReviewManagerConfig;
    private isInitialized = false;
    private pendingActions: UserAction[] = [];
    private isProcessingReview = false;
    private analyticsTracker = getAnalyticsTracker();
    private lazyLoader = getLazyLoader();
    private profiler = getPerformanceProfiler();

    constructor(config: Partial<ReviewManagerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.analyticsTracker.setDebugMode(this.config.debugMode || false);
    }

    /**
     * Initialize the ReviewManager and all its dependencies
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        return this.profiler.profileFunction('reviewManager_initialize', PerformanceCategory.COMPUTATION, async () => {
            try {
                if (this.config.debugMode) {
                    console.log('ReviewManager: Initializing...');
                }

                // Enable profiling in debug mode
                this.profiler.setEnabled(this.config.debugMode || false);

                // Preload components in background for better performance
                this.lazyLoader.preloadComponents().catch(error => {
                    console.warn('ReviewManager: Component preloading failed:', error);
                });

                // Process any pending actions that were queued before initialization
                await this.processPendingActions();

                this.isInitialized = true;

                if (this.config.debugMode) {
                    console.log('ReviewManager: Initialization complete');
                }
            } catch (error) {
                const reviewError = this.createError(
                    ReviewErrorType.UNKNOWN_ERROR,
                    'Failed to initialize ReviewManager',
                    error
                );
                await this.handleError(reviewError);
                throw reviewError;
            }
        });
    }

    /**
     * Check if a review should be triggered and show it if appropriate
     */
    async checkAndTriggerReview(context: ReviewContext): Promise<boolean> {
        try {
            await this.ensureInitialized();

            if (this.isProcessingReview) {
                if (this.config.debugMode) {
                    console.log('ReviewManager: Review already in progress, skipping');
                }
                return false;
            }

            if (this.config.debugMode) {
                console.log('ReviewManager: Evaluating review trigger', {
                    trigger: context.trigger,
                    userState: context.userState,
                });
            }

            // Evaluate if review should be triggered using lazy-loaded trigger engine
            const triggerEngine = await this.lazyLoader.getTriggerEngine();
            const startTime = Date.now();
            const triggerResult = await triggerEngine.evaluateTrigger(context);
            const evaluationTime = Date.now() - startTime;

            // Track trigger evaluation
            this.analyticsTracker.trackTriggerEvaluation(
                context.trigger,
                triggerResult.shouldTrigger,
                triggerResult.reason,
                triggerResult.confidence,
                evaluationTime
            );

            if (!triggerResult.shouldTrigger) {
                if (this.config.debugMode) {
                    console.log('ReviewManager: Review not triggered', {
                        reason: triggerResult.reason,
                        confidence: triggerResult.confidence,
                    });
                }
                return false;
            }

            if (this.config.debugMode) {
                console.log('ReviewManager: Review triggered', {
                    reason: triggerResult.reason,
                    confidence: triggerResult.confidence,
                });
            }

            // Track and record that we're showing a review prompt
            this.analyticsTracker.trackReviewPromptShown(context);
            await this.recordReviewPromptShown(context);

            // Show the review dialog
            const reviewResult = await this.showReviewDialog(context);

            // Track and record the user's action
            this.analyticsTracker.trackReviewAction(reviewResult.action, context);
            await this.recordReviewAction(reviewResult.action, context);

            return reviewResult.success;

        } catch (error) {
            const reviewError = this.createError(
                ReviewErrorType.UNKNOWN_ERROR,
                'Failed to check and trigger review',
                error,
                context
            );
            this.analyticsTracker.trackError(reviewError);
            await this.handleError(reviewError);
            return false;
        }
    }

    /**
     * Record a user action for metrics tracking
     */
    recordUserAction(action: UserAction): void {
        // Track user action immediately
        this.analyticsTracker.trackUserActionRecorded(action);

        if (!this.isInitialized) {
            // Queue action for processing after initialization
            this.pendingActions.push(action);
            return;
        }

        // Process action asynchronously to avoid blocking
        this.processUserAction(action).catch((error) => {
            const reviewError = this.createError(
                ReviewErrorType.UNKNOWN_ERROR,
                'Failed to record user action',
                error
            );
            this.analyticsTracker.trackError(reviewError);
            this.handleError(reviewError);
        });
    }

    /**
     * Check if review functionality is available
     */
    async isReviewAvailable(): Promise<boolean> {
        return this.profiler.profileApiCall('isReviewAvailable', async () => {
            try {
                await this.ensureInitialized();

                // Try to get from cache first
                const storageService = await this.lazyLoader.getStorageService();
                const cacheManager = (storageService as any).cacheManager;
                const cached = cacheManager?.getCachedReviewAvailability();

                if (cached !== null) {
                    return cached;
                }

                // Load review dialog lazily
                const { reviewDialog } = await import('./review-dialog');
                const startTime = Date.now();
                const isAvailable = await reviewDialog.isAvailable();
                const responseTime = Date.now() - startTime;

                // Cache the result
                if (cacheManager) {
                    cacheManager.cacheReviewAvailability(isAvailable);
                }

                this.analyticsTracker.trackApiCall('isAvailable', responseTime, true);
                return isAvailable;
            } catch (error) {
                const responseTime = Date.now();
                this.analyticsTracker.trackApiCall('isAvailable', responseTime, false, String(error));

                if (this.config.debugMode) {
                    console.error('ReviewManager: Error checking review availability:', error);
                }
                return false;
            }
        });
    }

    /**
     * Reset review state (for testing purposes)
     */
    async resetReviewState(): Promise<void> {
        if (this.config.debugMode) {
            console.log('ReviewManager: Resetting review state');
        }

        // Clear storage data
        try {
            const storageService = await this.lazyLoader.getStorageService();
            await storageService.clearReviewData();
            storageService.clearCache();
        } catch (error) {
            console.error('ReviewManager: Error clearing review data:', error);
        }

        // Clear cached data
        try {
            const triggerEngine = await this.lazyLoader.getTriggerEngine();
            triggerEngine.clearCache();
        } catch (error) {
            console.error('ReviewManager: Error clearing trigger engine cache:', error);
        }

        // Clear lazy loader cache
        this.lazyLoader.clearComponents();

        // Clear pending actions
        this.pendingActions = [];
        this.isProcessingReview = false;
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Ensure the manager is initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    /**
     * Process a user action asynchronously
     */
    private async processUserAction(action: UserAction): Promise<void> {
        return this.profiler.profileFunction('processUserAction', PerformanceCategory.COMPUTATION, async () => {
            try {
                if (this.config.debugMode) {
                    console.log('ReviewManager: Processing user action', {
                        type: action.type,
                        timestamp: action.timestamp,
                    });
                }

                const triggerEngine = await this.lazyLoader.getTriggerEngine();
                const startTime = Date.now();
                await triggerEngine.updateUserMetrics(action);
                const operationTime = Date.now() - startTime;

                this.analyticsTracker.trackStorageOperation('updateUserMetrics', operationTime, true);

                if (this.config.enableAnalytics) {
                    // Analytics tracking is now handled by AnalyticsTracker
                    if (this.config.debugMode) {
                        console.log('ReviewManager: User action processed and tracked', action);
                    }
                }
            } catch (error) {
                const operationTime = Date.now();
                this.analyticsTracker.trackStorageOperation('updateUserMetrics', operationTime, false, String(error));

                const reviewError = this.createError(
                    ReviewErrorType.UNKNOWN_ERROR,
                    'Failed to process user action',
                    error
                );
                this.analyticsTracker.trackError(reviewError);
                await this.handleError(reviewError);
            }
        });
    }

    /**
     * Process any actions that were queued before initialization
     */
    private async processPendingActions(): Promise<void> {
        if (this.pendingActions.length === 0) {
            return;
        }

        if (this.config.debugMode) {
            console.log(`ReviewManager: Processing ${this.pendingActions.length} pending actions`);
        }

        const actions = [...this.pendingActions];
        this.pendingActions = [];

        for (const action of actions) {
            await this.processUserAction(action);
        }
    }

    /**
     * Show the review dialog with enhanced error handling
     */
    private async showReviewDialog(context: ReviewContext): Promise<ReviewResult> {
        this.isProcessingReview = true;
        const operationId = 'show_review_dialog';

        try {
            if (this.config.debugMode) {
                console.log('ReviewManager: Showing review dialog');
            }

            // Load review dialog lazily
            const { reviewDialog } = await import('./review-dialog');
            const startTime = Date.now();
            const result = await reviewDialog.requestReview();
            const responseTime = Date.now() - startTime;

            this.analyticsTracker.trackApiCall('requestReview', responseTime, result.success, result.error);

            // Clear retry attempts on success
            if (result.success) {
                errorHandler.clearRetryAttempts(operationId);
            }

            return result;

        } catch (error) {
            const responseTime = Date.now();
            this.analyticsTracker.trackApiCall('requestReview', responseTime, false, String(error));

            // Create review error
            const reviewError = this.createError(
                ReviewErrorType.UNKNOWN_ERROR,
                'Failed to show review dialog',
                error,
                context
            );

            // Use error handler for recovery
            const recoveryResult = await errorHandler.handleReviewError(reviewError, context);

            return {
                success: recoveryResult.success,
                action: recoveryResult.action,
                error: recoveryResult.error,
            };

        } finally {
            this.isProcessingReview = false;
        }
    }

    /**
     * Record that a review prompt was shown
     */
    private async recordReviewPromptShown(context: ReviewContext): Promise<void> {
        const action: UserAction = {
            type: 'review_prompt_shown',
            timestamp: new Date(),
            metadata: {
                trigger: context.trigger,
                userState: context.userState,
            },
        };

        await this.processUserAction(action);
    }

    /**
     * Record the user's review action
     */
    private async recordReviewAction(reviewAction: ReviewAction, context: ReviewContext): Promise<void> {
        const action: UserAction = {
            type: 'review_action',
            timestamp: new Date(),
            metadata: {
                reviewAction,
                trigger: context.trigger,
                userState: context.userState,
            },
        };

        await this.processUserAction(action);
    }

    /**
     * Determine if a review request should be retried
     */
    private shouldRetryReviewRequest(result: ReviewResult): boolean {
        // Don't retry if user dismissed or completed
        if (result.action === ReviewAction.DISMISSED || result.action === ReviewAction.COMPLETED) {
            return false;
        }

        // Don't retry if API is not available
        if (result.action === ReviewAction.NOT_AVAILABLE) {
            return false;
        }

        // Retry on errors
        return result.action === ReviewAction.ERROR;
    }

    /**
     * Create a standardized error object
     */
    private createError(
        type: ReviewErrorType,
        message: string,
        originalError?: any,
        context?: ReviewContext
    ): ReviewError {
        return {
            type,
            message,
            originalError: originalError instanceof Error ? originalError : new Error(String(originalError)),
            context,
            timestamp: new Date(),
        };
    }

    /**
     * Handle errors with enhanced recovery strategies
     */
    private async handleError(error: ReviewError): Promise<void> {
        // Log the error
        console.error('ReviewManager Error:', {
            type: error.type,
            message: error.message,
            timestamp: error.timestamp,
            context: error.context,
            originalError: error.originalError?.message,
        });

        // Use error handler for comprehensive error handling
        await errorHandler.handleReviewError(error, error.context);

        // Track error in analytics
        this.analyticsTracker.trackError(error);

        if (this.config.enableAnalytics) {
            if (this.config.debugMode) {
                console.log('ReviewManager: Error handled and tracked', error);
            }
        }
    }

    /**
     * Utility method to delay execution
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================================================
    // PUBLIC UTILITY METHODS
    // ============================================================================

    /**
     * Get current user metrics (for debugging)
     */
    async getUserMetrics(): Promise<UserMetrics> {
        await this.ensureInitialized();
        const storageService = await this.lazyLoader.getStorageService();
        return await storageService.getUserMetrics();
    }

    /**
     * Get current review settings (for debugging)
     */
    async getReviewSettings(): Promise<ReviewSettings> {
        await this.ensureInitialized();
        const storageService = await this.lazyLoader.getStorageService();
        return await storageService.getReviewSettings();
    }

    /**
     * Get next eligible time for review prompt (for debugging)
     */
    async getNextEligibleTime(): Promise<Date | null> {
        await this.ensureInitialized();
        const triggerEngine = await this.lazyLoader.getTriggerEngine();
        return await triggerEngine.getNextEligibleTime();
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<ReviewManagerConfig>): void {
        this.config = { ...this.config, ...newConfig };

        // Update analytics tracker debug mode if changed
        if (newConfig.debugMode !== undefined) {
            this.analyticsTracker.setDebugMode(newConfig.debugMode);
        }
    }

    /**
     * Get current configuration (for debugging)
     */
    getConfig(): ReviewManagerConfig {
        return { ...this.config };
    }

    /**
     * Get debug information about current state
     */
    async getDebugInfo(): Promise<{
        isInitialized: boolean;
        isProcessingReview: boolean;
        pendingActionsCount: number;
        userMetrics: UserMetrics;
        reviewSettings: ReviewSettings;
        nextEligibleTime: Date | null;
        isReviewAvailable: boolean;
        analyticsStats: any;
    }> {
        await this.ensureInitialized();

        return {
            isInitialized: this.isInitialized,
            isProcessingReview: this.isProcessingReview,
            pendingActionsCount: this.pendingActions.length,
            userMetrics: await this.getUserMetrics(),
            reviewSettings: await this.getReviewSettings(),
            nextEligibleTime: await this.getNextEligibleTime(),
            isReviewAvailable: await this.isReviewAvailable(),
            analyticsStats: this.analyticsTracker.getPerformanceStats(),
        };
    }

    // ============================================================================
    // ANALYTICS METHODS
    // ============================================================================

    /**
     * Get analytics events for debugging and analysis
     */
    getAnalyticsEvents() {
        return this.analyticsTracker.getEvents();
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        return this.analyticsTracker.getPerformanceStats();
    }

    /**
     * Get debug logs
     */
    getDebugLogs() {
        return this.analyticsTracker.getDebugLogs();
    }

    /**
     * Export all analytics data
     */
    exportAnalyticsData() {
        return this.analyticsTracker.exportAnalyticsData();
    }

    /**
     * Clear analytics data
     */
    clearAnalyticsData(): void {
        this.analyticsTracker.clearAnalyticsData();
    }

    /**
     * Get error handling statistics
     */
    getErrorStats() {
        return errorHandler.getErrorStats();
    }

    /**
     * Get error handler configuration
     */
    getErrorHandlerConfig() {
        return errorHandler.getConfig();
    }

    /**
     * Update error handler configuration
     */
    updateErrorHandlerConfig(config: any): void {
        errorHandler.updateConfig(config);
    }
}

// Export singleton instance
export const reviewManager = new ReviewManager();