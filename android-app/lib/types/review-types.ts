/**
 * Core TypeScript interfaces and data models for the in-app review system
 * This file defines all the interfaces, enums, and data models used throughout
 * the review system components.
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Different triggers that can initiate a review prompt
 */
export enum ReviewTrigger {
  APP_OPEN = 'app_open',
  SUCCESSFUL_FOOD_LOG = 'successful_food_log',
  MILESTONE_ACHIEVED = 'milestone_achieved',
  GOAL_COMPLETED = 'goal_completed',
  STREAK_MILESTONE = 'streak_milestone'
}

/**
 * Actions a user can take when presented with a review prompt
 */
export enum ReviewAction {
  COMPLETED = 'completed',
  DISMISSED = 'dismissed',
  ERROR = 'error',
  NOT_AVAILABLE = 'not_available'
}

/**
 * Types of errors that can occur in the review system
 */
export enum ReviewErrorType {
  PLAY_SERVICES_UNAVAILABLE = 'play_services_unavailable',
  NETWORK_ERROR = 'network_error',
  STORAGE_ERROR = 'storage_error',
  API_RATE_LIMIT = 'api_rate_limit',
  UNKNOWN_ERROR = 'unknown_error'
}

// ============================================================================
// CORE INTERFACES
// ============================================================================

/**
 * Context information provided when evaluating review triggers
 */
export interface ReviewContext {
  trigger: ReviewTrigger;
  userState: UserState;
  appState: AppState;
}

/**
 * Current state of the user for review evaluation
 */
export interface UserState {
  appOpenCount: number;
  successfulFoodLogs: number;
  streakDays: number;
  milestonesAchieved: string[];
  lastReviewPrompt: Date | null;
  lastReviewAction: ReviewAction | null;
}

/**
 * Current state of the application
 */
export interface AppState {
  isLoading: boolean;
  hasErrors: boolean;
  currentScreen: string;
  sessionStartTime: Date;
}

/**
 * Result of trigger evaluation
 */
export interface TriggerResult {
  shouldTrigger: boolean;
  reason: string;
  confidence: number; // 0-1 scale indicating confidence in timing
  nextEligibleTime?: Date;
}

/**
 * Result of a review request
 */
export interface ReviewResult {
  success: boolean;
  action: ReviewAction;
  error?: string;
}

/**
 * User action that can be recorded for metrics
 */
