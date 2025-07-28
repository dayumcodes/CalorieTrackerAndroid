/**
 * Custom React Native hook for in-app review integration
 * 
 * This hook provides easy integration with the in-app review system,
 * offering methods for triggering reviews, recording user actions,
 * and managing review availability state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { getLazyLoader } from '../lib/lazy-loader';
import {
  UseInAppReviewReturn,
  TriggerReviewOptions,
  UserAction,
  ReviewContext,
  ReviewTrigger,
  UserState,
  AppState as ReviewAppState,
} from '../lib/types/review-types';

/**
 * Custom hook for in-app review functionality
 * 
 * Provides a React-friendly interface to the review system with:
 * - State management for review availability and loading states
 * - Methods for triggering reviews and recording user actions
 * - Proper cleanup and memory management
 * - Integration with app lifecycle events
 */
export function useInAppReview(): UseInAppReviewReturn {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Refs for cleanup and preventing memory leaks
  const isMountedRef = useRef<boolean>(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lazyLoader = getLazyLoader();

  // ============================================================================
  // INITIALIZATION AND CLEANUP
  // ============================================================================

  /**
   * Initialize the review manager and check availability
   */
  const initializeReviewSystem = useCallback(async () => {
    if (!isMountedRef.current) return;

    try {
      setIsLoading(true);

      // Initialize the review manager lazily
      const reviewManager = await lazyLoader.getReviewManager();

      if (!isMountedRef.current) return;

      // Check if review functionality is available
      const available = await reviewManager.isReviewAvailable();

      if (isMountedRef.current) {
        setIsAvailable(available);
        setIsInitialized(true);
      }
    } catch (error) {
      console.error('useInAppReview: Failed to initialize review system:', error);
      if (isMountedRef.current) {
        setIsAvailable(false);
        setIsInitialized(true);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  /**
   * Handle app state changes to record user actions
   */
  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    if (!isMountedRef.current || !isInitialized) return;

    const previousState = appStateRef.current;
    appStateRef.current = nextAppState;

    // Record app open when coming from background to active
    if (previousState.match(/inactive|background/) && nextAppState === 'active') {
      // Use lazy loading for recording user actions
      lazyLoader.getReviewManager().then(reviewManager => {
        reviewManager.recordUserAction({
          type: 'app_open',
          timestamp: new Date(),
          metadata: {
            previousState,
            currentState: nextAppState,
          },
        });
      }).catch(error => {
        console.error('useInAppReview: Failed to record app open action:', error);
      });
    }
  }, [isInitialized]);

  // Initialize on mount
  useEffect(() => {
    initializeReviewSystem();

    // Listen for app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      subscription?.remove();
    };
  }, [initializeReviewSystem, handleAppStateChange]);

  // ============================================================================
  // CORE FUNCTIONALITY
  // ============================================================================

  /**
   * Trigger a review prompt with optional configuration
   */
  const triggerReview = useCallback(async (options: TriggerReviewOptions = {}): Promise<boolean> => {
    if (!isMountedRef.current || !isInitialized) {
      console.warn('useInAppReview: Review system not initialized');
      return false;
    }

    const {
      force = false,
      showFallbackAlert = true,
      context: contextOverride,
    } = options;

    try {
      setIsLoading(true);

      // Get review manager lazily
      const reviewManager = await lazyLoader.getReviewManager();
      
      // Get current user metrics for context
      const userMetrics = await reviewManager.getUserMetrics();
      
      // Create review context
      const userState: UserState = {
        appOpenCount: userMetrics.appOpenCount,
        successfulFoodLogs: userMetrics.successfulFoodLogs,
        streakDays: userMetrics.streakDays,
        milestonesAchieved: userMetrics.milestonesAchieved,
        lastReviewPrompt: userMetrics.lastReviewPrompt,
        lastReviewAction: userMetrics.lastReviewAction,
      };

      const appState: ReviewAppState = {
        isLoading: false,
        hasErrors: false,
        currentScreen: 'unknown', // Could be enhanced with navigation state
        sessionStartTime: new Date(),
      };

      const context: ReviewContext = {
        trigger: ReviewTrigger.APP_OPEN, // Default trigger
        userState,
        appState,
        ...contextOverride,
      };

      // If forcing, bypass normal trigger evaluation
      if (force) {
        // Check if review is available
        const available = await reviewManager.isReviewAvailable();
        
        if (!available) {
          if (showFallbackAlert) {
            showFallbackReviewAlert();
          }
          return false;
        }

        // Force trigger by temporarily modifying context
        const forceContext: ReviewContext = {
          ...context,
          userState: {
            ...context.userState,
            appOpenCount: 999, // High number to bypass minimum requirements
          },
        };

        const result = await reviewManager.checkAndTriggerReview(forceContext);
        return result;
      }

      // Normal trigger evaluation
      const result = await reviewManager.checkAndTriggerReview(context);
      
      // If review wasn't triggered but fallback is enabled, show fallback
      if (!result && showFallbackAlert && isAvailable) {
        showFallbackReviewAlert();
      }

      return result;

    } catch (error) {
      console.error('useInAppReview: Error triggering review:', error);
      
      // Show fallback alert on error if enabled
      if (showFallbackAlert) {
        showFallbackReviewAlert();
      }
      
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [isInitialized, isAvailable]);

  /**
   * Record a user action for metrics tracking
   */
  const recordUserAction = useCallback((action: UserAction): void => {
    if (!isMountedRef.current || !isInitialized) {
      return;
    }

    // Use lazy loading for recording user actions
    lazyLoader.getReviewManager().then(reviewManager => {
      reviewManager.recordUserAction(action);
    }).catch(error => {
      console.error('useInAppReview: Error recording user action:', error);
    });
  }, [isInitialized]);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Show fallback alert when native review is not available
   */
  const showFallbackReviewAlert = useCallback(() => {
    Alert.alert(
      'Enjoying Calorie Tracker?',
      'Would you mind taking a moment to rate our app in the store? Your feedback helps us improve!',
      [
        { 
          text: 'Not Now', 
          style: 'cancel',
          onPress: () => {
            recordUserAction({
              type: 'review_fallback_dismissed',
              timestamp: new Date(),
            });
          }
        },
        { 
          text: 'Rate App', 
          onPress: () => {
            recordUserAction({
              type: 'review_fallback_accepted',
              timestamp: new Date(),
            });
            
            // In a real implementation, this would open the Play Store
            // For now, we'll use the review dialog's fallback method
            try {
              // This would typically use Linking.openURL with the Play Store URL
              console.log('Opening Play Store for rating...');
            } catch (error) {
              console.error('Error opening Play Store:', error);
            }
          }
        }
      ]
    );
  }, [recordUserAction]);

  // ============================================================================
  // RETURN HOOK INTERFACE
  // ============================================================================

  return {
    triggerReview,
    isAvailable,
    isLoading,
    recordUserAction,
  };
} 