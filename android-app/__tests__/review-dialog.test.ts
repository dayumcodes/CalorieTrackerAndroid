/**
 * Integration tests for ReviewDialog Google Play Services interaction
 */

import { ReviewDialog, createReviewDialog } from '../lib/review-dialog';
import { ReviewAction, ReviewErrorType } from '../lib/types/review-types';
import { Platform, Linking, Alert } from 'react-native';
import InAppReview from 'react-native-in-app-review';

// Mock react-native-in-app-review
jest.mock('react-native-in-app-review', () => ({
  isAvailable: jest.fn(),
  RequestInAppReview: jest.fn(),
}));

// Mock React Native modules
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
  Linking: {
    openURL: jest.fn(),
  },
  Alert: {
    alert: jest.fn(),
  },
}));

describe('ReviewDialog', () => {
  let reviewDialog: ReviewDialog;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create fresh instance
    reviewDialog = new ReviewDialog({
      debugMode: true,
      playStoreUrl: 'market://details?id=com.test.app',
    });
    
    // Default mock implementations
    (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
    (InAppReview.RequestInAppReview as jest.Mock).mockResolvedValue(true);
    (Platform as any).OS = 'android';
    (Linking.openURL as jest.Mock).mockResolvedValue(true);
  });

  describe('isAvailable', () => {
    it('should return true when on Android and API is available', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (Platform as any).OS = 'android';

      const result = await reviewDialog.isAvailable();

      expect(result).toBe(true);
      expect(InAppReview.isAvailable).toHaveBeenCalled();
    });

    it('should return false when not on Android platform', async () => {
      (Platform as any).OS = 'ios';

      const result = await reviewDialog.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false when API is not available', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(false);

      const result = await reviewDialog.isAvailable();

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      (InAppReview.isAvailable as jest.Mock).mockImplementation(() => {
        throw new Error('API Error');
      });

      const result = await reviewDialog.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('requestReview', () => {
    it('should successfully request review when API is available', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockResolvedValue(true);

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(true);
      expect(result.action).toBe(ReviewAction.COMPLETED);
      expect(InAppReview.RequestInAppReview).toHaveBeenCalled();
    });

    it('should handle API failure gracefully', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockResolvedValue(false);

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(false);
      expect(result.action).toBe(ReviewAction.ERROR);
      expect(result.error).toBe('Review flow failed to initiate');
    });

    it('should fallback to Play Store when API is not available', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(false);

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(true);
      expect(result.action).toBe(ReviewAction.COMPLETED);
      expect(Linking.openURL).toHaveBeenCalledWith('market://details?id=com.test.app');
    });

    it('should handle Google Play Services unavailable error', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockRejectedValue(
        new Error('Google Play Services not available')
      );

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(true); // Should succeed via fallback
      expect(result.action).toBe(ReviewAction.COMPLETED);
      expect(Linking.openURL).toHaveBeenCalled();
    });

    it('should handle network errors without fallback', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockRejectedValue(
        new Error('Network connection failed')
      );

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(false);
      expect(result.action).toBe(ReviewAction.ERROR);
      expect(result.error).toBe('Network connection failed');
      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('should handle API rate limit errors without fallback', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(false);
      expect(result.action).toBe(ReviewAction.ERROR);
      expect(result.error).toBe('API rate limit exceeded');
      expect(Linking.openURL).not.toHaveBeenCalled();
    });
  });

  describe('openPlayStore', () => {
    it('should open Play Store with configured URL', () => {
      reviewDialog.openPlayStore();

      expect(Linking.openURL).toHaveBeenCalledWith('market://details?id=com.test.app');
    });

    it('should show alert when Play Store URL fails', async () => {
      (Linking.openURL as jest.Mock).mockRejectedValue(new Error('Failed to open'));

      reviewDialog.openPlayStore();

      // Wait for the promise to resolve/reject
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Rate Our App',
        'We would love your feedback! Please rate us on the Google Play Store.',
        expect.any(Array)
      );
    });

    it('should handle missing Play Store URL', async () => {
      const dialogWithoutUrl = new ReviewDialog({ playStoreUrl: undefined });

      dialogWithoutUrl.openPlayStore();

      // Wait for the async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(Alert.alert).toHaveBeenCalled();
    });

    it('should not show alert when disabled in config', () => {
      const dialogWithoutAlert = new ReviewDialog({ 
        enableFallbackAlert: false,
        playStoreUrl: undefined,
      });

      dialogWithoutAlert.openPlayStore();

      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });

  describe('error categorization', () => {
    it('should categorize Google Play Services errors correctly', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockRejectedValue(
        new Error('Google Play Services is not available')
      );

      const result = await reviewDialog.requestReview();

      // Should attempt fallback for Play Services errors
      expect(Linking.openURL).toHaveBeenCalled();
    });

    it('should categorize network errors correctly', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockRejectedValue(
        new Error('Network connection timeout')
      );

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network connection timeout');
      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('should categorize rate limit errors correctly', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockRejectedValue(
        new Error('API quota exceeded')
      );

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(false);
      expect(result.error).toBe('API quota exceeded');
      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('should handle unknown errors with fallback', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockRejectedValue(
        new Error('Unknown error occurred')
      );

      const result = await reviewDialog.requestReview();

      // Should attempt fallback for unknown errors
      expect(Linking.openURL).toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const defaultDialog = new ReviewDialog();
      const config = defaultDialog.getConfig();

      expect(config.enableFallbackAlert).toBe(true);
      expect(config.debugMode).toBe(false);
      expect(config.playStoreUrl).toBe('market://details?id=com.calorietracker.app');
    });

    it('should allow configuration updates', () => {
      reviewDialog.updateConfig({
        debugMode: false,
        enableFallbackAlert: false,
      });

      const config = reviewDialog.getConfig();
      expect(config.debugMode).toBe(false);
      expect(config.enableFallbackAlert).toBe(false);
    });

    it('should create dialog with custom configuration', () => {
      const customDialog = createReviewDialog({
        playStoreUrl: 'market://details?id=com.custom.app',
        debugMode: true,
      });

      const config = customDialog.getConfig();
      expect(config.playStoreUrl).toBe('market://details?id=com.custom.app');
      expect(config.debugMode).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined errors', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockRejectedValue(null);

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(true); // Should fallback
      expect(Linking.openURL).toHaveBeenCalled();
    });

    it('should handle non-Error objects', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
      (InAppReview.RequestInAppReview as jest.Mock).mockRejectedValue('String error');

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(true); // Should fallback for unknown error
      expect(Linking.openURL).toHaveBeenCalled();
    });

    it('should handle Play Store fallback failure', async () => {
      (InAppReview.isAvailable as jest.Mock).mockReturnValue(false);
      (Linking.openURL as jest.Mock).mockRejectedValue(new Error('Cannot open URL'));

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(false);
      expect(result.action).toBe(ReviewAction.NOT_AVAILABLE);
      expect(result.error).toBe('Unable to open Play Store for review');
    });
  });

  describe('platform compatibility', () => {
    it('should handle iOS platform gracefully', async () => {
      (Platform as any).OS = 'ios';

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(true); // Should fallback to Play Store
      expect(result.action).toBe(ReviewAction.COMPLETED);
    });

    it('should handle web platform gracefully', async () => {
      (Platform as any).OS = 'web';

      const result = await reviewDialog.requestReview();

      expect(result.success).toBe(true); // Should fallback to Play Store
      expect(result.action).toBe(ReviewAction.COMPLETED);
    });
  });
});

