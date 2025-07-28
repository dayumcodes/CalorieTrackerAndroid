/**
 * TriggerEngine implementation for in-app review system
 * Evaluates user actions and determines optimal review timing with confidence scoring
 */

import {
    TriggerEngine,
    ReviewContext,
    TriggerResult,
    UserAction,
    UserMetrics,
    ReviewSettings,
    ReviewTrigger,
    ReviewAction,
    DEFAULT_REVIEW_CONFIG,
} from './types/review-types';
import { storageService } from './storage-service';
import { getAnalyticsTracker } from './analytics-tracker';

/**
 * Implementation of TriggerEngine that evaluates review triggers
 * and determines optimal timing for review prompts
 */
class ReviewTriggerEngine implements TriggerEngine {
    private isInitialized = false;
    private currentMetrics: UserMetrics | null = null;
    private currentSettings: ReviewSettings | null = null;
    private analyticsTracker = getAnalyticsTracker();

    /**
     * Initialize the trigger engine
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            await storageService.initialize();
            this.currentMetrics = await storageService.getUserMetrics();
            this.currentSettings = await storageService.getReviewSettings();
            this.isInitialized = true;
        } catch (error) {
            console.error('TriggerEngine initialization failed:', error);
            throw error;
        }
    }

    /**
     * Evaluate if a review should be triggered based on context
     */
    async evaluateTrigger(context: ReviewContext): Promise<TriggerResult> {
        await this.ensureInitialized();

        const metrics = await this.getCurrentMetrics();
        const settings = await this.getCurrentSettings();

        // Check if trigger is enabled
        if (!settings.enabledTriggers.includes(context.trigger)) {
            return {
                shouldTrigger: false,
                reason: `Trigger ${context.trigger} is disabled`,
                confidence: 0,
            };
        }

        // Check cooldown period
        const cooldownResult = this.checkCooldownPeriod(metrics, settings);
        if (!cooldownResult.isEligible) {
            return {
                shouldTrigger: false,
                reason: cooldownResult.reason,
                confidence: 0,
                nextEligibleTime: cooldownResult.nextEligibleTime,
            };
        }

        // Check maximum prompts limit
        if (this.hasExceededMaxPrompts(metrics, settings)) {
            return {
                shouldTrigger: false,
                reason: 'Maximum prompts per user exceeded',
                confidence: 0,
            };
        }

        // Check app state conditions
        const appStateResult = this.checkAppStateConditions(context.appState);
        if (!appStateResult.isEligible) {
            return {
                shouldTrigger: false,
                reason: appStateResult.reason,
                confidence: 0,
            };
        }

        // Evaluate specific trigger conditions
        const triggerResult = this.evaluateSpecificTrigger(context, metrics, settings);
        if (!triggerResult.shouldTrigger) {
            return triggerResult;
        }

        // Calculate confidence score
        const confidence = this.calculateConfidenceScore(context, metrics, settings);

        return {
            shouldTrigger: true,
            reason: triggerResult.reason,
            confidence,
        };
    }

    /**
     * Update user metrics based on user action
     */
    async updateUserMetrics(action: UserAction): Promise<void> {
        await this.ensureInitialized();

        const currentMetrics = await this.getCurrentMetrics();
        const updates: Partial<UserMetrics> = {};

        // Update metrics based on action type
        switch (action.type) {
            case 'app_open':
                updates.appOpenCount = currentMetrics.appOpenCount + 1;
                updates.lastAppOpen = action.timestamp;
                break;

            case 'successful_food_log':
                updates.successfulFoodLogs = currentMetrics.successfulFoodLogs + 1;
                break;

            case 'milestone_achieved':
                if (action.metadata?.milestone && !currentMetrics.milestonesAchieved.includes(action.metadata.milestone)) {
                    updates.milestonesAchieved = [...currentMetrics.milestonesAchieved, action.metadata.milestone];
                }
                break;

            case 'streak_updated':
                if (action.metadata?.streakDays) {
                    updates.streakDays = action.metadata.streakDays;
                }
                break;

            case 'review_prompt_shown':
                updates.lastReviewPrompt = action.timestamp;
                break;

            case 'review_action':
                if (action.metadata?.reviewAction) {
                    updates.lastReviewAction = action.metadata.reviewAction;
                }
                break;

            case 'session_time':
                if (action.metadata?.sessionTime) {
                    updates.totalSessionTime = currentMetrics.totalSessionTime + action.metadata.sessionTime;
                }
                break;
        }

        // Apply updates if any
        if (Object.keys(updates).length > 0) {
            await storageService.updateUserMetrics(updates);
            // Update cached metrics
            this.currentMetrics = { ...currentMetrics, ...updates };
        }
    }

