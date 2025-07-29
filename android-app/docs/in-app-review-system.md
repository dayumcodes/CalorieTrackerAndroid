# In-App Review System Documentation

## Overview

The In-App Review System is a React Native implementation that integrates with Google Play's In-App Review API to intelligently prompt users for app reviews at optimal moments. The system follows Google Play's best practices and policies while maximizing the likelihood of positive reviews.

## Architecture

### Core Components

- **ReviewManager**: Central orchestration service
- **TriggerEngine**: Evaluates user actions and determines optimal review timing
- **StorageService**: Manages persistent data for review tracking
- **ReviewDialog**: Native interface wrapper for Google Play's review API
- **AnalyticsTracker**: Logs review-related events for optimization

### Key Features

- Intelligent trigger-based review prompts
- Google Play In-App Review API integration
- Fallback to external Play Store navigation
- Comprehensive analytics and tracking
- Configurable trigger thresholds and timing
- Error handling and recovery mechanisms

## Usage

### Basic Integration

```typescript
import { useInAppReview } from '../hooks/useInAppReview';

function MyComponent() {
  const { triggerReview, recordAction, isAvailable } = useInAppReview();

  const handleSuccessfulAction = async () => {
    // Record user action for trigger evaluation
    recordAction({
      type: 'SUCCESSFUL_FOOD_LOG',
      timestamp: new Date(),
      context: { screen: 'food-logging' }
    });

    // Optionally trigger review check immediately
    await triggerReview('SUCCESSFUL_FOOD_LOG');
  };

  return (
    <Button onPress={handleSuccessfulAction}>
      Log Food
    </Button>
  );
}
```

### Advanced Configuration

```typescript
import { ReviewManager } from '../lib/review-manager';
import { ReviewConfig } from '../lib/types/review-types';

const customConfig: ReviewConfig = {
  triggers: {
    APP_OPEN: {
      minimumCount: 10,
      enabled: true
    },
    SUCCESSFUL_FOOD_LOG: {
      minimumCount: 5,
      enabled: true
    }
  },
  cooldownPeriod: 45, // days
  maxPromptsPerUser: 3,
  debugMode: false
};

// Initialize with custom configuration
const reviewManager = new ReviewManager(customConfig);
```

## Trigger Types

### Available Triggers

1. **APP_OPEN**: Triggered when user opens the app
2. **SUCCESSFUL_FOOD_LOG**: Triggered after successful food logging
3. **MILESTONE_ACHIEVED**: Triggered when user reaches milestones
4. **GOAL_COMPLETED**: Triggered when user completes goals
5. **STREAK_MILESTONE**: Triggered at streak milestones (7, 14, 30 days)

### Trigger Configuration

Each trigger can be configured with:
- `minimumCount`: Minimum occurrences before eligibility
- `enabled`: Whether the trigger is active
- Additional trigger-specific parameters

## Data Storage

### User Metrics

The system tracks:
- App open count
- Successful food logs count
- Last review prompt date
- Last review action taken
- Current streak days
- Achieved milestones

### Storage Location

Data is stored locally using AsyncStorage with keys:
- `@review_user_metrics`: User behavior metrics
- `@review_settings`: Review system configuration

## Analytics Events

### Tracked Events

- `review_prompt_shown`: When review dialog appears
- `review_completed`: When user submits review
- `review_dismissed`: When user dismisses dialog
- `review_error`: When errors occur
- `trigger_evaluated`: When triggers are checked

### Event Structure

```typescript
{
  event: string;
  timestamp: Date;
  context: {
    trigger?: ReviewTrigger;
    userMetrics?: UserMetrics;
    error?: string;
  };
}
```

## Error Handling

### Common Error Scenarios

1. **Google Play Services Unavailable**
   - Automatic fallback to external Play Store
   - User notification of alternative action

2. **Network Connectivity Issues**
   - Cached eligibility status
   - Retry mechanism with exponential backoff

3. **Storage Failures**
   - In-memory fallback for current session
   - Recovery attempt on next app start

4. **API Rate Limiting**
   - Client-side throttling
   - Respect Google Play's rate limits

## Performance Considerations

### Optimization Features

- Lazy loading of review components
- Caching of review availability status
- Background processing of user actions
- Minimal memory footprint (< 1MB)
- Fast prompt display (< 200ms)

### Performance Monitoring

The system includes built-in performance monitoring:
- Review prompt display time
- Storage operation duration
- Memory usage tracking
- App startup impact measurement

## Testing

### Test Coverage

- Unit tests for all core components
- Integration tests for Google Play API
- End-to-end tests for complete review flow
- Performance tests for optimization validation
- Manual testing scenarios

### Running Tests

```bash
# Run all review system tests
npm test -- --testPathPattern=review

# Run specific test suites
npm test review-manager.test.ts
npm test trigger-engine.test.ts
npm test storage-service.test.ts
```

## Configuration Options

### Default Configuration

```typescript
const DEFAULT_CONFIG: ReviewConfig = {
  triggers: {
    APP_OPEN: { minimumCount: 5, enabled: true },
    SUCCESSFUL_FOOD_LOG: { minimumCount: 3, enabled: true },
    MILESTONE_ACHIEVED: { milestones: ['week_1', 'week_2'], enabled: true },
    STREAK_MILESTONE: { streakDays: [7, 14, 30], enabled: true }
  },
  cooldownPeriod: 30,
  maxPromptsPerUser: 2,
  debugMode: false
};
```

### Runtime Configuration Updates

Configuration can be updated without app restart:

```typescript
await reviewManager.updateConfig({
  cooldownPeriod: 45,
  debugMode: true
});
```

## Debug Mode

### Enabling Debug Mode

```typescript
// Enable debug mode for testing
await reviewManager.updateConfig({ debugMode: true });

// Force trigger review (bypasses cooldown)
await reviewManager.forceReview();

// Reset review state
await reviewManager.resetReviewState();
```

### Debug Panel

The system includes a debug panel component for development:

```typescript
import { ReviewConfigDebugPanel } from '../components/ReviewConfigDebugPanel';

// Add to development screens
<ReviewConfigDebugPanel />
```

## Best Practices

### Implementation Guidelines

1. **Trigger Placement**: Place triggers after positive user actions
2. **Timing**: Avoid interrupting critical user flows
3. **Frequency**: Respect cooldown periods and user preferences
4. **Fallbacks**: Always provide graceful degradation
5. **Testing**: Test thoroughly on various devices and Android versions

### Google Play Compliance

- Follow Google Play's In-App Review policies
- Respect user choice and don't force reviews
- Don't incentivize positive reviews
- Handle API limitations gracefully
- Provide alternative feedback channels

## Monitoring and Analytics

### Key Metrics to Track

- Review prompt display rate
- User interaction rate (completed vs dismissed)
- Error rates and types
- Performance impact on app
- User satisfaction correlation

### Analytics Integration

The system integrates with your existing analytics:

```typescript
// Custom analytics integration
reviewManager.setAnalyticsHandler((event) => {
  // Send to your analytics service
  Analytics.track(event.event, event.context);
});
```

## Maintenance

### Regular Tasks

1. Monitor error rates and user feedback
2. Analyze trigger effectiveness
3. Update configuration based on user behavior
4. Test with new Android versions
5. Review Google Play policy updates

### Version Updates

When updating the review system:
1. Test migration of existing user data
2. Verify backward compatibility
3. Update documentation
4. Run full test suite
5. Monitor post-deployment metrics