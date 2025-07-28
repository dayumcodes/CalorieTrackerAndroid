/**
 * Unit tests for TriggerEngine
 * Tests trigger evaluation logic, user metrics tracking, cooldown enforcement, and confidence scoring
 */

// Mock AsyncStorage before importing other modules
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

import { ReviewTriggerEngine } from '../lib/trigger-engine';
import { storageService } from '../lib/storage-service';
import {
    ReviewTrigger,
    ReviewAction,
    ReviewContext,
    UserMetrics,
    ReviewSettings,
    UserAction,
    DEFAULT_USER_METRICS,
    DEFAULT_REVIEW_SETTINGS,
} from '../lib/types/review-types';

// Mock the storage service
jest.mock('../lib/storage-service');
const mockStorageService = storageService as jest.Mocked<typeof storageService>;

describe('ReviewTriggerEngine', () => {
    let triggerEngine: ReviewTriggerEngine;
    let mockUserMetrics: UserMetrics;
    let mockReviewSettings: ReviewSettings;

    beforeEach(() => {
        triggerEngine = new ReviewTriggerEngine();
        
        // Reset mocks
        jest.clearAllMocks();
        
        // Setup default mock data
        mockUserMetrics = {
            ...DEFAULT_USER_METRICS,
            appOpenCount: 10,
            successfulFoodLogs: 15,
            streakDays: 7,
            milestonesAchieved: ['7_day_streak'],
            firstAppOpen: new Date('2024-01-01'),
            lastAppOpen: new Date(),
        };

        mockReviewSettings = {
            ...DEFAULT_REVIEW_SETTINGS,
        };

        // Setup storage service mocks
        mockStorageService.initialize.mockResolvedValue();
        mockStorageService.getUserMetrics.mockResolvedValue(mockUserMetrics);
        mockStorageService.getReviewSettings.mockResolvedValue(mockReviewSettings);
        mockStorageService.updateUserMetrics.mockResolvedValue();
    });

    describe('initialization', () => {
        it('should initialize successfully', async () => {
            await triggerEngine.initialize();
            
            expect(mockStorageService.initialize).toHaveBeenCalled();
            expect(mockStorageService.getUserMetrics).toHaveBeenCalled();
            expect(mockStorageService.getReviewSettings).toHaveBeenCalled();
        });

        it('should handle initialization errors', async () => {
            mockStorageService.initialize.mockRejectedValue(new Error('Storage error'));
            
            await expect(triggerEngine.initialize()).rejects.toThrow('Storage error');
        });

        it('should not reinitialize if already initialized', async () => {
            await triggerEngine.initialize();
            await triggerEngine.initialize();
            
            expect(mockStorageService.initialize).toHaveBeenCalledTimes(1);
        });
    });

    describe('evaluateTrigger', () => {
        const createMockContext = (trigger: ReviewTrigger, overrides?: any): ReviewContext => ({
            trigger,
            userState: {
                appOpenCount: mockUserMetrics.appOpenCount,
                successfulFoodLogs: mockUserMetrics.successfulFoodLogs,
                streakDays: mockUserMetrics.streakDays,
                milestonesAchieved: mockUserMetrics.milestonesAchieved,
                lastReviewPrompt: mockUserMetrics.lastReviewPrompt,
                lastReviewAction: mockUserMetrics.lastReviewAction,
                ...overrides?.userState,
            },
            appState: {
                isLoading: false,
                hasErrors: false,
                currentScreen: 'home',
                sessionStartTime: new Date(),
                ...overrides?.appState,
            },
        });

        describe('disabled triggers', () => {
            it('should not trigger when trigger is disabled', async () => {
                mockReviewSettings.enabledTriggers = [ReviewTrigger.SUCCESSFUL_FOOD_LOG];
                
                const context = createMockContext(ReviewTrigger.APP_OPEN);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(false);
                expect(result.reason).toContain('disabled');
                expect(result.confidence).toBe(0);
            });
        });

        describe('cooldown period', () => {
            it('should not trigger during cooldown period', async () => {
                const recentPrompt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
                mockUserMetrics.lastReviewPrompt = recentPrompt;
                mockReviewSettings.cooldownDays = 30;
                
                const context = createMockContext(ReviewTrigger.APP_OPEN);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(false);
                expect(result.reason).toContain('Cooldown period active');
                expect(result.nextEligibleTime).toBeDefined();
            });

            it('should trigger after cooldown period expires', async () => {
                const oldPrompt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
                mockUserMetrics.lastReviewPrompt = oldPrompt;
                mockReviewSettings.cooldownDays = 30;
                
                const context = createMockContext(ReviewTrigger.APP_OPEN);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(true);
            });

            it('should trigger for first-time users (no previous prompt)', async () => {
                mockUserMetrics.lastReviewPrompt = null;
                
                const context = createMockContext(ReviewTrigger.APP_OPEN);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(true);
            });
        });

        describe('app state conditions', () => {
            it('should not trigger when app is loading', async () => {
                const context = createMockContext(ReviewTrigger.APP_OPEN, {
                    appState: { isLoading: true }
                });
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(false);
                expect(result.reason).toContain('loading');
            });

            it('should not trigger when app has errors', async () => {
                const context = createMockContext(ReviewTrigger.APP_OPEN, {
                    appState: { hasErrors: true }
                });
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(false);
                expect(result.reason).toContain('errors');
            });

            it('should not trigger on restricted screens', async () => {
                const context = createMockContext(ReviewTrigger.APP_OPEN, {
                    appState: { currentScreen: 'onboarding' }
                });
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(false);
                expect(result.reason).toContain('restricted');
            });
        });

        describe('APP_OPEN trigger', () => {
            it('should trigger when app opens meet minimum requirement', async () => {
                mockUserMetrics.appOpenCount = 10;
                
                const context = createMockContext(ReviewTrigger.APP_OPEN);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(true);
                expect(result.reason).toContain('meets minimum requirement');
                expect(result.confidence).toBeGreaterThan(0);
            });

            it('should not trigger when app opens below minimum', async () => {
                mockUserMetrics.appOpenCount = 3;
                
                const context = createMockContext(ReviewTrigger.APP_OPEN);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(false);
                expect(result.reason).toContain('below minimum');
            });
        });

        describe('SUCCESSFUL_FOOD_LOG trigger', () => {
            it('should trigger when food logs meet minimum requirement', async () => {
                mockUserMetrics.successfulFoodLogs = 15;
                
                const context = createMockContext(ReviewTrigger.SUCCESSFUL_FOOD_LOG);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(true);
                expect(result.reason).toContain('meets minimum requirement');
                expect(result.confidence).toBeGreaterThan(0.7); // Higher confidence for successful actions
            });

            it('should not trigger when food logs below minimum', async () => {
                mockUserMetrics.successfulFoodLogs = 5;
                
                const context = createMockContext(ReviewTrigger.SUCCESSFUL_FOOD_LOG);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(false);
                expect(result.reason).toContain('below minimum');
            });
        });

        describe('MILESTONE_ACHIEVED trigger', () => {
            it('should trigger when relevant milestone is achieved', async () => {
                const context = createMockContext(ReviewTrigger.MILESTONE_ACHIEVED, {
                    userState: { milestonesAchieved: ['7_day_streak'] }
                });
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(true);
                expect(result.reason).toContain('Milestone achieved');
                expect(result.confidence).toBeGreaterThan(0.8); // Very high confidence for milestones
            });

            it('should not trigger when no relevant milestone achieved', async () => {
                const context = createMockContext(ReviewTrigger.MILESTONE_ACHIEVED, {
                    userState: { milestonesAchieved: ['irrelevant_milestone'] }
                });
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(false);
                expect(result.reason).toContain('No relevant milestone');
            });
        });

        describe('STREAK_MILESTONE trigger', () => {
            it('should trigger when streak reaches milestone', async () => {
                mockUserMetrics.streakDays = 7; // 7 is in default milestone days
                
                const context = createMockContext(ReviewTrigger.STREAK_MILESTONE);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(true);
                expect(result.reason).toContain('Streak milestone reached');
                expect(result.confidence).toBeGreaterThan(0.9); // Highest confidence for streak milestones
            });

            it('should not trigger when streak is not a milestone', async () => {
                mockUserMetrics.streakDays = 5; // 5 is not in default milestone days
                
                const context = createMockContext(ReviewTrigger.STREAK_MILESTONE);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(false);
                expect(result.reason).toContain('not a milestone');
            });
        });

        describe('GOAL_COMPLETED trigger', () => {
            it('should trigger when goal is completed', async () => {
                const context = createMockContext(ReviewTrigger.GOAL_COMPLETED);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.shouldTrigger).toBe(true);
                expect(result.reason).toContain('Goal completed');
                expect(result.confidence).toBeGreaterThan(0.8); // High confidence for goal completion
            });
        });

        describe('confidence scoring', () => {
            it('should reduce confidence if user previously dismissed', async () => {
                mockUserMetrics.lastReviewAction = ReviewAction.DISMISSED;
                
                const context = createMockContext(ReviewTrigger.APP_OPEN);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.confidence).toBeLessThan(0.6); // Should be reduced from base 0.6
            });

            it('should increase confidence for highly engaged users', async () => {
                mockUserMetrics.appOpenCount = 50;
                mockUserMetrics.successfulFoodLogs = 100;
                mockUserMetrics.streakDays = 30;
                mockUserMetrics.milestonesAchieved = ['7_day_streak', '30_day_streak', 'first_goal_completed'];
                
                const context = createMockContext(ReviewTrigger.SUCCESSFUL_FOOD_LOG);
                const result = await triggerEngine.evaluateTrigger(context);
                
                expect(result.confidence).toBeGreaterThan(0.8); // Should be boosted
            });
        });
    });

    describe('updateUserMetrics', () => {
        beforeEach(async () => {
            await triggerEngine.initialize();
        });

        it('should update app open count', async () => {
            const action: UserAction = {
                type: 'app_open',
                timestamp: new Date(),
            };

            await triggerEngine.updateUserMetrics(action);

            expect(mockStorageService.updateUserMetrics).toHaveBeenCalledWith({
                appOpenCount: mockUserMetrics.appOpenCount + 1,
                lastAppOpen: action.timestamp,
            });
        });

        it('should update successful food logs', async () => {
            const action: UserAction = {
                type: 'successful_food_log',
                timestamp: new Date(),
            };

            await triggerEngine.updateUserMetrics(action);

            expect(mockStorageService.updateUserMetrics).toHaveBeenCalledWith({
                successfulFoodLogs: mockUserMetrics.successfulFoodLogs + 1,
            });
        });

        it('should update milestones achieved', async () => {
            const action: UserAction = {
                type: 'milestone_achieved',
                timestamp: new Date(),
                metadata: { milestone: 'new_milestone' },
            };

            await triggerEngine.updateUserMetrics(action);

            expect(mockStorageService.updateUserMetrics).toHaveBeenCalledWith({
                milestonesAchieved: [...mockUserMetrics.milestonesAchieved, 'new_milestone'],
            });
        });

        it('should not duplicate milestones', async () => {
            const action: UserAction = {
                type: 'milestone_achieved',
                timestamp: new Date(),
                metadata: { milestone: '7_day_streak' }, // Already exists
            };

            await triggerEngine.updateUserMetrics(action);

            // Should not call updateUserMetrics since no changes
            expect(mockStorageService.updateUserMetrics).not.toHaveBeenCalled();
        });

        it('should update streak days', async () => {
            const action: UserAction = {
                type: 'streak_updated',
                timestamp: new Date(),
                metadata: { streakDays: 14 },
            };

            await triggerEngine.updateUserMetrics(action);

            expect(mockStorageService.updateUserMetrics).toHaveBeenCalledWith({
                streakDays: 14,
            });
        });

        it('should update review prompt timestamp', async () => {
            const action: UserAction = {
                type: 'review_prompt_shown',
                timestamp: new Date(),
            };

            await triggerEngine.updateUserMetrics(action);

            expect(mockStorageService.updateUserMetrics).toHaveBeenCalledWith({
                lastReviewPrompt: action.timestamp,
            });
        });

        it('should update review action', async () => {
            const action: UserAction = {
                type: 'review_action',
                timestamp: new Date(),
                metadata: { reviewAction: ReviewAction.COMPLETED },
            };

            await triggerEngine.updateUserMetrics(action);

            expect(mockStorageService.updateUserMetrics).toHaveBeenCalledWith({
                lastReviewAction: ReviewAction.COMPLETED,
            });
        });

        it('should update session time', async () => {
            const action: UserAction = {
                type: 'session_time',
                timestamp: new Date(),
                metadata: { sessionTime: 30 }, // 30 minutes
            };

            await triggerEngine.updateUserMetrics(action);

            expect(mockStorageService.updateUserMetrics).toHaveBeenCalledWith({
                totalSessionTime: mockUserMetrics.totalSessionTime + 30,
            });
        });

        it('should handle unknown action types gracefully', async () => {
            const action: UserAction = {
                type: 'unknown_action',
                timestamp: new Date(),
            };

            await triggerEngine.updateUserMetrics(action);

            // Should not call updateUserMetrics for unknown actions
            expect(mockStorageService.updateUserMetrics).not.toHaveBeenCalled();
        });
    });

    describe('getNextEligibleTime', () => {
        beforeEach(async () => {
            await triggerEngine.initialize();
        });

        it('should return null for users who have never been prompted', async () => {
            mockUserMetrics.lastReviewPrompt = null;

            const nextTime = await triggerEngine.getNextEligibleTime();

            expect(nextTime).toBeNull();
        });

        it('should return null if cooldown period has expired', async () => {
            const oldPrompt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
            mockUserMetrics.lastReviewPrompt = oldPrompt;
            mockReviewSettings.cooldownDays = 30;

            const nextTime = await triggerEngine.getNextEligibleTime();

            expect(nextTime).toBeNull();
        });

        it('should return future date if still in cooldown period', async () => {
            const recentPrompt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
            mockUserMetrics.lastReviewPrompt = recentPrompt;
            mockReviewSettings.cooldownDays = 30;

            const nextTime = await triggerEngine.getNextEligibleTime();

            expect(nextTime).toBeInstanceOf(Date);
            expect(nextTime!.getTime()).toBeGreaterThan(Date.now());
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle storage errors gracefully', async () => {
            mockStorageService.getUserMetrics.mockRejectedValue(new Error('Storage error'));

            await expect(triggerEngine.initialize()).rejects.toThrow('Storage error');
        });

        it('should handle invalid user metrics data', async () => {
            const invalidMetrics = {
                ...mockUserMetrics,
                appOpenCount: -5, // Invalid negative value
                streakDays: NaN, // Invalid NaN value
            };
            mockStorageService.getUserMetrics.mockResolvedValue(invalidMetrics as any);

            await triggerEngine.initialize();
            const context = createMockContext(ReviewTrigger.APP_OPEN);
            
            // Should still work with invalid data
            const result = await triggerEngine.evaluateTrigger(context);
            expect(result).toBeDefined();
        });

        it('should handle missing metadata in user actions', async () => {
            await triggerEngine.initialize();
            
            const action: UserAction = {
                type: 'milestone_achieved',
                timestamp: new Date(),
                // metadata is missing
            };

            // Should not throw error
            await expect(triggerEngine.updateUserMetrics(action)).resolves.not.toThrow();
        });
    });

    describe('utility methods', () => {
        it('should clear cache', () => {
            triggerEngine.clearCache();
            // No direct way to test this, but it should not throw
        });

        it('should provide debug information', async () => {
            await triggerEngine.initialize();
            
            const debugInfo = await triggerEngine.getDebugInfo();
            
            expect(debugInfo).toHaveProperty('metrics');
            expect(debugInfo).toHaveProperty('settings');
            expect(debugInfo).toHaveProperty('nextEligibleTime');
        });
    });

    // Helper function to create mock context
    function createMockContext(trigger: ReviewTrigger, overrides?: any): ReviewContext {
        return {
            trigger,
            userState: {
                appOpenCount: mockUserMetrics.appOpenCount,
                successfulFoodLogs: mockUserMetrics.successfulFoodLogs,
                streakDays: mockUserMetrics.streakDays,
                milestonesAchieved: mockUserMetrics.milestonesAchieved,
                lastReviewPrompt: mockUserMetrics.lastReviewPrompt,
                lastReviewAction: mockUserMetrics.lastReviewAction,
                ...overrides?.userState,
            },
            appState: {
                isLoading: false,
                hasErrors: false,
                currentScreen: 'home',
                sessionStartTime: new Date(),
                ...overrides?.appState,
            },
        };
    }
});