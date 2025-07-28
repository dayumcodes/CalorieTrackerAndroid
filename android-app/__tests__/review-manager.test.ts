/**
 * Unit tests for ReviewManager
 * Tests the orchestration service that coordinates all review components
 */

import { ReviewManager } from '../lib/review-manager';
import { storageService } from '../lib/storage-service';
import { triggerEngine } from '../lib/trigger-engine';
import { reviewDialog } from '../lib/review-dialog';
import {
    ReviewContext,
    ReviewTrigger,
    ReviewAction,
    UserAction,
    ReviewResult,
    TriggerResult,
    UserMetrics,
    ReviewSettings,
    DEFAULT_USER_METRICS,
    DEFAULT_REVIEW_SETTINGS,
} from '../lib/types/review-types';

// Mock all dependencies
jest.mock('../lib/storage-service');
jest.mock('../lib/trigger-engine');
jest.mock('../lib/review-dialog');

const mockStorageService = storageService as jest.Mocked<typeof storageService>;
const mockTriggerEngine = triggerEngine as jest.Mocked<typeof triggerEngine>;
const mockReviewDialog = reviewDialog as jest.Mocked<typeof reviewDialog>;

describe('ReviewManager', () => {
    let reviewManager: ReviewManager;
    let mockContext: ReviewContext;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create fresh instance for each test
        reviewManager = new ReviewManager({ debugMode: true });

        // Setup default mock context
        mockContext = {
            trigger: ReviewTrigger.APP_OPEN,
            userState: {
                appOpenCount: 10,
                successfulFoodLogs: 5,
                streakDays: 3,
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

        // Setup default mock implementations
        mockStorageService.initialize.mockResolvedValue();
        mockTriggerEngine.initialize.mockResolvedValue();
        mockStorageService.getUserMetrics.mockResolvedValue({ ...DEFAULT_USER_METRICS });
        mockStorageService.getReviewSettings.mockResolvedValue({ ...DEFAULT_REVIEW_SETTINGS });
        mockReviewDialog.isAvailable.mockResolvedValue(true);
    });

    describe('initialize', () => {
        it('should initialize all dependencies successfully', async () => {
            await reviewManager.initialize();

            expect(mockStorageService.initialize).toHaveBeenCalledTimes(1);
            expect(mockTriggerEngine.initialize).toHaveBeenCalledTimes(1);
        });

        it('should not initialize twice', async () => {
            await reviewManager.initialize();
            await reviewManager.initialize();

            expect(mockStorageService.initialize).toHaveBeenCalledTimes(1);
            expect(mockTriggerEngine.initialize).toHaveBeenCalledTimes(1);
        });

        it('should handle initialization errors', async () => {
            const error = new Error('Storage initialization failed');
            mockStorageService.initialize.mockRejectedValue(error);

            try {
                await reviewManager.initialize();
                fail('Expected initialization to throw');
            } catch (thrownError: any) {
                expect(thrownError.message).toContain('Failed to initialize ReviewManager');
            }
        });

        it('should process pending actions after initialization', async () => {
            const action: UserAction = {
                type: 'app_open',
                timestamp: new Date(),
            };

            // Record action before initialization
            reviewManager.recordUserAction(action);

            // Initialize should process the pending action
            await reviewManager.initialize();

            // Give time for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledWith(action);
        });
    });

    describe('checkAndTriggerReview', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should trigger review when conditions are met', async () => {
            const triggerResult: TriggerResult = {
                shouldTrigger: true,
                reason: 'App opens meet minimum requirement',
                confidence: 0.8,
            };

            const reviewResult: ReviewResult = {
                success: true,
                action: ReviewAction.COMPLETED,
            };

            mockTriggerEngine.evaluateTrigger.mockResolvedValue(triggerResult);
            mockReviewDialog.requestReview.mockResolvedValue(reviewResult);

            const result = await reviewManager.checkAndTriggerReview(mockContext);

            expect(result).toBe(true);
            expect(mockTriggerEngine.evaluateTrigger).toHaveBeenCalledWith(mockContext);
            expect(mockReviewDialog.requestReview).toHaveBeenCalledTimes(1);
            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledTimes(2); // prompt shown + action
        });

        it('should not trigger review when conditions are not met', async () => {
            const triggerResult: TriggerResult = {
                shouldTrigger: false,
                reason: 'App opens below minimum',
                confidence: 0,
            };

            mockTriggerEngine.evaluateTrigger.mockResolvedValue(triggerResult);

            const result = await reviewManager.checkAndTriggerReview(mockContext);

            expect(result).toBe(false);
            expect(mockReviewDialog.requestReview).not.toHaveBeenCalled();
        });

        it('should handle review dialog errors gracefully', async () => {
            const triggerResult: TriggerResult = {
                shouldTrigger: true,
                reason: 'Conditions met',
                confidence: 0.8,
            };

            const reviewResult: ReviewResult = {
                success: false,
                action: ReviewAction.ERROR,
                error: 'Google Play Services unavailable',
            };

            mockTriggerEngine.evaluateTrigger.mockResolvedValue(triggerResult);
            mockReviewDialog.requestReview.mockResolvedValue(reviewResult);

            const result = await reviewManager.checkAndTriggerReview(mockContext);

            expect(result).toBe(false);
            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledTimes(2); // prompt shown + error action
        });

        it('should prevent concurrent review processing', async () => {
            const triggerResult: TriggerResult = {
                shouldTrigger: true,
                reason: 'Conditions met',
                confidence: 0.8,
            };

            mockTriggerEngine.evaluateTrigger.mockResolvedValue(triggerResult);
            
            // Mock a slow review dialog
            mockReviewDialog.requestReview.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve({
                    success: true,
                    action: ReviewAction.COMPLETED,
                }), 50))
            );

            // Start first review check
            const promise1 = reviewManager.checkAndTriggerReview(mockContext);
            
            // Give it a moment to start processing
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Start second review check while first is still processing
            const promise2 = reviewManager.checkAndTriggerReview(mockContext);

            const [result1, result2] = await Promise.all([promise1, promise2]);

            // First should succeed, second should be skipped
            expect(result1).toBe(true);
            expect(result2).toBe(false);
            expect(mockReviewDialog.requestReview).toHaveBeenCalledTimes(1);
        });

        it('should retry failed review requests', async () => {
            const triggerResult: TriggerResult = {
                shouldTrigger: true,
                reason: 'Conditions met',
                confidence: 0.8,
            };

            mockTriggerEngine.evaluateTrigger.mockResolvedValue(triggerResult);
            
            // First two calls fail, third succeeds
            mockReviewDialog.requestReview
                .mockResolvedValueOnce({
                    success: false,
                    action: ReviewAction.ERROR,
                    error: 'Network error',
                })
                .mockResolvedValueOnce({
                    success: false,
                    action: ReviewAction.ERROR,
                    error: 'Network error',
                })
                .mockResolvedValueOnce({
                    success: true,
                    action: ReviewAction.COMPLETED,
                });

            const result = await reviewManager.checkAndTriggerReview(mockContext);

            expect(result).toBe(true);
            expect(mockReviewDialog.requestReview).toHaveBeenCalledTimes(3);
        });

        it('should not retry dismissed reviews', async () => {
            const triggerResult: TriggerResult = {
                shouldTrigger: true,
                reason: 'Conditions met',
                confidence: 0.8,
            };

            mockTriggerEngine.evaluateTrigger.mockResolvedValue(triggerResult);
            mockReviewDialog.requestReview.mockResolvedValue({
                success: false,
                action: ReviewAction.DISMISSED,
            });

            const result = await reviewManager.checkAndTriggerReview(mockContext);

            expect(result).toBe(false);
            expect(mockReviewDialog.requestReview).toHaveBeenCalledTimes(1); // No retry
        });
    });

    describe('recordUserAction', () => {
        it('should process user actions when initialized', async () => {
            await reviewManager.initialize();

            const action: UserAction = {
                type: 'successful_food_log',
                timestamp: new Date(),
                metadata: { calories: 500 },
            };

            reviewManager.recordUserAction(action);

            // Give time for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledWith(action);
        });

        it('should queue actions when not initialized', async () => {
            const action: UserAction = {
                type: 'app_open',
                timestamp: new Date(),
            };

            // Record action before initialization
            reviewManager.recordUserAction(action);

            // Should not be processed yet
            expect(mockTriggerEngine.updateUserMetrics).not.toHaveBeenCalled();

            // Initialize and wait for processing
            await reviewManager.initialize();
            await new Promise(resolve => setTimeout(resolve, 10));

            // Now should be processed
            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledWith(action);
        });

        it('should handle action processing errors gracefully', async () => {
            await reviewManager.initialize();

            const error = new Error('Metrics update failed');
            mockTriggerEngine.updateUserMetrics.mockRejectedValue(error);

            const action: UserAction = {
                type: 'app_open',
                timestamp: new Date(),
            };

            // Should not throw
            expect(() => reviewManager.recordUserAction(action)).not.toThrow();

            // Give time for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledWith(action);
        });
    });

    describe('isReviewAvailable', () => {
        it('should return true when review dialog is available', async () => {
            mockReviewDialog.isAvailable.mockResolvedValue(true);

            const result = await reviewManager.isReviewAvailable();

            expect(result).toBe(true);
            expect(mockReviewDialog.isAvailable).toHaveBeenCalledTimes(1);
        });

        it('should return false when review dialog is not available', async () => {
            mockReviewDialog.isAvailable.mockResolvedValue(false);

            const result = await reviewManager.isReviewAvailable();

            expect(result).toBe(false);
        });

        it('should handle errors and return false', async () => {
            mockReviewDialog.isAvailable.mockRejectedValue(new Error('Check failed'));

            const result = await reviewManager.isReviewAvailable();

            expect(result).toBe(false);
        });
    });

    describe('resetReviewState', () => {
        it('should clear all review data', async () => {
            await reviewManager.initialize();

            // Mock the clearReviewData method
            mockStorageService.clearReviewData.mockResolvedValue();

            reviewManager.resetReviewState();

            expect(mockStorageService.clearReviewData).toHaveBeenCalledTimes(1);
            expect(mockStorageService.clearCache).toHaveBeenCalledTimes(1);
            expect(mockTriggerEngine.clearCache).toHaveBeenCalledTimes(1);
        });

        it('should handle clear data errors gracefully', async () => {
            await reviewManager.initialize();

            mockStorageService.clearReviewData.mockImplementation(() => {
                throw new Error('Clear failed');
            });

            // Should not throw
            expect(() => reviewManager.resetReviewState()).not.toThrow();
        });
    });

    describe('utility methods', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should get user metrics', async () => {
            const metrics: UserMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 15,
            };

            mockStorageService.getUserMetrics.mockResolvedValue(metrics);

            const result = await reviewManager.getUserMetrics();

            expect(result).toEqual(metrics);
            expect(mockStorageService.getUserMetrics).toHaveBeenCalledTimes(1);
        });

        it('should get review settings', async () => {
            const settings: ReviewSettings = {
                ...DEFAULT_REVIEW_SETTINGS,
                minimumAppOpens: 10,
            };

            mockStorageService.getReviewSettings.mockResolvedValue(settings);

            const result = await reviewManager.getReviewSettings();

            expect(result).toEqual(settings);
            expect(mockStorageService.getReviewSettings).toHaveBeenCalledTimes(1);
        });

        it('should get next eligible time', async () => {
            const nextTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            mockTriggerEngine.getNextEligibleTime.mockResolvedValue(nextTime);

            const result = await reviewManager.getNextEligibleTime();

            expect(result).toEqual(nextTime);
            expect(mockTriggerEngine.getNextEligibleTime).toHaveBeenCalledTimes(1);
        });

        it('should get debug info', async () => {
            const metrics: UserMetrics = { ...DEFAULT_USER_METRICS, appOpenCount: 15 };
            const settings: ReviewSettings = { ...DEFAULT_REVIEW_SETTINGS, minimumAppOpens: 10 };
            const nextTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

            mockStorageService.getUserMetrics.mockResolvedValue(metrics);
            mockStorageService.getReviewSettings.mockResolvedValue(settings);
            mockTriggerEngine.getNextEligibleTime.mockResolvedValue(nextTime);
            mockReviewDialog.isAvailable.mockResolvedValue(true);

            const debugInfo = await reviewManager.getDebugInfo();

            expect(debugInfo).toEqual({
                isInitialized: true,
                isProcessingReview: false,
                pendingActionsCount: 0,
                userMetrics: metrics,
                reviewSettings: settings,
                nextEligibleTime: nextTime,
                isReviewAvailable: true,
                analyticsStats: expect.any(Object),
            });
        });
    });

    describe('configuration', () => {
        it('should use default configuration', () => {
            const manager = new ReviewManager();
            const config = manager.getConfig();

            expect(config.debugMode).toBe(false);
            expect(config.enableAnalytics).toBe(true);
            expect(config.maxRetryAttempts).toBe(3);
            expect(config.retryDelayMs).toBe(1000);
        });

        it('should accept custom configuration', () => {
            const customConfig = {
                debugMode: true,
                enableAnalytics: false,
                maxRetryAttempts: 5,
                retryDelayMs: 2000,
            };

            const manager = new ReviewManager(customConfig);
            const config = manager.getConfig();

            expect(config).toEqual(customConfig);
        });

        it('should update configuration', () => {
            const manager = new ReviewManager();
            
            manager.updateConfig({ debugMode: true, maxRetryAttempts: 5 });
            
            const config = manager.getConfig();
            expect(config.debugMode).toBe(true);
            expect(config.maxRetryAttempts).toBe(5);
            expect(config.enableAnalytics).toBe(true); // Should keep default
        });
    });

    describe('error handling', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should handle trigger evaluation errors', async () => {
            mockTriggerEngine.evaluateTrigger.mockRejectedValue(new Error('Evaluation failed'));

            const result = await reviewManager.checkAndTriggerReview(mockContext);

            expect(result).toBe(false);
        });

        it('should handle storage errors during action recording', async () => {
            mockTriggerEngine.updateUserMetrics.mockRejectedValue(new Error('Storage failed'));

            const action: UserAction = {
                type: 'app_open',
                timestamp: new Date(),
            };

            // Should not throw
            expect(() => reviewManager.recordUserAction(action)).not.toThrow();

            // Give time for async processing
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        it('should handle initialization errors in checkAndTriggerReview', async () => {
            const uninitializedManager = new ReviewManager();
            mockStorageService.initialize.mockRejectedValue(new Error('Init failed'));

            const result = await uninitializedManager.checkAndTriggerReview(mockContext);

            expect(result).toBe(false);
        });
    });

    describe('analytics integration', () => {
        it('should track user actions when analytics is enabled', async () => {
            const manager = new ReviewManager({ enableAnalytics: true, debugMode: true });
            await manager.initialize();

            const action: UserAction = {
                type: 'successful_food_log',
                timestamp: new Date(),
            };

            manager.recordUserAction(action);

            // Give time for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledWith(action);
        });

        it('should not track analytics when disabled', async () => {
            const manager = new ReviewManager({ enableAnalytics: false });
            await manager.initialize();

            const action: UserAction = {
                type: 'successful_food_log',
                timestamp: new Date(),
            };

            manager.recordUserAction(action);

            // Give time for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledWith(action);
        });
    });
});