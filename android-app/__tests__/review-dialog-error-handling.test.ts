/**
 * Tests for review dialog error handling and recovery mechanisms
 */

import { ReviewDialog, createReviewDialog } from '../lib/review-dialog';
import {
    ReviewAction,
    ReviewErrorType,
} from '../lib/types/review-types';

// Mock react-native-in-app-review
const mockRequestInAppReview = jest.fn();
const mockIsAvailable = jest.fn();

jest.mock('react-native-in-app-review', () => ({
    RequestInAppReview: mockRequestInAppReview,
    isAvailable: mockIsAvailable,
}));

// Mock React Native modules
jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
    Linking: {
        openURL: jest.fn(),
    },
    Alert: {
        alert: jest.fn(),
    },
}));

// Mock error handler
const mockErrorHandler = {
    isRateLimited: jest.fn(),
    recordApiRequest: jest.fn(),
    handleReviewError: jest.fn(),
    shouldRetry: jest.fn(),
    recordRetryAttempt: jest.fn(),
    getRetryDelay: jest.fn(),
    clearRetryAttempts: jest.fn(),
};

jest.mock('../lib/error-handler', () => ({
    errorHandler: mockErrorHandler,
}));

// Mock analytics tracker
jest.mock('../lib/analytics-tracker', () => ({
    getAnalyticsTracker: () => ({
        setDebugMode: jest.fn(),
        trackError: jest.fn(),
    }),
}));

