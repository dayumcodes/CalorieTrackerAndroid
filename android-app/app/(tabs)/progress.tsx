import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInAppReview } from '../../hooks/useInAppReview';
import { ReviewTrigger, UserAction } from '../../lib/types/review-types';

// Progress page URL
const PROGRESS_URL = 'https://calorietracker.in/progress';

// Keys for tracking progress-related data
const GOAL_ACHIEVEMENTS_KEY = '@calorie_tracker:goal_achievements';
const STREAK_MILESTONES_KEY = '@calorie_tracker:streak_milestones';
const PROGRESS_VISITS_KEY = '@calorie_tracker:progress_visits';

export default function ProgressScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { triggerReview, recordUserAction } = useInAppReview();

  // Track progress screen visits and check for milestones
  useEffect(() => {
    const trackProgressVisit = async () => {
      try {
        // Record progress screen visit
        recordUserAction({
          type: 'progress_screen_visit',
          timestamp: new Date(),
          metadata: {
            screen: 'progress',
            source: 'tab_navigation'
          }
        });

        // Track visit count for engagement analysis
        const visitsStr = await AsyncStorage.getItem(PROGRESS_VISITS_KEY);
        const visits = visitsStr ? JSON.parse(visitsStr) : [];
        
        visits.push({
          timestamp: Date.now(),
          type: 'progress_view'
        });
        
        // Keep only the last 20 entries
        const recentVisits = visits.slice(-20);
        await AsyncStorage.setItem(PROGRESS_VISITS_KEY, JSON.stringify(recentVisits));
        
        // If user frequently checks progress (indicates engagement), consider review
        if (recentVisits.length >= 5) {
          const recentVisitTimes = recentVisits.slice(-5).map((v: any) => v.timestamp);
          const timeSpan = recentVisitTimes[recentVisitTimes.length - 1] - recentVisitTimes[0];
          
          // If 5 visits within a week, user is engaged
          if (timeSpan < 7 * 24 * 60 * 60 * 1000) {
            setTimeout(() => {
              triggerReview({
                context: {
                  trigger: ReviewTrigger.MILESTONE_ACHIEVED,
                  userState: {
                    appOpenCount: 0,
                    successfulFoodLogs: 0,
                    streakDays: 0,
                    milestonesAchieved: ['progress_engagement'],
                    lastReviewPrompt: null,
                    lastReviewAction: null,
                  },
                  appState: {
                    isLoading: false,
                    hasErrors: false,
                    currentScreen: 'progress',
                    sessionStartTime: new Date(),
                  }
                }
              });
            }, 3000);
          }
        }
        
      } catch (error) {
        console.error('Error tracking progress visit:', error);
      }
    };

    trackProgressVisit();
  }, [triggerReview, recordUserAction]);

  const handleWebViewLoad = () => {
    setLoading(false);
  };

  // Handle navigation state changes to detect progress milestones
  const handleWebViewNavigationStateChange = (newNavState: WebViewNavigation) => {
    setLoading(newNavState.loading);
    
    if (!newNavState.loading && !error) {
      // Check for streak milestones in URL
      if (newNavState.url.includes('streak')) {
        handleStreakMilestone(newNavState.url);
      }
      
      // Check for goal completion indicators
      if (newNavState.url.includes('goal') && (newNavState.url.includes('complete') || newNavState.url.includes('achieved'))) {
        handleGoalAchievement(newNavState.url);
      }
      
      // Check for weight loss milestones
      if (newNavState.url.includes('weight') && newNavState.url.includes('milestone')) {
        handleWeightMilestone(newNavState.url);
      }
    }
  };

  // Handle streak milestone detection
  const handleStreakMilestone = async (url: string) => {
    try {
      // Extract streak information from URL
      const streakMatch = url.match(/streak[=\-_](\d+)/i);
      const streakDays = streakMatch ? parseInt(streakMatch[1], 10) : 0;
      
      if (streakDays > 0 && [7, 14, 30, 60, 90].includes(streakDays)) {
        const milestoneKey = `${streakDays}_day_streak`;
        
        // Record streak milestone
        recordUserAction({
          type: 'streak_milestone_achieved',
          timestamp: new Date(),
          metadata: {
            screen: 'progress',
            streakDays,
            milestoneKey,
            source: 'progress_tracking'
          }
        });

        // Store streak milestone
        const milestonesStr = await AsyncStorage.getItem(STREAK_MILESTONES_KEY);
        const milestones = milestonesStr ? JSON.parse(milestonesStr) : [];
        
        if (!milestones.includes(milestoneKey)) {
          milestones.push(milestoneKey);
          await AsyncStorage.setItem(STREAK_MILESTONES_KEY, JSON.stringify(milestones));
          
          // Trigger review for streak milestone - high confidence
          setTimeout(() => {
            triggerReview({
              context: {
                trigger: ReviewTrigger.STREAK_MILESTONE,
                userState: {
                  appOpenCount: 0,
                  successfulFoodLogs: 0,
                  streakDays,
                  milestonesAchieved: [milestoneKey],
                  lastReviewPrompt: null,
                  lastReviewAction: null,
                },
                appState: {
                  isLoading: false,
                  hasErrors: false,
                  currentScreen: 'progress',
                  sessionStartTime: new Date(),
                }
              }
            });
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error handling streak milestone:', error);
    }
  };

  // Handle goal achievement detection
  const handleGoalAchievement = async (url: string) => {
    try {
      // Record goal achievement
      recordUserAction({
        type: 'goal_completed',
        timestamp: new Date(),
        metadata: {
          screen: 'progress',
          source: 'goal_tracking',
          url
        }
      });

      // Store goal achievement
      const achievementsStr = await AsyncStorage.getItem(GOAL_ACHIEVEMENTS_KEY);
      const achievements = achievementsStr ? JSON.parse(achievementsStr) : [];
      
      const achievement = {
        timestamp: Date.now(),
        type: 'goal_completed',
        url
      };
      
      achievements.push(achievement);
      
      // Keep only the last 50 achievements
      const recentAchievements = achievements.slice(-50);
      await AsyncStorage.setItem(GOAL_ACHIEVEMENTS_KEY, JSON.stringify(recentAchievements));
      
      // Trigger review for goal completion - very high confidence
      setTimeout(() => {
        triggerReview({
          context: {
            trigger: ReviewTrigger.GOAL_COMPLETED,
            userState: {
              appOpenCount: 0,
              successfulFoodLogs: 0,
              streakDays: 0,
              milestonesAchieved: ['goal_completed'],
              lastReviewPrompt: null,
              lastReviewAction: null,
            },
            appState: {
              isLoading: false,
              hasErrors: false,
              currentScreen: 'progress',
              sessionStartTime: new Date(),
            }
          }
        });
      }, 2500);
    } catch (error) {
      console.error('Error handling goal achievement:', error);
    }
  };

  // Handle weight milestone detection
  const handleWeightMilestone = async (url: string) => {
    try {
      // Record weight milestone
      recordUserAction({
        type: 'weight_milestone_achieved',
        timestamp: new Date(),
        metadata: {
          screen: 'progress',
          source: 'weight_tracking',
          url
        }
      });

      // Trigger review for weight milestone
      setTimeout(() => {
        triggerReview({
          context: {
            trigger: ReviewTrigger.MILESTONE_ACHIEVED,
            userState: {
              appOpenCount: 0,
              successfulFoodLogs: 0,
              streakDays: 0,
              milestonesAchieved: ['weight_milestone'],
              lastReviewPrompt: null,
              lastReviewAction: null,
            },
            appState: {
              isLoading: false,
              hasErrors: false,
              currentScreen: 'progress',
              sessionStartTime: new Date(),
            }
          }
        });
      }, 2000);
    } catch (error) {
      console.error('Error handling weight milestone:', error);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      <WebView
        source={{ uri: PROGRESS_URL }}
        style={styles.webview}
        onLoad={handleWebViewLoad}
        onNavigationStateChange={handleWebViewNavigationStateChange}
        onError={() => setError(true)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        onHttpError={() => setError(true)}
        injectedJavaScript={`
          // Track progress-related interactions
          (function() {
            // Monitor for streak updates
            const trackStreakUpdates = () => {
              const streakElements = document.querySelectorAll('[data-streak], .streak, .streak-counter');
              streakElements.forEach(element => {
                const streakText = element.textContent || '';
                const streakMatch = streakText.match(/(\\d+)\\s*day/i);
                if (streakMatch) {
                  const days = parseInt(streakMatch[1], 10);
                  if ([7, 14, 30, 60, 90].includes(days)) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'milestone',
                      milestone: 'streak',
                      days: days,
                      timestamp: new Date().toISOString()
                    }));
                  }
                }
              });
            };

            // Monitor for goal completions
            const trackGoalCompletions = () => {
              const goalElements = document.querySelectorAll('[data-goal], .goal, .achievement');
              goalElements.forEach(element => {
                if (element.textContent && (element.textContent.includes('completed') || element.textContent.includes('achieved'))) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'milestone',
                    milestone: 'goal_completed',
                    text: element.textContent,
                    timestamp: new Date().toISOString()
                  }));
                }
              });
            };

            // Monitor for weight milestones
            const trackWeightMilestones = () => {
              const weightElements = document.querySelectorAll('[data-weight], .weight-milestone, .weight-achievement');
              weightElements.forEach(element => {
                if (element.textContent && element.textContent.includes('milestone')) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'milestone',
                    milestone: 'weight_milestone',
                    text: element.textContent,
                    timestamp: new Date().toISOString()
                  }));
                }
              });
            };

            // Set up mutation observer
            if (window.MutationObserver) {
              const observer = new MutationObserver(() => {
                trackStreakUpdates();
                trackGoalCompletions();
                trackWeightMilestones();
              });
              
              observer.observe(document.body, {
                childList: true,
                subtree: true
              });
            }

            // Initial check after page load
            setTimeout(() => {
              trackStreakUpdates();
              trackGoalCompletions();
              trackWeightMilestones();
            }, 2000);
          })();
          true;
        `}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'milestone') {
              // Handle milestone messages from web interface
              if (data.milestone === 'streak' && data.days) {
                handleStreakMilestone(`/progress?streak=${data.days}`);
              } else if (data.milestone === 'goal_completed') {
                handleGoalAchievement('/progress?goal=completed');
              } else if (data.milestone === 'weight_milestone') {
                handleWeightMilestone('/progress?weight=milestone');
              }
            }
          } catch (error) {
            console.error('Error parsing progress WebView message:', error);
          }
        }}
      />

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Loading Progress...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            Unable to load your progress.
            Please check your internet connection.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    color: 'red',
  },
}); 