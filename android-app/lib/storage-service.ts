/**
 * StorageService implementation for in-app review system
 * Provides AsyncStorage wrapper with data serialization, error handling, and fallback mechanisms
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    StorageService,
    UserMetrics,
    ReviewSettings,
    StoredUserMetrics,
    StoredReviewSettings,
    ReviewErrorType,
    ReviewError,
    DEFAULT_USER_METRICS,
    DEFAULT_REVIEW_SETTINGS,
} from './types/review-types';
import { getAnalyticsTracker } from './analytics-tracker';
import { errorHandler } from './error-handler';
import { getCacheManager } from './cache-manager';
import { getBatchProcessor } from './batch-processor';
import { getPerformanceProfiler } from './performance-profiler';

// Storage keys
const STORAGE_KEYS = {
    USER_METRICS: '@review_user_metrics',
    REVIEW_SETTINGS: '@review_settings',
} as const;

/**
 * Implementation of StorageService using AsyncStorage
 * Handles data persistence for user metrics and review settings with error handling
 */
class AsyncStorageService implements StorageService {
    private userMetricsCache: UserMetrics | null = null;
    private reviewSettingsCache: ReviewSettings | null = null;
    private isInitialized = false;
    private analyticsTracker = getAnalyticsTracker();
    private cacheManager = getCacheManager();
    private batchProcessor = getBatchProcessor();
    private profiler = getPerformanceProfiler();

