/**
 * ReviewTriggerTracker Component
 * 
 * A utility component that helps track user engagement patterns
 * and trigger reviews at optimal moments across the app.
 */

import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInAppReview } from '../hooks/useInAppReview';
import { ReviewTrigger, UserAction } from '../lib/types/review-types';

interface ReviewTriggerTrackerProps {
  children: React.ReactNode;
}

// Storage keys for tracking engagement
const SESSION_START_KEY = '@calorie_tracker:session_start';
const ENGAGEMENT_SCORE_KEY = '@calorie_tracker:engagement_score';
const LAST_ENGAGEMENT_CHECK_KEY = '@calorie_tracker:last_engagement_check';

export function ReviewTriggerTracker({ children }: ReviewTriggerTrackerProps) {
  const { recordUserAction, triggerReview } = useInAppReview();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const sessionStartRef = useRef<Date>(new Date());

  useEffect(() => {
    // Initialize session tracking
    const initializeSession = async () => {
      const sessionStart = new Date();
      sessionStartRef.current = sessionStart;
      
      await AsyncStorage.setItem(SESSION_START_KEY, sessionStart.toISOString());
      
      recordUserAction({
        type: 'session_start',
        timestamp: sessionStart,
        metadata: {
          source: 'app_lifecycle'
        }
      });
    };

    initializeSession();

    // Handle app state changes
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (previousState === 'active' && nextAppState.match(/inactive|background/)) {
        // App going to background - calculate session duration
        await handleSessionEnd();
      } else if (previousState.match(/inactive|background/) && nextAppState === 'active') {
        // App coming to foreground - start new session
        await handleSessionStart();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
      // Handle session end on unmount
      handleSessionEnd();
    };
  }, [recordUserAction, triggerReview]);

  // Handle session start
  const handleSessionStart = async () => {
    const sessionStart = new Date();
    sessionStartRef.current = sessionStart;
    
    await AsyncStorage.setItem(SESSION_START_KEY, sessionStart.toISOString());
    
    recordUserAction({
      type: 'session_start',
      timestamp: sessionStart,
      metadata: {
        source: 'app_foreground'
      }
    });

    // Check if it's time for an engagement-based review
    await checkEngagementReview();
  };

  // Handle session end
  const handleSessionEnd = async () => {
    try {
      const sessionEnd = new Date();
      const sessionDuration = sessionEnd.getTime() - sessionStartRef.current.getTime();
      
      recordUserAction({
        type: 'session_end',
        timestamp: sessionEnd,
        metadata: {
          duration: sessionDuration,
          source: 'app_background'
        }
      });

      // Update engagement score based on session duration
      await updateEngagementScore(sessionDuration);
      
    } catch (error) {
      console.error('Error handling session end:', error);
    }
  };

  // Update engagement score based on user activity
  const updateEngagementScore = async (sessionDuration: number) => {
    try {
      const scoreStr = await AsyncStorage.getItem(ENGAGEMENT_SCORE_KEY);
      let currentScore = scoreStr ? parseFloat(scoreStr) : 0;
      
      // Calculate engagement points based on session duration
      // Longer sessions indicate higher engagement
      const sessionMinutes = sessionDuration / (1000 * 60);
      let sessionPoints = 0;
      
      if (sessionMinutes > 0.5) sessionPoints += 1; // Basic usage
      if (sessionMinutes > 2) sessionPoints += 2; // Moderate usage
      if (sessionMinutes > 5) sessionPoints += 3; // High engagement
      if (sessionMinutes > 10) sessionPoints += 2; // Very high engagement
      
      // Update score with decay factor (older engagement matters less)
      const decayFactor = 0.95;
      const newScore = (currentScore * decayFactor) + sessionPoints;
      
      await AsyncStorage.setItem(ENGAGEMENT_SCORE_KEY, newScore.toString());
      
      // If engagement score is high, consider triggering review
      if (newScore > 15 && sessionPoints > 2) {
        setTimeout(() => {
          triggerReview({
            context: {
              trigger: ReviewTrigger.MILESTONE_ACHIEVED,
              userState: {
                appOpenCount: 0,
                successfulFoodLogs: 0,
                streakDays: 0,
                milestonesAchieved: ['high_engagement'],
                lastReviewPrompt: null,
                lastReviewAction: null,
              },
              appState: {
                isLoading: false,
                hasErrors: false,
                currentScreen: 'unknown',
                sessionStartTime: sessionStartRef.current,
              }
            }
          });
        }, 3000);
      }
      
    } catch (error) {
      console.error('Error updating engagement score:', error);
    }
  };

  // Check if it's time for an engagement-based review
  const checkEngagementReview = async () => {
    try {
      const lastCheckStr = await AsyncStorage.getItem(LAST_ENGAGEMENT_CHECK_KEY);
      const lastCheck = lastCheckStr ? new Date(lastCheckStr) : new Date(0);
      const now = new Date();
      
      // Only check once per day
      const daysSinceLastCheck = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceLastCheck >= 1) {
        await AsyncStorage.setItem(LAST_ENGAGEMENT_CHECK_KEY, now.toISOString());
        
        // Get engagement score
        const scoreStr = await AsyncStorage.getItem(ENGAGEMENT_SCORE_KEY);
        const engagementScore = scoreStr ? parseFloat(scoreStr) : 0;
        
        // If user has been consistently engaged, trigger review
        if (engagementScore > 20) {
          setTimeout(() => {
            triggerReview({
              context: {
                trigger: ReviewTrigger.MILESTONE_ACHIEVED,
                userState: {
                  appOpenCount: 0,
                  successfulFoodLogs: 0,
                  streakDays: 0,
                  milestonesAchieved: ['consistent_engagement'],
                  lastReviewPrompt: null,
                  lastReviewAction: null,
                },
                appState: {
                  isLoading: false,
                  hasErrors: false,
                  currentScreen: 'unknown',
                  sessionStartTime: sessionStartRef.current,
                }
              }
            });
          }, 5000);
        }
      }
    } catch (error) {
      console.error('Error checking engagement review:', error);
    }
  };

  return <>{children}</>;
}

export default ReviewTriggerTracker;