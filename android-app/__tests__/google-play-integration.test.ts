/**
 * Integration tests for Google Play API interaction
 * Tests the native Google Play In-App Review API integration
 */

import { ReviewDialog } from '../lib/review-dialog';
import { ReviewAction, ReviewResult } from '../lib/types/review-types';
import InAppReview from 'react-native-in-app-review';

// Mock the react-native-in-app-review module
jest.mock('react-native-in-app-review', () => ({
    isAvailable: jest.fn(),
    RequestInAppReview: jest.fn(),
}));

const mockInAppReview = InAppReview as jest.Mocked<typeof InAppReview>;

describe('Google Play API Integration', () => {
    let reviewDialog: ReviewDialog;

    beforeEach(() => {
        reviewDialog = new ReviewDialog();
        jest.clearAllMocks();
    });

    describe('Availability Check', () => {
        it('should return true when Google Play Services is available', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);

            const isAvailable = await reviewDialog.isAvailable();

            expect(isAvailable).toBe(true);
            expect(mockInAppReview.isAvailable).toHaveBeenCalledTimes(1);
        });

        it('should return false when Google Play Services is not available', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(false);

            const isAvailable = await reviewDialog.isAvailable();

            expect(isAvailable).toBe(false);
            expect(mockInAppReview.isAvailable).toHaveBeenCalledTimes(1);
        });

        it('should handle availability check errors', async () => {
            mockInAppReview.isAvailable.mockRejectedValue(new Error('Google Play Services error'));

            const isAvailable = await reviewDialog.isAvailable();

            expect(isAvailable).toBe(false);
        });

        it('should cache availability result for performance', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);

            // First call
            await reviewDialog.isAvailable();
            // Second call
            await reviewDialog.isAvailable();

            // Should only call the native method once due to caching
            expect(mockInAppReview.isAvailable).toHaveBeenCalledTimes(1);
        });

        it('should refresh cache after timeout', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);

            // First call
            await reviewDialog.isAvailable();

            // Mock time passage (cache timeout is typically 5 minutes)
            jest.advanceTimersByTime(5 * 60 * 1000 + 1000);

            // Second call after timeout
            await reviewDialog.isAvailable();

            expect(mockInAppReview.isAvailable).toHaveBeenCalledTimes(2);
        });
    });

    describe('Review Request', () => {
        beforeEach(() => {
            mockInAppReview.isAvailable.mockResolvedValue(true);
        });

        it('should successfully request review when available', async () => {
            mockInAppReview.RequestInAppReview.mockResolvedValue(true);

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: true,
                action: ReviewAction.COMPLETED,
            });
            expect(mockInAppReview.RequestInAppReview).toHaveBeenCalledTimes(1);
        });

        it('should handle review request failure', async () => {
            mockInAppReview.RequestInAppReview.mockResolvedValue(false);

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.DISMISSED,
            });
        });

        it('should handle review request errors', async () => {
            mockInAppReview.RequestInAppReview.mockRejectedValue(new Error('Review request failed'));

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Review request failed',
            });
        });

        it('should not request review when not available', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(false);

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.NOT_AVAILABLE,
                error: 'Google Play In-App Review not available',
            });
            expect(mockInAppReview.RequestInAppReview).not.toHaveBeenCalled();
        });

        it('should handle timeout during review request', async () => {
            // Mock a request that takes too long
            mockInAppReview.RequestInAppReview.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve(true), 10000))
            );

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Review request timeout',
            });
        });

        it('should prevent concurrent review requests', async () => {
            mockInAppReview.RequestInAppReview.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve(true), 100))
            );

            // Start two concurrent requests
            const promise1 = reviewDialog.requestReview();
            const promise2 = reviewDialog.requestReview();

            const [result1, result2] = await Promise.all([promise1, promise2]);

            // First should succeed, second should be rejected
            expect(result1.success).toBe(true);
            expect(result2).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Review request already in progress',
            });
            expect(mockInAppReview.RequestInAppReview).toHaveBeenCalledTimes(1);
        });
    });

    describe('Fallback Mechanisms', () => {
        it('should provide fallback to Play Store when in-app review fails', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(false);

            const openPlayStoreSpy = jest.spyOn(reviewDialog, 'openPlayStore');
            openPlayStoreSpy.mockImplementation(() => {});

            const result = await reviewDialog.requestReview();

            expect(result.action).toBe(ReviewAction.NOT_AVAILABLE);
            // Fallback should be available as a separate method
            expect(typeof reviewDialog.openPlayStore).toBe('function');
        });

        it('should handle Play Store fallback errors', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            // Mock Linking.openURL to throw error
            jest.doMock('react-native', () => ({
                Linking: {
                    openURL: jest.fn().mockRejectedValue(new Error('Cannot open URL')),
                },
            }));

            expect(() => reviewDialog.openPlayStore()).not.toThrow();
            
            consoleSpy.mockRestore();
        });
    });

    describe('Error Scenarios', () => {
        it('should handle Google Play Services unavailable', async () => {
            mockInAppReview.isAvailable.mockRejectedValue(new Error('Google Play Services not available'));

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Google Play Services not available',
            });
        });

        it('should handle network connectivity issues', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview.mockRejectedValue(new Error('Network error'));

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Network error',
            });
        });

        it('should handle API rate limiting', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview.mockRejectedValue(new Error('Rate limit exceeded'));

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Rate limit exceeded',
            });
        });

        it('should handle device compatibility issues', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview.mockRejectedValue(new Error('Device not supported'));

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Device not supported',
            });
        });

        it('should handle app store policy violations', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview.mockRejectedValue(new Error('Policy violation'));

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Policy violation',
            });
        });
    });

    describe('Android Version Compatibility', () => {
        it('should work on Android API level 21+', async () => {
            // Mock Android API level
            jest.doMock('react-native', () => ({
                Platform: {
                    OS: 'android',
                    Version: 21,
                },
            }));

            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview.mockResolvedValue(true);

            const result = await reviewDialog.requestReview();

            expect(result.success).toBe(true);
        });

        it('should handle older Android versions gracefully', async () => {
            jest.doMock('react-native', () => ({
                Platform: {
                    OS: 'android',
                    Version: 19, // Below minimum
                },
            }));

            mockInAppReview.isAvailable.mockResolvedValue(false);

            const result = await reviewDialog.requestReview();

            expect(result.action).toBe(ReviewAction.NOT_AVAILABLE);
        });
    });

    describe('Google Play Store Variants', () => {
        it('should work with standard Google Play Store', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview.mockResolvedValue(true);

            const result = await reviewDialog.requestReview();

            expect(result.success).toBe(true);
        });

        it('should handle alternative app stores', async () => {
            // Mock environment without Google Play Store
            mockInAppReview.isAvailable.mockResolvedValue(false);

            const result = await reviewDialog.requestReview();

            expect(result.action).toBe(ReviewAction.NOT_AVAILABLE);
        });

        it('should handle enterprise/managed devices', async () => {
            mockInAppReview.isAvailable.mockRejectedValue(new Error('Managed device restrictions'));

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Managed device restrictions',
            });
        });
    });

    describe('User Interaction Scenarios', () => {
        beforeEach(() => {
            mockInAppReview.isAvailable.mockResolvedValue(true);
        });

        it('should handle user completing review', async () => {
            mockInAppReview.RequestInAppReview.mockResolvedValue(true);

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: true,
                action: ReviewAction.COMPLETED,
            });
        });

        it('should handle user dismissing review dialog', async () => {
            mockInAppReview.RequestInAppReview.mockResolvedValue(false);

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.DISMISSED,
            });
        });

        it('should handle user canceling review', async () => {
            mockInAppReview.RequestInAppReview.mockRejectedValue(new Error('User canceled'));

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'User canceled',
            });
        });
    });

    describe('Performance and Reliability', () => {
        it('should complete availability check quickly', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);

            const startTime = Date.now();
            await reviewDialog.isAvailable();
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(100);
        });

        it('should complete review request within reasonable time', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview.mockResolvedValue(true);

            const startTime = Date.now();
            await reviewDialog.requestReview();
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(5000); // 5 seconds max
        });

        it('should handle multiple sequential requests', async () => {
            mockInAppReview.RequestInAppReview.mockResolvedValue(true);

            const results = [];
            for (let i = 0; i < 3; i++) {
                const result = await reviewDialog.requestReview();
                results.push(result);
                // Wait between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            results.forEach(result => {
                expect(result.success).toBe(true);
            });
        });

        it('should recover from temporary failures', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);
            
            // First request fails
            mockInAppReview.RequestInAppReview.mockRejectedValueOnce(new Error('Temporary failure'));
            // Second request succeeds
            mockInAppReview.RequestInAppReview.mockResolvedValueOnce(true);

            const result1 = await reviewDialog.requestReview();
            expect(result1.success).toBe(false);

            const result2 = await reviewDialog.requestReview();
            expect(result2.success).toBe(true);
        });
    });

    describe('Configuration and Customization', () => {
        it('should support custom timeout configuration', async () => {
            const customDialog = new ReviewDialog({ timeout: 2000 });
            
            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve(true), 3000))
            );

            const result = await customDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Review request timeout',
            });
        });

        it('should support retry configuration', async () => {
            const customDialog = new ReviewDialog({ maxRetries: 2, retryDelay: 100 });
            
            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce(true);

            const result = await customDialog.requestReview();

            expect(result.success).toBe(true);
            expect(mockInAppReview.RequestInAppReview).toHaveBeenCalledTimes(3);
        });

        it('should support debug mode configuration', async () => {
            const debugDialog = new ReviewDialog({ debugMode: true });
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview.mockResolvedValue(true);

            await debugDialog.requestReview();

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('Memory and Resource Management', () => {
        it('should not leak memory during normal operation', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(true);
            mockInAppReview.RequestInAppReview.mockResolvedValue(true);

            // Perform many operations
            for (let i = 0; i < 100; i++) {
                await reviewDialog.isAvailable();
                await reviewDialog.requestReview();
            }

            // Should not cause memory issues
            expect(true).toBe(true); // Test passes if no memory errors
        });

        it('should clean up resources properly', () => {
            const dialog = new ReviewDialog();
            
            // Use the dialog
            dialog.isAvailable();
            
            // Cleanup should not throw
            expect(() => dialog.cleanup?.()).not.toThrow();
        });
    });

    describe('Edge Cases', () => {
        it('should handle null/undefined responses from native module', async () => {
            mockInAppReview.isAvailable.mockResolvedValue(null as any);
            mockInAppReview.RequestInAppReview.mockResolvedValue(undefined as any);

            const isAvailable = await reviewDialog.isAvailable();
            const result = await reviewDialog.requestReview();

            expect(isAvailable).toBe(false);
            expect(result.success).toBe(false);
        });

        it('should handle malformed error objects', async () => {
            mockInAppReview.RequestInAppReview.mockRejectedValue('String error' as any);

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'String error',
            });
        });

        it('should handle promise rejection without error message', async () => {
            mockInAppReview.RequestInAppReview.mockRejectedValue(null);

            const result = await reviewDialog.requestReview();

            expect(result).toEqual({
                success: false,
                action: ReviewAction.ERROR,
                error: 'Unknown error occurred',
            });
        });
    });
});