    /**
     * Initialize the storage service and load cached data
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Pre-load data into cache for better performance
            await Promise.all([
                this.getUserMetrics(),
                this.getReviewSettings(),
            ]);
            this.isInitialized = true;
        } catch (error) {
            // Log error but don't throw - service should still be usable with defaults
            const reviewError = this.createStorageError('StorageService initialization failed, using defaults', error);
            await this.handleStorageError(reviewError);
            this.isInitialized = true;
        }
    }

    /**
     * Get user metrics with fallback to defaults
     */
    async getUserMetrics(): Promise<UserMetrics> {
        return this.profiler.profileStorage('getUserMetrics', async () => {
            // Check cache first
            const cached = this.cacheManager.getCachedUserMetrics();
            if (cached) {
                this.userMetricsCache = cached;
                return cached;
            }

            // Return in-memory cache if available
            if (this.userMetricsCache) {
                this.cacheManager.cacheUserMetrics(this.userMetricsCache);
                return this.userMetricsCache;
            }

            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEYS.USER_METRICS);

                if (!stored) {
                    // No stored data, return defaults
                    this.userMetricsCache = { ...DEFAULT_USER_METRICS };
                    this.cacheManager.cacheUserMetrics(this.userMetricsCache);
                    return this.userMetricsCache;
                }

                const storedMetrics: StoredUserMetrics = JSON.parse(stored);
                const userMetrics = this.deserializeUserMetrics(storedMetrics);

                // Validate the deserialized data
                const validatedMetrics = this.validateUserMetrics(userMetrics);
                this.userMetricsCache = validatedMetrics;
                this.cacheManager.cacheUserMetrics(validatedMetrics);

                return validatedMetrics;
            } catch (error) {
                const reviewError = this.createStorageError('Failed to get user metrics', error);
                
                // Use error handler for recovery (if available)
                if (errorHandler && errorHandler.handleReviewError) {
                    const recoveryResult = await errorHandler.handleReviewError(reviewError);
                    
                    // Check for in-memory fallback
                    const fallbackData = errorHandler.getInMemoryFallback('user_metrics');
                    if (fallbackData) {
                        this.userMetricsCache = fallbackData;
                        this.cacheManager.cacheUserMetrics(fallbackData);
                        return fallbackData;
                    }
                }

                await this.handleStorageError(reviewError);

                // Return defaults as final fallback
                this.userMetricsCache = { ...DEFAULT_USER_METRICS };
                this.cacheManager.cacheUserMetrics(this.userMetricsCache);
                return this.userMetricsCache;
            }
        });
    }

    /**
     * Update user metrics with partial data
     */
    async updateUserMetrics(metrics: Partial<UserMetrics>): Promise<void> {
        // Use batch processor for non-critical updates
        const isCritical = this.isCriticalUpdate(metrics);
        
        if (!isCritical) {
            this.batchProcessor.batchUpdateUserMetrics(metrics);
            return;
        }

        // Process critical updates immediately
        return this.profiler.profileStorage('updateUserMetrics', async () => {
            try {
                // Get current metrics first
                const currentMetrics = await this.getUserMetrics();

                // Merge with new data
                const updatedMetrics: UserMetrics = {
                    ...currentMetrics,
                    ...metrics,
                };

                // Validate the updated metrics
                const validatedMetrics = this.validateUserMetrics(updatedMetrics);

                // Store in in-memory fallback first (if available)
                if (errorHandler && errorHandler.setInMemoryFallback) {
                    errorHandler.setInMemoryFallback('user_metrics', validatedMetrics);
                }

                // Serialize for storage
                const storedMetrics = this.serializeUserMetrics(validatedMetrics);

                // Store the data
                await AsyncStorage.setItem(
                    STORAGE_KEYS.USER_METRICS,
                    JSON.stringify(storedMetrics)
                );

                // Update caches
                this.userMetricsCache = validatedMetrics;
                this.cacheManager.cacheUserMetrics(validatedMetrics);
            } catch (error) {
                const reviewError = this.createStorageError('Failed to update user metrics', error);
                
                // Use error handler for recovery (if available)
                if (errorHandler && errorHandler.handleReviewError) {
                    const recoveryResult = await errorHandler.handleReviewError(reviewError);
                    
                    // If recovery succeeded, we can continue with in-memory data
                    if (!recoveryResult.success) {
                        await this.handleStorageError(reviewError);
                        throw reviewError;
                    }
                } else {
                    await this.handleStorageError(reviewError);
                    throw reviewError;
                }
            }
        });
    }

    /**
     * Get review settings with fallback to defaults
     */
    async getReviewSettings(): Promise<ReviewSettings> {
        return this.profiler.profileStorage('getReviewSettings', async () => {
            // Check cache first
            const cached = this.cacheManager.getCachedReviewSettings();
            if (cached) {
                this.reviewSettingsCache = cached;
                return cached;
            }

            // Return in-memory cache if available
            if (this.reviewSettingsCache) {
                this.cacheManager.cacheReviewSettings(this.reviewSettingsCache);
                return this.reviewSettingsCache;
            }

            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEYS.REVIEW_SETTINGS);

                if (!stored) {
                    // No stored data, return defaults
                    this.reviewSettingsCache = { ...DEFAULT_REVIEW_SETTINGS };
                    this.cacheManager.cacheReviewSettings(this.reviewSettingsCache);
                    return this.reviewSettingsCache;
                }

                const storedSettings: StoredReviewSettings = JSON.parse(stored);
                const reviewSettings = this.deserializeReviewSettings(storedSettings);

                // Validate the deserialized data
                const validatedSettings = this.validateReviewSettings(reviewSettings);
                this.reviewSettingsCache = validatedSettings;
                this.cacheManager.cacheReviewSettings(validatedSettings);

                return validatedSettings;
            } catch (error) {
                const reviewError = this.createStorageError('Failed to get review settings', error);
                
                // Use error handler for recovery (if available)
                if (errorHandler && errorHandler.handleReviewError) {
                    const recoveryResult = await errorHandler.handleReviewError(reviewError);
                    
                    // Check for in-memory fallback
                    const fallbackData = errorHandler.getInMemoryFallback('review_settings');
                    if (fallbackData) {
                        this.reviewSettingsCache = fallbackData;
                        this.cacheManager.cacheReviewSettings(fallbackData);
                        return fallbackData;
                    }
                }

                await this.handleStorageError(reviewError);

                // Return defaults as final fallback
                this.reviewSettingsCache = { ...DEFAULT_REVIEW_SETTINGS };
                this.cacheManager.cacheReviewSettings(this.reviewSettingsCache);
                return this.reviewSettingsCache;
            }
        });
    }

    /**
     * Update review settings with partial data
     */
    async updateReviewSettings(settings: Partial<ReviewSettings>): Promise<void> {
        try {
            // Get current settings first
            const currentSettings = await this.getReviewSettings();

            // Merge with new data
            const updatedSettings: ReviewSettings = {
                ...currentSettings,
                ...settings,
            };

            // Validate the updated settings
            const validatedSettings = this.validateReviewSettings(updatedSettings);

            // Store in in-memory fallback first (if available)
            if (errorHandler && errorHandler.setInMemoryFallback) {
                errorHandler.setInMemoryFallback('review_settings', validatedSettings);
            }

            // Serialize for storage
            const storedSettings = this.serializeReviewSettings(validatedSettings);

            // Store the data
            await AsyncStorage.setItem(
                STORAGE_KEYS.REVIEW_SETTINGS,
                JSON.stringify(storedSettings)
            );

            // Update cache
            this.reviewSettingsCache = validatedSettings;
        } catch (error) {
            const reviewError = this.createStorageError('Failed to update review settings', error);
            
            // Use error handler for recovery (if available)
            if (errorHandler && errorHandler.handleReviewError) {
                const recoveryResult = await errorHandler.handleReviewError(reviewError);
                
                // If recovery succeeded, we can continue with in-memory data
                if (!recoveryResult.success) {
                    await this.handleStorageError(reviewError);
                    throw reviewError;
                }
            } else {
                await this.handleStorageError(reviewError);
                throw reviewError;
            }
        }
    }

    /**
     * Clear all review-related data
     */
    async clearReviewData(): Promise<void> {
        try {
            await Promise.all([
                AsyncStorage.removeItem(STORAGE_KEYS.USER_METRICS),
                AsyncStorage.removeItem(STORAGE_KEYS.REVIEW_SETTINGS),
            ]);

            // Clear cache
            this.userMetricsCache = null;
            this.reviewSettingsCache = null;
        } catch (error) {
            const reviewError = this.createStorageError('Failed to clear review data', error);
            await this.handleStorageError(reviewError);
            throw reviewError;
        }
    }

    // ============================================================================
    // SERIALIZATION METHODS
    // ============================================================================

    /**
     * Convert UserMetrics to StoredUserMetrics for AsyncStorage
     */
    private serializeUserMetrics(metrics: UserMetrics): StoredUserMetrics {
        return {
            appOpenCount: metrics.appOpenCount,
            successfulFoodLogs: metrics.successfulFoodLogs,
            lastReviewPrompt: metrics.lastReviewPrompt?.toISOString() || null,
            lastReviewAction: metrics.lastReviewAction,
            streakDays: metrics.streakDays,
            milestonesAchieved: [...metrics.milestonesAchieved], // Create copy
            firstAppOpen: metrics.firstAppOpen.toISOString(),
            totalSessionTime: metrics.totalSessionTime,
            lastAppOpen: metrics.lastAppOpen.toISOString(),
        };
    }

    /**
     * Convert StoredUserMetrics to UserMetrics from AsyncStorage
     */
    private deserializeUserMetrics(stored: StoredUserMetrics): UserMetrics {
        const parseDate = (dateStr: string | null): Date | null => {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? null : date;
        };

        return {
            appOpenCount: stored.appOpenCount,
            successfulFoodLogs: stored.successfulFoodLogs,
            lastReviewPrompt: parseDate(stored.lastReviewPrompt),
            lastReviewAction: stored.lastReviewAction,
            streakDays: stored.streakDays,
            milestonesAchieved: Array.isArray(stored.milestonesAchieved) ? [...stored.milestonesAchieved] : [],
            firstAppOpen: parseDate(stored.firstAppOpen) || new Date(),
            totalSessionTime: stored.totalSessionTime,
            lastAppOpen: parseDate(stored.lastAppOpen) || new Date(),
        };
    }

    /**
     * Convert ReviewSettings to StoredReviewSettings for AsyncStorage
     */
    private serializeReviewSettings(settings: ReviewSettings): StoredReviewSettings {
        return {
            minimumAppOpens: settings.minimumAppOpens,
            cooldownDays: settings.cooldownDays,
            enabledTriggers: settings.enabledTriggers.map(trigger => trigger.toString()),
            debugMode: settings.debugMode,
            maxPromptsPerUser: settings.maxPromptsPerUser,
        };
    }

    /**
     * Convert StoredReviewSettings to ReviewSettings from AsyncStorage
     */
    private deserializeReviewSettings(stored: StoredReviewSettings): ReviewSettings {
        return {
            minimumAppOpens: stored.minimumAppOpens,
            cooldownDays: stored.cooldownDays,
            enabledTriggers: stored.enabledTriggers as any[], // Type assertion for enum values
            debugMode: stored.debugMode,
            maxPromptsPerUser: stored.maxPromptsPerUser,
        };
    }

    // ============================================================================
    // VALIDATION METHODS
    // ============================================================================

    /**
     * Validate and sanitize user metrics data
     */
    private validateUserMetrics(metrics: UserMetrics): UserMetrics {
        const validated: UserMetrics = {
            appOpenCount: Math.max(0, Math.floor(Number(metrics.appOpenCount) || 0)),
            successfulFoodLogs: Math.max(0, Math.floor(Number(metrics.successfulFoodLogs) || 0)),
            lastReviewPrompt: metrics.lastReviewPrompt instanceof Date ? metrics.lastReviewPrompt : null,
            lastReviewAction: metrics.lastReviewAction || null,
            streakDays: Math.max(0, Math.floor(Number(metrics.streakDays) || 0)),
            milestonesAchieved: Array.isArray(metrics.milestonesAchieved) ? [...metrics.milestonesAchieved] : [],
            firstAppOpen: metrics.firstAppOpen instanceof Date ? metrics.firstAppOpen : new Date(),
            totalSessionTime: Math.max(0, Math.floor(Number(metrics.totalSessionTime) || 0)),
            lastAppOpen: metrics.lastAppOpen instanceof Date ? metrics.lastAppOpen : new Date(),
        };

        return validated;
    }

    /**
     * Validate and sanitize review settings data
     */
    private validateReviewSettings(settings: ReviewSettings): ReviewSettings {
        const validated: ReviewSettings = {
            minimumAppOpens: Math.max(1, Math.floor(Number(settings.minimumAppOpens) || DEFAULT_REVIEW_SETTINGS.minimumAppOpens)),
            cooldownDays: Math.max(1, Math.floor(Number(settings.cooldownDays) || DEFAULT_REVIEW_SETTINGS.cooldownDays)),
            enabledTriggers: Array.isArray(settings.enabledTriggers) ? settings.enabledTriggers : DEFAULT_REVIEW_SETTINGS.enabledTriggers,
            debugMode: Boolean(settings.debugMode),
            maxPromptsPerUser: Math.max(1, Math.floor(Number(settings.maxPromptsPerUser) || DEFAULT_REVIEW_SETTINGS.maxPromptsPerUser)),
        };

        return validated;
    }

    // ============================================================================
    // ERROR HANDLING METHODS
    // ============================================================================

    /**
     * Create a standardized storage error
     */
    private createStorageError(message: string, originalError: any): ReviewError {
        return {
            type: ReviewErrorType.STORAGE_ERROR,
            message,
            originalError: originalError instanceof Error ? originalError : new Error(String(originalError)),
            timestamp: new Date(),
        };
    }

    /**
     * Handle storage errors with logging and recovery
     */
    private async handleStorageError(error: ReviewError): Promise<void> {
        // Log the error for debugging
        console.error('StorageService Error:', {
            type: error.type,
            message: error.message,
            timestamp: error.timestamp,
            originalError: error.originalError?.message,
        });

        // In a production app, you might want to send this to analytics
        // For now, we just log it
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Check if storage is available and working
     */
    async isStorageAvailable(): Promise<boolean> {
        try {
            const testKey = '@storage_test';
            const testValue = 'test';

            await AsyncStorage.setItem(testKey, testValue);
            const retrieved = await AsyncStorage.getItem(testKey);
            await AsyncStorage.removeItem(testKey);

            return retrieved === testValue;
        } catch {
            return false;
        }
    }

    /**
     * Get storage usage information (for debugging)
     */
    async getStorageInfo(): Promise<{ userMetricsSize: number; reviewSettingsSize: number }> {
        try {
            const [userMetrics, reviewSettings] = await Promise.all([
                AsyncStorage.getItem(STORAGE_KEYS.USER_METRICS),
                AsyncStorage.getItem(STORAGE_KEYS.REVIEW_SETTINGS),
            ]);

            return {
                userMetricsSize: userMetrics ? userMetrics.length : 0,
                reviewSettingsSize: reviewSettings ? reviewSettings.length : 0,
            };
        } catch {
            return { userMetricsSize: 0, reviewSettingsSize: 0 };
        }
    }

    /**
     * Clear cache (useful for testing)
     */
    clearCache(): void {
        this.userMetricsCache = null;
        this.reviewSettingsCache = null;
        this.cacheManager.clear();
    }

    /**
     * Determine if a metrics update is critical and needs immediate processing
     */
    private isCriticalUpdate(metrics: Partial<UserMetrics>): boolean {
        // Critical updates that need immediate processing
        const criticalFields = ['lastReviewPrompt', 'lastReviewAction'];
        return criticalFields.some(field => field in metrics);
    }
}

// Export a singleton instance
export const storageService = new AsyncStorageService();

// Export the class for testing
export { AsyncStorageService };