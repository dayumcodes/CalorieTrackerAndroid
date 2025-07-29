/**
 * Tests for review manager error handling and recovery mechanisms
 */

import { ReviewManager } from '../lib/review-manager';
import {
    ReviewContext,
    ReviewTrigger,
    ReviewAction,
    ReviewErrorType,
} from '../lib/types/review-types';

// Mock dependencies
const mockStorageService = {
    initialize: jest.fn(),
    getUserMetrics: jest.fn(),
    getReviewSettings: jest.fn(),
    clearReviewData: jest.fn(),
    clearCache: jest.fn(),
};

const mockTriggerEngine = {
    initialize: jest.fn(),
    evaluateTrigger: jest.fn(),
    updateUserMetrics: jest.fn(),
    getNextEligibleTime: jest.fn(),
    clearCache: jest.fn(),
};

const mockReviewDialog = {
    requestReview: jest.fn(),
    isAvailable: jest.fn(),
};

const mockAnalyticsTracker = {
    setDebugMode: jest.fn(),
    trackTriggerEvaluation: jest.fn(),
    trackReviewPromptShown: jest.fn(),
    trackReviewAction: jest.fn(),
    trackError: jest.fn(),
    trackUserActionRecorded: jest.fn(),
    trackApiCall: jest.fn(),
    trackStorageOperation: jest.fn(),
    trackFallbackUsed: jest.fn(),
    getPerformanceStats: jest.fn(),
    getEvents: jest.fn(),
    getEventsByType: jest.fn(),
    getDebugLogs: jest.fn(),
    exportAnalyticsData: jest.fn(),
    clearAnalyticsData: jest.fn(),
};

const mockErrorHandler = {
    handleReviewError: jest.fn(),
    clearRetryAttempts: jest.fn(),
    getErrorStats: jest.fn(),
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
};

jest.mock('../lib/storage-service', () => ({
    storageService: mockStorageService,
}));

jest.mock('../lib/trigger-engine', () => ({
    triggerEngine: mockTriggerEngine,
}));

jest.mock('../lib/review-dialog', () => ({
    reviewDialog: mockReviewDialog,
}));

jest.mock('../lib/analytics-tracker', () => ({
    getAnalyticsTracker: () => mockAnalyticsTracker,
}));

jest.mock('../lib/error-handler', () => ({
    errorHandler: mockErrorHandler,
}));

