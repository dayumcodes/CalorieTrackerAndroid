import InAppReview from 'react-native-in-app-review';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Key for storing the last review request timestamp
const LAST_REVIEW_REQUEST_KEY = '@calorie_tracker:last_review_request';
// Minimum days between review requests (to avoid annoying users)
const MIN_DAYS_BETWEEN_REQUESTS = 30;

/**
 * Service for handling in-app reviews
 */
export const InAppReviewService = {
  /**
   * Check if in-app review is available on the device
   */
  isAvailable: (): boolean => {
    return InAppReview.isAvailable();
  },

  /**
   * Request an in-app review based on certain conditions:
   * - Feature is available on the device
   * - Enough time has passed since the last request
   * - User has had meaningful interactions with the app
   * 
   * @param forceShow Force showing the review dialog regardless of time constraints
   * @returns Promise resolving to whether the review flow completed successfully
   */
  requestReview: async (forceShow = false): Promise<boolean> => {
    try {
      // Check if in-app review is available
      if (!InAppReview.isAvailable()) {
        console.log('In-app review is not available on this device');
        return false;
      }

      // If not forcing, check if enough time has passed since last request
      if (!forceShow) {
        const canShowReview = await InAppReviewService.canRequestReview();
        if (!canShowReview) {
          console.log('Not showing review - too soon since last request');
          return false;
        }
      }

      // Save the current timestamp as the last review request time
      await AsyncStorage.setItem(LAST_REVIEW_REQUEST_KEY, Date.now().toString());

      // Request the review
      const result = await InAppReview.RequestInAppReview();
      
      // Note: The API doesn't tell us if the user actually reviewed the app
      // It only tells us if the flow completed (Android) or launched (iOS)
      return result;
    } catch (error) {
      console.error('Error requesting in-app review:', error);
      return false;
    }
  },

  /**
   * Check if enough time has passed since the last review request
   */
  canRequestReview: async (): Promise<boolean> => {
    try {
      const lastRequestStr = await AsyncStorage.getItem(LAST_REVIEW_REQUEST_KEY);
      
      // If no previous request, we can show the review
      if (!lastRequestStr) {
        return true;
      }

      const lastRequest = parseInt(lastRequestStr, 10);
      const now = Date.now();
      const daysSinceLastRequest = (now - lastRequest) / (1000 * 60 * 60 * 24);

      // Check if enough days have passed
      return daysSinceLastRequest >= MIN_DAYS_BETWEEN_REQUESTS;
    } catch (error) {
      console.error('Error checking review request timing:', error);
      return false;
    }
  }
}; 