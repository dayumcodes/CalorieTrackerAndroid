/**
 * Configuration Manager for in-app review system
 * 
 * Provides centralized configuration management with runtime updates,
 * development mode overrides, and admin/debug interface capabilities.
 */

import {
    ReviewConfig,
    ReviewSettings,
    ReviewTrigger,
    DEFAULT_REVIEW_CONFIG,
    DEFAULT_REVIEW_SETTINGS,
    ReviewErrorType,
    ReviewError,
} from './types/review-types';
import { storageService } from './storage-service';
import { getAnalyticsTracker } from './analytics-tracker';

/**
 * Configuration change event listener
 */
export type ConfigChangeListener = (config: ReviewConfig) => void;

/**
 * Development mode override settings
 */
export interface DevModeOverrides {
    forceShowReview?: boolean;
    skipCooldownPeriod?: boolean;
    minimumAppOpens?: number;
    customTriggerThresholds?: Partial<ReviewConfig['triggers']>;
    enableVerboseLogging?: boolean;
    simulateErrors?: boolean;
}

/**
 * Admin interface data for debugging
 */
export interface AdminDebugInfo {
    currentConfig: ReviewConfig;
    activeOverrides: DevModeOverrides | null;
    configHistory: ConfigHistoryEntry[];
    systemStatus: SystemStatus;
    performanceMetrics: PerformanceMetrics;
}

/**
 * Configuration history entry
 */
interface ConfigHistoryEntry {
    timestamp: Date;
    changes: Partial<ReviewConfig>;
    source: 'user' | 'dev_override' | 'system' | 'reset';
    reason?: string;
}

/**
 * System status information
 */
interface SystemStatus {
    isInitialized: boolean;
    lastConfigUpdate: Date | null;
    configVersion: number;
    hasActiveOverrides: boolean;
    storageAvailable: boolean;
}

/**
 * Performance metrics for configuration operations
 */
interface PerformanceMetrics {
    configLoadTime: number;
    configSaveTime: number;
    totalConfigUpdates: number;
    averageUpdateTime: number;
}

/**
 * Configuration Manager implementation
 */
export class ConfigManager {
    private currentConfig: ReviewConfig;
    private devModeOverrides: DevModeOverrides | null = null;
    private configHistory: ConfigHistoryEntry[] = [];
    private changeListeners: ConfigChangeListener[] = [];
    private isInitialized = false;
    private configVersion = 1;
    private lastConfigUpdate: Date | null = null;
    private performanceMetrics: PerformanceMetrics = {
        configLoadTime: 0,
        configSaveTime: 0,
        totalConfigUpdates: 0,
        averageUpdateTime: 0,
    };
    private analyticsTracker = getAnalyticsTracker();

    constructor() {
        this.currentConfig = { ...DEFAULT_REVIEW_CONFIG };
    }

    /**
     * Initialize the configuration manager
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            const startTime = Date.now();

            // Load configuration from storage
            await this.loadConfiguration();

            this.performanceMetrics.configLoadTime = Date.now() - startTime;
            this.isInitialized = true;

            this.analyticsTracker.trackConfigEvent('initialized', {
                loadTime: this.performanceMetrics.configLoadTime,
                configVersion: this.configVersion,
            });

            console.log('ConfigManager: Initialized successfully');
        } catch (error) {
            const reviewError = this.createConfigError('Failed to initialize ConfigManager', error);
            this.analyticsTracker.trackError(reviewError);
            throw reviewError;
        }
    }

    /**
     * Get current configuration with any active overrides applied
     */
    getConfig(): ReviewConfig {
        return this.applyDevModeOverrides(this.currentConfig);
    }

    /**
     * Get raw configuration without overrides
     */
    getRawConfig(): ReviewConfig {
        return { ...this.currentConfig };
    }