describe('ReviewManager Error Handling', () => {
    let reviewManager: ReviewManager;
    let mockContext: ReviewContext;

    beforeEach(() => {
        reviewManager = new ReviewManager({ debugMode: true });
        
        mockContext = {
            trigger: ReviewTrigger.APP_OPEN,
            userState: {
                appOpenCount: 5,
                successfulFoodLogs: 10,
                streakDays: 7,
                milestonesAchieved: [],
                lastReviewPrompt: null,
                lastReviewAction: null,
            },
            appState: {
                isLoading: false,
                hasErrors: false,
                currentScreen: 'home',
                sessionStartTime: new Date(),
            },
        };

        jest.clearAllMocks();
        
        // Default mock implementations
        mockStorageService.initialize.mockResolvedValue(undefined);
        mockTriggerEngine.initialize.mockResolvedValue(undefined);
        mockTriggerEngine.evaluateTrigger.mockResolvedValue({
            shouldTrigger: true,
            reason: 'Test trigger',
            confidence: 0.8,
        });
        mockReviewDialog.requestReview.mockResolvedValue({
            success: true,
            action: ReviewAction.COMPLETED,
        });
        mockReviewDialog.isAvailable.mockResolvedValue(true);
        mockErrorHandler.handleReviewError.mockResolvedValue({
            success: true,
            action: ReviewAction.COMPLETED,
        });
        mockErrorHandler.getErrorStats.mockReturnValue({
            totalErrors: 0,
            errorsByType: {},
            totalRetryAttempts: 0,
            rateLimitedOperations: 0,
            inMemoryFallbackSize: 0,
        });
        mockErrorHandler.getConfig.mockReturnValue({
            maxRetryAttempts: 3,
            baseRetryDelayMs: 1000,
            enableFallbacks: true,
        });
    });

    describe('Initialization Error Handling', () => {
        it('should handle storage service initialization failure', async () => {
            const error = new Error('Storage initialization failed');
            mockStorageService.initialize.mockRejectedValue(error);

            await expect(reviewManager.initialize()).rejects.toThrow();
            
            expect(mockAnalyticsTracker.trackError).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: ReviewErrorType.UNKNOWN_ERROR,
                    message: 'Failed to initialize ReviewManager',
                })
            );
        });

        it('should handle trigger engine initialization failure', async () => {
            const error = new Error('Trigger engine initialization failed');
            mockTriggerEngine.initialize.mockRejectedValue(error);

            await expect(reviewManager.initialize()).rejects.toThrow();
            
            expect(mockAnalyticsTracker.trackError).toHaveBeenCalled();
        });

        it('should not reinitialize if already initialized', async () => {
            await reviewManager.initialize();
            await reviewManager.initialize();

            expect(mockStorageService.initialize).toHaveBeenCalledTimes(1);
            expect(mockTriggerEngine.initialize).toHaveBeenCalledTimes(1);
        });
    });

    describe('Review Triggering Error Handling', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should handle trigger evaluation errors', async () => {
            const error = new Error('Trigger evaluation failed');
            mockTriggerEngine.evaluateTrigger.mockRejectedValue(error);

            const result = await reviewManager.checkAndTriggerReview(mockContext);

            expect(result).toBe(false);
            expect(mockAnalyticsTracker.trackError).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: ReviewErrorType.UNKNOWN_ERROR,
                    message: 'Failed to check and trigger review',
                })
            );
        });

        it('should skip review when already processing', async () => {
            // Start first review request
            const promise1 = reviewManager.checkAndTriggerReview(mockContext);
            
            // Start second review request while first is processing
            const result2 = await reviewManager.checkAndTriggerReview(mockContext);
            
            expect(result2).toBe(false);
            
            // Wait for first request to complete
            await promise1;
        });

        it('should handle review dialog errors with error handler', async () => {
            const error = new Error('Review dialog failed');
            mockReviewDialog.requestReview.mockRejectedValue(error);
            
            mockErrorHandler.handleReviewError.mockResolvedValue({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Recovery failed',
            });

            const result = await reviewManager.checkAndTriggerReview(mockContext);

            expect(result).toBe(false);
            expect(mockErrorHandler.handleReviewError).toHaveBeenCalled();
            expect(mockAnalyticsTracker.trackApiCall).toHaveBeenCalledWith(
                'requestReview',
                expect.any(Number),
                false,
                'Review dialog failed'
            );
        });

        it('should clear retry attempts on successful review', async () => {
            const result = await reviewManager.checkAndTriggerReview(mockContext);

            expect(result).toBe(true);
            expect(mockErrorHandler.clearRetryAttempts).toHaveBeenCalledWith('show_review_dialog');
        });
    });

    describe('User Action Recording Error Handling', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should queue actions when not initialized', () => {
            const uninitializedManager = new ReviewManager();
            const action = {
                type: 'test_action',
                timestamp: new Date(),
            };

            uninitializedManager.recordUserAction(action);

            expect(mockAnalyticsTracker.trackUserActionRecorded).toHaveBeenCalledWith(action);
        });

        it('should handle user action processing errors', async () => {
            const error = new Error('User action processing failed');
            mockTriggerEngine.updateUserMetrics.mockRejectedValue(error);

            const action = {
                type: 'test_action',
                timestamp: new Date(),
            };

            reviewManager.recordUserAction(action);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockAnalyticsTracker.trackStorageOperation).toHaveBeenCalledWith(
                'updateUserMetrics',
                expect.any(Number),
                false,
                'User action processing failed'
            );
        });

        it('should process pending actions after initialization', async () => {
            const uninitializedManager = new ReviewManager();
            const action = {
                type: 'test_action',
                timestamp: new Date(),
            };

            uninitializedManager.recordUserAction(action);
            await uninitializedManager.initialize();

            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledWith(action);
        });
    });

    describe('Review Availability Error Handling', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should handle review availability check errors', async () => {
            const error = new Error('Availability check failed');
            mockReviewDialog.isAvailable.mockRejectedValue(error);

            const result = await reviewManager.isReviewAvailable();

            expect(result).toBe(false);
            expect(mockAnalyticsTracker.trackApiCall).toHaveBeenCalledWith(
                'isAvailable',
                expect.any(Number),
                false,
                'Availability check failed'
            );
        });

        it('should track successful availability checks', async () => {
            const result = await reviewManager.isReviewAvailable();

            expect(result).toBe(true);
            expect(mockAnalyticsTracker.trackApiCall).toHaveBeenCalledWith(
                'isAvailable',
                expect.any(Number),
                true
            );
        });
    });

    describe('State Reset Error Handling', () => {
        it('should handle storage clearing errors gracefully', async () => {
            const error = new Error('Clear data failed');
            mockStorageService.clearReviewData.mockImplementation(() => {
                throw error;
            });

            await expect(reviewManager.resetReviewState()).resolves.not.toThrow();
        });

        it('should clear all caches and pending actions', async () => {
            await reviewManager.resetReviewState();

            expect(mockStorageService.clearCache).toHaveBeenCalled();
            expect(mockTriggerEngine.clearCache).toHaveBeenCalled();
        });
    });

    describe('Debug Information Error Handling', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should provide comprehensive debug information', async () => {
            mockStorageService.getUserMetrics.mockResolvedValue({
                appOpenCount: 5,
                successfulFoodLogs: 10,
            });
            mockStorageService.getReviewSettings.mockResolvedValue({
                minimumAppOpens: 5,
                cooldownDays: 30,
            });
            mockTriggerEngine.getNextEligibleTime.mockResolvedValue(new Date());
            mockAnalyticsTracker.getPerformanceStats.mockReturnValue({
                averagePromptDisplayTime: 100,
            });

            const debugInfo = await reviewManager.getDebugInfo();

            expect(debugInfo).toHaveProperty('isInitialized');
            expect(debugInfo).toHaveProperty('isProcessingReview');
            expect(debugInfo).toHaveProperty('pendingActionsCount');
            expect(debugInfo).toHaveProperty('userMetrics');
            expect(debugInfo).toHaveProperty('reviewSettings');
            expect(debugInfo).toHaveProperty('nextEligibleTime');
            expect(debugInfo).toHaveProperty('isReviewAvailable');
            expect(debugInfo).toHaveProperty('analyticsStats');
        });
    });

    describe('Error Handler Integration', () => {
        it('should provide error statistics', () => {
            const stats = reviewManager.getErrorStats();

            expect(mockErrorHandler.getErrorStats).toHaveBeenCalled();
            expect(stats).toHaveProperty('totalErrors');
            expect(stats).toHaveProperty('errorsByType');
        });

        it('should provide error handler configuration', () => {
            const config = reviewManager.getErrorHandlerConfig();

            expect(mockErrorHandler.getConfig).toHaveBeenCalled();
            expect(config).toHaveProperty('maxRetryAttempts');
            expect(config).toHaveProperty('enableFallbacks');
        });

        it('should update error handler configuration', () => {
            const newConfig = {
                maxRetryAttempts: 5,
                enableFallbacks: false,
            };

            reviewManager.updateErrorHandlerConfig(newConfig);

            expect(mockErrorHandler.updateConfig).toHaveBeenCalledWith(newConfig);
        });
    });

    describe('Analytics Integration', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should track performance metrics for operations', async () => {
            await reviewManager.checkAndTriggerReview(mockContext);

            expect(mockAnalyticsTracker.trackTriggerEvaluation).toHaveBeenCalled();
            expect(mockAnalyticsTracker.trackReviewPromptShown).toHaveBeenCalled();
            expect(mockAnalyticsTracker.trackReviewAction).toHaveBeenCalled();
        });

        it('should provide analytics data access', () => {
            reviewManager.getAnalyticsEvents();
            reviewManager.getPerformanceStats();
            reviewManager.getDebugLogs();
            reviewManager.exportAnalyticsData();

            expect(mockAnalyticsTracker.getEvents).toHaveBeenCalled();
            expect(mockAnalyticsTracker.getPerformanceStats).toHaveBeenCalled();
            expect(mockAnalyticsTracker.getDebugLogs).toHaveBeenCalled();
            expect(mockAnalyticsTracker.exportAnalyticsData).toHaveBeenCalled();
        });

        it('should clear analytics data', () => {
            reviewManager.clearAnalyticsData();

            expect(mockAnalyticsTracker.clearAnalyticsData).toHaveBeenCalled();
        });
    });

    describe('Configuration Management', () => {
        it('should update configuration and propagate to analytics', () => {
            const newConfig = {
                debugMode: false,
                enableAnalytics: false,
            };

            reviewManager.updateConfig(newConfig);

            expect(mockAnalyticsTracker.setDebugMode).toHaveBeenCalledWith(false);
        });

        it('should provide current configuration', () => {
            const config = reviewManager.getConfig();

            expect(config).toHaveProperty('debugMode');
            expect(config).toHaveProperty('enableAnalytics');
            expect(config).toHaveProperty('maxRetryAttempts');
        });
    });

    describe('Comprehensive Error Recovery', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should handle multiple error types in sequence', async () => {
            // First call fails with network error
            mockTriggerEngine.evaluateTrigger.mockRejectedValueOnce(new Error('Network error'));
            
            // Second call fails with storage error
            mockTriggerEngine.evaluateTrigger.mockRejectedValueOnce(new Error('Storage error'));
            
            // Third call succeeds
            mockTriggerEngine.evaluateTrigger.mockResolvedValueOnce({
                shouldTrigger: true,
                reason: 'Success after errors',
                confidence: 0.9,
            });

            const result1 = await reviewManager.checkAndTriggerReview(mockContext);
            const result2 = await reviewManager.checkAndTriggerReview(mockContext);
            const result3 = await reviewManager.checkAndTriggerReview(mockContext);

            expect(result1).toBe(false);
            expect(result2).toBe(false);
            expect(result3).toBe(true);
            
            expect(mockAnalyticsTracker.trackError).toHaveBeenCalledTimes(2);
        });

        it('should maintain system stability during error conditions', async () => {
            // Simulate various error conditions
            mockStorageService.getUserMetrics.mockRejectedValue(new Error('Storage error'));
            mockTriggerEngine.evaluateTrigger.mockRejectedValue(new Error('Trigger error'));
            mockReviewDialog.requestReview.mockRejectedValue(new Error('Dialog error'));

            // System should not crash and should handle errors gracefully
            const result = await reviewManager.checkAndTriggerReview(mockContext);
            const metrics = await reviewManager.getUserMetrics().catch(() => null);
            const available = await reviewManager.isReviewAvailable();

            expect(result).toBe(false);
            expect(available).toBe(false);
            await expect(reviewManager.resetReviewState()).resolves.not.toThrow();
        });
    });
});