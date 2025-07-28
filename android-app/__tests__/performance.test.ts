/**
 * Performance tests for the review system
 * Tests to ensure minimal app impact and optimal performance
 */

import { ReviewManager } from '../lib/review-manager';
import { ReviewTriggerEngine } from '../lib/trigger-engine';
import { ReviewStorageService } from '../lib/storage-service';
import { ReviewDialog } from '../lib/review-dialog';
import { AnalyticsTracker } from '../lib/analytics-tracker';
import {
    ReviewTrigger,
    ReviewAction,
    UserAction,
    ReviewContext,
    DEFAULT_USER_METRICS,
    DEFAULT_REVIEW_SETTINGS,
} from '../lib/types/review-types';

// Mock AsyncStorage for performance testing
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
    getAllKeys: jest.fn(() => Promise.resolve([])),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiSet: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock react-native-in-app-review
jest.mock('react-native-in-app-review', () => ({
    isAvailable: jest.fn(() => Promise.resolve(true)),
    RequestInAppReview: jest.fn(() => Promise.resolve(true)),
}));

describe('Performance Tests', () => {
    let reviewManager: ReviewManager;
    let triggerEngine: ReviewTriggerEngine;
    let storageService: ReviewStorageService;
    let reviewDialog: ReviewDialog;
    let analyticsTracker: AnalyticsTracker;

    beforeEach(() => {
        reviewManager = new ReviewManager({ debugMode: false });
        triggerEngine = new ReviewTriggerEngine();
        storageService = new ReviewStorageService();
        reviewDialog = new ReviewDialog();
        analyticsTracker = new AnalyticsTracker();
    });

    describe('Initialization Performance', () => {
        it('should initialize ReviewManager within 100ms', async () => {
            const startTime = performance.now();
            
            await reviewManager.initialize();
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(100);
        });

        it('should initialize TriggerEngine within 50ms', async () => {
            const startTime = performance.now();
            
            await triggerEngine.initialize();
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(50);
        });

        it('should initialize StorageService within 50ms', async () => {
            const startTime = performance.now();
            
            await storageService.initialize();
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(50);
        });

        it('should handle concurrent initialization efficiently', async () => {
            const startTime = performance.now();
            
            // Initialize multiple components concurrently
            await Promise.all([
                reviewManager.initialize(),
                triggerEngine.initialize(),
                storageService.initialize(),
                analyticsTracker.initialize(),
            ]);
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Should not take significantly longer than single initialization
            expect(duration).toBeLessThan(150);
        });
    });

    describe('User Action Processing Performance', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should process user actions within 10ms', async () => {
            const action: UserAction = {
                type: 'app_open',
                timestamp: new Date(),
            };

            const startTime = performance.now();
            
            reviewManager.recordUserAction(action);
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Synchronous part should be very fast
            expect(duration).toBeLessThan(10);
        });

        it('should handle burst of user actions efficiently', async () => {
            const actions: UserAction[] = Array.from({ length: 100 }, (_, i) => ({
                type: i % 2 === 0 ? 'app_open' : 'successful_food_log',
                timestamp: new Date(Date.now() + i * 1000),
                metadata: { index: i },
            }));

            const startTime = performance.now();
            
            actions.forEach(action => reviewManager.recordUserAction(action));
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Should handle 100 actions in under 50ms
            expect(duration).toBeLessThan(50);
        });

        it('should process queued actions efficiently after initialization', async () => {
            const uninitializedManager = new ReviewManager();
            
            // Queue actions before initialization
            const actions: UserAction[] = Array.from({ length: 50 }, (_, i) => ({
                type: 'app_open',
                timestamp: new Date(Date.now() + i * 1000),
            }));

            actions.forEach(action => uninitializedManager.recordUserAction(action));

            const startTime = performance.now();
            
            await uninitializedManager.initialize();
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Should process queued actions during initialization efficiently
            expect(duration).toBeLessThan(200);
        });
    });

    describe('Review Trigger Evaluation Performance', () => {
        beforeEach(async () => {
            await triggerEngine.initialize();
        });

        it('should evaluate triggers within 20ms', async () => {
            const context: ReviewContext = {
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

            const startTime = performance.now();
            
            await triggerEngine.evaluateTrigger(context);
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(20);
        });

        it('should handle multiple trigger evaluations efficiently', async () => {
            const contexts: ReviewContext[] = [
                ReviewTrigger.APP_OPEN,
                ReviewTrigger.SUCCESSFUL_FOOD_LOG,
                ReviewTrigger.MILESTONE_ACHIEVED,
                ReviewTrigger.GOAL_COMPLETED,
                ReviewTrigger.STREAK_MILESTONE,
            ].map(trigger => ({
                trigger,
                userState: {
                    appOpenCount: 10,
                    successfulFoodLogs: 15,
                    streakDays: 7,
                    milestonesAchieved: ['7_day_streak'],
                    lastReviewPrompt: null,
                    lastReviewAction: null,
                },
                appState: {
                    isLoading: false,
                    hasErrors: false,
                    currentScreen: 'home',
                    sessionStartTime: new Date(),
                },
            }));

            const startTime = performance.now();
            
            await Promise.all(contexts.map(context => triggerEngine.evaluateTrigger(context)));
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Should evaluate all 5 triggers in under 100ms
            expect(duration).toBeLessThan(100);
        });
    });

    describe('Storage Performance', () => {
        beforeEach(async () => {
            await storageService.initialize();
        });

        it('should read user metrics within 30ms', async () => {
            const startTime = performance.now();
            
            await storageService.getUserMetrics();
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(30);
        });

        it('should write user metrics within 30ms', async () => {
            const metrics = {
                appOpenCount: 15,
                successfulFoodLogs: 20,
            };

            const startTime = performance.now();
            
            await storageService.updateUserMetrics(metrics);
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(30);
        });

        it('should handle batch operations efficiently', async () => {
            const operations = Array.from({ length: 20 }, (_, i) => ({
                appOpenCount: i,
                successfulFoodLogs: i * 2,
            }));

            const startTime = performance.now();
            
            await Promise.all(operations.map(metrics => storageService.updateUserMetrics(metrics)));
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Should handle 20 batch operations in under 200ms
            expect(duration).toBeLessThan(200);
        });

        it('should cache frequently accessed data', async () => {
            // First read (cache miss)
            const startTime1 = performance.now();
            await storageService.getUserMetrics();
            const duration1 = performance.now() - startTime1;

            // Second read (cache hit)
            const startTime2 = performance.now();
            await storageService.getUserMetrics();
            const duration2 = performance.now() - startTime2;

            // Cached read should be significantly faster
            expect(duration2).toBeLessThan(duration1 * 0.5);
        });
    });

    describe('Review Dialog Performance', () => {
        it('should check availability within 50ms', async () => {
            const startTime = performance.now();
            
            await reviewDialog.isAvailable();
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(50);
        });

        it('should request review within 200ms', async () => {
            const startTime = performance.now();
            
            await reviewDialog.requestReview();
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Native dialog should be fast
            expect(duration).toBeLessThan(200);
        });
    });

    describe('Memory Usage', () => {
        it('should not create memory leaks during normal operation', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Simulate normal usage
            await reviewManager.initialize();
            
            for (let i = 0; i < 100; i++) {
                const action: UserAction = {
                    type: i % 2 === 0 ? 'app_open' : 'successful_food_log',
                    timestamp: new Date(),
                };
                reviewManager.recordUserAction(action);
                
                if (i % 10 === 0) {
                    const context: ReviewContext = {
                        trigger: ReviewTrigger.APP_OPEN,
                        userState: {
                            appOpenCount: i,
                            successfulFoodLogs: i / 2,
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
                }
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            // Memory increase should be reasonable (less than 5MB)
            expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
        });

        it('should clean up resources properly', async () => {
            await reviewManager.initialize();
            
            // Use the system
            for (let i = 0; i < 50; i++) {
                reviewManager.recordUserAction({
                    type: 'app_open',
                    timestamp: new Date(),
                });
            }
            
            // Reset state (should clean up resources)
            reviewManager.resetReviewState();
            
            // Should not throw or cause memory issues
            expect(() => reviewManager.resetReviewState()).not.toThrow();
        });
    });

    describe('Concurrent Operations', () => {
        beforeEach(async () => {
            await reviewManager.initialize();
        });

        it('should handle concurrent review checks efficiently', async () => {
            const context: ReviewContext = {
                trigger: ReviewTrigger.APP_OPEN,
                userState: {
                    appOpenCount: 10,
                    successfulFoodLogs: 5,
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

            const startTime = performance.now();
            
            // Start multiple concurrent review checks
            const promises = Array.from({ length: 10 }, () => 
                reviewManager.checkAndTriggerReview(context)
            );
            
            await Promise.all(promises);
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Should handle concurrent operations efficiently
            expect(duration).toBeLessThan(300);
        });

        it('should handle concurrent user action recording', async () => {
            const actions: UserAction[] = Array.from({ length: 50 }, (_, i) => ({
                type: i % 3 === 0 ? 'app_open' : i % 3 === 1 ? 'successful_food_log' : 'milestone_achieved',
                timestamp: new Date(Date.now() + i),
                metadata: { index: i },
            }));

            const startTime = performance.now();
            
            // Record all actions concurrently
            actions.forEach(action => reviewManager.recordUserAction(action));
            
            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(150);
        });
    });

    describe('Stress Testing', () => {
        it('should handle high-frequency user actions', async () => {
            await reviewManager.initialize();
            
            const startTime = performance.now();
            
            // Simulate rapid user interactions
            for (let i = 0; i < 1000; i++) {
                reviewManager.recordUserAction({
                    type: 'app_open',
                    timestamp: new Date(Date.now() + i),
                });
            }
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Should handle 1000 actions in under 100ms
            expect(duration).toBeLessThan(100);
        });

        it('should maintain performance under load', async () => {
            await reviewManager.initialize();
            
            const iterations = 100;
            const durations: number[] = [];
            
            for (let i = 0; i < iterations; i++) {
                const startTime = performance.now();
                
                reviewManager.recordUserAction({
                    type: 'successful_food_log',
                    timestamp: new Date(),
                });
                
                const context: ReviewContext = {
                    trigger: ReviewTrigger.SUCCESSFUL_FOOD_LOG,
                    userState: {
                        appOpenCount: i,
                        successfulFoodLogs: i,
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
                
                const endTime = performance.now();
                durations.push(endTime - startTime);
            }
            
            const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
            const maxDuration = Math.max(...durations);
            
            // Performance should remain consistent
            expect(averageDuration).toBeLessThan(50);
            expect(maxDuration).toBeLessThan(100);
        });
    });

    describe('App Startup Impact', () => {
        it('should have minimal impact on app startup time', async () => {
            // Simulate app startup scenario
            const startTime = performance.now();
            
            // Initialize review system as part of app startup
            const reviewManager = new ReviewManager({ debugMode: false });
            await reviewManager.initialize();
            
            // Record initial app open
            reviewManager.recordUserAction({
                type: 'app_open',
                timestamp: new Date(),
            });
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Should add less than 50ms to startup time
            expect(duration).toBeLessThan(50);
        });

        it('should support lazy initialization', async () => {
            const reviewManager = new ReviewManager({ debugMode: false });
            
            // Should be able to record actions before initialization
            const startTime = performance.now();
            
            reviewManager.recordUserAction({
                type: 'app_open',
                timestamp: new Date(),
            });
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Recording before initialization should be instant
            expect(duration).toBeLessThan(5);
        });
    });

    describe('Resource Cleanup', () => {
        it('should clean up timers and listeners', async () => {
            const reviewManager = new ReviewManager({ debugMode: false });
            await reviewManager.initialize();
            
            // Use the system
            reviewManager.recordUserAction({
                type: 'app_open',
                timestamp: new Date(),
            });
            
            // Reset should clean up resources
            const startTime = performance.now();
            reviewManager.resetReviewState();
            const endTime = performance.now();
            
            const duration = endTime - startTime;
            expect(duration).toBeLessThan(10);
        });
    });
});