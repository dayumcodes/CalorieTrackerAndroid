/**
 * Type validation script to ensure all interfaces and types are properly defined
 * This file validates that our type definitions are correct and can be used
 */

import {
  // Enums
  ReviewTrigger,
  ReviewAction,
  ReviewErrorType,
  
  // Core interfaces
  ReviewContext,
  UserState,
  AppState,
  TriggerResult,
  ReviewResult,
  UserAction,
  
  // Data models
  UserMetrics,
  ReviewSettings,
  ReviewConfig,
  
  // Service interfaces
  ReviewManager,
  TriggerEngine,
  StorageService,
  ReviewDialog,
  AnalyticsTracker,
  ErrorHandler,
  
  // Error types
  ReviewError,
  
  // Storage schemas
  StoredUserMetrics,
  StoredReviewSettings,
  
  // Hook interfaces
  UseInAppReviewReturn,
  TriggerReviewOptions,
  
  // Default values
  DEFAULT_REVIEW_CONFIG,
  DEFAULT_REVIEW_SETTINGS,
  DEFAULT_USER_METRICS,
} from './review-types';

/**
 * Validation function to test type definitions
 */
function validateTypes(): void {
  console.log('🔍 Validating in-app review types...');

  // Test enum values
  console.log('✅ ReviewTrigger enum:', {
    APP_OPEN: ReviewTrigger.APP_OPEN,
    SUCCESSFUL_FOOD_LOG: ReviewTrigger.SUCCESSFUL_FOOD_LOG,
    MILESTONE_ACHIEVED: ReviewTrigger.MILESTONE_ACHIEVED,
    GOAL_COMPLETED: ReviewTrigger.GOAL_COMPLETED,
    STREAK_MILESTONE: ReviewTrigger.STREAK_MILESTONE,
  });

  console.log('✅ ReviewAction enum:', {
    COMPLETED: ReviewAction.COMPLETED,
    DISMISSED: ReviewAction.DISMISSED,
    ERROR: ReviewAction.ERROR,
    NOT_AVAILABLE: ReviewAction.NOT_AVAILABLE,
  });

  console.log('✅ ReviewErrorType enum:', {
    PLAY_SERVICES_UNAVAILABLE: ReviewErrorType.PLAY_SERVICES_UNAVAILABLE,
    NETWORK_ERROR: ReviewErrorType.NETWORK_ERROR,
    STORAGE_ERROR: ReviewErrorType.STORAGE_ERROR,
    API_RATE_LIMIT: ReviewErrorType.API_RATE_LIMIT,
    UNKNOWN_ERROR: ReviewErrorType.UNKNOWN_ERROR,
  });

  // Test interface creation
  const userState: UserState = {
    appOpenCount: 5,
    successfulFoodLogs: 10,
    streakDays: 7,
    milestonesAchieved: ['7_day_streak'],
    lastReviewPrompt: null,
    lastReviewAction: null,
  };

  const appState: AppState = {
    isLoading: false,
    hasErrors: false,
    currentScreen: 'home',
    sessionStartTime: new Date(),
  };

  const reviewContext: ReviewContext = {
    trigger: ReviewTrigger.APP_OPEN,
    userState,
    appState,
  };

  console.log('✅ ReviewContext created:', {
    trigger: reviewContext.trigger,
    userStateValid: reviewContext.userState.appOpenCount === 5,
    appStateValid: reviewContext.appState.currentScreen === 'home',
  });

  // Test TriggerResult
  const triggerResult: TriggerResult = {
    shouldTrigger: true,
    reason: 'User has opened app 5 times',
    confidence: 0.8,
    nextEligibleTime: new Date(),
  };

  console.log('✅ TriggerResult created:', {
    shouldTrigger: triggerResult.shouldTrigger,
    confidence: triggerResult.confidence,
    hasNextEligibleTime: triggerResult.nextEligibleTime instanceof Date,
  });

  // Test UserMetrics
  const userMetrics: UserMetrics = {
    appOpenCount: 10,
    successfulFoodLogs: 25,
    lastReviewPrompt: new Date(),
    lastReviewAction: ReviewAction.COMPLETED,
    streakDays: 14,
    milestonesAchieved: ['7_day_streak', '14_day_streak'],
    firstAppOpen: new Date(),
    totalSessionTime: 120,
    lastAppOpen: new Date(),
  };

  console.log('✅ UserMetrics created:', {
    appOpenCount: userMetrics.appOpenCount,
    lastReviewAction: userMetrics.lastReviewAction,
    milestonesCount: userMetrics.milestonesAchieved.length,
  });

  // Test ReviewError
  const reviewError: ReviewError = {
    type: ReviewErrorType.NETWORK_ERROR,
    message: 'Network connection failed',
    originalError: new Error('Connection timeout'),
    timestamp: new Date(),
  };

  console.log('✅ ReviewError created:', {
    type: reviewError.type,
    hasOriginalError: reviewError.originalError instanceof Error,
    timestamp: reviewError.timestamp instanceof Date,
  });

  // Test default values
  console.log('✅ Default values:', {
    configCooldownPeriod: DEFAULT_REVIEW_CONFIG.cooldownPeriod,
    settingsMinimumOpens: DEFAULT_REVIEW_SETTINGS.minimumAppOpens,
    metricsAppOpenCount: DEFAULT_USER_METRICS.appOpenCount,
  });

  // Test storage schema compatibility
  const storedMetrics: StoredUserMetrics = {
    appOpenCount: userMetrics.appOpenCount,
    successfulFoodLogs: userMetrics.successfulFoodLogs,
    lastReviewPrompt: userMetrics.lastReviewPrompt?.toISOString() || null,
    lastReviewAction: userMetrics.lastReviewAction,
    streakDays: userMetrics.streakDays,
    milestonesAchieved: userMetrics.milestonesAchieved,
    firstAppOpen: userMetrics.firstAppOpen.toISOString(),
    totalSessionTime: userMetrics.totalSessionTime,
    lastAppOpen: userMetrics.lastAppOpen.toISOString(),
  };

  console.log('✅ StoredUserMetrics compatibility:', {
    appOpenCount: storedMetrics.appOpenCount === userMetrics.appOpenCount,
    firstAppOpenIsString: typeof storedMetrics.firstAppOpen === 'string',
  });

  // Test interface method signatures (compile-time check)
  const mockReviewManager: ReviewManager = {
    async initialize(): Promise<void> {
      // Mock implementation
    },
    async checkAndTriggerReview(context: ReviewContext): Promise<boolean> {
      return context.userState.appOpenCount >= 5;
    },
    recordUserAction(action: UserAction): void {
      // Mock implementation
    },
    async isReviewAvailable(): Promise<boolean> {
      return true;
    },
    resetReviewState(): void {
      // Mock implementation
    },
  };

  console.log('✅ ReviewManager interface validated');

  const mockTriggerEngine: TriggerEngine = {
    async evaluateTrigger(context: ReviewContext): Promise<TriggerResult> {
      return {
        shouldTrigger: context.userState.appOpenCount >= 5,
        reason: 'Minimum app opens reached',
        confidence: 0.8,
      };
    },
    async updateUserMetrics(action: UserAction): Promise<void> {
      // Mock implementation
    },
    async getNextEligibleTime(): Promise<Date | null> {
      return new Date();
    },
  };

  console.log('✅ TriggerEngine interface validated');

  const mockStorageService: StorageService = {
    async getUserMetrics(): Promise<UserMetrics> {
      return DEFAULT_USER_METRICS;
    },
    async updateUserMetrics(metrics: Partial<UserMetrics>): Promise<void> {
      // Mock implementation
    },
    async getReviewSettings(): Promise<ReviewSettings> {
      return DEFAULT_REVIEW_SETTINGS;
    },
    async updateReviewSettings(settings: Partial<ReviewSettings>): Promise<void> {
      // Mock implementation
    },
    async clearReviewData(): Promise<void> {
      // Mock implementation
    },
  };

  console.log('✅ StorageService interface validated');

  console.log('🎉 All types validated successfully!');
}

// Run validation if this file is executed directly
if (require.main === module) {
  validateTypes();
}

export { validateTypes };