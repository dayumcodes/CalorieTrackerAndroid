/**
 * Comprehensive unit tests for StorageService
 * Tests data persistence, serialization, error handling, and fallback mechanisms
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AsyncStorageService,
  storageService,
} from '../lib/storage-service';
import {
  UserMetrics,
  ReviewSettings,
  ReviewAction,
  ReviewTrigger,
  DEFAULT_USER_METRICS,
  DEFAULT_REVIEW_SETTINGS,
} from '../lib/types/review-types';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('AsyncStorageService', () => {
  let service: AsyncStorageService;

  beforeEach(() => {
    // Create a fresh instance for each test
    service = new AsyncStorageService();
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Clear service cache
    service.clearCache();
    
    // Mock console.warn to avoid noise in tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      await service.initialize();
      
      expect(mockAsyncStorage.getItem).toHaveBeenCalledTimes(2);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@review_user_metrics');
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@review_settings');
    });

    it('should handle initialization errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));
      
      await service.initialize();
      
      // The service should still be initialized even with errors
      // It will use defaults and log errors internally
      expect(console.error).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      await service.initialize();
      await service.initialize();
      
      // Should only be called once during first initialization
      expect(mockAsyncStorage.getItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('getUserMetrics', () => {
    it('should return default metrics when no stored data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const metrics = await service.getUserMetrics();
      
      expect(metrics).toEqual(DEFAULT_USER_METRICS);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@review_user_metrics');
    });

    it('should deserialize and return stored metrics', async () => {
      const storedMetrics = {
        appOpenCount: 10,
        successfulFoodLogs: 25,
        lastReviewPrompt: '2024-01-15T10:00:00.000Z',
        lastReviewAction: ReviewAction.COMPLETED,
        streakDays: 7,
        milestonesAchieved: ['7_day_streak'],
        firstAppOpen: '2024-01-01T10:00:00.000Z',
        totalSessionTime: 120,
        lastAppOpen: '2024-01-15T10:00:00.000Z',
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(storedMetrics));
      
      const metrics = await service.getUserMetrics();
      
      expect(metrics.appOpenCount).toBe(10);
      expect(metrics.successfulFoodLogs).toBe(25);
      expect(metrics.lastReviewPrompt).toEqual(new Date('2024-01-15T10:00:00.000Z'));
      expect(metrics.lastReviewAction).toBe(ReviewAction.COMPLETED);
      expect(metrics.streakDays).toBe(7);
      expect(metrics.milestonesAchieved).toEqual(['7_day_streak']);
      expect(metrics.firstAppOpen).toEqual(new Date('2024-01-01T10:00:00.000Z'));
      expect(metrics.totalSessionTime).toBe(120);
      expect(metrics.lastAppOpen).toEqual(new Date('2024-01-15T10:00:00.000Z'));
    });

    it('should return cached metrics on subsequent calls', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const metrics1 = await service.getUserMetrics();
      const metrics2 = await service.getUserMetrics();
      
      expect(metrics1).toBe(metrics2); // Same reference
      expect(mockAsyncStorage.getItem).toHaveBeenCalledTimes(1);
    });

    it('should handle storage errors and return defaults', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));
      
      const metrics = await service.getUserMetrics();
      
      expect(metrics).toEqual(DEFAULT_USER_METRICS);
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle invalid JSON and return defaults', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid json');
      
      const metrics = await service.getUserMetrics();
      
      expect(metrics).toEqual(DEFAULT_USER_METRICS);
      expect(console.error).toHaveBeenCalled();
    });

    it('should validate and sanitize metrics data', async () => {
      const invalidMetrics = {
        appOpenCount: -5, // Should be sanitized to 0
        successfulFoodLogs: 'invalid', // Should be sanitized to 0
        lastReviewPrompt: 'invalid date', // Should be null
        lastReviewAction: ReviewAction.COMPLETED,
        streakDays: -1, // Should be sanitized to 0
        milestonesAchieved: 'not an array', // Should be []
        firstAppOpen: 'invalid date', // Should be current date
        totalSessionTime: -10, // Should be sanitized to 0
        lastAppOpen: 'invalid date', // Should be current date
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(invalidMetrics));
      
      const metrics = await service.getUserMetrics();
      
      expect(metrics.appOpenCount).toBe(0);
      expect(metrics.successfulFoodLogs).toBe(0);
      expect(metrics.lastReviewPrompt).toBeNull();
      expect(metrics.streakDays).toBe(0);
      expect(metrics.milestonesAchieved).toEqual([]);
      expect(metrics.totalSessionTime).toBe(0);
      expect(metrics.firstAppOpen).toBeInstanceOf(Date);
      expect(metrics.lastAppOpen).toBeInstanceOf(Date);
    });
  });

  describe('updateUserMetrics', () => {
    it('should update metrics with partial data', async () => {
      // Mock getting current metrics
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const updates: Partial<UserMetrics> = {
        appOpenCount: 15,
        streakDays: 10,
      };
      
      await service.updateUserMetrics(updates);
      
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@review_user_metrics',
        expect.stringContaining('"appOpenCount":15')
      );
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@review_user_metrics',
        expect.stringContaining('"streakDays":10')
      );
    });

    it('should merge updates with existing metrics', async () => {
      const existingMetrics = {
        appOpenCount: 5,
        successfulFoodLogs: 10,
        lastReviewPrompt: null,
        lastReviewAction: null,
        streakDays: 3,
        milestonesAchieved: ['first_open'],
        firstAppOpen: '2024-01-01T10:00:00.000Z',
        totalSessionTime: 60,
        lastAppOpen: '2024-01-10T10:00:00.000Z',
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingMetrics));
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const updates: Partial<UserMetrics> = {
        appOpenCount: 15,
        milestonesAchieved: ['first_open', '7_day_streak'],
      };
      
      await service.updateUserMetrics(updates);
      
      const savedData = JSON.parse(
        (mockAsyncStorage.setItem as jest.Mock).mock.calls[0][1]
      );
      
      expect(savedData.appOpenCount).toBe(15); // Updated
      expect(savedData.successfulFoodLogs).toBe(10); // Preserved
      expect(savedData.milestonesAchieved).toEqual(['first_open', '7_day_streak']); // Updated
    });

    it('should update cache after successful storage', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const updates: Partial<UserMetrics> = {
        appOpenCount: 20,
      };
      
      await service.updateUserMetrics(updates);
      
      // Get metrics again - should return cached data without calling storage
      mockAsyncStorage.getItem.mockClear();
      const metrics = await service.getUserMetrics();
      
      expect(metrics.appOpenCount).toBe(20);
      expect(mockAsyncStorage.getItem).not.toHaveBeenCalled();
    });

    it('should handle storage errors and throw', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));
      
      const updates: Partial<UserMetrics> = {
        appOpenCount: 15,
      };
      
      await expect(service.updateUserMetrics(updates)).rejects.toThrow();
      expect(console.error).toHaveBeenCalled();
    });

    it('should validate updated metrics before storing', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const updates: Partial<UserMetrics> = {
        appOpenCount: -5, // Invalid, should be sanitized
        streakDays: -10, // Invalid, should be sanitized
      };
      
      await service.updateUserMetrics(updates);
      
      const savedData = JSON.parse(
        (mockAsyncStorage.setItem as jest.Mock).mock.calls[0][1]
      );
      
      expect(savedData.appOpenCount).toBe(0);
      expect(savedData.streakDays).toBe(0);
    });
  });

  describe('getReviewSettings', () => {
    it('should return default settings when no stored data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const settings = await service.getReviewSettings();
      
      expect(settings).toEqual(DEFAULT_REVIEW_SETTINGS);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@review_settings');
    });

    it('should deserialize and return stored settings', async () => {
      const storedSettings = {
        minimumAppOpens: 10,
        cooldownDays: 45,
        enabledTriggers: [ReviewTrigger.APP_OPEN, ReviewTrigger.SUCCESSFUL_FOOD_LOG],
        debugMode: true,
        maxPromptsPerUser: 5,
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(storedSettings));
      
      const settings = await service.getReviewSettings();
      
      expect(settings.minimumAppOpens).toBe(10);
      expect(settings.cooldownDays).toBe(45);
      expect(settings.enabledTriggers).toEqual([
        ReviewTrigger.APP_OPEN,
        ReviewTrigger.SUCCESSFUL_FOOD_LOG,
      ]);
      expect(settings.debugMode).toBe(true);
      expect(settings.maxPromptsPerUser).toBe(5);
    });

    it('should return cached settings on subsequent calls', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const settings1 = await service.getReviewSettings();
      const settings2 = await service.getReviewSettings();
      
      expect(settings1).toBe(settings2); // Same reference
      expect(mockAsyncStorage.getItem).toHaveBeenCalledTimes(1);
    });

    it('should handle storage errors and return defaults', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));
      
      const settings = await service.getReviewSettings();
      
      expect(settings).toEqual(DEFAULT_REVIEW_SETTINGS);
      expect(console.error).toHaveBeenCalled();
    });

    it('should validate and sanitize settings data', async () => {
      const invalidSettings = {
        minimumAppOpens: -5, // Should be sanitized to default (5)
        cooldownDays: 0, // Should be sanitized to default (30)
        enabledTriggers: 'not an array', // Should use default
        debugMode: 'not a boolean', // Should be false
        maxPromptsPerUser: -1, // Should be sanitized to default (3)
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(invalidSettings));
      
      const settings = await service.getReviewSettings();
      
      expect(settings.minimumAppOpens).toBe(DEFAULT_REVIEW_SETTINGS.minimumAppOpens); // Uses default when invalid
      expect(settings.cooldownDays).toBe(DEFAULT_REVIEW_SETTINGS.cooldownDays); // Uses default when invalid
      expect(settings.enabledTriggers).toEqual(DEFAULT_REVIEW_SETTINGS.enabledTriggers);
      expect(settings.debugMode).toBe(false);
      expect(settings.maxPromptsPerUser).toBe(DEFAULT_REVIEW_SETTINGS.maxPromptsPerUser); // Uses default when invalid
    });
  });

  describe('updateReviewSettings', () => {
    it('should update settings with partial data', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const updates: Partial<ReviewSettings> = {
        minimumAppOpens: 8,
        debugMode: true,
      };
      
      await service.updateReviewSettings(updates);
      
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@review_settings',
        expect.stringContaining('"minimumAppOpens":8')
      );
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@review_settings',
        expect.stringContaining('"debugMode":true')
      );
    });

    it('should merge updates with existing settings', async () => {
      const existingSettings = {
        minimumAppOpens: 5,
        cooldownDays: 30,
        enabledTriggers: [ReviewTrigger.APP_OPEN],
        debugMode: false,
        maxPromptsPerUser: 3,
      };
      
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingSettings));
      mockAsyncStorage.setItem.mockResolvedValue();
      
      const updates: Partial<ReviewSettings> = {
        minimumAppOpens: 10,
        enabledTriggers: [ReviewTrigger.APP_OPEN, ReviewTrigger.MILESTONE_ACHIEVED],
      };
      
      await service.updateReviewSettings(updates);
      
      const savedData = JSON.parse(
        (mockAsyncStorage.setItem as jest.Mock).mock.calls[0][1]
      );
      
      expect(savedData.minimumAppOpens).toBe(10); // Updated
      expect(savedData.cooldownDays).toBe(30); // Preserved
      expect(savedData.enabledTriggers).toEqual([
        ReviewTrigger.APP_OPEN,
        ReviewTrigger.MILESTONE_ACHIEVED,
      ]); // Updated
    });

    it('should handle storage errors and throw', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));
      
      const updates: Partial<ReviewSettings> = {
        minimumAppOpens: 10,
      };
      
      await expect(service.updateReviewSettings(updates)).rejects.toThrow();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('clearReviewData', () => {
    it('should remove all review data from storage', async () => {
      mockAsyncStorage.removeItem.mockResolvedValue();
      
      await service.clearReviewData();
      
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@review_user_metrics');
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@review_settings');
    });

    it('should clear cache after removing data', async () => {
      mockAsyncStorage.removeItem.mockResolvedValue();
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      // First, populate cache
      await service.getUserMetrics();
      await service.getReviewSettings();
      
      // Clear data
      await service.clearReviewData();
      
      // Getting data again should call storage (cache cleared)
      mockAsyncStorage.getItem.mockClear();
      await service.getUserMetrics();
      
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@review_user_metrics');
    });

    it('should handle storage errors and throw', async () => {
      mockAsyncStorage.removeItem.mockRejectedValue(new Error('Storage error'));
      
      await expect(service.clearReviewData()).rejects.toThrow();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    describe('isStorageAvailable', () => {
      it('should return true when storage is working', async () => {
        mockAsyncStorage.setItem.mockResolvedValue();
        mockAsyncStorage.getItem.mockResolvedValue('test');
        mockAsyncStorage.removeItem.mockResolvedValue();
        
        const isAvailable = await service.isStorageAvailable();
        
        expect(isAvailable).toBe(true);
        expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('@storage_test', 'test');
        expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@storage_test');
        expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@storage_test');
      });

      it('should return false when storage fails', async () => {
        mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));
        
        const isAvailable = await service.isStorageAvailable();
        
        expect(isAvailable).toBe(false);
      });

      it('should return false when retrieved value does not match', async () => {
        mockAsyncStorage.setItem.mockResolvedValue();
        mockAsyncStorage.getItem.mockResolvedValue('different');
        mockAsyncStorage.removeItem.mockResolvedValue();
        
        const isAvailable = await service.isStorageAvailable();
        
        expect(isAvailable).toBe(false);
      });
    });

    describe('getStorageInfo', () => {
      it('should return storage size information', async () => {
        const testData = '{"test": "data"}';
        const settingData = '{"setting": true}';
        
        mockAsyncStorage.getItem
          .mockResolvedValueOnce(testData) // user metrics
          .mockResolvedValueOnce(settingData); // review settings
        
        const info = await service.getStorageInfo();
        
        expect(info.userMetricsSize).toBe(testData.length);
        expect(info.reviewSettingsSize).toBe(settingData.length);
      });

      it('should return zero sizes when no data exists', async () => {
        mockAsyncStorage.getItem.mockResolvedValue(null);
        
        const info = await service.getStorageInfo();
        
        expect(info.userMetricsSize).toBe(0);
        expect(info.reviewSettingsSize).toBe(0);
      });

      it('should handle storage errors gracefully', async () => {
        mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));
        
        const info = await service.getStorageInfo();
        
        expect(info.userMetricsSize).toBe(0);
        expect(info.reviewSettingsSize).toBe(0);
      });
    });

    describe('clearCache', () => {
      it('should clear internal cache', async () => {
        mockAsyncStorage.getItem.mockResolvedValue(null);
        
        // Populate cache
        await service.getUserMetrics();
        await service.getReviewSettings();
        
        // Clear cache
        service.clearCache();
        
        // Should call storage again
        mockAsyncStorage.getItem.mockClear();
        await service.getUserMetrics();
        
        expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@review_user_metrics');
      });
    });
  });

  describe('serialization', () => {
    it('should properly serialize and deserialize user metrics', async () => {
      const originalMetrics: UserMetrics = {
        appOpenCount: 15,
        successfulFoodLogs: 30,
        lastReviewPrompt: new Date('2024-01-15T10:00:00.000Z'),
        lastReviewAction: ReviewAction.DISMISSED,
        streakDays: 14,
        milestonesAchieved: ['7_day_streak', '14_day_streak'],
        firstAppOpen: new Date('2024-01-01T10:00:00.000Z'),
        totalSessionTime: 240,
        lastAppOpen: new Date('2024-01-15T10:00:00.000Z'),
      };
      
      // Mock the storage to return our serialized data
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === '@review_user_metrics') {
          return Promise.resolve(JSON.stringify({
            appOpenCount: 15,
            successfulFoodLogs: 30,
            lastReviewPrompt: '2024-01-15T10:00:00.000Z',
            lastReviewAction: ReviewAction.DISMISSED,
            streakDays: 14,
            milestonesAchieved: ['7_day_streak', '14_day_streak'],
            firstAppOpen: '2024-01-01T10:00:00.000Z',
            totalSessionTime: 240,
            lastAppOpen: '2024-01-15T10:00:00.000Z',
          }));
        }
        return Promise.resolve(null);
      });
      
      const deserializedMetrics = await service.getUserMetrics();
      
      expect(deserializedMetrics.appOpenCount).toBe(originalMetrics.appOpenCount);
      expect(deserializedMetrics.successfulFoodLogs).toBe(originalMetrics.successfulFoodLogs);
      expect(deserializedMetrics.lastReviewPrompt).toEqual(originalMetrics.lastReviewPrompt);
      expect(deserializedMetrics.lastReviewAction).toBe(originalMetrics.lastReviewAction);
      expect(deserializedMetrics.streakDays).toBe(originalMetrics.streakDays);
      expect(deserializedMetrics.milestonesAchieved).toEqual(originalMetrics.milestonesAchieved);
      expect(deserializedMetrics.firstAppOpen).toEqual(originalMetrics.firstAppOpen);
      expect(deserializedMetrics.totalSessionTime).toBe(originalMetrics.totalSessionTime);
      expect(deserializedMetrics.lastAppOpen).toEqual(originalMetrics.lastAppOpen);
    });

    it('should handle null dates in serialization', async () => {
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === '@review_user_metrics') {
          return Promise.resolve(JSON.stringify({
            ...DEFAULT_USER_METRICS,
            lastReviewPrompt: null,
            firstAppOpen: '2024-01-01T10:00:00.000Z',
            lastAppOpen: '2024-01-01T10:00:00.000Z',
          }));
        }
        return Promise.resolve(null);
      });
      
      const metrics = await service.getUserMetrics();
      
      expect(metrics.lastReviewPrompt).toBeNull();
      expect(metrics.firstAppOpen).toBeInstanceOf(Date);
      expect(metrics.lastAppOpen).toBeInstanceOf(Date);
    });
  });

  describe('error handling', () => {
    it('should create proper error objects', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Test error'));
      
      // This should not throw, but should log error
      const metrics = await service.getUserMetrics();
      
      expect(metrics).toEqual(DEFAULT_USER_METRICS);
      expect(console.error).toHaveBeenCalledWith(
        'StorageService Error:',
        expect.objectContaining({
          type: 'storage_error',
          message: 'Failed to get user metrics',
          timestamp: expect.any(Date),
          originalError: 'Test error',
        })
      );
    });

    it('should handle non-Error objects in catch blocks', async () => {
      mockAsyncStorage.getItem.mockRejectedValue('String error');
      
      const metrics = await service.getUserMetrics();
      
      expect(metrics).toEqual(DEFAULT_USER_METRICS);
      expect(console.error).toHaveBeenCalled();
    });
  });
});

describe('storageService singleton', () => {
  it('should export a singleton instance', () => {
    expect(storageService).toBeInstanceOf(AsyncStorageService);
  });

  it('should be the same instance on multiple imports', () => {
    const { storageService: service1 } = require('../lib/storage-service');
    const { storageService: service2 } = require('../lib/storage-service');
    
    expect(service1).toBe(service2);
  });
});