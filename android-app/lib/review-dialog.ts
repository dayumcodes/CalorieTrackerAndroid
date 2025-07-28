/**
 * ReviewDialog wrapper for Google Play In-App Review integration
 * 
 * This service provides a wrapper around the native Google Play In-App Review API
 * with fallback mechanisms and comprehensive error handling.
 */

import InAppReview from 'react-native-in-app-review';
import { Linking, Alert, Platform } from 'react-native';
import { 
  ReviewDialog as IReviewDialog, 
  ReviewResult, 
  ReviewAction, 
  ReviewError, 
  ReviewErrorType 
} from './types/review-types';
import { errorHandler } from './error-handler';
import { getAnalyticsTracker } from './analytics-tracker';

/**
 * Configuration for the ReviewDialog
 */
interface ReviewDialogConfig {
  playStoreUrl?: string;
  enableFallbackAlert?: boolean;
  debugMode?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ReviewDialogConfig = {
  playStoreUrl: 'market://details?id=com.calorietracker.app',
  enableFallbackAlert: true,
  debugMode: false,
};

/**
 * ReviewDialog implementation for Google Play integration
 */
export class ReviewDialog implements IReviewDialog {
  private config: ReviewDialogConfig;
  private analyticsTracker = getAnalyticsTracker();
  private lastRequestTime: Date | null = null;

  constructor(config: Partial<ReviewDialogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if Google Play In-App Review is available on the device
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if we're on Android platform
      if (Platform.OS !== 'android') {
        if (this.config.debugMode) {
          console.log('ReviewDialog: Not on Android platform');
        }
        return false;
      }

      // Check if the in-app review API is available
      const available = InAppReview.isAvailable();
      
      if (this.config.debugMode) {
        console.log(`ReviewDialog: In-app review available: ${available}`);
      }

      return available;
    } catch (error) {
      if (this.config.debugMode) {
        console.error('ReviewDialog: Error checking availability:', error);
      }
      return false;
    }
  }

  /**
   * Request an in-app review from the user
   */
  async requestReview(): Promise<ReviewResult> {
    const operationId = 'review_request';
    
    try {
      // Check rate limiting (if error handler is available)
      if (errorHandler && errorHandler.isRateLimited && errorHandler.isRateLimited(operationId)) {
        const error = this.createError(
          ReviewErrorType.API_RATE_LIMIT,
          'Review request rate limited'
        );
        
        const recoveryResult = await errorHandler.handleReviewError(error);
        return {
          success: recoveryResult.success,
          action: recoveryResult.action,
          error: recoveryResult.error,
        };
      }

      // Record API request for rate limiting (if error handler is available)
      if (errorHandler && errorHandler.recordApiRequest) {
        errorHandler.recordApiRequest(operationId);
      }
      this.lastRequestTime = new Date();

      // Check network connectivity
      const isConnected = await this.checkNetworkConnectivity();
      if (!isConnected) {
        const error = this.createError(
          ReviewErrorType.NETWORK_ERROR,
          'No network connectivity'
        );
        
        if (errorHandler && errorHandler.handleReviewError) {
          const recoveryResult = await errorHandler.handleReviewError(error);
          return {
            success: recoveryResult.success,
            action: recoveryResult.action,
            error: recoveryResult.error,
          };
        } else {
          return {
            success: false,
            action: ReviewAction.ERROR,
            error: error.message,
          };
        }
      }

      // First check if the API is available
      const available = await this.isAvailable();
      
      if (!available) {
        if (this.config.debugMode) {
          console.log('ReviewDialog: API not available, attempting fallback');
        }
        
        const error = this.createError(
          ReviewErrorType.PLAY_SERVICES_UNAVAILABLE,
          'Google Play Services not available'
        );
        
        if (errorHandler && errorHandler.handleReviewError) {
          const recoveryResult = await errorHandler.handleReviewError(error);
          return {
            success: recoveryResult.success,
            action: recoveryResult.action,
            error: recoveryResult.error,
          };
        } else {
          return {
            success: false,
            action: ReviewAction.NOT_AVAILABLE,
            error: error.message,
          };
        }
      }

      if (this.config.debugMode) {
        console.log('ReviewDialog: Requesting in-app review');
      }

      // Request the review using the native API with retry logic
      const result = await this.requestReviewWithRetry(operationId);
      
      if (this.config.debugMode) {
        console.log(`ReviewDialog: Review request result: ${result}`);
      }

      // The native API doesn't provide detailed feedback about user actions
      // We can only determine if the flow was initiated successfully
      if (result) {
        if (errorHandler && errorHandler.clearRetryAttempts) {
          errorHandler.clearRetryAttempts(operationId);
        }
        return {
          success: true,
          action: ReviewAction.COMPLETED, // Assume completed if no error
        };
      } else {
        return {
          success: false,
          action: ReviewAction.ERROR,
          error: 'Review flow failed to initiate',
        };
      }

    } catch (error) {
      if (this.config.debugMode) {
        console.error('ReviewDialog: Error requesting review:', error);
      }

      // Handle specific error types
      const reviewError = this.categorizeError(error);
      
      // Use error handler for recovery (if available)
      if (errorHandler && errorHandler.handleReviewError) {
        const recoveryResult = await errorHandler.handleReviewError(reviewError);
        
        return {
          success: recoveryResult.success,
          action: recoveryResult.action,
          error: recoveryResult.error,
        };
      } else {
        return {
          success: false,
          action: ReviewAction.ERROR,
          error: reviewError.message,
        };
      }
    }
  }

