# In-App Review System Integration Guide

## Quick Start

This guide will help you integrate the In-App Review System into your React Native Android application.

## Prerequisites

- React Native 0.60+
- Android API level 21+
- Google Play Services installed on target devices
- AsyncStorage for data persistence

## Installation

### 1. Install Dependencies

```bash
npm install react-native-in-app-review @react-native-async-storage/async-storage
```

### 2. Android Configuration

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### 3. Copy Core Files

Copy the following files to your project:

```
lib/
├── review-manager.ts
├── trigger-engine.ts
├── storage-service.ts
├── review-dialog.ts
├── analytics-tracker.ts
├── error-handler.ts
└── types/
    └── review-types.ts

hooks/
└── useInAppReview.ts

components/
├── ReviewConfigDebugPanel.tsx (optional)
└── ReviewTriggerTracker.tsx (optional)
```

## Basic Integration

### Step 1: Initialize the Review System

In your app's root component or main entry point:

```typescript
import { ReviewManager } from './lib/review-manager';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // Initialize review system on app start
    const initializeReviewSystem = async () => {
      try {
        const reviewManager = ReviewManager.getInstance();
        await reviewManager.initialize();
        
        // Record app open
        reviewManager.recordUserAction({
          type: 'APP_OPEN',
          timestamp: new Date(),
          context: { source: 'app_start' }
        });
      } catch (error) {
        console.warn('Failed to initialize review system:', error);
      }
    };

    initializeReviewSystem();
  }, []);

  return (
    // Your app content
  );
}
```

### Step 2: Add Review Triggers

In components where you want to trigger reviews:

```typescript
import { useInAppReview } from '../hooks/useInAppReview';

function FoodLoggingScreen() {
  const { recordAction, triggerReview } = useInAppReview();

  const handleSuccessfulFoodLog = async () => {
    // Your food logging logic here
    await saveFoodEntry(foodData);

    // Record the successful action
    recordAction({
      type: 'SUCCESSFUL_FOOD_LOG',
      timestamp: new Date(),
      context: { 
        screen: 'food-logging',
        foodType: foodData.type 
      }
    });

    // Optionally trigger review check
    await triggerReview('SUCCESSFUL_FOOD_LOG');
  };

  return (
    <Button onPress={handleSuccessfulFoodLog}>
      Save Food Entry
    </Button>
  );
}
```

### Step 3: Add Milestone Triggers

For milestone achievements:

```typescript
function ProgressScreen() {
  const { recordAction, triggerReview } = useInAppReview();

  const handleMilestoneAchieved = async (milestone: string) => {
    // Your milestone logic here
    
    recordAction({
      type: 'MILESTONE_ACHIEVED',
      timestamp: new Date(),
      context: { 
        milestone,
        screen: 'progress'
      }
    });

    await triggerReview('MILESTONE_ACHIEVED');
  };

  // Call when user reaches milestones
  useEffect(() => {
    if (userStreak === 7) {
      handleMilestoneAchieved('week_1_streak');
    }
  }, [userStreak]);
}
```

## Advanced Configuration

### Custom Configuration

Create a custom configuration for your app:

```typescript
import { ReviewConfig } from './lib/types/review-types';

const myAppReviewConfig: ReviewConfig = {
  triggers: {
    APP_OPEN: {
      minimumCount: 8, // Require 8 app opens
      enabled: true
    },
    SUCCESSFUL_FOOD_LOG: {
      minimumCount: 5, // Require 5 successful logs
      enabled: true
    },
    MILESTONE_ACHIEVED: {
      milestones: ['week_1', 'week_2', 'month_1'],
      enabled: true
    },
    STREAK_MILESTONE: {
      streakDays: [7, 14, 30, 60],
      enabled: true
    }
  },
  cooldownPeriod: 45, // 45 days between prompts
  maxPromptsPerUser: 3, // Maximum 3 prompts per user
  debugMode: __DEV__ // Enable debug mode in development
};

// Initialize with custom config
const reviewManager = new ReviewManager(myAppReviewConfig);
```

### Analytics Integration

Integrate with your existing analytics service:

```typescript
import { ReviewManager } from './lib/review-manager';
import Analytics from '@react-native-firebase/analytics';

const reviewManager = ReviewManager.getInstance();

// Set up analytics handler
reviewManager.setAnalyticsHandler(async (event) => {
  await Analytics().logEvent('review_system_event', {
    event_type: event.event,
    trigger: event.context.trigger,
    timestamp: event.timestamp.toISOString()
  });
});
```

## Component Integration Patterns

### Pattern 1: Success Flow Integration

```typescript
function SuccessScreen({ onComplete }: { onComplete: () => void }) {
  const { triggerReview } = useInAppReview();

  const handleSuccess = async () => {
    // Show success message
    showSuccessMessage();
    
    // Trigger review after positive experience
    await triggerReview('GOAL_COMPLETED');
    
    // Continue with normal flow
    onComplete();
  };

  return (
    <View>
      <Text>Congratulations! Goal completed!</Text>
      <Button onPress={handleSuccess}>Continue</Button>
    </View>
  );
}
```

### Pattern 2: Background Tracking

