import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, ActivityIndicator, Text, BackHandler, Platform, StatusBar as RNStatusBar, SafeAreaView, NativeSyntheticEvent } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInAppReview } from '../../hooks/useInAppReview';

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
  const { triggerReview } = useInAppReview();

  // Track app opens and potentially show review prompt
  useEffect(() => {
    const trackAppOpenAndReview = async () => {
      try {
        // Get current open count
        const countStr = await AsyncStorage.getItem(APP_OPEN_COUNT_KEY);
        const currentCount = countStr ? parseInt(countStr, 10) : 0;
        const newCount = currentCount + 1;
        
        // Save the new count
        await AsyncStorage.setItem(APP_OPEN_COUNT_KEY, newCount.toString());
        
        // Check if we should show the review prompt
        // Only show after a certain number of opens and not on first launch
        if (newCount >= 5 && newCount % 10 === 0) {
          // Wait a bit for the app to load before showing the review prompt
          setTimeout(() => {
            triggerReview({
              minimumAppOpens: 5
            });
          }, 3000);
        }
      } catch (error) {
        console.error('Error tracking app opens:', error);
      }
    };

    trackAppOpenAndReview();
  }, [triggerReview]);

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
    
    // Check if user has logged food (this is a heuristic based on URL)
    // You may need to adjust this based on your actual URL structure
    if (newNavState.url.includes('/log-food') && newNavState.url.includes('success=true')) {
      handleSuccessfulFoodLog();
    }
  };
  
  // Track successful food logs and potentially trigger review
  const handleSuccessfulFoodLog = async () => {
    try {
      // Get the current timestamp
      const now = Date.now();
      
      // Save the last successful log time
      await AsyncStorage.setItem(LAST_SUCCESSFUL_LOG_KEY, now.toString());
      
      // Get log count (we could track this separately if needed)
      const countStr = await AsyncStorage.getItem(APP_OPEN_COUNT_KEY);
      const currentCount = countStr ? parseInt(countStr, 10) : 0;
      
      // Show review after user has had meaningful interactions
      // This is a good time to ask for a review - after a successful action
      if (currentCount >= 8) {
        setTimeout(() => {
          triggerReview();
        }, 1500);
      }
    } catch (error) {
      console.error('Error handling successful food log:', error);
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

  // Custom JavaScript to inject to handle React Server Component errors
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
      }
    } catch (e) {
      console.error('Error parsing WebView message:', e);
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
