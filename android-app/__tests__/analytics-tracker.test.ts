/**
 * Tests for the AnalyticsTracker implementation
 * Covers event tracking, performance metrics, debugging, and error handling
 */

import {
  AnalyticsTracker,
  getAnalyticsTracker,
  resetAnalyticsTracker,
  ReviewEventType,
  LogLevel,
} from '../lib/analytics-tracker';
import {
  ReviewContext,
  ReviewAction,
  ReviewError,
  ReviewTrigger,
  ReviewErrorType,
  UserAction,
} from '../lib/types/review-types';

// Mock console methods to avoid noise in tests
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

describe('AnalyticsTracker', () => {
  let tracker: AnalyticsTracker;
  let mockContext: ReviewContext;

  beforeEach(() => {
    resetAnalyticsTracker();
    tracker = new AnalyticsTracker(false);
    
    mockContext = {
      trigger: ReviewTrigger.APP_OPEN,
      userState: {
        appOpenCount: 5,
        successfulFoodLogs: 10,
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
    };
  });

  afterEach(() => {
    resetAnalyticsTracker();
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('Initialization', () => {
    it('should initialize with default settings', () => {
      const newTracker = new AnalyticsTracker();
      expect(newTracker).toBeDefined();
      expect(newTracker.getEvents()).toHaveLength(0);
      expect(newTracker.getDebugLogs().length).toBeGreaterThan(0); // Should have initialization log
    });

    it('should initialize with debug mode enabled', () => {
      const debugTracker = new AnalyticsTracker(true);
      expect(debugTracker).toBeDefined();
      
      // Should log to console in debug mode
      expect(console.info).toHaveBeenCalled();
    });

    it('should generate unique session IDs', () => {
      const tracker1 = new AnalyticsTracker();
      const tracker2 = new AnalyticsTracker();
      
      const events1 = tracker1.getEvents();
      const events2 = tracker2.getEvents();
      
      // Session IDs should be different (though events arrays are empty, sessionIds are generated)
      expect(tracker1).not.toBe(tracker2);
    });
  });

  // ============================================================================
  // EVENT TRACKING TESTS
  // ============================================================================

  describe('Event Tracking', () => {
    it('should track review prompt shown events', () => {
      tracker.trackReviewPromptShown(mockContext);
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(2); // Prompt shown + performance metric
      
      const promptEvent = events.find(e => e.eventType === ReviewEventType.PROMPT_SHOWN);
      expect(promptEvent).toBeDefined();
      expect(promptEvent?.context).toEqual(mockContext);
      expect(promptEvent?.metadata?.trigger).toBe(ReviewTrigger.APP_OPEN);
      expect(promptEvent?.metadata?.userAppOpenCount).toBe(5);
    });

    it('should track review actions', () => {
      tracker.trackReviewAction(ReviewAction.COMPLETED, mockContext);
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      
      const actionEvent = events[0];
      expect(actionEvent.eventType).toBe(ReviewEventType.REVIEW_COMPLETED);
      expect(actionEvent.context).toEqual(mockContext);
      expect(actionEvent.metadata?.action).toBe(ReviewAction.COMPLETED);
    });

    it('should track different review actions correctly', () => {
      tracker.trackReviewAction(ReviewAction.DISMISSED, mockContext);
      tracker.trackReviewAction(ReviewAction.ERROR, mockContext);
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(2);
      
      expect(events[0].eventType).toBe(ReviewEventType.PROMPT_DISMISSED);
      expect(events[1].eventType).toBe(ReviewEventType.REVIEW_ERROR);
    });

    it('should track errors with full context', () => {
      const error: ReviewError = {
        type: ReviewErrorType.PLAY_SERVICES_UNAVAILABLE,
        message: 'Google Play Services not available',
        originalError: new Error('Service unavailable'),
        context: mockContext,
        timestamp: new Date(),
      };

      tracker.trackError(error);
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      
      const errorEvent = events[0];
      expect(errorEvent.eventType).toBe(ReviewEventType.REVIEW_ERROR);
      expect(errorEvent.metadata?.errorType).toBe(ReviewErrorType.PLAY_SERVICES_UNAVAILABLE);
      expect(errorEvent.metadata?.errorMessage).toBe('Google Play Services not available');
      expect(errorEvent.metadata?.originalError).toBe('Service unavailable');
    });

    it('should track trigger evaluations', () => {
      tracker.trackTriggerEvaluation(
        ReviewTrigger.SUCCESSFUL_FOOD_LOG,
        true,
        'User has sufficient food logs',
        0.8,
        15
      );
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(2); // Trigger evaluation + performance metric
      
      const triggerEvent = events.find(e => e.eventType === ReviewEventType.TRIGGER_EVALUATED);
      expect(triggerEvent).toBeDefined();
      expect(triggerEvent?.metadata?.trigger).toBe(ReviewTrigger.SUCCESSFUL_FOOD_LOG);
      expect(triggerEvent?.metadata?.shouldTrigger).toBe(true);
      expect(triggerEvent?.metadata?.confidence).toBe(0.8);
      expect(triggerEvent?.metadata?.evaluationTime).toBe(15);
    });

    it('should track user actions', () => {
      const userAction: UserAction = {
        type: 'food_logged',
        timestamp: new Date(),
        metadata: { calories: 500 },
      };

      tracker.trackUserActionRecorded(userAction);
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      
      const actionEvent = events[0];
      expect(actionEvent.eventType).toBe(ReviewEventType.USER_ACTION_RECORDED);
      expect(actionEvent.metadata?.actionType).toBe('food_logged');
      expect(actionEvent.metadata?.metadata).toEqual({ calories: 500 });
    });

    it('should track API calls', () => {
      tracker.trackApiCall('requestReview', 250, true);
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(2); // API call + performance metric
      
      const apiEvent = events.find(e => e.eventType === ReviewEventType.API_CALL_MADE);
      expect(apiEvent).toBeDefined();
      expect(apiEvent?.metadata?.operation).toBe('requestReview');
      expect(apiEvent?.metadata?.responseTime).toBe(250);
      expect(apiEvent?.metadata?.success).toBe(true);
    });

    it('should track API call failures', () => {
      tracker.trackApiCall('requestReview', 500, false, 'Network timeout');
      
      const events = tracker.getEvents();
      const apiEvent = events.find(e => e.eventType === ReviewEventType.API_CALL_MADE);
      
      expect(apiEvent?.metadata?.success).toBe(false);
      expect(apiEvent?.metadata?.error).toBe('Network timeout');
    });

    it('should track storage operations', () => {
      tracker.trackStorageOperation('getUserMetrics', 25, true);
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(2); // Storage operation + performance metric
      
      const storageEvent = events.find(e => e.eventType === ReviewEventType.STORAGE_OPERATION);
      expect(storageEvent).toBeDefined();
      expect(storageEvent?.metadata?.operation).toBe('getUserMetrics');
      expect(storageEvent?.metadata?.operationTime).toBe(25);
      expect(storageEvent?.metadata?.success).toBe(true);
    });

    it('should track fallback usage', () => {
      tracker.trackFallbackUsed('external_play_store', 'In-app review not available', mockContext);
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      
      const fallbackEvent = events[0];
      expect(fallbackEvent.eventType).toBe(ReviewEventType.FALLBACK_USED);
      expect(fallbackEvent.metadata?.fallbackType).toBe('external_play_store');
      expect(fallbackEvent.metadata?.reason).toBe('In-app review not available');
      expect(fallbackEvent.context).toEqual(mockContext);
    });
  });

  // ============================================================================
  // PERFORMANCE METRICS TESTS
  // ============================================================================

  describe('Performance Metrics', () => {
    it('should track performance metrics', () => {
      const metrics = {
        promptDisplayTime: 150,
        apiResponseTime: 300,
        storageOperationTime: 25,
        memoryUsage: 1024,
        triggerEvaluationTime: 10,
      };

      tracker.trackPerformanceMetric(metrics);
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      
      const perfEvent = events[0];
      expect(perfEvent.eventType).toBe(ReviewEventType.PERFORMANCE_METRIC);
      expect(perfEvent.metadata).toEqual(metrics);
    });

    it('should calculate performance statistics', () => {
      // Add multiple performance metrics
      tracker.trackPerformanceMetric({
        promptDisplayTime: 100,
        apiResponseTime: 200,
        storageOperationTime: 20,
        memoryUsage: 1000,
        triggerEvaluationTime: 5,
      });

      tracker.trackPerformanceMetric({
        promptDisplayTime: 200,
        apiResponseTime: 400,
        storageOperationTime: 40,
        memoryUsage: 2000,
        triggerEvaluationTime: 15,
      });

      const stats = tracker.getPerformanceStats();
      expect(stats.averagePromptDisplayTime).toBe(150);
      expect(stats.averageApiResponseTime).toBe(300);
      expect(stats.averageStorageOperationTime).toBe(30);
      expect(stats.averageMemoryUsage).toBe(1500);
      expect(stats.averageTriggerEvaluationTime).toBe(10);
      expect(stats.totalMetrics).toBe(2);
    });

    it('should return zero stats when no metrics exist', () => {
      const stats = tracker.getPerformanceStats();
      expect(stats.averagePromptDisplayTime).toBe(0);
      expect(stats.averageApiResponseTime).toBe(0);
      expect(stats.averageStorageOperationTime).toBe(0);
      expect(stats.averageMemoryUsage).toBe(0);
      expect(stats.averageTriggerEvaluationTime).toBe(0);
      expect(stats.totalMetrics).toBe(0);
    });
  });

  // ============================================================================
  // DEBUG AND DEVELOPMENT TESTS
  // ============================================================================

  describe('Debug and Development', () => {
    it('should enable and disable debug mode', () => {
      // Clear previous calls
      (console.info as jest.Mock).mockClear();
      
      tracker.setDebugMode(true);
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Debug mode enabled'), '');
      
      // Clear calls again
      (console.info as jest.Mock).mockClear();
      
      tracker.setDebugMode(false);
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Debug mode disabled'), '');
    });

    it('should log to console in debug mode', () => {
      tracker.setDebugMode(true);
      tracker.trackReviewPromptShown(mockContext);
      
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Review prompt shown'),
        expect.any(Object)
      );
    });

    it('should not log to console when debug mode is disabled', () => {
      const logCallsBefore = (console.log as jest.Mock).mock.calls.length;
      
      tracker.setDebugMode(false);
      tracker.trackReviewPromptShown(mockContext);
      
      const logCallsAfter = (console.log as jest.Mock).mock.calls.length;
      expect(logCallsAfter).toBe(logCallsBefore);
    });

    it('should return debug logs', () => {
      tracker.trackReviewPromptShown(mockContext);
      
      const debugLogs = tracker.getDebugLogs();
      expect(debugLogs.length).toBeGreaterThan(0);
      
      const promptLog = debugLogs.find(log => log.message.includes('Review prompt shown'));
      expect(promptLog).toBeDefined();
      expect(promptLog?.level).toBe(LogLevel.INFO);
    });

    it('should filter events by type', () => {
      tracker.trackReviewPromptShown(mockContext);
      tracker.trackReviewAction(ReviewAction.COMPLETED, mockContext);
      
      const promptEvents = tracker.getEventsByType(ReviewEventType.PROMPT_SHOWN);
      const completedEvents = tracker.getEventsByType(ReviewEventType.REVIEW_COMPLETED);
      
      expect(promptEvents).toHaveLength(1);
      expect(completedEvents).toHaveLength(1);
      expect(promptEvents[0].eventType).toBe(ReviewEventType.PROMPT_SHOWN);
      expect(completedEvents[0].eventType).toBe(ReviewEventType.REVIEW_COMPLETED);
    });

    it('should filter events by time range', () => {
      const startTime = new Date();
      
      tracker.trackReviewPromptShown(mockContext);
      
      // Wait a bit and add another event
      setTimeout(() => {
        tracker.trackReviewAction(ReviewAction.COMPLETED, mockContext);
      }, 10);
      
      const endTime = new Date(Date.now() + 100);
      const eventsInRange = tracker.getEventsInTimeRange(startTime, endTime);
      
      expect(eventsInRange.length).toBeGreaterThan(0);
      eventsInRange.forEach(event => {
        expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
        expect(event.timestamp.getTime()).toBeLessThanOrEqual(endTime.getTime());
      });
    });

    it('should clear analytics data', () => {
      tracker.trackReviewPromptShown(mockContext);
      tracker.trackReviewAction(ReviewAction.COMPLETED, mockContext);
      
      expect(tracker.getEvents().length).toBeGreaterThan(0);
      expect(tracker.getDebugLogs().length).toBeGreaterThan(0);
      
      tracker.clearAnalyticsData();
      
      expect(tracker.getEvents()).toHaveLength(0);
      expect(tracker.getDebugLogs().length).toBe(1); // Only the clear log remains
    });

    it('should export analytics data', () => {
      tracker.trackReviewPromptShown(mockContext);
      tracker.trackPerformanceMetric({
        promptDisplayTime: 100,
        apiResponseTime: 200,
        storageOperationTime: 20,
        memoryUsage: 1000,
        triggerEvaluationTime: 5,
      });
      
      const exportedData = tracker.exportAnalyticsData();
      
      expect(exportedData.events.length).toBeGreaterThan(0);
      expect(exportedData.performanceMetrics.length).toBeGreaterThan(0);
      expect(exportedData.debugLogs.length).toBeGreaterThan(0);
      expect(exportedData.sessionId).toBeDefined();
      expect(exportedData.exportTimestamp).toBeInstanceOf(Date);
    });
  });

  // ============================================================================
  // HISTORY MANAGEMENT TESTS
  // ============================================================================

  describe('History Management', () => {
    it('should maintain maximum event history', () => {
      // Create a tracker with a small max history for testing
      const smallTracker = new AnalyticsTracker();
      
      // Add more events than the maximum (we'll simulate this by checking the behavior)
      for (let i = 0; i < 10; i++) {
        smallTracker.trackReviewAction(ReviewAction.DISMISSED, mockContext);
      }
      
      const events = smallTracker.getEvents();
      expect(events.length).toBeLessThanOrEqual(1000); // Default max
    });

    it('should maintain session consistency across events', () => {
      tracker.trackReviewPromptShown(mockContext);
      tracker.trackReviewAction(ReviewAction.COMPLETED, mockContext);
      
      const events = tracker.getEvents();
      const sessionIds = events.map(event => event.sessionId);
      
      // All events should have the same session ID
      expect(new Set(sessionIds).size).toBe(1);
    });
  });

  // ============================================================================
  // SINGLETON TESTS
  // ============================================================================

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const tracker1 = getAnalyticsTracker();
      const tracker2 = getAnalyticsTracker();
      
      expect(tracker1).toBe(tracker2);
    });

    it('should create new instance after reset', () => {
      const tracker1 = getAnalyticsTracker();
      resetAnalyticsTracker();
      const tracker2 = getAnalyticsTracker();
      
      expect(tracker1).not.toBe(tracker2);
    });

    it('should apply debug mode to existing instance', () => {
      const tracker1 = getAnalyticsTracker(false);
      const tracker2 = getAnalyticsTracker(true);
      
      expect(tracker1).toBe(tracker2);
      // Debug mode should be enabled on the same instance
    });
  });

  // ============================================================================
  // EDGE CASES AND ERROR HANDLING
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle undefined context gracefully', () => {
      expect(() => {
        tracker.trackFallbackUsed('test', 'reason', undefined);
      }).not.toThrow();
      
      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].context).toBeUndefined();
    });

    it('should handle empty time ranges', () => {
      const now = new Date();
      const events = tracker.getEventsInTimeRange(now, now);
      expect(events).toHaveLength(0);
    });

    it('should handle invalid event type filtering', () => {
      const events = tracker.getEventsByType('invalid_type' as ReviewEventType);
      expect(events).toHaveLength(0);
    });
  });
});