describe('ReviewDialog Error Handling', () => {
    let reviewDialog: ReviewDialog;
    const { Linking, Alert } = require('react-native');

    beforeEach(() => {
        reviewDialog = createReviewDialog({ debugMode: true });
        jest.clearAllMocks();
        
        // Default mock implementations
        mockIsAvailable.mockReturnValue(true);
        mockRequestInAppReview.mockResolvedValue(true);
        mockErrorHandler.isRateLimited.mockReturnValue(false);
        mockErrorHandler.shouldRetry.mockReturnValue(true);
        mockErrorHandler.getRetryDelay.mockReturnValue(1000);
        mockErrorHandler.handleReviewError.mockResolvedValue({
            success: true,
            action: ReviewAction.COMPLETED,
        });
        Linking.openURL.mockResolvedValue();
    });

    describe('Rate Limiting', () => {
        it('should check rate limiting before making requests', async () => {
            mockErrorHandler.isRateLimited.mockReturnValue(true);
            mockErrorHandler.handleReviewError.mockResolvedValue({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Rate limited',
            });

            const result = await reviewDialog.requestReview();

            expect(mockErrorHandler.isRateLimited).toHaveBeenCalledWith('review_request');
            expect(result.success).toBe(false);
            expect(result.action).toBe(ReviewAction.ERROR);
        });

        it('should record API requests for rate limiting', async () => {
            await reviewDialog.requestReview();

            expect(mockErrorHandler.recordApiRequest).toHaveBeenCalledWith('review_request');
        });
    });

    describe('Network Connectivity', () => {
        it('should handle network connectivity issues', async () => {
            // Mock network check to fail
            jest.doMock('@react-native-community/netinfo', () => ({
                default: {
                    fetch: jest.fn().mockResolvedValue({ isConnected: false }),
                },
            }));

            mockErrorHandler.handleReviewError.mockResolvedValue({
                success: false,
                action: ReviewAction.ERROR,
                error: 'No network connectivity',
            });

            const result = await reviewDialog.requestReview();

            expect(mockErrorHandler.handleReviewError).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: ReviewErrorType.NETWORK_ERROR,
                    message: 'No network connectivity',
                })
            );
        });

        it('should handle NetInfo import failure gracefully', async () => {
            // Mock NetInfo import to fail
            jest.doMock('@react-native-community/netinfo', () => {
                throw new Error('NetInfo not available');
            });

            // Should still proceed assuming network is available
            const result = await reviewDialog.requestReview();

            expect(result.success).toBe(true);
        });
    });

    describe('Google Play Services Availability', () => {
        it('should handle Google Play Services unavailable', async () => {
            mockIsAvailable.mockReturnValue(false);
            mockErrorHandler.handleReviewError.mockResolvedValue({
                success: true,
                action: ReviewAction.COMPLETED,
            });

            const result = await reviewDialog.requestReview();

            expect(mockErrorHandler.handleReviewError).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: ReviewErrorType.PLAY_SERVICES_UNAVAILABLE,
                    message: 'Google Play Services not available',
                })
            );
        });

        it('should return false for isAvailable on non-Android platforms', async () => {
            const { Platform } = require('react-native');
            Platform.OS = 'ios';

            const result = await reviewDialog.isAvailable();

            expect(result).toBe(false);
        });

        it('should handle errors in isAvailable check', async () => {
            mockIsAvailable.mockImplementation(() => {
                throw new Error('API error');
            });

            const result = await reviewDialog.isAvailable();

            expect(result).toBe(false);
        });
    });

    describe('Retry Logic', () => {
        it('should retry failed requests with exponential backoff', async () => {
            mockRequestInAppReview
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce(true);

            mockErrorHandler.shouldRetry.mockReturnValue(true);
            mockErrorHandler.getRetryDelay
                .mockReturnValueOnce(100)
                .mockReturnValueOnce(200);

            const result = await reviewDialog.requestReview();

            expect(mockRequestInAppReview).toHaveBeenCalledTimes(3);
            expect(mockErrorHandler.recordRetryAttempt).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(true);
        });

        it('should stop retrying when shouldRetry returns false', async () => {
            mockRequestInAppReview.mockRejectedValue(new Error('API rate limit'));
            mockErrorHandler.shouldRetry.mockReturnValue(false);

            const result = await reviewDialog.requestReview();

            expect(mockRequestInAppReview).toHaveBeenCalledTimes(1);
            expect(mockErrorHandler.recordRetryAttempt).toHaveBeenCalledTimes(1);
        });

        it('should clear retry attempts on success', async () => {
            const result = await reviewDialog.requestReview();

            expect(result.success).toBe(true);
            expect(mockErrorHandler.clearRetryAttempts).toHaveBeenCalledWith('review_request');
        });

        it('should stop retrying after maximum attempts', async () => {
            mockRequestInAppReview.mockRejectedValue(new Error('Persistent error'));
            mockErrorHandler.shouldRetry.mockReturnValue(true);

            const result = await reviewDialog.requestReview();

            expect(mockRequestInAppReview).toHaveBeenCalledTimes(3); // Maximum attempts
        });
    });

    describe('Error Categorization', () => {
        it('should categorize Google Play Services errors', async () => {
            const error = new Error('Google Play Services not available');
            mockRequestInAppReview.mockRejectedValue(error);
            mockErrorHandler.shouldRetry.mockReturnValue(false);

            await reviewDialog.requestReview();

            expect(mockErrorHandler.recordRetryAttempt).toHaveBeenCalledWith(
                'review_request',
                expect.objectContaining({
                    type: ReviewErrorType.PLAY_SERVICES_UNAVAILABLE,
                })
            );
        });

        it('should categorize network errors', async () => {
            const error = new Error('Network connection failed');
            mockRequestInAppReview.mockRejectedValue(error);
            mockErrorHandler.shouldRetry.mockReturnValue(false);

            await reviewDialog.requestReview();

            expect(mockErrorHandler.recordRetryAttempt).toHaveBeenCalledWith(
                'review_request',
                expect.objectContaining({
                    type: ReviewErrorType.NETWORK_ERROR,
                })
            );
        });

        it('should categorize rate limit errors', async () => {
            const error = new Error('API rate limit exceeded');
            mockRequestInAppReview.mockRejectedValue(error);
            mockErrorHandler.shouldRetry.mockReturnValue(false);

            await reviewDialog.requestReview();

            expect(mockErrorHandler.recordRetryAttempt).toHaveBeenCalledWith(
                'review_request',
                expect.objectContaining({
                    type: ReviewErrorType.API_RATE_LIMIT,
                })
            );
        });

        it('should categorize unknown errors', async () => {
            const error = new Error('Unknown error');
            mockRequestInAppReview.mockRejectedValue(error);
            mockErrorHandler.shouldRetry.mockReturnValue(false);

            await reviewDialog.requestReview();

            expect(mockErrorHandler.recordRetryAttempt).toHaveBeenCalledWith(
                'review_request',
                expect.objectContaining({
                    type: ReviewErrorType.UNKNOWN_ERROR,
                })
            );
        });
    });

    describe('Fallback Mechanisms', () => {
        it('should open Play Store as fallback', async () => {
            const playStoreUrl = 'market://details?id=com.test.app';
            const testDialog = createReviewDialog({
                playStoreUrl,
                debugMode: true,
            });

            testDialog.openPlayStore();

            expect(Linking.openURL).toHaveBeenCalledWith(playStoreUrl);
        });

        it('should show alert when Play Store URL fails', async () => {
            Linking.openURL.mockRejectedValue(new Error('Failed to open URL'));
            
            const testDialog = createReviewDialog({
                enableFallbackAlert: true,
                debugMode: true,
            });

            testDialog.openPlayStore();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(Alert.alert).toHaveBeenCalled();
        });

        it('should handle missing Play Store URL', async () => {
            const testDialog = createReviewDialog({
                playStoreUrl: undefined,
                enableFallbackAlert: true,
                debugMode: true,
            });

            testDialog.openPlayStore();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(Alert.alert).toHaveBeenCalled();
        });

        it('should not show alert when fallback alert is disabled', async () => {
            Linking.openURL.mockRejectedValue(new Error('Failed to open URL'));
            
            const testDialog = createReviewDialog({
                enableFallbackAlert: false,
                debugMode: true,
            });

            testDialog.openPlayStore();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(Alert.alert).not.toHaveBeenCalled();
        });
    });

    describe('Configuration', () => {
        it('should update configuration', () => {
            const newConfig = {
                playStoreUrl: 'market://details?id=com.new.app',
                enableFallbackAlert: false,
                debugMode: false,
            };

            reviewDialog.updateConfig(newConfig);
            const config = reviewDialog.getConfig();

            expect(config.playStoreUrl).toBe(newConfig.playStoreUrl);
            expect(config.enableFallbackAlert).toBe(newConfig.enableFallbackAlert);
            expect(config.debugMode).toBe(newConfig.debugMode);
        });

        it('should get current configuration', () => {
            const config = reviewDialog.getConfig();

            expect(config).toHaveProperty('playStoreUrl');
            expect(config).toHaveProperty('enableFallbackAlert');
            expect(config).toHaveProperty('debugMode');
        });
    });

    describe('Request Tracking', () => {
        it('should track last request time', async () => {
            const beforeRequest = new Date();
            await reviewDialog.requestReview();
            const afterRequest = new Date();

            const lastRequestTime = reviewDialog.getLastRequestTime();

            expect(lastRequestTime).toBeInstanceOf(Date);
            expect(lastRequestTime!.getTime()).toBeGreaterThanOrEqual(beforeRequest.getTime());
            expect(lastRequestTime!.getTime()).toBeLessThanOrEqual(afterRequest.getTime());
        });

        it('should return null for last request time initially', () => {
            const newDialog = createReviewDialog();
            expect(newDialog.getLastRequestTime()).toBeNull();
        });
    });

    describe('Error Recovery Integration', () => {
        it('should use error handler for comprehensive error recovery', async () => {
            const error = new Error('Test error');
            mockRequestInAppReview.mockRejectedValue(error);
            mockErrorHandler.shouldRetry.mockReturnValue(false);
            
            mockErrorHandler.handleReviewError.mockResolvedValue({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Recovery failed',
            });

            const result = await reviewDialog.requestReview();

            expect(mockErrorHandler.handleReviewError).toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(result.action).toBe(ReviewAction.ERROR);
            expect(result.error).toBe('Recovery failed');
        });
    });
});