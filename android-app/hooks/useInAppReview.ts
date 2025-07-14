import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { InAppReviewService } from '../lib/in-app-review';

/**
 * Hook for using the in-app review functionality
 */
export function useInAppReview() {
  /**
   * Trigger in-app review at appropriate moments
   * @param options Configuration options
   */
  const triggerReview = useCallback(async (options?: { 
    force?: boolean,
    showFallbackAlert?: boolean,
    minimumAppOpens?: number
  }) => {
    const { force = false, showFallbackAlert = true, minimumAppOpens = 3 } = options || {};
    
    try {
      // Check if in-app review is available
      const isAvailable = InAppReviewService.isAvailable();
      
      if (isAvailable) {
        // Request in-app review
        const result = await InAppReviewService.requestReview(force);
        return result;
      } else if (showFallbackAlert) {
        // Fallback for devices where in-app review is not available
        Alert.alert(
          'Enjoying Calorie Tracker?',
          'Would you mind taking a moment to rate our app in the store?',
          [
            { text: 'Not Now', style: 'cancel' },
            { 
              text: 'Rate App', 
              onPress: () => {
                // Here you would typically open the app store page
                // This would require a deep linking solution
                console.log('User would be directed to app store');
              } 
            }
          ]
        );
        return false;
      }
      
      return false;
    } catch (error) {
      console.error('Error in useInAppReview:', error);
      return false;
    }
  }, []);

  return {
    triggerReview,
    isAvailable: InAppReviewService.isAvailable()
  };
} 