describe('ReviewDialog Integration', () => {
  it('should integrate properly with Google Play Services', async () => {
    // Reset mocks for this test
    jest.clearAllMocks();
    
    // This test simulates a real-world scenario
    const reviewDialog = createReviewDialog({
      playStoreUrl: 'market://details?id=com.calorietracker.app',
      debugMode: false,
    });

    // Mock successful Google Play interaction
    (InAppReview.isAvailable as jest.Mock).mockReturnValue(true);
    (InAppReview.RequestInAppReview as jest.Mock).mockResolvedValue(true);
    (Platform as any).OS = 'android';

    const isAvailable = await reviewDialog.isAvailable();
    expect(isAvailable).toBe(true);

    const result = await reviewDialog.requestReview();
    expect(result.success).toBe(true);
    expect(result.action).toBe(ReviewAction.COMPLETED);
  });

  it('should handle complete Google Play Services failure gracefully', async () => {
    const reviewDialog = createReviewDialog({
      playStoreUrl: 'market://details?id=com.calorietracker.app',
      enableFallbackAlert: true,
    });

    // Mock complete Google Play Services failure
    (InAppReview.isAvailable as jest.Mock).mockReturnValue(false);
    (Linking.openURL as jest.Mock).mockResolvedValue(true);

    const result = await reviewDialog.requestReview();
    
    // Should still succeed via fallback
    expect(result.success).toBe(true);
    expect(result.action).toBe(ReviewAction.COMPLETED);
    expect(Linking.openURL).toHaveBeenCalledWith('market://details?id=com.calorietracker.app');
  });
});