    /**
     * Get the next eligible time for review prompt
     */
    async getNextEligibleTime(): Promise<Date | null> {
        await this.ensureInitialized();

        const metrics = await this.getCurrentMetrics();
        const settings = await this.getCurrentSettings();

        if (!metrics.lastReviewPrompt) {
            return null; // No previous prompt, eligible now
        }

        const cooldownMs = settings.cooldownDays * 24 * 60 * 60 * 1000;
        const nextEligibleTime = new Date(metrics.lastReviewPrompt.getTime() + cooldownMs);

        return nextEligibleTime > new Date() ? nextEligibleTime : null;
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Ensure the engine is initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    /**
     * Get current user metrics with caching
     */
    private async getCurrentMetrics(): Promise<UserMetrics> {
        if (!this.currentMetrics) {
            this.currentMetrics = await storageService.getUserMetrics();
        }
        return this.currentMetrics;
    }

    /**
     * Get current review settings with caching
     */
    private async getCurrentSettings(): Promise<ReviewSettings> {
        if (!this.currentSettings) {
            this.currentSettings = await storageService.getReviewSettings();
        }
        return this.currentSettings;
    }

    /**
     * Check if user is within cooldown period
     */
    private checkCooldownPeriod(metrics: UserMetrics, settings: ReviewSettings): {
        isEligible: boolean;
        reason: string;
        nextEligibleTime?: Date;
    } {
        if (!metrics.lastReviewPrompt) {
            return { isEligible: true, reason: 'No previous review prompt' };
        }

        const cooldownMs = settings.cooldownDays * 24 * 60 * 60 * 1000;
        const timeSinceLastPrompt = Date.now() - metrics.lastReviewPrompt.getTime();

        if (timeSinceLastPrompt < cooldownMs) {
            const nextEligibleTime = new Date(metrics.lastReviewPrompt.getTime() + cooldownMs);
            return {
                isEligible: false,
                reason: `Cooldown period active (${settings.cooldownDays} days)`,
                nextEligibleTime,
            };
        }

        return { isEligible: true, reason: 'Cooldown period expired' };
    }

    /**
     * Check if user has exceeded maximum prompts
     */
    private hasExceededMaxPrompts(metrics: UserMetrics, settings: ReviewSettings): boolean {
        // Count how many times user has been prompted
        // For now, we'll use a simple check based on lastReviewAction
        // In a more sophisticated implementation, we might track prompt history
        return metrics.lastReviewAction === ReviewAction.DISMISSED && 
               metrics.lastReviewPrompt !== null;
    }

    /**
     * Check app state conditions for showing review
     */
    private checkAppStateConditions(appState: any): {
        isEligible: boolean;
        reason: string;
    } {
        // Don't show during loading
        if (appState.isLoading) {
            return {
                isEligible: false,
                reason: 'App is currently loading',
            };
        }

        // Don't show when there are errors
        if (appState.hasErrors) {
            return {
                isEligible: false,
                reason: 'App has active errors',
            };
        }

        // Don't show on certain screens (like onboarding)
        const restrictedScreens = ['onboarding', 'login', 'signup', 'error'];
        if (restrictedScreens.includes(appState.currentScreen)) {
            return {
                isEligible: false,
                reason: `Current screen (${appState.currentScreen}) is restricted`,
            };
        }

        return { isEligible: true, reason: 'App state is suitable' };
    }

    /**
     * Evaluate specific trigger conditions
     */
    private evaluateSpecificTrigger(
        context: ReviewContext,
        metrics: UserMetrics,
        settings: ReviewSettings
    ): TriggerResult {
        const config = DEFAULT_REVIEW_CONFIG.triggers;

        switch (context.trigger) {
            case ReviewTrigger.APP_OPEN:
                return this.evaluateAppOpenTrigger(metrics, config[ReviewTrigger.APP_OPEN]);

            case ReviewTrigger.SUCCESSFUL_FOOD_LOG:
                return this.evaluateSuccessfulFoodLogTrigger(metrics, config[ReviewTrigger.SUCCESSFUL_FOOD_LOG]);

            case ReviewTrigger.MILESTONE_ACHIEVED:
                return this.evaluateMilestoneTrigger(context, metrics, config[ReviewTrigger.MILESTONE_ACHIEVED]);

            case ReviewTrigger.STREAK_MILESTONE:
                return this.evaluateStreakMilestoneTrigger(metrics, config[ReviewTrigger.STREAK_MILESTONE]);

            case ReviewTrigger.GOAL_COMPLETED:
                return this.evaluateGoalCompletedTrigger(context, config[ReviewTrigger.GOAL_COMPLETED]);

            default:
                return {
                    shouldTrigger: false,
                    reason: `Unknown trigger: ${context.trigger}`,
                    confidence: 0,
                };
        }
    }

    /**
     * Evaluate app open trigger
     */
    private evaluateAppOpenTrigger(
        metrics: UserMetrics,
        config: { minimumCount: number; enabled: boolean }
    ): TriggerResult {
        if (!config.enabled) {
            return {
                shouldTrigger: false,
                reason: 'App open trigger is disabled',
                confidence: 0,
            };
        }

        if (metrics.appOpenCount < config.minimumCount) {
            return {
                shouldTrigger: false,
                reason: `App opens (${metrics.appOpenCount}) below minimum (${config.minimumCount})`,
                confidence: 0,
            };
        }

        return {
            shouldTrigger: true,
            reason: `App opens (${metrics.appOpenCount}) meets minimum requirement`,
            confidence: 0.6, // Base confidence for app opens
        };
    }

    /**
     * Evaluate successful food log trigger
     */
    private evaluateSuccessfulFoodLogTrigger(
        metrics: UserMetrics,
        config: { minimumCount: number; enabled: boolean }
    ): TriggerResult {
        if (!config.enabled) {
            return {
                shouldTrigger: false,
                reason: 'Successful food log trigger is disabled',
                confidence: 0,
            };
        }

        if (metrics.successfulFoodLogs < config.minimumCount) {
            return {
                shouldTrigger: false,
                reason: `Food logs (${metrics.successfulFoodLogs}) below minimum (${config.minimumCount})`,
                confidence: 0,
            };
        }

        return {
            shouldTrigger: true,
            reason: `Food logs (${metrics.successfulFoodLogs}) meets minimum requirement`,
            confidence: 0.8, // Higher confidence for successful actions
        };
    }

    /**
     * Evaluate milestone achievement trigger
     */
    private evaluateMilestoneTrigger(
        context: ReviewContext,
        metrics: UserMetrics,
        config: { milestones: string[]; enabled: boolean }
    ): TriggerResult {
        if (!config.enabled) {
            return {
                shouldTrigger: false,
                reason: 'Milestone trigger is disabled',
                confidence: 0,
            };
        }

        // Check if this is a milestone achievement context
        const achievedMilestone = context.userState.milestonesAchieved?.find(
            milestone => config.milestones.includes(milestone)
        );

        if (!achievedMilestone) {
            return {
                shouldTrigger: false,
                reason: 'No relevant milestone achieved',
                confidence: 0,
            };
        }

        return {
            shouldTrigger: true,
            reason: `Milestone achieved: ${achievedMilestone}`,
            confidence: 0.9, // Very high confidence for milestones
        };
    }

    /**
     * Evaluate streak milestone trigger
     */
    private evaluateStreakMilestoneTrigger(
        metrics: UserMetrics,
        config: { streakDays: number[]; enabled: boolean }
    ): TriggerResult {
        if (!config.enabled) {
            return {
                shouldTrigger: false,
                reason: 'Streak milestone trigger is disabled',
                confidence: 0,
            };
        }

        const isStreakMilestone = config.streakDays.includes(metrics.streakDays);

        if (!isStreakMilestone) {
            return {
                shouldTrigger: false,
                reason: `Current streak (${metrics.streakDays}) is not a milestone`,
                confidence: 0,
            };
        }

        return {
            shouldTrigger: true,
            reason: `Streak milestone reached: ${metrics.streakDays} days`,
            confidence: 0.95, // Highest confidence for streak milestones
        };
    }

    /**
     * Evaluate goal completed trigger
     */
    private evaluateGoalCompletedTrigger(
        context: ReviewContext,
        config: { enabled: boolean }
    ): TriggerResult {
        if (!config.enabled) {
            return {
                shouldTrigger: false,
                reason: 'Goal completed trigger is disabled',
                confidence: 0,
            };
        }

        // This trigger should be called when a goal is completed
        // We assume the context indicates this
        return {
            shouldTrigger: true,
            reason: 'Goal completed',
            confidence: 0.85, // High confidence for goal completion
        };
    }

    /**
     * Calculate confidence score based on multiple factors
     */
    private calculateConfidenceScore(
        context: ReviewContext,
        metrics: UserMetrics,
        settings: ReviewSettings
    ): number {
        let confidence = 0;

        // Base confidence from trigger evaluation
        const triggerResult = this.evaluateSpecificTrigger(context, metrics, settings);
        confidence = triggerResult.confidence;

        // Adjust based on user engagement
        const engagementBonus = this.calculateEngagementBonus(metrics);
        confidence = Math.min(1, confidence + engagementBonus);

        // Adjust based on timing
        const timingBonus = this.calculateTimingBonus(metrics);
        confidence = Math.min(1, confidence + timingBonus);

        // Reduce confidence if user previously dismissed
        if (metrics.lastReviewAction === ReviewAction.DISMISSED) {
            confidence *= 0.7; // 30% reduction
        }

        // Ensure confidence is between 0 and 1
        return Math.max(0, Math.min(1, confidence));
    }

    /**
     * Calculate engagement bonus based on user activity
     */
    private calculateEngagementBonus(metrics: UserMetrics): number {
        let bonus = 0;

        // Bonus for high app usage
        if (metrics.appOpenCount > 20) {
            bonus += 0.1;
        }

        // Bonus for consistent food logging
        if (metrics.successfulFoodLogs > 50) {
            bonus += 0.1;
        }

        // Bonus for long streaks
        if (metrics.streakDays > 14) {
            bonus += 0.15;
        }

        // Bonus for multiple milestones
        if (metrics.milestonesAchieved.length > 2) {
            bonus += 0.1;
        }

        return Math.min(0.3, bonus); // Cap at 30% bonus
    }

    /**
     * Calculate timing bonus based on when user is most active
     */
    private calculateTimingBonus(metrics: UserMetrics): number {
        let bonus = 0;

        // Bonus for users who haven't been prompted recently
        if (metrics.lastReviewPrompt) {
            const daysSinceLastPrompt = (Date.now() - metrics.lastReviewPrompt.getTime()) / (24 * 60 * 60 * 1000);
            if (daysSinceLastPrompt > 60) {
                bonus += 0.1; // 10% bonus for long-time users
            }
        } else {
            bonus += 0.05; // 5% bonus for first-time prompt
        }

        // Bonus for recent activity
        if (metrics.lastAppOpen) {
            const hoursSinceLastOpen = (Date.now() - metrics.lastAppOpen.getTime()) / (60 * 60 * 1000);
            if (hoursSinceLastOpen < 24) {
                bonus += 0.05; // 5% bonus for recent activity
            }
        }

        return Math.min(0.2, bonus); // Cap at 20% bonus
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Reset cached data (useful for testing)
     */
    clearCache(): void {
        this.currentMetrics = null;
        this.currentSettings = null;
    }

    /**
     * Get debug information about current state
     */
    async getDebugInfo(): Promise<{
        metrics: UserMetrics;
        settings: ReviewSettings;
        nextEligibleTime: Date | null;
    }> {
        await this.ensureInitialized();

        return {
            metrics: await this.getCurrentMetrics(),
            settings: await this.getCurrentSettings(),
            nextEligibleTime: await this.getNextEligibleTime(),
        };
    }
}

// Export singleton instance
export const triggerEngine = new ReviewTriggerEngine();

// Export class for testing
export { ReviewTriggerEngine };