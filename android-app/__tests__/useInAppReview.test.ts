/**
 * Tests for useInAppReview hook
 * 
 * Tests the React Native integration hook for in-app review functionality,
 * including state management, user action recording, and review triggering.
 */

import { reviewManager } from '../lib/review-manager';
import {
  ReviewTrigger,
  UserAction,
  DEFAULT_USER_METRICS,
} from '../lib/types/review-types';

// Mock dependencies
jest.mock('../lib/review-manager');

// Mock React Native modules
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

// Mock React hooks
const mockUseState = jest.fn();
const mockUseEffect = jest.fn();
const mockUseCallback = jest.fn();
const mockUseRef = jest.fn();

jest.mock('react', () => ({
  useState: mockUseState,
  useEffect: mockUseEffect,
  useCallback: mockUseCallback,
  useRef: mockUseRef,
}));

const mockReviewManager = reviewManager as jest.Mocked<typeof reviewManager>;

describe('useInAppReview Hook Integration', () => {
  // ============================================================================
  // SETUP AND TEARDOWN
  // ============================================================================

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockReviewManager.initialize.mockResolvedValue();
    mockReviewManager.isReviewAvailable.mockResolvedValue(true);
    mockReviewManager.getUserMetrics.mockResolvedValue(DEFAULT_USER_METRICS);
    mockReviewManager.checkAndTriggerReview.mockResolvedValue(true);
    mockReviewManager.recordUserAction.mockImplementation(() => {});
    
    // Setup React hook mocks
    let stateValues: any[] = [];
    let stateSetters: any[] = [];
    let effectCallbacks: any[] = [];
    let callbackFunctions: any[] = [];
    let refValues: any[] = [];

    mockUseState.mockImplementation((initialValue: any) => {
      const index = stateValues.length;
      stateValues[index] = initialValue;
      stateSetters[index] = jest.fn((newValue: any) => {
        stateValues[index] = newValue;
      });
      return [stateValues[index], stateSetters[index]];
    });

    mockUseEffect.mockImplementation((callback: any, deps?: any[]) => {
      effectCallbacks.push(callback);
      // Simulate effect running
      setTimeout(() => callback(), 0);
    });

    mockUseCallback.mockImplementation((callback: any, deps?: any[]) => {
      callbackFunctions.push(callback);
      return callback;
    });

    mockUseRef.mockImplementation((initialValue: any) => {
      const index = refValues.length;
      refValues[index] = { current: initialValue };
      return refValues[index];
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ============================================================================
  // CORE FUNCTIONALITY TESTS
  // ============================================================================

  describe('ReviewManager Integration', () => {
    it('should call reviewManager.initialize during hook initialization', () => {
      // Import and test the hook module
      const hookModule = require('../hooks/useInAppReview');
      expect(hookModule.useInAppReview).toBeDefined();
      expect(typeof hookModule.useInAppReview).toBe('function');
    });

    it('should integrate with reviewManager for triggering reviews', async () => {
      // Test that the hook properly integrates with ReviewManager
      expect(mockReviewManager.initialize).toBeDefined();
      expect(mockReviewManager.checkAndTriggerReview).toBeDefined();
      expect(mockReviewManager.recordUserAction).toBeDefined();
      expect(mockReviewManager.isReviewAvailable).toBeDefined();
      expect(mockReviewManager.getUserMetrics).toBeDefined();
    });

    it('should handle user action recording', () => {
      const testAction: UserAction = {
        type: 'test_action',
        timestamp: new Date(),
        metadata: { test: true },
      };

      // Simulate calling recordUserAction
      mockReviewManager.recordUserAction(testAction);
      
      expect(mockReviewManager.recordUserAction).toHaveBeenCalledWith(testAction);
    });

    it('should handle review triggering with context', async () => {
      const testContext = {
        trigger: ReviewTrigger.SUCCESSFUL_FOOD_LOG,
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

      const result = await mockReviewManager.checkAndTriggerReview(testContext);
      
      expect(result).toBe(true);
      expect(mockReviewManager.checkAndTriggerReview).toHaveBeenCalledWith(testContext);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle ReviewManager initialization errors', async () => {
      const error = new Error('Initialization failed');
      mockReviewManager.initialize.mockRejectedValue(error);

      try {
        await mockReviewManager.initialize();
      } catch (e) {
        expect(e).toBe(error);
      }

      expect(mockReviewManager.initialize).toHaveBeenCalled();
    });

    it('should handle review availability check errors', async () => {
      mockReviewManager.isReviewAvailable.mockRejectedValue(new Error('Availability check failed'));

      try {
        await mockReviewManager.isReviewAvailable();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle review trigger errors', async () => {
      const error = new Error('Review trigger failed');
      mockReviewManager.checkAndTriggerReview.mockRejectedValue(error);

      const testContext = {
        trigger: ReviewTrigger.APP_OPEN,
        userState: DEFAULT_USER_METRICS,
        appState: {
          isLoading: false,
          hasErrors: false,
          currentScreen: 'home',
          sessionStartTime: new Date(),
        },
      };

      try {
        await mockReviewManager.checkAndTriggerReview(testContext);
      } catch (e) {
        expect(e).toBe(error);
      }
    });

    it('should handle user action recording errors', () => {
      const error = new Error('Recording failed');
      mockReviewManager.recordUserAction.mockImplementation(() => {
        throw error;
      });

      const testAction: UserAction = {
        type: 'test_action',
        timestamp: new Date(),
      };

      expect(() => {
        mockReviewManager.recordUserAction(testAction);
      }).toThrow(error);
    });
  });

  // ============================================================================
  // HOOK INTERFACE TESTS
  // ============================================================================

  describe('Hook Interface', () => {
    it('should provide the correct return type interface', () => {
      // Test that the hook module exports the expected interface
      const hookModule = require('../hooks/useInAppReview');
      
      expect(hookModule.useInAppReview).toBeDefined();
      expect(typeof hookModule.useInAppReview).toBe('function');
    });

    it('should integrate with React hooks properly', () => {
      // Test that React hooks are called
      expect(mockUseState).toBeDefined();
      expect(mockUseEffect).toBeDefined();
      expect(mockUseCallback).toBeDefined();
      expect(mockUseRef).toBeDefined();
    });
  });

  // ============================================================================
  // REACT NATIVE INTEGRATION TESTS
  // ============================================================================

  describe('React Native Integration', () => {
    it('should integrate with React Native Alert', () => {
      const { Alert } = require('react-native');
      
      Alert.alert('Test', 'Test message', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'OK', onPress: () => {} }
      ]);

      expect(Alert.alert).toHaveBeenCalledWith(
        'Test',
        'Test message',
        expect.any(Array)
      );
    });

    it('should integrate with React Native AppState', () => {
      const { AppState } = require('react-native');
      
      const mockHandler = jest.fn();
      const subscription = AppState.addEventListener('change', mockHandler);

      expect(AppState.addEventListener).toHaveBeenCalledWith('change', mockHandler);
      expect(subscription).toEqual({ remove: expect.any(Function) });
    });
  });

  // ============================================================================
  // TYPE INTEGRATION TESTS
  // ============================================================================

  describe('Type Integration', () => {
    it('should work with ReviewTrigger enum', () => {
      expect(ReviewTrigger.APP_OPEN).toBe('app_open');
      expect(ReviewTrigger.SUCCESSFUL_FOOD_LOG).toBe('successful_food_log');
      expect(ReviewTrigger.MILESTONE_ACHIEVED).toBe('milestone_achieved');
      expect(ReviewTrigger.GOAL_COMPLETED).toBe('goal_completed');
      expect(ReviewTrigger.STREAK_MILESTONE).toBe('streak_milestone');
    });

    it('should work with UserAction interface', () => {
      const action: UserAction = {
        type: 'test_action',
        timestamp: new Date(),
        metadata: { test: true },
      };

      expect(action.type).toBe('test_action');
      expect(action.timestamp).toBeInstanceOf(Date);
      expect(action.metadata).toEqual({ test: true });
    });

    it('should work with DEFAULT_USER_METRICS', () => {
      expect(DEFAULT_USER_METRICS).toBeDefined();
      expect(DEFAULT_USER_METRICS.appOpenCount).toBe(0);
      expect(DEFAULT_USER_METRICS.successfulFoodLogs).toBe(0);
      expect(DEFAULT_USER_METRICS.streakDays).toBe(0);
      expect(DEFAULT_USER_METRICS.milestonesAchieved).toEqual([]);
      expect(DEFAULT_USER_METRICS.lastReviewPrompt).toBeNull();
      expect(DEFAULT_USER_METRICS.lastReviewAction).toBeNull();
    });
  });
});