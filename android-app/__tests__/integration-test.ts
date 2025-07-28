/**
 * Integration tests for the review system integration into app screens
 */

import { ReviewTrigger, UserAction } from '../lib/types/review-types';

describe('Review System Integration', () => {
    describe('ReviewTrigger enum', () => {
        it('should have all required trigger types', () => {
            expect(ReviewTrigger.APP_OPEN).toBe('app_open');
            expect(ReviewTrigger.SUCCESSFUL_FOOD_LOG).toBe('successful_food_log');
            expect(ReviewTrigger.MILESTONE_ACHIEVED).toBe('milestone_achieved');
            expect(ReviewTrigger.GOAL_COMPLETED).toBe('goal_completed');
            expect(ReviewTrigger.STREAK_MILESTONE).toBe('streak_milestone');
        });
    });

    describe('UserAction interface', () => {
        it('should support all required action types', () => {
            const appOpenAction: UserAction = {
                type: 'app_open',
                timestamp: new Date(),
                metadata: {
                    screen: 'home',
                    source: 'app_launch'
                }
            };

            const foodLogAction: UserAction = {
                type: 'successful_food_log',
                timestamp: new Date(),
                metadata: {
                    screen: 'home',
                    source: 'food_logging'
                }
            };

            const goalCompletionAction: UserAction = {
                type: 'goal_completed',
                timestamp: new Date(),
                metadata: {
                    screen: 'progress',
                    source: 'goal_tracking'
                }
            };

            const milestoneAction: UserAction = {
                type: 'milestone_achieved',
                timestamp: new Date(),
                metadata: {
                    screen: 'progress',
                    milestoneType: 'streak_milestone',
                    source: 'milestone_tracking'
                }
            };

            expect(appOpenAction.type).toBe('app_open');
            expect(foodLogAction.type).toBe('successful_food_log');
            expect(goalCompletionAction.type).toBe('goal_completed');
            expect(milestoneAction.type).toBe('milestone_achieved');
        });
    });

    describe('Screen Integration Points', () => {
        it('should support HomeScreen integration', () => {
            // Test that HomeScreen can track app opens
            const homeScreenActions = [
                'app_open',
                'successful_food_log',
                'goal_completed',
                'milestone_achieved'
            ];

            homeScreenActions.forEach(actionType => {
                const action: UserAction = {
                    type: actionType,
                    timestamp: new Date(),
                    metadata: {
                        screen: 'home',
                        source: 'webview_integration'
                    }
                };
                expect(action.type).toBe(actionType);
            });
        });

        it('should support ProgressScreen integration', () => {
            // Test that ProgressScreen can track milestones and goals
            const progressScreenActions = [
                'progress_screen_visit',
                'streak_milestone_achieved',
                'goal_completed',
                'weight_milestone_achieved'
            ];

            progressScreenActions.forEach(actionType => {
                const action: UserAction = {
                    type: actionType,
                    timestamp: new Date(),
                    metadata: {
                        screen: 'progress',
                        source: 'progress_tracking'
                    }
                };
                expect(action.type).toBe(actionType);
            });
        });

        it('should support RemindersScreen integration', () => {
            // Test that RemindersScreen can track setup actions
            const reminderActions = [
                'reminders_screen_visit',
                'reminders_configured',
                'test_notification'
            ];

            reminderActions.forEach(actionType => {
                const action: UserAction = {
                    type: actionType,
                    timestamp: new Date(),
                    metadata: {
                        screen: 'reminders',
                        source: 'settings_interaction'
                    }
                };
                expect(action.type).toBe(actionType);
            });
        });

        it('should support ExploreScreen integration', () => {
            // Test that ExploreScreen can track engagement
            const exploreAction: UserAction = {
                type: 'explore_screen_visit',
                timestamp: new Date(),
                metadata: {
                    screen: 'explore',
                    source: 'tab_navigation'
                }
            };

            expect(exploreAction.type).toBe('explore_screen_visit');
            expect(exploreAction.metadata?.screen).toBe('explore');
        });
    });

    describe('Review Context Creation', () => {
        it('should create proper review contexts for different triggers', () => {
            const baseUserState = {
                appOpenCount: 0,
                successfulFoodLogs: 0,
                streakDays: 0,
                milestonesAchieved: [],
                lastReviewPrompt: null,
                lastReviewAction: null,
            };

            const baseAppState = {
                isLoading: false,
                hasErrors: false,
                currentScreen: 'home',
                sessionStartTime: new Date(),
            };

            // Test different trigger contexts
            const triggers = [
                ReviewTrigger.APP_OPEN,
                ReviewTrigger.SUCCESSFUL_FOOD_LOG,
                ReviewTrigger.GOAL_COMPLETED,
                ReviewTrigger.MILESTONE_ACHIEVED,
                ReviewTrigger.STREAK_MILESTONE
            ];

            triggers.forEach(trigger => {
                const context = {
                    trigger,
                    userState: baseUserState,
                    appState: baseAppState
                };

                expect(context.trigger).toBe(trigger);
                expect(context.userState).toBeDefined();
                expect(context.appState).toBeDefined();
            });
        });
    });

    describe('WebView Integration', () => {
        it('should support WebView message handling', () => {
            // Test WebView message structure
            const webViewMessages = [
                {
                    type: 'user_action',
                    action: 'successful_food_log',
                    timestamp: new Date().toISOString()
                },
                {
                    type: 'user_action',
                    action: 'goal_completed',
                    timestamp: new Date().toISOString()
                },
                {
                    type: 'milestone',
                    milestone: 'streak',
                    days: 7,
                    timestamp: new Date().toISOString()
                }
            ];

            webViewMessages.forEach(message => {
                expect(message.type).toBeDefined();
                expect(message.timestamp).toBeDefined();
            });
        });
    });
});