    /**
     * Update configuration with partial changes
     */
    async updateConfig(
        changes: Partial<ReviewConfig>,
        source: 'user' | 'system' = 'user',
        reason?: string
    ): Promise<void> {
        await this.ensureInitialized();

        const startTime = Date.now();

        try {
            // Validate changes
            const validatedChanges = this.validateConfigChanges(changes);

            // Create new configuration
            const newConfig: ReviewConfig = {
                ...this.currentConfig,
                ...validatedChanges,
            };

            // Save to storage
            await this.saveConfiguration(newConfig);

            // Update internal state
            const oldConfig = this.currentConfig;
            this.currentConfig = newConfig;
            this.configVersion++;
            this.lastConfigUpdate = new Date();

            // Record in history
            this.addToHistory(validatedChanges, source, reason);

            // Update performance metrics
            const updateTime = Date.now() - startTime;
            this.updatePerformanceMetrics(updateTime);

            // Notify listeners
            this.notifyConfigChange(this.getConfig());

            // Track analytics
            this.analyticsTracker.trackConfigEvent('updated', {
                changes: validatedChanges,
                source,
                reason,
                updateTime,
                configVersion: this.configVersion,
            });

            console.log('ConfigManager: Configuration updated', {
                changes: validatedChanges,
                source,
                configVersion: this.configVersion,
            });

        } catch (error) {
            const reviewError = this.createConfigError('Failed to update configuration', error);
            this.analyticsTracker.trackError(reviewError);
            throw reviewError;
        }
    }

    /**
     * Reset configuration to defaults
     */
    async resetToDefaults(reason?: string): Promise<void> {
        await this.updateConfig(DEFAULT_REVIEW_CONFIG, 'system', reason || 'Reset to defaults');
    }

    /**
     * Apply development mode overrides
     */
    setDevModeOverrides(overrides: DevModeOverrides | null): void {
        const oldOverrides = this.devModeOverrides;
        this.devModeOverrides = overrides;

        // Track override changes
        this.analyticsTracker.trackConfigEvent('dev_overrides_changed', {
            oldOverrides,
            newOverrides: overrides,
            hasOverrides: overrides !== null,
        });

        // Notify listeners of effective config change
        this.notifyConfigChange(this.getConfig());

        console.log('ConfigManager: Dev mode overrides updated', {
            overrides,
            hasOverrides: overrides !== null,
        });
    }

    /**
     * Get current development mode overrides
     */
    getDevModeOverrides(): DevModeOverrides | null {
        return this.devModeOverrides ? { ...this.devModeOverrides } : null;
    }

    /**
     * Clear all development mode overrides
     */
    clearDevModeOverrides(): void {
        this.setDevModeOverrides(null);
    }

    /**
     * Add configuration change listener
     */
    addConfigChangeListener(listener: ConfigChangeListener): void {
        this.changeListeners.push(listener);
    }

    /**
     * Remove configuration change listener
     */
    removeConfigChangeListener(listener: ConfigChangeListener): void {
        const index = this.changeListeners.indexOf(listener);
        if (index > -1) {
            this.changeListeners.splice(index, 1);
        }
    }

    /**
     * Get admin/debug information
     */
    async getAdminDebugInfo(): Promise<AdminDebugInfo> {
        await this.ensureInitialized();

        const systemStatus: SystemStatus = {
            isInitialized: this.isInitialized,
            lastConfigUpdate: this.lastConfigUpdate,
            configVersion: this.configVersion,
            hasActiveOverrides: this.devModeOverrides !== null,
            storageAvailable: await storageService.isStorageAvailable(),
        };

        return {
            currentConfig: this.getConfig(),
            activeOverrides: this.getDevModeOverrides(),
            configHistory: [...this.configHistory],
            systemStatus,
            performanceMetrics: { ...this.performanceMetrics },
        };
    }

    /**
     * Export configuration for backup or sharing
     */
    exportConfiguration(): {
        config: ReviewConfig;
        metadata: {
            version: number;
            exportDate: Date;
            configHistory: ConfigHistoryEntry[];
        };
    } {
        return {
            config: this.getRawConfig(),
            metadata: {
                version: this.configVersion,
                exportDate: new Date(),
                configHistory: [...this.configHistory],
            },
        };
    }

