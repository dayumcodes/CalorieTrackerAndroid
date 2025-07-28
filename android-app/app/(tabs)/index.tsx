import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, ActivityIndicator, Text, BackHandler, Platform, StatusBar as RNStatusBar, SafeAreaView, NativeSyntheticEvent } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInAppReview } from '../../hooks/useInAppReview';
import { ReviewTrigger, UserAction } from '../../lib/types/review-types';

// You'll need to replace this with your actual hosted Next.js app URL
// For development, you can use your local network IP address and port
// For production, use your deployed URL
const APP_URL = 'https://calorietracker.in'; // Replace with your actual URL

// Keys for tracking app usage for review prompting
const APP_OPEN_COUNT_KEY = '@calorie_tracker:app_open_count';
const LAST_SUCCESSFUL_LOG_KEY = '@calorie_tracker:last_successful_log';

// Define the WebViewRenderProcessGoneDetail interface
interface WebViewRenderProcessGoneDetail {
  didCrash: boolean;
}

// Define the WebViewRenderProcessGoneEvent type
type WebViewRenderProcessGoneEvent = NativeSyntheticEvent<WebViewRenderProcessGoneDetail>;

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const { triggerReview, recordUserAction } = useInAppReview();

  // Track app opens and potentially show review prompt
  useEffect(() => {
    const trackAppOpenAndReview = async () => {
      try {
        // Record app open action for review system
        recordUserAction({
          type: 'app_open',
          timestamp: new Date(),
          metadata: {
            screen: 'home',
            source: 'app_launch'
          }
        });

        // Trigger review with proper context after app loads
        setTimeout(() => {
          triggerReview({
            context: {
              trigger: ReviewTrigger.APP_OPEN,
              userState: {
                appOpenCount: 0, // Will be populated by the hook
                successfulFoodLogs: 0,
                streakDays: 0,
                milestonesAchieved: [],
                lastReviewPrompt: null,
                lastReviewAction: null,
              },
              appState: {
                isLoading: false,
                hasErrors: false,
                currentScreen: 'home',
                sessionStartTime: new Date(),
              }
            }
          });
        }, 3000);
      } catch (error) {
        console.error('Error tracking app opens:', error);
      }
    };

    trackAppOpenAndReview();
  }, [triggerReview, recordUserAction]);

  // Handle back button press for navigation within WebView
  useEffect(() => {
    const backAction = () => {
      if (webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const handleWebViewNavigationStateChange = (newNavState: WebViewNavigation) => {
    // Update loading state
    setLoading(newNavState.loading);

    // Reset error state when navigation is successful
    if (!newNavState.loading && !newNavState.title?.includes('Error')) {
      setError(false);
      setErrorMessage(null);
    }

    // Check for successful food logging based on URL patterns
    if (newNavState.url.includes('/log-food') && newNavState.url.includes('success=true')) {
      handleSuccessfulFoodLog();
    }

    // Check for goal completion patterns
    if (newNavState.url.includes('/goals') && newNavState.url.includes('completed=true')) {
      handleGoalCompletion();
    }

    // Check for milestone achievements
    if (newNavState.url.includes('/achievements') || newNavState.url.includes('milestone=')) {
      handleMilestoneAchievement(newNavState.url);
    }
  };

  // Track successful food logs and potentially trigger review
  const handleSuccessfulFoodLog = async () => {
    try {
      // Record successful food log action
      recordUserAction({
        type: 'successful_food_log',
        timestamp: new Date(),
        metadata: {
          screen: 'home',
          source: 'food_logging'
        }
      });

      // Save the last successful log time for legacy compatibility
      await AsyncStorage.setItem(LAST_SUCCESSFUL_LOG_KEY, Date.now().toString());

      // Trigger review with successful food log context
      // This is an optimal time to ask for a review - after a successful action
      setTimeout(() => {
        triggerReview({
          context: {
            trigger: ReviewTrigger.SUCCESSFUL_FOOD_LOG,
            userState: {
              appOpenCount: 0, // Will be populated by the hook
              successfulFoodLogs: 0,
              streakDays: 0,
              milestonesAchieved: [],
              lastReviewPrompt: null,
              lastReviewAction: null,
            },
            appState: {
              isLoading: false,
              hasErrors: false,
              currentScreen: 'home',
              sessionStartTime: new Date(),
            }
          }
        });
      }, 1500);
    } catch (error) {
      console.error('Error handling successful food log:', error);
    }
  };

  // Handle goal completion events
  const handleGoalCompletion = async () => {
    try {
      // Record goal completion action
      recordUserAction({
        type: 'goal_completed',
        timestamp: new Date(),
        metadata: {
          screen: 'home',
          source: 'goal_tracking'
        }
      });

      // Trigger review for goal completion - high confidence trigger
      setTimeout(() => {
        triggerReview({
          context: {
            trigger: ReviewTrigger.GOAL_COMPLETED,
            userState: {
              appOpenCount: 0, // Will be populated by the hook
              successfulFoodLogs: 0,
              streakDays: 0,
              milestonesAchieved: [],
              lastReviewPrompt: null,
              lastReviewAction: null,
            },
            appState: {
              isLoading: false,
              hasErrors: false,
              currentScreen: 'home',
              sessionStartTime: new Date(),
            }
          }
        });
      }, 2000);
    } catch (error) {
      console.error('Error handling goal completion:', error);
    }
  };

  // Handle milestone achievement events
  const handleMilestoneAchievement = async (url: string) => {
    try {
      // Extract milestone information from URL
      let milestoneType = 'unknown';
      if (url.includes('streak')) {
        milestoneType = 'streak_milestone';
      } else if (url.includes('goal')) {
        milestoneType = 'goal_milestone';
      } else if (url.includes('achievement')) {
        milestoneType = 'general_achievement';
      }

      // Record milestone achievement action
      recordUserAction({
        type: 'milestone_achieved',
        timestamp: new Date(),
        metadata: {
          screen: 'home',
          source: 'milestone_tracking',
          milestoneType,
          url
        }
      });

      // Trigger review for milestone achievement - very high confidence trigger
      setTimeout(() => {
        triggerReview({
          context: {
            trigger: ReviewTrigger.MILESTONE_ACHIEVED,
            userState: {
              appOpenCount: 0, // Will be populated by the hook
              successfulFoodLogs: 0,
              streakDays: 0,
              milestonesAchieved: [milestoneType],
              lastReviewPrompt: null,
              lastReviewAction: null,
            },
            appState: {
              isLoading: false,
              hasErrors: false,
              currentScreen: 'home',
              sessionStartTime: new Date(),
            }
          }
        });
      }, 2500);
    } catch (error) {
      console.error('Error handling milestone achievement:', error);
    }
  };

  // Handle WebView errors
  const handleWebViewError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    setError(true);
    setErrorMessage(nativeEvent.description || 'An error occurred while loading the page.');
    console.error('WebView error:', nativeEvent);
  };

  // Handle HTTP errors
  const handleHttpError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    if (nativeEvent.statusCode >= 400) {
      setError(true);
      setErrorMessage(`HTTP Error: ${nativeEvent.statusCode}`);
      console.error('WebView HTTP error:', nativeEvent);
    }
  };

  // Handle rendering errors - fixed to use the correct type
  const handleRenderError = (event: WebViewRenderProcessGoneEvent) => {
    const { nativeEvent } = event;
    setError(true);
    setErrorMessage(`Rendering Error: Process terminated ${nativeEvent.didCrash ? 'due to crash' : 'by the system'}`);
    console.error('WebView rendering process gone:', nativeEvent);
    return true; // Prevent default handling
  };

  const statusBarHeight = Platform.OS === 'android' ? RNStatusBar.currentHeight || 0 : 0;

  const reloadWebView = () => {
    if (webViewRef.current) {
      setError(false);
      setErrorMessage(null);
      setLoading(true);
      webViewRef.current.reload();
    }
  };

  // Custom JavaScript to inject to handle React Server Component errors and track user actions
  const injectedJavaScript = `
    window.onerror = function(message, source, lineno, colno, error) {
      if (message && message.includes('Server Components')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          message: message,
          source: source,
          lineno: lineno,
          colno: colno
        }));
      }
      return true;
    };
    
    // Handle React error boundaries
    if (window.addEventListener) {
      window.addEventListener('error', function(e) {
        if (e.message && e.message.includes('Server Components')) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: e.message,
            source: e.filename,
            lineno: e.lineno,
            colno: e.colno
          }));
        }
      });
    }

    // Track user interactions for review triggers
    (function() {
      // Track successful food logging
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        return originalFetch.apply(this, args).then(response => {
          if (response.ok && args[0] && args[0].includes('/api/food')) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'user_action',
              action: 'successful_food_log',
              timestamp: new Date().toISOString()
            }));
          }
          return response;
        });
      };

      // Track goal completions
      const trackGoalCompletion = () => {
        if (window.location.href.includes('goal') && window.location.href.includes('complete')) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'user_action',
            action: 'goal_completed',
            timestamp: new Date().toISOString()
          }));
        }
      };

      // Track milestone achievements
      const trackMilestones = () => {
        const milestoneElements = document.querySelectorAll('[data-milestone], .milestone, .achievement');
        milestoneElements.forEach(element => {
          if (element.textContent && element.textContent.includes('achieved')) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'user_action',
              action: 'milestone_achieved',
              milestone: element.textContent,
              timestamp: new Date().toISOString()
            }));
          }
        });
      };

      // Monitor for changes in the DOM
      if (window.MutationObserver) {
        const observer = new MutationObserver(() => {
          trackGoalCompletion();
          trackMilestones();
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }

      // Initial check
      setTimeout(() => {
        trackGoalCompletion();
        trackMilestones();
      }, 1000);
    })();
    
    true;
  `;

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'error') {
        console.error('WebView JS error:', data);
        setError(true);
        setErrorMessage(`Error: ${data.message}`);
      } else if (data.type === 'user_action') {
        // Handle user actions from the web interface
        handleWebUserAction(data);
      }
    } catch (e) {
      console.error('Error parsing WebView message:', e);
    }
  };

  // Handle user actions received from the web interface
  const handleWebUserAction = (data: any) => {
    try {
      const action: UserAction = {
        type: data.action,
        timestamp: new Date(data.timestamp),
        metadata: {
          source: 'web_interface',
          ...data
        }
      };

      recordUserAction(action);

      // Trigger appropriate review based on action type
      switch (data.action) {
        case 'successful_food_log':
          setTimeout(() => {
            triggerReview({
              context: {
                trigger: ReviewTrigger.SUCCESSFUL_FOOD_LOG,
                userState: {
                  appOpenCount: 0,
                  successfulFoodLogs: 0,
                  streakDays: 0,
                  milestonesAchieved: [],
                  lastReviewPrompt: null,
                  lastReviewAction: null,
                },
                appState: {
                  isLoading: false,
                  hasErrors: false,
                  currentScreen: 'home',
                  sessionStartTime: new Date(),
                }
              }
            });
          }, 1500);
          break;

        case 'goal_completed':
          setTimeout(() => {
            triggerReview({
              context: {
                trigger: ReviewTrigger.GOAL_COMPLETED,
                userState: {
                  appOpenCount: 0,
                  successfulFoodLogs: 0,
                  streakDays: 0,
                  milestonesAchieved: [],
                  lastReviewPrompt: null,
                  lastReviewAction: null,
                },
                appState: {
                  isLoading: false,
                  hasErrors: false,
                  currentScreen: 'home',
                  sessionStartTime: new Date(),
                }
              }
            });
          }, 2000);
          break;

        case 'milestone_achieved':
          setTimeout(() => {
            triggerReview({
              context: {
                trigger: ReviewTrigger.MILESTONE_ACHIEVED,
                userState: {
                  appOpenCount: 0,
                  successfulFoodLogs: 0,
                  streakDays: 0,
                  milestonesAchieved: [data.milestone || 'web_milestone'],
                  lastReviewPrompt: null,
                  lastReviewAction: null,
                },
                appState: {
                  isLoading: false,
                  hasErrors: false,
                  currentScreen: 'home',
                  sessionStartTime: new Date(),
                }
              }
            });
          }, 2500);
          break;
      }
    } catch (error) {
      console.error('Error handling web user action:', error);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: statusBarHeight,
          paddingBottom: insets.bottom || 10 // Use insets if available, otherwise use a small default
        }
      ]}
    >
      <StatusBar style="auto" />

      <WebView
        ref={webViewRef}
        source={{ uri: APP_URL }}
        style={styles.webview}
        onNavigationStateChange={handleWebViewNavigationStateChange}
        onError={handleWebViewError}
        onHttpError={handleHttpError}
        onRenderProcessGone={handleRenderError}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        cacheEnabled={false}
        incognito={false} // Try with both true and false
        injectedJavaScript={injectedJavaScript}
        onMessage={handleMessage}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0000ff" />
            <Text style={styles.loadingText}>Loading Calorie Tracker...</Text>
          </View>
        )}
      />

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {errorMessage || 'Unable to connect to the Calorie Tracker. Please check your internet connection.'}
          </Text>
          <Text
            style={styles.reloadText}
            onPress={reloadWebView}
          >
            Tap here to try again
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'android' ? Constants.statusBarHeight : 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    marginBottom: 20,
  },
  reloadText: {
    fontSize: 16,
    textAlign: 'center',
    color: 'blue',
    textDecorationLine: 'underline',
    marginTop: 20,
  },
});
