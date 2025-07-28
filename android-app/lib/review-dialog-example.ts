/**
 * Example usage of the ReviewDialog for Google Play In-App Review
 * 
 * This file demonstrates how to use the ReviewDialog in a React Native app.
 */

import { reviewDialog, createReviewDialog } from './review-dialog';
import { ReviewTrigger, ReviewAction } from './types/review-types';

/**
 * Example: Basic usage with default configuration
 */
export async function basicReviewExample() {
  try {
    // Check if in-app review is available
    const isAvailable = await reviewDialog.isAvailable();
    console.log('In-app review available:', isAvailable);

    if (isAvailable) {
      // Request a review
      const result = await reviewDialog.requestReview();
      console.log('Review result:', result);
      
      if (result.success) {
        console.log('Review flow completed successfully');
      } else {
        console.log('Review flow failed:', result.error);
      }
    } else {
      // Fallback to Play Store
      reviewDialog.openPlayStore();
    }
  } catch (error) {
    console.error('Error in review flow:', error);
  }
}

/**
 * Example: Custom configuration
 */
export async function customReviewExample() {
  // Create a custom ReviewDialog instance
  const customReviewDialog = createReviewDialog({
    playStoreUrl: 'market://details?id=com.calorietracker.app',
    enableFallbackAlert: true,
    debugMode: true, // Enable debug logging
  });

  try {
    const result = await customReviewDialog.requestReview();
    
    switch (result.action) {
      case ReviewAction.COMPLETED:
        console.log('User completed the review');
        break;
      case ReviewAction.DISMISSED:
        console.log('User dismissed the review');
        break;
      case ReviewAction.ERROR:
        console.log('Review error occurred:', result.error);
        break;
      case ReviewAction.NOT_AVAILABLE:
        console.log('Review not available on this device');
        break;
    }
  } catch (error) {
    console.error('Custom review error:', error);
  }
}

/**
 * Example: Integration with app logic
 */
export class ReviewManager {
  private reviewDialog = createReviewDialog({
    debugMode: __DEV__, // Enable debug mode in development
  });

  /**
   * Check if we should show a review prompt based on user actions
   */
  async shouldShowReview(userActionCount: number, lastReviewDate?: Date): Promise<boolean> {
    // Basic logic - show review after 10 actions and not shown in last 30 days
    if (userActionCount < 10) {
      return false;
    }

    if (lastReviewDate) {
      const daysSinceLastReview = (Date.now() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastReview < 30) {
        return false;
      }
    }

    // Check if the API is available
    return await this.reviewDialog.isAvailable();
  }

  /**
   * Trigger a review prompt
   */
  async triggerReview(): Promise<boolean> {
    try {
      const result = await this.reviewDialog.requestReview();
      return result.success;
    } catch (error) {
      console.error('Failed to trigger review:', error);
      return false;
    }
  }

  /**
   * Open Play Store as fallback
   */
  openPlayStore(): void {
    this.reviewDialog.openPlayStore();
  }
}

/**
 * Example: React Native component integration
 */
export const useReviewDialog = () => {
  const reviewDialog = createReviewDialog();

  const triggerReview = async () => {
    const isAvailable = await reviewDialog.isAvailable();
    
    if (isAvailable) {
      return await reviewDialog.requestReview();
    } else {
      reviewDialog.openPlayStore();
      return { success: true, action: ReviewAction.COMPLETED };
    }
  };

  return {
    triggerReview,
    openPlayStore: () => reviewDialog.openPlayStore(),
    isAvailable: () => reviewDialog.isAvailable(),
  };
};