    /**
     * Import configuration from backup
     */
    async importConfiguration(
        importData: {
            config: ReviewConfig;
            metadata?: any;
        },
        reason?: string
    ): Promise<void> {
        await this.updateConfig(
            importData.config,
            'system',
            reason || 'Configuration imported'
        );
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Ensure the manager is initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    /**
     * Load configuration from storage
     */
    private async loadConfiguration(): Promise<void> {
        try {
            // Load review settings from storage service
            const reviewSettings = await storageService.getReviewSettings();

            // Convert ReviewSettings to ReviewConfig format
            this.currentConfig = this.convertSettingsToConfig(reviewSettings);

            console.log('ConfigManager: Configuration loaded from storage');
        } catch (error) {
            console.warn('ConfigManager: Failed to load configuration, using defaults', error);
            this.currentConfig = { ...DEFAULT_REVIEW_CONFIG };
            // Re-throw error to be handled by initialize()
            throw error;
        }
    }

    /**
     * Save configuration to storage
     */
    private async saveConfiguration(config: ReviewConfig): Promise<void> {
        const startTime = Date.now();

        try {
            // Convert ReviewConfig to ReviewSettings format for storage
            const reviewSettings = this.convertConfigToSettings(config);

            // Save to storage service
            await storageService.updateReviewSettings(reviewSettings);

            this.performanceMetrics.configSaveTime = Date.now() - startTime;

            console.log('ConfigManager: Configuration saved to storage');
        } catch (error) {
            throw this.createConfigError('Failed to save configuration to storage', error);
        }
    }

    /**
     * Convert ReviewSettings to ReviewConfig format
     */
    private convertSettingsToConfig(settings: ReviewSettings): ReviewConfig {
        return {
            triggers: {
                [ReviewTrigger.APP_OPEN]: {
                    minimumCount: settings.minimumAppOpens,
                    enabled: settings.enabledTriggers.includes(ReviewTrigger.APP_OPEN),
                },
                [ReviewTrigger.SUCCESSFUL_FOOD_LOG]: {
                    minimumCount: 10, // Default value
                    enabled: settings.enabledTriggers.includes(ReviewTrigger.SUCCESSFUL_FOOD_LOG),
                },
                [ReviewTrigger.MILESTONE_ACHIEVED]: {
                    milestones: ['7_day_streak', '30_day_streak', 'first_goal_completed'],
                    enabled: settings.enabledTriggers.includes(ReviewTrigger.MILESTONE_ACHIEVED),
                },
                [ReviewTrigger.STREAK_MILESTONE]: {
                    streakDays: [7, 14, 30, 60, 90],
                    enabled: settings.enabledTriggers.includes(ReviewTrigger.STREAK_MILESTONE),
                },
                [ReviewTrigger.GOAL_COMPLETED]: {
                    enabled: settings.enabledTriggers.includes(ReviewTrigger.GOAL_COMPLETED),
                },
            },
            cooldownPeriod: settings.cooldownDays,
            maxPromptsPerUser: settings.maxPromptsPerUser,
            debugMode: settings.debugMode,
        };
    }

    /**
     * Convert ReviewConfig to ReviewSettings format
     */
    private convertConfigToSettings(config: ReviewConfig): ReviewSettings {
        const enabledTriggers: ReviewTrigger[] = [];

        Object.entries(config.triggers).forEach(([trigger, settings]) => {
            if (settings.enabled) {
                enabledTriggers.push(trigger as ReviewTrigger);
            }
        });

        return {
            minimumAppOpens: config.triggers[ReviewTrigger.APP_OPEN].minimumCount,
            cooldownDays: config.cooldownPeriod,
            enabledTriggers,
            debugMode: config.debugMode,
            maxPromptsPerUser: config.maxPromptsPerUser,
        };
    }

    /**
     * Apply development mode overrides to configuration
     */
    private applyDevModeOverrides(baseConfig: ReviewConfig): ReviewConfig {
        if (!this.devModeOverrides) {
            return baseConfig;
        }

        // Use any to avoid complex union type issues
        const overriddenConfig: any = { ...baseConfig };

        // Apply debug mode override
        if (this.devModeOverrides.enableVerboseLogging !== undefined) {
            overriddenConfig.debugMode = this.devModeOverrides.enableVerboseLogging;
        }

        // Apply minimum app opens override
        if (this.devModeOverrides.minimumAppOpens !== undefined) {
            overriddenConfig.triggers[ReviewTrigger.APP_OPEN].minimumCount =
                this.devModeOverrides.minimumAppOpens;
        }

        // Apply custom trigger thresholds
        if (this.devModeOverrides.customTriggerThresholds) {
            Object.entries(this.devModeOverrides.customTriggerThresholds).forEach(([trigger, settings]) => {
                if (settings) {
                    const triggerKey = trigger as ReviewTrigger;
                    const currentTrigger = overriddenConfig.triggers[triggerKey];
                    // @ts-ignore
                    overriddenConfig.triggers[triggerKey] = {
                        ...currentTrigger,
                        ...settings,
                    };
                }
            });
        }

        // Apply cooldown override (skip cooldown = set to 0)
        if (this.devModeOverrides.skipCooldownPeriod) {
            overriddenConfig.cooldownPeriod = 0;
        }

        return overriddenConfig as ReviewConfig;
    }

    /**
     * Validate configuration changes
     */
    private validateConfigChanges(changes: Partial<ReviewConfig>): Partial<ReviewConfig> {
        const validated: any = {}; // Use any to avoid complex union type issues

        // Validate cooldown period
        if (changes.cooldownPeriod !== undefined) {
            const cooldown = Number(changes.cooldownPeriod);
            validated.cooldownPeriod = isNaN(cooldown) ? 0 : Math.max(0, Math.floor(cooldown));
        }

        // Validate max prompts per user
        if (changes.maxPromptsPerUser !== undefined) {
            const maxPrompts = Number(changes.maxPromptsPerUser);
            validated.maxPromptsPerUser = isNaN(maxPrompts) ? 1 : Math.max(1, Math.floor(maxPrompts));
        }

        // Validate debug mode
        if (changes.debugMode !== undefined) {
            validated.debugMode = Boolean(changes.debugMode);
        }

        // Validate triggers
        if (changes.triggers && typeof changes.triggers === 'object') {
            // @ts-ignore
            validated.triggers = {};

            Object.entries(changes.triggers).forEach(([trigger, settings]) => {
                if (settings && typeof settings === 'object') {
                    const triggerKey = trigger as keyof ReviewConfig['triggers'];
                    // @ts-ignore
                    validated.triggers[triggerKey] = { ...settings };

                    // Validate specific trigger settings based on trigger type
                    const validatedTrigger = validated.triggers[triggerKey];

                    if ('minimumCount' in settings && settings.minimumCount !== undefined) {
                        const count = Number(settings.minimumCount);
                        // @ts-ignore
                        validatedTrigger.minimumCount = isNaN(count) ? 1 : Math.max(1, Math.floor(count));
                    }

                    if ('enabled' in settings && settings.enabled !== undefined) {
                        // @ts-ignore
                        validatedTrigger.enabled = Boolean(settings.enabled);
                    }

                    if ('milestones' in settings && settings.milestones !== undefined) {
                        // @ts-ignore
                        validatedTrigger.milestones =
                            Array.isArray(settings.milestones) ? [...settings.milestones] : [];
                    }

                    if ('streakDays' in settings && settings.streakDays !== undefined) {
                        // @ts-ignore
                        validatedTrigger.streakDays =
                            Array.isArray(settings.streakDays) ?
                                settings.streakDays.filter(day => Number.isInteger(day) && day > 0) : [];
                    }
                }
            });
        }

        return validated as Partial<ReviewConfig>;
    }

    /**
     * Add entry to configuration history
     */
    private addToHistory(
        changes: Partial<ReviewConfig>,
        source: 'user' | 'dev_override' | 'system' | 'reset',
        reason?: string
    ): void {
        const entry: ConfigHistoryEntry = {
            timestamp: new Date(),
            changes,
            source,
            reason,
        };

        this.configHistory.push(entry);

        // Keep only last 50 entries to prevent memory issues
        if (this.configHistory.length > 50) {
            this.configHistory = this.configHistory.slice(-50);
        }
    }

    /**
     * Update performance metrics
     */
    private updatePerformanceMetrics(updateTime: number): void {
        this.performanceMetrics.totalConfigUpdates++;
        this.performanceMetrics.averageUpdateTime =
            (this.performanceMetrics.averageUpdateTime * (this.performanceMetrics.totalConfigUpdates - 1) + updateTime) /
            this.performanceMetrics.totalConfigUpdates;
    }

    /**
     * Notify all listeners of configuration change
     */
    private notifyConfigChange(config: ReviewConfig): void {
        this.changeListeners.forEach(listener => {
            try {
                listener(config);
            } catch (error) {
                console.error('ConfigManager: Error in config change listener:', error);
            }
        });
    }

    /**
     * Create a standardized configuration error
     */
    private createConfigError(message: string, originalError?: any): ReviewError {
        return {
            type: ReviewErrorType.UNKNOWN_ERROR,
            message: `ConfigManager: ${message}`,
            originalError: originalError instanceof Error ? originalError : new Error(String(originalError)),
            timestamp: new Date(),
        };
    }
}

// Export singleton instance
export const configManager = new ConfigManager();