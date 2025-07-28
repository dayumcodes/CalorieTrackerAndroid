/**
 * End-to-end tests for complete review flow
 * Tests the entire review system from user action to review completion
 */

import { ReviewManager } from '../lib/review-manager';
import { storageService } from '../lib/storage-service';
import { triggerEngine } from '../lib/trigger-engine';
import { reviewDialog } from '../lib/review-dialog';
import { analyticsTracker } from '../lib/analytics-tracker';
import {
    ReviewTrigger,
    ReviewAction,
    UserAction,
    ReviewContext,
    DEFAULT_USER_METRICS,
    DEFAULT_REVIEW_SETTINGS,
} from '../lib/types/review-types';

// Mock all dependencies
jest.mock('../lib/storage-service');
jest.mock('../lib/trigger-engine');
jest.mock('../lib/review-dialog');
jest.mock('../lib/analytics-tracker');

const mockStorageService = storageService as jest.Mocked<typeof storageService>;
const mockTriggerEngine = triggerEngine as jest.Mocked<typeof triggerEngine>;
const mockReviewDialog = reviewDialog as jest.Mocked<typeof reviewDialog>;
const mockAnalyticsTracker = analyticsTracker as jest.Mocked<typeof analyticsTracker>;

describe('End-to-End Review Flow', () => {
    let reviewManager: ReviewManager;

    beforeEach(() => {
        jest.clearAllMocks();
        reviewManager = new ReviewManager({ debugMode: true });

        // Setup default mocks
        mockStorageService.initialize.mockResolvedValue();
        mockTriggerEngine.initialize.mockResolvedValue();
        mockStorageService.getUserMetrics.mockResolvedValue({ ...DEFAULT_USER_METRICS });
        mockStorageService.getReviewSettings.mockResolvedValue({ ...DEFAULT_REVIEW_SETTINGS });
        mockReviewDialog.isAvailable.mockResolvedValue(true);
        mockAnalyticsTracker.initialize.mockResolvedValue();
        mockAnalyticsTracker.trackEvent.mockResolvedValue();
    });

    describe('New User Journey', () => {
        it('should complete full review flow for new user reaching app open threshold', async () => {
            // Setup new user metrics
            const newUserMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 5, // At threshold
                firstAppOpen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
                lastReviewPrompt: null, // Never prompted
            };

            mockStorageService.getUserMetrics.mockResolvedValue(newUserMetrics);
            mockTriggerEngine.evaluateTrigger.mockResolvedValue({
                shouldTrigger: true,
                reason: 'App opens meet minimum requirement',
                confidence: 0.7,
            });
            mockReviewDialog.requestReview.mockResolvedValue({
                success: true,
                action: ReviewAction.COMPLETED,
            });

            // Initialize system
            await reviewManager.initialize();

            // Simulate user opening app (5th time)
            const appOpenAction: UserAction = {
                type: 'app_open',
                timestamp: new Date(),
                metadata: { screen: 'home', source: 'app_launch' },
            };

            reviewManager.recordUserAction(appOpenAction);
            await new Promise(resolve => setTimeout(resolve, 10)); // Allow async processing

            // Create review context
            const context: ReviewContext = {
                trigger: ReviewTrigger.APP_OPEN,
                userState: {
                    appOpenCount: 5,
                    successfulFoodLogs: 0,
                    streakDays: 0,
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

            // Trigger review check
            const reviewTriggered = await reviewManager.checkAndTriggerReview(context);

            // Verify complete flow
            expect(reviewTriggered).toBe(true);
            expect(mockTriggerEngine.evaluateTrigger).toHaveBeenCalledWith(context);
            expect(mockReviewDialog.requestReview).toHaveBeenCalled();
            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledTimes(3); // app_open + review_prompt_shown + review_action
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('review_prompt_shown', expect.any(Object));
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('review_completed', expect.any(Object));
        });

        it('should handle new user not meeting threshold', async () => {
            const newUserMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 2, // Below threshold
                firstAppOpen: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
            };

            mockStorageService.getUserMetrics.mockResolvedValue(newUserMetrics);
            mockTriggerEngine.evaluateTrigger.mockResolvedValue({
                shouldTrigger: false,
                reason: 'App opens below minimum requirement',
                confidence: 0,
            });

            await reviewManager.initialize();

            const context: ReviewContext = {
                trigger: ReviewTrigger.APP_OPEN,
                userState: {
                    appOpenCount: 2,
                    successfulFoodLogs: 0,
                    streakDays: 0,
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

            const reviewTriggered = await reviewManager.checkAndTriggerReview(context);

            expect(reviewTriggered).toBe(false);
            expect(mockReviewDialog.requestReview).not.toHaveBeenCalled();
        });
    });

    describe('Engaged User Journey', () => {
        it('should complete review flow for user achieving milestone', async () => {
            const engagedUserMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 20,
                successfulFoodLogs: 50,
                streakDays: 7,
                milestonesAchieved: ['7_day_streak'],
                lastReviewPrompt: null,
            };

            mockStorageService.getUserMetrics.mockResolvedValue(engagedUserMetrics);
            mockTriggerEngine.evaluateTrigger.mockResolvedValue({
                shouldTrigger: true,
                reason: 'Milestone achieved: 7_day_streak',
                confidence: 0.9,
            });
            mockReviewDialog.requestReview.mockResolvedValue({
                success: true,
                action: ReviewAction.COMPLETED,
            });

            await reviewManager.initialize();

            // Simulate milestone achievement
            const milestoneAction: UserAction = {
                type: 'milestone_achieved',
                timestamp: new Date(),
                metadata: { milestone: '7_day_streak', screen: 'progress' },
            };

            reviewManager.recordUserAction(milestoneAction);
            await new Promise(resolve => setTimeout(resolve, 10));

            const context: ReviewContext = {
                trigger: ReviewTrigger.MILESTONE_ACHIEVED,
                userState: {
                    appOpenCount: 20,
                    successfulFoodLogs: 50,
                    streakDays: 7,
                    milestonesAchieved: ['7_day_streak'],
                    lastReviewPrompt: null,
                    lastReviewAction: null,
                },
                appState: {
                    isLoading: false,
                    hasErrors: false,
                    currentScreen: 'progress',
                    sessionStartTime: new Date(),
                },
            };

            const reviewTriggered = await reviewManager.checkAndTriggerReview(context);

            expect(reviewTriggered).toBe(true);
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('milestone_achieved', expect.objectContaining({
                milestone: '7_day_streak',
            }));
        });

        it('should handle successful food logging trigger', async () => {
            const userMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 15,
                successfulFoodLogs: 10, // At threshold
                lastReviewPrompt: null,
            };

            mockStorageService.getUserMetrics.mockResolvedValue(userMetrics);
            mockTriggerEngine.evaluateTrigger.mockResolvedValue({
                shouldTrigger: true,
                reason: 'Successful food logs meet minimum requirement',
                confidence: 0.8,
            });
            mockReviewDialog.requestReview.mockResolvedValue({
                success: true,
                action: ReviewAction.COMPLETED,
            });

            await reviewManager.initialize();

            // Simulate successful food logging
            const foodLogAction: UserAction = {
                type: 'successful_food_log',
                timestamp: new Date(),
                metadata: { calories: 500, screen: 'home' },
            };

            reviewManager.recordUserAction(foodLogAction);
            await new Promise(resolve => setTimeout(resolve, 10));

            const context: ReviewContext = {
                trigger: ReviewTrigger.SUCCESSFUL_FOOD_LOG,
                userState: {
                    appOpenCount: 15,
                    successfulFoodLogs: 10,
                    streakDays: 0,
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

            const reviewTriggered = await reviewManager.checkAndTriggerReview(context);

            expect(reviewTriggered).toBe(true);
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('successful_food_log', expect.any(Object));
        });
    });

    describe('Review Dismissal and Cooldown', () => {
        it('should handle user dismissing review and enforce cooldown', async () => {
            const userMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 10,
                lastReviewPrompt: null,
            };

            mockStorageService.getUserMetrics.mockResolvedValue(userMetrics);
            mockTriggerEngine.evaluateTrigger.mockResolvedValue({
                shouldTrigger: true,
                reason: 'App opens meet minimum requirement',
                confidence: 0.6,
            });
            mockReviewDialog.requestReview.mockResolvedValue({
                success: false,
                action: ReviewAction.DISMISSED,
            });

            await reviewManager.initialize();

            const context: ReviewContext = {
                trigger: ReviewTrigger.APP_OPEN,
                userState: {
                    appOpenCount: 10,
                    successfulFoodLogs: 0,
                    streakDays: 0,
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

            const reviewTriggered = await reviewManager.checkAndTriggerReview(context);

            expect(reviewTriggered).toBe(false);
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('review_dismissed', expect.any(Object));

            // Verify cooldown is enforced on next attempt
            mockTriggerEngine.evaluateTrigger.mockResolvedValue({
                shouldTrigger: false,
                reason: 'Cooldown period active',
                confidence: 0,
                nextEligibleTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });

            const secondAttempt = await reviewManager.checkAndTriggerReview(context);
            expect(secondAttempt).toBe(false);
        });
    });

    describe('Error Recovery Scenarios', () => {
        it('should handle Google Play Services unavailable with fallback', async () => {
            const userMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 10,
                lastReviewPrompt: null,
            };

            mockStorageService.getUserMetrics.mockResolvedValue(userMetrics);
            mockTriggerEngine.evaluateTrigger.mockResolvedValue({
                shouldTrigger: true,
                reason: 'App opens meet minimum requirement',
                confidence: 0.7,
            });
            mockReviewDialog.isAvailable.mockResolvedValue(false);
            mockReviewDialog.requestReview.mockResolvedValue({
                success: false,
                action: ReviewAction.NOT_AVAILABLE,
                error: 'Google Play Services unavailable',
            });

            await reviewManager.initialize();

            const context: ReviewContext = {
                trigger: ReviewTrigger.APP_OPEN,
                userState: {
                    appOpenCount: 10,
                    successfulFoodLogs: 0,
                    streakDays: 0,
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

            const reviewTriggered = await reviewManager.checkAndTriggerReview(context);

            expect(reviewTriggered).toBe(false);
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('review_error', expect.objectContaining({
                error: 'Google Play Services unavailable',
            }));
        });

        it('should handle network errors with retry mechanism', async () => {
            const userMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 10,
                lastReviewPrompt: null,
            };

            mockStorageService.getUserMetrics.mockResolvedValue(userMetrics);
            mockTriggerEngine.evaluateTrigger.mockResolvedValue({
                shouldTrigger: true,
                reason: 'App opens meet minimum requirement',
                confidence: 0.7,
            });

            // First two attempts fail with network error, third succeeds
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

            await reviewManager.initialize();

            const context: ReviewContext = {
                trigger: ReviewTrigger.APP_OPEN,
                userState: {
                    appOpenCount: 10,
                    successfulFoodLogs: 0,
                    streakDays: 0,
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

            const reviewTriggered = await reviewManager.checkAndTriggerReview(context);

            expect(reviewTriggered).toBe(true);
            expect(mockReviewDialog.requestReview).toHaveBeenCalledTimes(3);
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('review_retry', expect.any(Object));
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('review_completed', expect.any(Object));
        });
    });

    describe('Multiple Trigger Scenarios', () => {
        it('should handle multiple triggers in sequence', async () => {
            const userMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 15,
                successfulFoodLogs: 12,
                streakDays: 7,
                milestonesAchieved: ['7_day_streak'],
                lastReviewPrompt: null,
            };

            mockStorageService.getUserMetrics.mockResolvedValue(userMetrics);
            await reviewManager.initialize();

            // First trigger: successful food log
            mockTriggerEngine.evaluateTrigger.mockResolvedValueOnce({
                shouldTrigger: true,
                reason: 'Successful food logs meet minimum requirement',
                confidence: 0.8,
            });
            mockReviewDialog.requestReview.mockResolvedValueOnce({
                success: true,
                action: ReviewAction.COMPLETED,
            });

            const foodLogContext: ReviewContext = {
                trigger: ReviewTrigger.SUCCESSFUL_FOOD_LOG,
                userState: userMetrics,
                appState: {
                    isLoading: false,
                    hasErrors: false,
                    currentScreen: 'home',
                    sessionStartTime: new Date(),
                },
            };

            const firstReview = await reviewManager.checkAndTriggerReview(foodLogContext);
            expect(firstReview).toBe(true);

            // Second trigger: milestone (should be blocked by cooldown)
            mockTriggerEngine.evaluateTrigger.mockResolvedValueOnce({
                shouldTrigger: false,
                reason: 'Cooldown period active',
                confidence: 0,
                nextEligibleTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });

            const milestoneContext: ReviewContext = {
                trigger: ReviewTrigger.MILESTONE_ACHIEVED,
                userState: {
                    ...userMetrics,
                    lastReviewPrompt: new Date(), // Just prompted
                    lastReviewAction: ReviewAction.COMPLETED,
                },
                appState: {
                    isLoading: false,
                    hasErrors: false,
                    currentScreen: 'progress',
                    sessionStartTime: new Date(),
                },
            };

            const secondReview = await reviewManager.checkAndTriggerReview(milestoneContext);
            expect(secondReview).toBe(false);
        });
    });

    describe('Analytics Integration', () => {
        it('should track all review events throughout the flow', async () => {
            const userMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 10,
                lastReviewPrompt: null,
            };

            mockStorageService.getUserMetrics.mockResolvedValue(userMetrics);
            mockTriggerEngine.evaluateTrigger.mockResolvedValue({
                shouldTrigger: true,
                reason: 'App opens meet minimum requirement',
                confidence: 0.7,
            });
            mockReviewDialog.requestReview.mockResolvedValue({
                success: true,
                action: ReviewAction.COMPLETED,
            });

            await reviewManager.initialize();

            // Record user action
            const appOpenAction: UserAction = {
                type: 'app_open',
                timestamp: new Date(),
                metadata: { screen: 'home' },
            };
            reviewManager.recordUserAction(appOpenAction);
            await new Promise(resolve => setTimeout(resolve, 10));

            // Trigger review
            const context: ReviewContext = {
                trigger: ReviewTrigger.APP_OPEN,
                userState: {
                    appOpenCount: 10,
                    successfulFoodLogs: 0,
                    streakDays: 0,
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

            await reviewManager.checkAndTriggerReview(context);

            // Verify all analytics events were tracked
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('app_open', expect.any(Object));
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('review_prompt_shown', expect.any(Object));
            expect(mockAnalyticsTracker.trackEvent).toHaveBeenCalledWith('review_completed', expect.any(Object));
        });
    });

    describe('Configuration Changes', () => {
        it('should handle runtime configuration updates', async () => {
            await reviewManager.initialize();

            // Update configuration
            reviewManager.updateConfig({
                debugMode: false,
                maxRetryAttempts: 5,
            });

            const config = reviewManager.getConfig();
            expect(config.debugMode).toBe(false);
            expect(config.maxRetryAttempts).toBe(5);
        });
    });

    describe('State Management', () => {
        it('should maintain consistent state throughout complex flow', async () => {
            const initialMetrics = {
                ...DEFAULT_USER_METRICS,
                appOpenCount: 4, // One below threshold
            };

            mockStorageService.getUserMetrics.mockResolvedValue(initialMetrics);
            await reviewManager.initialize();

            // Record app open (should reach threshold)
            const appOpenAction: UserAction = {
                type: 'app_open',
                timestamp: new Date(),
            };
            reviewManager.recordUserAction(appOpenAction);
            await new Promise(resolve => setTimeout(resolve, 10));

            // Verify metrics were updated
            expect(mockTriggerEngine.updateUserMetrics).toHaveBeenCalledWith(appOpenAction);

            // Get debug info to verify state
            const debugInfo = await reviewManager.getDebugInfo();
            expect(debugInfo.isInitialized).toBe(true);
            expect(debugInfo.pendingActionsCount).toBe(0);
        });
    });
});