  /**
   * Open the Play Store as a fallback mechanism
   */
  openPlayStore(): void {
    this.openPlayStoreAsync().catch((error) => {
      if (this.config.debugMode) {
        console.error('ReviewDialog: Error in openPlayStore:', error);
      }
    });
  }

  /**
   * Attempt fallback to Play Store with proper result handling
   */
  private async attemptFallback(): Promise<ReviewResult> {
    try {
      await this.openPlayStoreAsync();
      
      return {
        success: true,
        action: ReviewAction.COMPLETED, // Assume user will complete in Play Store
      };
    } catch (error) {
      return {
        success: false,
        action: ReviewAction.NOT_AVAILABLE,
        error: 'Unable to open Play Store for review',
      };
    }
  }

  /**
   * Async version of openPlayStore for better error handling
   */
  private async openPlayStoreAsync(): Promise<void> {
    if (!this.config.playStoreUrl) {
      // Show alert as fallback when URL is not configured
      if (this.config.enableFallbackAlert) {
        Alert.alert(
          'Rate Our App',
          'We would love your feedback! Please rate us on the Google Play Store.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Rate App', 
              onPress: () => {
                // Try alternative Play Store URL
                const fallbackUrl = 'https://play.google.com/store/apps/details?id=com.calorietracker.app';
                Linking.openURL(fallbackUrl).catch(() => {
                  console.error('ReviewDialog: Failed to open fallback URL');
                });
              }
            },
          ]
        );
      }
      throw new Error('Play Store URL not configured');
    }

    if (this.config.debugMode) {
      console.log(`ReviewDialog: Opening Play Store: ${this.config.playStoreUrl}`);
    }

    try {
      await Linking.openURL(this.config.playStoreUrl);
    } catch (error) {
      if (this.config.debugMode) {
        console.error('ReviewDialog: Error opening Play Store URL:', error);
      }

      // Show alert as last resort
      if (this.config.enableFallbackAlert) {
        Alert.alert(
          'Rate Our App',
          'We would love your feedback! Please rate us on the Google Play Store.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Rate App', 
              onPress: () => {
                // Try alternative Play Store URL
                const fallbackUrl = 'https://play.google.com/store/apps/details?id=com.calorietracker.app';
                Linking.openURL(fallbackUrl).catch(() => {
                  console.error('ReviewDialog: Failed to open fallback URL');
                });
              }
            },
          ]
        );
      }
      throw error;
    }
  }

  /**
   * Categorize errors for better handling
   */
  private categorizeError(error: any): ReviewError {
    const timestamp = new Date();
    
    // Check error message or type to categorize
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    
    if (errorMessage.includes('Google Play Services')) {
      return {
        type: ReviewErrorType.PLAY_SERVICES_UNAVAILABLE,
        message: 'Google Play Services is not available',
        originalError: error,
        timestamp,
      };
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return {
        type: ReviewErrorType.NETWORK_ERROR,
        message: errorMessage,
        originalError: error,
        timestamp,
      };
    }
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      return {
        type: ReviewErrorType.API_RATE_LIMIT,
        message: errorMessage,
        originalError: error,
        timestamp,
      };
    }
    
    return {
      type: ReviewErrorType.UNKNOWN_ERROR,
      message: errorMessage,
      originalError: error,
      timestamp,
    };
  }

  /**
   * Determine if fallback should be attempted for a given error type
   */
  private shouldAttemptFallback(errorType: ReviewErrorType): boolean {
    switch (errorType) {
      case ReviewErrorType.PLAY_SERVICES_UNAVAILABLE:
      case ReviewErrorType.UNKNOWN_ERROR:
        return true;
      case ReviewErrorType.NETWORK_ERROR:
      case ReviewErrorType.API_RATE_LIMIT:
        return false;
      default:
        return false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ReviewDialogConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration (for debugging)
   */
  getConfig(): ReviewDialogConfig {
    return { ...this.config };
  }

  /**
   * Check network connectivity
   */
  private async checkNetworkConnectivity(): Promise<boolean> {
    try {
      // Try to import NetInfo dynamically (optional dependency)
      let NetInfo: any = null;
      try {
        // Use dynamic import with string to avoid TypeScript module resolution
        NetInfo = await import('@react-native-community' + '/netinfo');
      } catch (error) {
        // NetInfo is not available, will fallback to assuming connected
      }
      
      if (NetInfo && NetInfo.default && NetInfo.default.fetch) {
        const netInfo = await NetInfo.default.fetch();
        return netInfo.isConnected === true;
      }
      
      // Fallback: assume connected if NetInfo is not available
      return true;
    } catch (error) {
      if (this.config.debugMode) {
        console.warn('ReviewDialog: Error checking network connectivity:', error);
      }
      // Assume connected on error
      return true;
    }
  }

  /**
   * Request review with retry logic
   */
  private async requestReviewWithRetry(operationId: string): Promise<boolean> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await InAppReview.RequestInAppReview();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const reviewError = this.categorizeError(error);
        
        // Record retry attempt (if error handler is available)
        if (errorHandler && errorHandler.recordRetryAttempt) {
          errorHandler.recordRetryAttempt(operationId, reviewError);
        }
        
        // Check if we should retry
        const shouldRetry = errorHandler && errorHandler.shouldRetry ? 
          errorHandler.shouldRetry(reviewError, operationId) : false;
        
        if (!shouldRetry || attempt >= 3) {
          break;
        }
        
        // Wait before retrying
        const delay = errorHandler && errorHandler.getRetryDelay ? 
          errorHandler.getRetryDelay(attempt) : 1000 * attempt;
        await this.delay(delay);
      }
    }

    // All attempts failed
    throw lastError || new Error('Review request failed after all retry attempts');
  }

  /**
   * Create a standardized error
   */
  private createError(type: ReviewErrorType, message: string, originalError?: any): ReviewError {
    return {
      type,
      message,
      originalError: originalError instanceof Error ? originalError : new Error(String(originalError)),
      timestamp: new Date(),
    };
  }

  /**
   * Utility method to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get last request time for debugging
   */
  getLastRequestTime(): Date | null {
    return this.lastRequestTime;
  }
}

/**
 * Default instance for easy usage
 */
export const reviewDialog = new ReviewDialog();

/**
 * Factory function to create ReviewDialog with custom configuration
 */
export const createReviewDialog = (config: Partial<ReviewDialogConfig> = {}): ReviewDialog => {
  return new ReviewDialog(config);
};