```typescript
function useActivityTracking() {
  const { recordAction } = useInAppReview();

  const trackActivity = useCallback((activity: string) => {
    recordAction({
      type: 'USER_ACTIVITY',
      timestamp: new Date(),
      context: { activity }
    });
  }, [recordAction]);

  return { trackActivity };
}
```

### Pattern 3: Conditional Triggers

```typescript
function ConditionalReviewTrigger({ userLevel, hasCompletedTutorial }: Props) {
  const { triggerReview } = useInAppReview();

  const handleConditionalTrigger = async () => {
    // Only trigger for experienced users
    if (userLevel >= 5 && hasCompletedTutorial) {
      await triggerReview('MILESTONE_ACHIEVED');
    }
  };

  return (
    <Button onPress={handleConditionalTrigger}>
      Complete Action
    </Button>
  );
}
```

## Testing Integration

### Unit Testing

Test your integration with mocked review system:

```typescript
import { ReviewManager } from '../lib/review-manager';

// Mock the review manager
jest.mock('../lib/review-manager');

describe('MyComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should trigger review on success', async () => {
    const mockTriggerReview = jest.fn();
    (ReviewManager.getInstance as jest.Mock).mockReturnValue({
      triggerReview: mockTriggerReview
    });

    // Test your component
    const { getByText } = render(<MyComponent />);
    fireEvent.press(getByText('Success Button'));

    expect(mockTriggerReview).toHaveBeenCalledWith('SUCCESSFUL_ACTION');
  });
});
```

### Integration Testing

Test the complete flow:

```typescript
import { ReviewManager } from '../lib/review-manager';

describe('Review Integration', () => {
  let reviewManager: ReviewManager;

  beforeEach(async () => {
    reviewManager = new ReviewManager({
      debugMode: true,
      cooldownPeriod: 0 // Disable cooldown for testing
    });
    await reviewManager.initialize();
  });

  it('should show review after meeting criteria', async () => {
    // Simulate user actions
    for (let i = 0; i < 5; i++) {
      reviewManager.recordUserAction({
        type: 'APP_OPEN',
        timestamp: new Date(),
        context: {}
      });
    }

    // Should be eligible for review
    const result = await reviewManager.checkAndTriggerReview({
      trigger: 'APP_OPEN',
      userState: {},
      appState: {}
    });

    expect(result).toBe(true);
  });
});
```

## Debugging

### Debug Mode

Enable debug mode for development:

```typescript
// In development builds
const reviewManager = new ReviewManager({
  debugMode: __DEV__,
  // Other config...
});

// Force trigger for testing
if (__DEV__) {
  await reviewManager.forceReview();
}
```

### Debug Panel

Add the debug panel to development screens:

```typescript
import { ReviewConfigDebugPanel } from '../components/ReviewConfigDebugPanel';

function DeveloperScreen() {
  if (!__DEV__) return null;

  return (
    <ScrollView>
      <Text>Developer Tools</Text>
      <ReviewConfigDebugPanel />
    </ScrollView>
  );
}
```

### Logging

Enable detailed logging:

```typescript
import { ReviewManager } from './lib/review-manager';

const reviewManager = ReviewManager.getInstance();

// Enable verbose logging in development
if (__DEV__) {
  reviewManager.setLogLevel('verbose');
}
```

## Common Integration Issues

### Issue 1: Review Not Showing

**Symptoms**: Review prompts never appear
**Solutions**:
- Check Google Play Services availability
- Verify trigger conditions are met
- Check cooldown period hasn't been exceeded
- Enable debug mode to bypass restrictions

### Issue 2: Storage Errors

**Symptoms**: User metrics not persisting
**Solutions**:
- Ensure AsyncStorage is properly installed
- Check device storage permissions
- Verify storage keys aren't conflicting

### Issue 3: Performance Impact

**Symptoms**: App startup slowdown
**Solutions**:
- Initialize review system asynchronously
- Use lazy loading for components
- Profile with React Native performance tools

## Migration Guide

### From Manual Review Prompts

If migrating from manual review prompts:

1. Remove existing review prompt code
2. Install the new system
3. Map existing trigger points to new system
4. Test thoroughly before deployment

### Data Migration

If you have existing user data:

```typescript
// Migrate existing user data
const migrateUserData = async (existingData: any) => {
  const reviewManager = ReviewManager.getInstance();
  
  await reviewManager.updateUserMetrics({
    appOpenCount: existingData.appOpens || 0,
    successfulFoodLogs: existingData.foodLogs || 0,
    // Map other relevant data
  });
};
```

## Best Practices

### Do's

- ✅ Trigger reviews after positive experiences
- ✅ Respect user choice and cooldown periods
- ✅ Test on various devices and Android versions
- ✅ Monitor analytics and adjust configuration
- ✅ Provide fallback mechanisms

### Don'ts

- ❌ Force users to review
- ❌ Trigger during critical user flows
- ❌ Ignore Google Play policies
- ❌ Skip error handling
- ❌ Forget to test edge cases

## Support

### Getting Help

1. Check the troubleshooting guide
2. Review test cases for examples
3. Enable debug mode for detailed logging
4. Check Google Play Console for policy updates

### Contributing

When making changes to the review system:
1. Update tests
2. Update documentation
3. Test on multiple devices
4. Follow existing code patterns
5. Consider backward compatibility