export interface UserAction {
  type: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// ============================================================================
// DATA MODELS
// ============================================================================

/**
 * User metrics tracked for review timing decisions
 */
export interface UserMetrics {
  appOpenCount: number;
  successfulFoodLogs: number;
  lastReviewPrompt: Date | null;
  lastReviewAction: ReviewAction | null;
  streakDays: number;
  milestonesAchieved: string[];
  firstAppOpen: Date;
  totalSessionTime: number; // in minutes
  lastAppOpen: Date;
}

/**
 * Settings that control review behavior
 */
export interface ReviewSettings {
  minimumAppOpens: number;
  cooldownDays: number;
  enabledTriggers: ReviewTrigger[];
  debugMode: boolean;
  maxPromptsPerUser: number;
}

/**
 * Configuration for the review system
 */
export interface ReviewConfig {
  triggers: {
    [ReviewTrigger.APP_OPEN]: {
      minimumCount: number;
      enabled: boolean;
    };
    [ReviewTrigger.SUCCESSFUL_FOOD_LOG]: {
      minimumCount: number;
      enabled: boolean;
    };
    [ReviewTrigger.MILESTONE_ACHIEVED]: {
      milestones: string[];
      enabled: boolean;
    };
    [ReviewTrigger.STREAK_MILESTONE]: {
      streakDays: number[];
      enabled: boolean;
    };
    [ReviewTrigger.GOAL_COMPLETED]: {
      enabled: boolean;
    };
  };
  cooldownPeriod: number; // days
  maxPromptsPerUser: number;
  debugMode: boolean;
}

// ============================================================================
// SERVICE INTERFACES
// ============================================================================

/**
 * Main interface for the review management service
 */
export interface ReviewManager {
  initialize(): Promise<void>;
  checkAndTriggerReview(context: ReviewContext): Promise<boolean>;
  recordUserAction(action: UserAction): void;
  isReviewAvailable(): Promise<boolean>;
  resetReviewState(): void; // For testing
}

/**
 * Interface for the trigger evaluation engine
 */
export interface TriggerEngine {
  evaluateTrigger(context: ReviewContext): Promise<TriggerResult>;
  updateUserMetrics(action: UserAction): Promise<void>;
  getNextEligibleTime(): Promise<Date | null>;
}

/**
 * Interface for data persistence service
 */
export interface StorageService {
  getUserMetrics(): Promise<UserMetrics>;
  updateUserMetrics(metrics: Partial<UserMetrics>): Promise<void>;
  getReviewSettings(): Promise<ReviewSettings>;
  updateReviewSettings(settings: Partial<ReviewSettings>): Promise<void>;
  clearReviewData(): Promise<void>;
}

/**
 * Interface for the native review dialog wrapper
 */
export interface ReviewDialog {
  isAvailable(): Promise<boolean>;
  requestReview(): Promise<ReviewResult>;
  openPlayStore(): void; // Fallback method
}

/**
 * Interface for analytics tracking
 */
export interface AnalyticsTracker {
  trackReviewPromptShown(context: ReviewContext): void;
  trackReviewAction(action: ReviewAction, context: ReviewContext): void;
  trackError(error: ReviewError): void;
}

/**
 * Interface for error handling
 */
export interface ErrorHandler {
  handleReviewError(error: ReviewError): Promise<void>;
  shouldRetry(error: ReviewError): boolean;
  getRetryDelay(attemptCount: number): number;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Review system error with context
 */
export interface ReviewError {
  type: ReviewErrorType;
  message: string;
  originalError?: Error;
  context?: ReviewContext;
  timestamp: Date;
}

// ============================================================================
// STORAGE SCHEMAS
// ============================================================================

/**
 * Schema for storing user metrics in AsyncStorage
 */
export interface StoredUserMetrics {
  appOpenCount: number;
  successfulFoodLogs: number;
  lastReviewPrompt: string | null; // ISO date string
  lastReviewAction: ReviewAction | null;
  streakDays: number;
  milestonesAchieved: string[];
  firstAppOpen: string; // ISO date string
  totalSessionTime: number; // in minutes
  lastAppOpen: string; // ISO date string
}

/**
 * Schema for storing review settings in AsyncStorage
 */
export interface StoredReviewSettings {
  minimumAppOpens: number;
  cooldownDays: number;
  enabledTriggers: string[]; // ReviewTrigger values as strings
  debugMode: boolean;
  maxPromptsPerUser: number;
}

// ============================================================================
// HOOK INTERFACES
// ============================================================================

/**
 * Return type for the useInAppReview hook
 */
export interface UseInAppReviewReturn {
  triggerReview: (options?: TriggerReviewOptions) => Promise<boolean>;
  isAvailable: boolean;
  isLoading: boolean;
  recordUserAction: (action: UserAction) => void;
}

/**
 * Options for triggering a review
 */
export interface TriggerReviewOptions {
  force?: boolean;
  showFallbackAlert?: boolean;
  context?: Partial<ReviewContext>;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  triggers: {
    [ReviewTrigger.APP_OPEN]: {
      minimumCount: 5,
      enabled: true,
    },
    [ReviewTrigger.SUCCESSFUL_FOOD_LOG]: {
      minimumCount: 10,
      enabled: true,
    },
    [ReviewTrigger.MILESTONE_ACHIEVED]: {
      milestones: ['7_day_streak', '30_day_streak', 'first_goal_completed'],
      enabled: true,
    },
    [ReviewTrigger.STREAK_MILESTONE]: {
      streakDays: [7, 14, 30, 60, 90],
      enabled: true,
    },
    [ReviewTrigger.GOAL_COMPLETED]: {
      enabled: true,
    },
  },
  cooldownPeriod: 30, // days
  maxPromptsPerUser: 3,
  debugMode: false,
};

/**
 * Default review settings
 */
export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  minimumAppOpens: 5,
  cooldownDays: 30,
  enabledTriggers: [
    ReviewTrigger.APP_OPEN,
    ReviewTrigger.SUCCESSFUL_FOOD_LOG,
    ReviewTrigger.MILESTONE_ACHIEVED,
    ReviewTrigger.STREAK_MILESTONE,
    ReviewTrigger.GOAL_COMPLETED,
  ],
  debugMode: false,
  maxPromptsPerUser: 3,
};

/**
 * Default user metrics for new users
 */
export const DEFAULT_USER_METRICS: UserMetrics = {
  appOpenCount: 0,
  successfulFoodLogs: 0,
  lastReviewPrompt: null,
  lastReviewAction: null,
  streakDays: 0,
  milestonesAchieved: [],
  firstAppOpen: new Date(),
  totalSessionTime: 0,
  lastAppOpen: new Date(),
};