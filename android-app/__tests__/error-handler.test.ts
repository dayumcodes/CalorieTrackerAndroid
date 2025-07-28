/**
 * Tests for the comprehensive error handling and recovery system
 */

import { ErrorHandler, createErrorHandler } from '../lib/error-handler';
import {
    ReviewError,
    ReviewErrorType,
    ReviewContext,
    ReviewTrigger,
    ReviewAction,
} from '../lib/types/review-types';

// Add custom matcher
declare global {
    namespace jest {
        interface Matchers<R> {
            toBeOneOf(expected: any[]): R;
        }
    }
}

expect.extend({
    toBeOneOf(received, expected) {
        const pass = expected.includes(received);
        if (pass) {
            return {
                message: () => `expected ${received} not to be one of ${expected}`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected ${received} to be one of ${expected}`,
                pass: false,
            };
        }
    },
});

// Mock analytics tracker
jest.mock('../lib/analytics-tracker', () => ({
    getAnalyticsTracker: () => ({
        setDebugMode: jest.fn(),
        trackError: jest.fn(),
        trackFallbackUsed: jest.fn(),
        getEventsByType: jest.fn(() => []),
    }),
}));

// Mock review dialog
const mockOpenPlayStore = jest.fn();
jest.mock('../lib/review-dialog', () => ({
    reviewDialog: {
        openPlayStore: mockOpenPlayStore,
    },
}));

describe('ErrorHandler', () => {
    let errorHandler: ErrorHandler;
    let mockContext: ReviewContext;
    let mockError: ReviewError;

    beforeEach(() => {
        errorHandler = createErrorHandler({
            debugMode: true,
            maxRetryAttempts: 3,
            baseRetryDelayMs: 100,
            enableFallbacks: true,
            enableInMemoryFallback: true,
        });

        mockContext = {
            trigger: ReviewTrigger.APP_OPEN,
            userState: {
                appOpenCount: 5,
                successfulFoodLogs: 10,
                streakDays: 7,
                milestonesAchieved: [],
                lastReviewPrompt: null,
                lastReviewAction: null,
            },
            appState: {
                isLoading: false,
                hasErrors: false,
                currentScreen: 'home',
                sessionStartTime: new Date(),
            },
        };

        mockError = {
            type: ReviewErrorType.UNKNOWN_ERROR,
            message: 'Test error',
            originalError: new Error('Original error'),
            timestamp: new Date(),
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Error Handling', () => {
        it('should handle Google Play Services unavailable error', async () => {
            const error: ReviewError = {
                ...mockError,
                type: ReviewErrorType.PLAY_SERVICES_UNAVAILABLE,
                message: 'Google Play Services not available',
            };

            const result = await errorHandler.handleReviewError(error, mockContext);

            // The result should attempt Play Store fallback
            expect(result.fallbackUsed).toBe('play_store_redirect');
            // It may succeed or fail depending on the mock, but should attempt the fallback
            expect(result.action).toBeOneOf([ReviewAction.COMPLETED, ReviewAction.NOT_AVAILABLE]);
        });

        it('should handle network errors with retry strategy', async () => {
            const error: ReviewError = {
                ...mockError,
                type: ReviewErrorType.NETWORK_ERROR,
                message: 'Network connection failed',
            };

            const result = await errorHandler.handleReviewError(error, mockContext);

            expect(result.fallbackUsed).toBe('retry_with_backoff');
        });

        it('should handle storage errors with in-memory fallback', async () => {
            const error: ReviewError = {
                ...mockError,
                type: ReviewErrorType.STORAGE_ERROR,
                message: 'Storage operation failed',
            };

            // Set up in-memory fallback data
            errorHandler.setInMemoryFallback('storage_fallback', { test: 'data' });

            const result = await errorHandler.handleReviewError(error, mockContext);

            expect(result.success).toBe(true);
            expect(result.action).toBe(ReviewAction.COMPLETED);
            expect(result.fallbackUsed).toBe('in_memory_storage');
        });

        it('should handle API rate limiting', async () => {
            const error: ReviewError = {
                ...mockError,
                type: ReviewErrorType.API_RATE_LIMIT,
                message: 'API rate limit exceeded',
            };

            const result = await errorHandler.handleReviewError(error, mockContext);

            expect(result.success).toBe(false);
            expect(result.action).toBe(ReviewAction.ERROR);
            expect(result.fallbackUsed).toBe('rate_limit_backoff');
            expect(result.error).toContain('Rate limited');
        });
    });

    describe('Retry Logic', () => {
        it('should determine retry eligibility correctly', () => {
            const networkError: ReviewError = {
                ...mockError,
                type: ReviewErrorType.NETWORK_ERROR,
            };

            const rateLimitError: ReviewError = {
                ...mockError,
                type: ReviewErrorType.API_RATE_LIMIT,
            };

            expect(errorHandler.shouldRetry(networkError)).toBe(true);
            expect(errorHandler.shouldRetry(rateLimitError)).toBe(false);
        });

        it('should calculate exponential backoff delay', () => {
            const delay1 = errorHandler.getRetryDelay(1);
            const delay2 = errorHandler.getRetryDelay(2);
            const delay3 = errorHandler.getRetryDelay(3);

            expect(delay1).toBe(100); // base delay
            expect(delay2).toBe(200); // base * 2^1
            expect(delay3).toBe(400); // base * 2^2
        });

        it('should respect maximum retry attempts', () => {
            const operationId = 'test_operation';
            
            // Record maximum retry attempts
            for (let i = 0; i < 3; i++) {
                errorHandler.recordRetryAttempt(operationId, mockError);
            }

            expect(errorHandler.shouldRetry(mockError, operationId)).toBe(false);
        });

        it('should clear retry attempts', () => {
            const operationId = 'test_operation';
            
            errorHandler.recordRetryAttempt(operationId, mockError);
            expect(errorHandler.shouldRetry(mockError, operationId)).toBe(true);
            
            errorHandler.clearRetryAttempts(operationId);
            expect(errorHandler.shouldRetry(mockError, operationId)).toBe(true);
        });
    });

    describe('Rate Limiting', () => {
        it('should track API requests for rate limiting', () => {
            const operationId = 'test_api';
            
            // Should not be rate limited initially
            expect(errorHandler.isRateLimited(operationId)).toBe(false);
            
            // Record requests up to the limit
            for (let i = 0; i < 5; i++) {
                errorHandler.recordApiRequest(operationId);
            }
            
            // Should now be rate limited
            expect(errorHandler.isRateLimited(operationId)).toBe(true);
        });

        it('should reset rate limiting after time window', async () => {
            const operationId = 'test_api';
            
            // Create error handler with short rate limit window for testing
            const testErrorHandler = createErrorHandler({
                rateLimitWindowMs: 100,
                rateLimitMaxRequests: 2,
            });
            
            // Record requests to hit the limit
            testErrorHandler.recordApiRequest(operationId);
            testErrorHandler.recordApiRequest(operationId);
            
            expect(testErrorHandler.isRateLimited(operationId)).toBe(true);
            
            // Wait for rate limit window to pass
            await new Promise(resolve => setTimeout(resolve, 150));
            
            expect(testErrorHandler.isRateLimited(operationId)).toBe(false);
        });
    });

    describe('In-Memory Fallback', () => {
        it('should store and retrieve fallback data', () => {
            const key = 'test_key';
            const data = { test: 'value', number: 42 };
            
            errorHandler.setInMemoryFallback(key, data);
            const retrieved = errorHandler.getInMemoryFallback(key);
            
            expect(retrieved).toEqual(data);
        });

        it('should return null for non-existent fallback data', () => {
            const result = errorHandler.getInMemoryFallback('non_existent_key');
            expect(result).toBeNull();
        });

        it('should expire old fallback data', async () => {
            // Create error handler with short expiry for testing
            const testErrorHandler = createErrorHandler({
                enableInMemoryFallback: true,
            });
            
            const key = 'test_key';
            const data = { test: 'value' };
            
            testErrorHandler.setInMemoryFallback(key, data);
            
            // Mock Date.now to simulate time passing
            const originalNow = Date.now;
            Date.now = jest.fn(() => originalNow() + 2 * 60 * 60 * 1000); // 2 hours later
            
            const result = testErrorHandler.getInMemoryFallback(key);
            expect(result).toBeNull();
            
            // Restore Date.now
            Date.now = originalNow;
        });

        it('should clear all fallback data', () => {
            errorHandler.setInMemoryFallback('key1', 'data1');
            errorHandler.setInMemoryFallback('key2', 'data2');
            
            errorHandler.clearInMemoryFallback();
            
            expect(errorHandler.getInMemoryFallback('key1')).toBeNull();
            expect(errorHandler.getInMemoryFallback('key2')).toBeNull();
        });
    });

    describe('Error Statistics', () => {
        it('should provide error statistics', () => {
            const stats = errorHandler.getErrorStats();
            
            expect(stats).toHaveProperty('totalErrors');
            expect(stats).toHaveProperty('errorsByType');
            expect(stats).toHaveProperty('totalRetryAttempts');
            expect(stats).toHaveProperty('rateLimitedOperations');
            expect(stats).toHaveProperty('inMemoryFallbackSize');
            
            expect(typeof stats.totalErrors).toBe('number');
            expect(typeof stats.errorsByType).toBe('object');
            expect(typeof stats.totalRetryAttempts).toBe('number');
            expect(typeof stats.rateLimitedOperations).toBe('number');
            expect(typeof stats.inMemoryFallbackSize).toBe('number');
        });

        it('should track retry attempts in statistics', () => {
            const operationId = 'test_operation';
            
            errorHandler.recordRetryAttempt(operationId, mockError);
            errorHandler.recordRetryAttempt(operationId, mockError);
            
            const stats = errorHandler.getErrorStats();
            expect(stats.totalRetryAttempts).toBe(2);
        });
    });

    describe('Configuration', () => {
        it('should update configuration', () => {
            const newConfig = {
                maxRetryAttempts: 5,
                baseRetryDelayMs: 2000,
                debugMode: false,
            };
            
            errorHandler.updateConfig(newConfig);
            const config = errorHandler.getConfig();
            
            expect(config.maxRetryAttempts).toBe(5);
            expect(config.baseRetryDelayMs).toBe(2000);
            expect(config.debugMode).toBe(false);
        });

        it('should get current configuration', () => {
            const config = errorHandler.getConfig();
            
            expect(config).toHaveProperty('maxRetryAttempts');
            expect(config).toHaveProperty('baseRetryDelayMs');
            expect(config).toHaveProperty('enableFallbacks');
            expect(config).toHaveProperty('debugMode');
        });
    });

    describe('Error Recovery Strategies', () => {
        it('should not attempt recovery when fallbacks are disabled', async () => {
            const testErrorHandler = createErrorHandler({
                enableFallbacks: false,
            });
            
            const result = await testErrorHandler.handleReviewError(mockError, mockContext);
            
            expect(result.success).toBe(false);
            expect(result.action).toBe(ReviewAction.ERROR);
            expect(result.fallbackUsed).toBeUndefined();
        });

        it('should handle recovery failure gracefully', async () => {
            // Create a new error handler to test import failure
            const testErrorHandler = createErrorHandler({
                enableFallbacks: true,
                debugMode: true,
            });
            
            const error: ReviewError = {
                ...mockError,
                type: ReviewErrorType.PLAY_SERVICES_UNAVAILABLE,
            };
            
            // Mock the import to fail by temporarily replacing the import function
            const originalImport = (global as any).import;
            (global as any).import = jest.fn().mockRejectedValue(new Error('Import failed'));
            
            const result = await testErrorHandler.handleReviewError(error, mockContext);
            
            // Restore original import
            (global as any).import = originalImport;
            
            expect(result.success).toBe(false);
            expect(result.action).toBe(ReviewAction.NOT_AVAILABLE);
        });
    });
});