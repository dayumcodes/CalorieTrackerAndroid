import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInAppReview } from '../../hooks/useInAppReview';

// Progress page URL
const PROGRESS_URL = 'https://calorietracker.in/progress';

// Key for tracking goal achievements
const GOAL_ACHIEVEMENTS_KEY = '@calorie_tracker:goal_achievements';

export default function ProgressScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { triggerReview } = useInAppReview();

  // Check for goal achievements when viewing progress
  useEffect(() => {
    const checkGoalAchievements = async () => {
      try {
        // This is a simplified example - in a real app, you would have actual goal tracking
        // Here we're just simulating checking if there are goal achievements
        
        // Get current achievements count
        const achievementsStr = await AsyncStorage.getItem(GOAL_ACHIEVEMENTS_KEY);
        const achievements = achievementsStr ? JSON.parse(achievementsStr) : [];
        
        // For this example, we'll consider viewing the progress page as a potential indicator
        // that the user is engaged with the app and might have achieved goals
        
        // In a real app, you would check for actual goal achievements
        // For now, we'll just prompt for a review if they've viewed the progress page multiple times
        // as this indicates engagement
        
        if (achievements.length >= 2) {
          // User has viewed progress multiple times, good time to ask for a review
          setTimeout(() => {
            triggerReview();
          }, 2000);
        }
        
        // Record this visit
        achievements.push({
          timestamp: Date.now(),
          type: 'progress_view'
        });
        
        // Keep only the last 10 entries to avoid growing too large
        const recentAchievements = achievements.slice(-10);
        await AsyncStorage.setItem(GOAL_ACHIEVEMENTS_KEY, JSON.stringify(recentAchievements));
        
      } catch (error) {
        console.error('Error checking goal achievements:', error);
      }
    };

    checkGoalAchievements();
  }, [triggerReview]);

  const handleWebViewLoad = () => {
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      <WebView
        source={{ uri: PROGRESS_URL }}
        style={styles.webview}
        onLoad={handleWebViewLoad}
        onError={() => setError(true)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        onHttpError={() => setError(true)}
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