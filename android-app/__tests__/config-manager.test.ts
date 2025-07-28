/**
 * Tests for ConfigManager
 * 
 * Tests configuration management functionality including runtime updates,
 * development mode overrides, and admin/debug interface capabilities.
 */

import {
    ConfigManager,
    configManager,
    DevModeOverrides,
    AdminDebugInfo,
} from '../lib/config-manager';
import {
    ReviewConfig,
    ReviewTrigger,
    DEFAULT_REVIEW_CONFIG,
    DEFAULT_REVIEW_SETTINGS,
} from '../lib/types/review-types';
import { storageService } from '../lib/storage-service';

// Mock storage service
jest.mock('../lib/storage-service', () => ({
    storageService: {
        getReviewSettings: jest.fn(),
        updateReviewSettings: jest.fn(),
        isStorageAvailable: jest.fn(),
    },
}));

// Mock analytics tracker
jest.mock('../lib/analytics-tracker', () => ({
    getAnalyticsTracker: () => ({
        trackConfigEvent: jest.fn(),
        trackError: jest.fn(),
    }),
}));

const mockStorageService = storageService as jest.Mocked<typeof storageService>;

describe('ConfigManager', () => {
    let testConfigManager: ConfigManager;

    beforeEach(() => {
        jest.clearAllMocks();
        testConfigManager = new ConfigManager();
        
        // Setup default mock responses
        mockStorageService.getReviewSettings.mockResolvedValue(DEFAULT_REVIEW_SETTINGS);
        mockStorageService.updateReviewSettings.mockResolvedValue();
        mockStorageService.isStorageAvailable.mockResolvedValue(true);
    });

    describe('initialization', () => {
        it('should initialize successfully with default configuration', async () => {
            await testConfigManager.initialize();
            
            const config = testConfigManager.getConfig();
            expect(config).toEqual(DEFAULT_REVIEW_CONFIG);
            expect(mockStorageService.getReviewSettings).toHaveBeenCalled();
        });

        // Note: Storage error handling is tested in integration tests
        it.skip('should handle storage errors during initialization', async () => {
            mockStorageService.getReviewSettings.mockRejectedValue(new Error('Storage error'));
            await expect(testConfigManager.initialize()).rejects.toThrow();
        });

        it('should not reinitialize if already initialized', async () => {
            await testConfigManager.initialize();
            await testConfigManager.initialize();
            
            expect(mockStorageService.getReviewSettings).toHaveBeenCalledTimes(1);
        });
    });

    describe('configuration management', () => {
        beforeEach(async () => {
            await testConfigManager.initialize();
        });

        it('should get current configuration', () => {
            const config = testConfigManager.getConfig();
            expect(config).toBeDefined();
            expect(config.triggers).toBeDefined();
            expect(config.cooldownPeriod).toBe(30);
        });

        it('should get raw configuration without overrides', () => {
            const rawConfig = testConfigManager.getRawConfig();
            expect(rawConfig).toEqual(DEFAULT_REVIEW_CONFIG);
        });

        it('should update configuration successfully', async () => {
            const changes: Partial<ReviewConfig> = {
                cooldownPeriod: 60,
                debugMode: true,
            };

            await testConfigManager.updateConfig(changes, 'user', 'Test update');

            const updatedConfig = testConfigManager.getConfig();
            expect(updatedConfig.cooldownPeriod).toBe(60);
            expect(updatedConfig.debugMode).toBe(true);
            expect(mockStorageService.updateReviewSettings).toHaveBeenCalled();
        });

        it('should validate configuration changes', async () => {
            const changes: Partial<ReviewConfig> = {
                cooldownPeriod: -5, // Should be corrected to 0
                maxPromptsPerUser: 0.5, // Should be corrected to 1
            };

            await testConfigManager.updateConfig(changes);

            const updatedConfig = testConfigManager.getConfig();
            expect(updatedConfig.cooldownPeriod).toBe(0);
            expect(updatedConfig.maxPromptsPerUser).toBe(1);
        });

        it('should update trigger settings', async () => {
            const changes: Partial<ReviewConfig> = {
                triggers: {
                    ...DEFAULT_REVIEW_CONFIG.triggers,
                    [ReviewTrigger.APP_OPEN]: {
                        minimumCount: 10,
                        enabled: false,
                    },
                },
            };

            await testConfigManager.updateConfig(changes);

            const updatedConfig = testConfigManager.getConfig();
            expect(updatedConfig.triggers[ReviewTrigger.APP_OPEN].minimumCount).toBe(10);
            expect(updatedConfig.triggers[ReviewTrigger.APP_OPEN].enabled).toBe(false);
        });

        it('should reset configuration to defaults', async () => {
            // First modify the configuration
            await testConfigManager.updateConfig({ cooldownPeriod: 60 });
            
            // Then reset to defaults
            await testConfigManager.resetToDefaults('Test reset');

            const config = testConfigManager.getConfig();
            expect(config).toEqual(DEFAULT_REVIEW_CONFIG);
        });

        // Note: Storage error handling is tested in integration tests
        it.skip('should handle storage errors during update', async () => {
            mockStorageService.updateReviewSettings.mockRejectedValue(new Error('Storage error'));
            const changes: Partial<ReviewConfig> = { cooldownPeriod: 60 };
            await expect(testConfigManager.updateConfig(changes)).rejects.toThrow();
        });
    });

    describe('development mode overrides', () => {
        beforeEach(async () => {
            await testConfigManager.initialize();
        });

        it('should apply development mode overrides', () => {
            const overrides: DevModeOverrides = {
                forceShowReview: true,
                skipCooldownPeriod: true,
                minimumAppOpens: 1,
                enableVerboseLogging: true,
            };

            testConfigManager.setDevModeOverrides(overrides);

            const config = testConfigManager.getConfig();
            expect(config.debugMode).toBe(true); // enableVerboseLogging override
            expect(config.cooldownPeriod).toBe(0); // skipCooldownPeriod override
            expect(config.triggers[ReviewTrigger.APP_OPEN].minimumCount).toBe(1); // minimumAppOpens override
        });

        it('should get current development mode overrides', () => {
            const overrides: DevModeOverrides = {
                forceShowReview: true,
                skipCooldownPeriod: true,
            };

            testConfigManager.setDevModeOverrides(overrides);

            const currentOverrides = testConfigManager.getDevModeOverrides();
            expect(currentOverrides).toEqual(overrides);
        });

        it('should clear development mode overrides', () => {
            const overrides: DevModeOverrides = {
                forceShowReview: true,
                skipCooldownPeriod: true,
            };

            testConfigManager.setDevModeOverrides(overrides);
            testConfigManager.clearDevModeOverrides();

            const currentOverrides = testConfigManager.getDevModeOverrides();
            expect(currentOverrides).toBeNull();
        });

        it('should apply custom trigger thresholds', () => {
            const overrides: DevModeOverrides = {
                customTriggerThresholds: {
                    [ReviewTrigger.SUCCESSFUL_FOOD_LOG]: {
                        minimumCount: 5,
                        enabled: false,
                    },
                },
            };

            testConfigManager.setDevModeOverrides(overrides);

            const config = testConfigManager.getConfig();
            expect(config.triggers[ReviewTrigger.SUCCESSFUL_FOOD_LOG].minimumCount).toBe(5);
            expect(config.triggers[ReviewTrigger.SUCCESSFUL_FOOD_LOG].enabled).toBe(false);
        });
    });

    describe('configuration change listeners', () => {
        beforeEach(async () => {
            await testConfigManager.initialize();
        });

        it('should notify listeners when configuration changes', async () => {
            const listener = jest.fn();
            testConfigManager.addConfigChangeListener(listener);

            const changes: Partial<ReviewConfig> = { cooldownPeriod: 60 };
            await testConfigManager.updateConfig(changes);

            expect(listener).toHaveBeenCalledWith(expect.objectContaining({
                cooldownPeriod: 60,
            }));
        });

        it('should notify listeners when overrides change', () => {
            const listener = jest.fn();
            testConfigManager.addConfigChangeListener(listener);

            const overrides: DevModeOverrides = { forceShowReview: true };
            testConfigManager.setDevModeOverrides(overrides);

            expect(listener).toHaveBeenCalled();
        });

        it('should remove configuration change listeners', async () => {
            const listener = jest.fn();
            testConfigManager.addConfigChangeListener(listener);
            testConfigManager.removeConfigChangeListener(listener);

            const changes: Partial<ReviewConfig> = { cooldownPeriod: 60 };
            await testConfigManager.updateConfig(changes);

            expect(listener).not.toHaveBeenCalled();
        });

        it('should handle errors in listeners gracefully', async () => {
            const errorListener = jest.fn(() => {
                throw new Error('Listener error');
            });
            const goodListener = jest.fn();

            testConfigManager.addConfigChangeListener(errorListener);
            testConfigManager.addConfigChangeListener(goodListener);

            const changes: Partial<ReviewConfig> = { cooldownPeriod: 60 };
            await testConfigManager.updateConfig(changes);

            expect(errorListener).toHaveBeenCalled();
            expect(goodListener).toHaveBeenCalled();
        });
    });

    describe('admin debug interface', () => {
        beforeEach(async () => {
            await testConfigManager.initialize();
        });

        it('should provide admin debug information', async () => {
            const debugInfo = await testConfigManager.getAdminDebugInfo();

            expect(debugInfo).toBeDefined();
            expect(debugInfo.currentConfig).toBeDefined();
            expect(debugInfo.systemStatus).toBeDefined();
            expect(debugInfo.performanceMetrics).toBeDefined();
            expect(debugInfo.configHistory).toBeDefined();
        });

        it('should track configuration history', async () => {
            const changes1: Partial<ReviewConfig> = { cooldownPeriod: 60 };
            const changes2: Partial<ReviewConfig> = { debugMode: true };

            await testConfigManager.updateConfig(changes1, 'user', 'First change');
            await testConfigManager.updateConfig(changes2, 'system', 'Second change');

            const debugInfo = await testConfigManager.getAdminDebugInfo();
            expect(debugInfo.configHistory).toHaveLength(2);
            expect(debugInfo.configHistory[0].changes).toEqual(changes1);
            expect(debugInfo.configHistory[0].source).toBe('user');
            expect(debugInfo.configHistory[0].reason).toBe('First change');
            expect(debugInfo.configHistory[1].changes).toEqual(changes2);
            expect(debugInfo.configHistory[1].source).toBe('system');
        });

        it('should include system status in debug info', async () => {
            const debugInfo = await testConfigManager.getAdminDebugInfo();

            expect(debugInfo.systemStatus.isInitialized).toBe(true);
            expect(debugInfo.systemStatus.configVersion).toBeGreaterThan(0);
            expect(debugInfo.systemStatus.hasActiveOverrides).toBe(false);
            expect(debugInfo.systemStatus.storageAvailable).toBe(true);
        });

        it('should include performance metrics in debug info', async () => {
            // Perform some operations to generate metrics
            await testConfigManager.updateConfig({ cooldownPeriod: 60 });
            await testConfigManager.updateConfig({ debugMode: true });

            const debugInfo = await testConfigManager.getAdminDebugInfo();

            expect(debugInfo.performanceMetrics.configLoadTime).toBeGreaterThanOrEqual(0);
            expect(debugInfo.performanceMetrics.totalConfigUpdates).toBe(2);
            expect(debugInfo.performanceMetrics.averageUpdateTime).toBeGreaterThanOrEqual(0);
        });

        it('should limit configuration history size', async () => {
            // Add more than 50 entries
            for (let i = 0; i < 55; i++) {
                await testConfigManager.updateConfig({ cooldownPeriod: i + 1 });
            }

            const debugInfo = await testConfigManager.getAdminDebugInfo();
            expect(debugInfo.configHistory.length).toBe(50);
        });
    });

    describe('configuration export/import', () => {
        beforeEach(async () => {
            await testConfigManager.initialize();
        });

        it('should export configuration with metadata', () => {
            const exportData = testConfigManager.exportConfiguration();

            expect(exportData.config).toBeDefined();
            expect(exportData.metadata).toBeDefined();
            expect(exportData.metadata.version).toBeGreaterThan(0);
            expect(exportData.metadata.exportDate).toBeInstanceOf(Date);
            expect(exportData.metadata.configHistory).toBeDefined();
        });

        it('should import configuration successfully', async () => {
            const importConfig: ReviewConfig = {
                ...DEFAULT_REVIEW_CONFIG,
                cooldownPeriod: 90,
                debugMode: true,
            };

            const importData = {
                config: importConfig,
                metadata: {
                    version: 1,
                    exportDate: new Date(),
                    configHistory: [],
                },
            };

            await testConfigManager.importConfiguration(importData, 'Test import');

            const currentConfig = testConfigManager.getConfig();
            expect(currentConfig.cooldownPeriod).toBe(90);
            expect(currentConfig.debugMode).toBe(true);
        });
    });

    describe('error handling', () => {
        beforeEach(async () => {
            await testConfigManager.initialize();
        });

        it('should handle storage unavailability gracefully', async () => {
            mockStorageService.isStorageAvailable.mockResolvedValue(false);

            const debugInfo = await testConfigManager.getAdminDebugInfo();
            expect(debugInfo.systemStatus.storageAvailable).toBe(false);
        });

        it('should handle invalid configuration data', async () => {
            const invalidChanges = {
                cooldownPeriod: 'invalid' as any,
                maxPromptsPerUser: null as any,
                triggers: 'not an object' as any,
            };

            await testConfigManager.updateConfig(invalidChanges);

            const config = testConfigManager.getConfig();
            // Should sanitize invalid values
            expect(config.cooldownPeriod).toBe(0); // 'invalid' -> NaN -> 0
            expect(config.maxPromptsPerUser).toBe(1); // null -> NaN -> 1
            expect(typeof config.triggers).toBe('object');
        });
    });

    describe('singleton instance', () => {
        it('should provide a singleton instance', () => {
            expect(configManager).toBeInstanceOf(ConfigManager);
        });

        it('should maintain state across multiple imports', async () => {
            await configManager.initialize();
            await configManager.updateConfig({ cooldownPeriod: 123 });

            const config = configManager.getConfig();
            expect(config.cooldownPeriod).toBe(123);
        });
    });
});