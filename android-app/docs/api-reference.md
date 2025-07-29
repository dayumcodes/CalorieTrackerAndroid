# In-App Review System API Reference

## Core Classes

### ReviewManager

The central orchestration service for the in-app review system.

#### Constructor

```typescript
constructor(config?: Partial<ReviewConfig>)
```

Creates a new ReviewManager instance with optional configuration.

**Parameters:**
- `config` (optional): Partial configuration object to override defaults

**Example:**
```typescript
const reviewManager = new ReviewManager({
  cooldownPeriod: 45,
  debugMode: true
});
```

#### Static Methods

##### getInstance()

```typescript
static getInstance(): ReviewManager
```

Returns the singleton instance of ReviewManager.

**Returns:** `ReviewManager` - The singleton instance

**Example:**
```typescript
const reviewManager = ReviewManager.getInstance();
```

#### Instance Methods

##### initialize()

```typescript
async initialize(): Promise<void>
```

Initializes the review system, loading configuration and user metrics.

**Throws:** `Error` if initialization fails

**Example:**
```typescript
await reviewManager.initialize();
```

##### checkAndTriggerReview()

```typescript
async checkAndTriggerReview(context: ReviewContext): Promise<boolean>
```

Evaluates triggers and shows review prompt if conditions are met.

**Parameters:**
- `context`: Review context containing trigger information

**Returns:** `Promise<boolean>` - True if review was triggered

**Example:**
```typescript
const triggered = await reviewManager.checkAndTriggerReview({
  trigger: 'SUCCESSFUL_FOOD_LOG',
  userState: { level: 5 },
  appState: { screen: 'food-logging' }
});
```

##### recordUserAction()

```typescript
recordUserAction(action: UserAction): void
```

Records a user action for trigger evaluation.

**Parameters:**
- `action`: User action object

**Example:**
```typescript
reviewManager.recordUserAction({
  type: 'SUCCESSFUL_FOOD_LOG',
  timestamp: new Date(),
  context: { foodType: 'breakfast' }
});
```

##### isReviewAvailable()

```typescript
async isReviewAvailable(): Promise<boolean>
```

Checks if Google Play In-App Review is available.

**Returns:** `Promise<boolean>` - True if review is available

##### updateConfig()

```typescript
async updateConfig(config: Partial<ReviewConfig>): Promise<void>
```

Updates the review system configuration.

**Parameters:**
- `config`: Partial configuration to merge with existing config

**Example:**
```typescript
await reviewManager.updateConfig({
  cooldownPeriod: 60,
  debugMode: false
});
```

##### getConfig()

```typescript
getConfig(): ReviewConfig
```

Returns the current configuration.

**Returns:** `ReviewConfig` - Current configuration object

##### resetReviewState()

```typescript
async resetReviewState(): Promise<void>
```

Resets all review-related user data (for testing purposes).

##### forceReview()

```typescript
async forceReview(): Promise<boolean>
```

Forces a review prompt to appear (debug mode only).

**Returns:** `Promise<boolean>` - True if review was shown

### TriggerEngine

Evaluates user actions and determines optimal review timing.

#### Constructor

```typescript
constructor(config: ReviewConfig, storageService: StorageService)
```

**Parameters:**
- `config`: Review system configuration
- `storageService`: Storage service instance

#### Methods

##### evaluateTrigger()

```typescript
async evaluateTrigger(context: ReviewContext): Promise<TriggerResult>
```

Evaluates whether a trigger should show a review prompt.

**Parameters:**
- `context`: Review context

**Returns:** `Promise<TriggerResult>` - Evaluation result

**Example:**
```typescript
const result = await triggerEngine.evaluateTrigger({
  trigger: 'APP_OPEN',
  userState: {},
  appState: {}
});

console.log('Should trigger:', result.shouldTrigger);
console.log('Reason:', result.reason);
console.log('Confidence:', result.confidence);
```

##### updateUserMetrics()

```typescript
updateUserMetrics(action: UserAction): void
```

Updates user metrics based on an action.

**Parameters:**
- `action`: User action object

##### getNextEligibleTime()

```typescript
getNextEligibleTime(): Date | null
```

Returns the next time the user is eligible for a review prompt.

**Returns:** `Date | null` - Next eligible time or null if eligible now

### StorageService

Manages persistent data for review tracking.

#### Constructor

```typescript
constructor()
```

#### Methods

##### getUserMetrics()

```typescript
async getUserMetrics(): Promise<UserMetrics>
```

Retrieves user metrics from storage.

**Returns:** `Promise<UserMetrics>` - User metrics object

##### updateUserMetrics()

```typescript
async updateUserMetrics(metrics: Partial<UserMetrics>): Promise<void>
```

Updates user metrics in storage.

**Parameters:**
- `metrics`: Partial metrics to update

**Example:**
```typescript
await storageService.updateUserMetrics({
  appOpenCount: 10,
  successfulFoodLogs: 5
});
```

##### getReviewSettings()

```typescript
async getReviewSettings(): Promise<ReviewSettings>
```

Retrieves review settings from storage.

**Returns:** `Promise<ReviewSettings>` - Review settings object

##### updateReviewSettings()

```typescript
async updateReviewSettings(settings: Partial<ReviewSettings>): Promise<void>
```

Updates review settings in storage.

**Parameters:**
- `settings`: Partial settings to update

##### clearReviewData()

```typescript
async clearReviewData(): Promise<void>
```

Clears all review-related data from storage.

### ReviewDialog

Native interface wrapper for Google Play's review API.

#### Constructor

```typescript
constructor()
```

#### Methods

##### isAvailable()

```typescript
async isAvailable(): Promise<boolean>
```

Checks if Google Play In-App Review is available.

**Returns:** `Promise<boolean>` - True if available

##### requestReview()

```typescript
async requestReview(): Promise<ReviewResult>
```

Requests a review from the user using Google Play's native dialog.

**Returns:** `Promise<ReviewResult>` - Result of the review request

**Example:**
```typescript
const result = await reviewDialog.requestReview();

switch (result.action) {
  case 'COMPLETED':
    console.log('User completed review');
    break;
  case 'DISMISSED':
    console.log('User dismissed review');
    break;
  case 'ERROR':
    console.error('Review error:', result.error);
    break;
}
```

##### openPlayStore()

```typescript
openPlayStore(): void
```

Opens the external Play Store page as a fallback.

### AnalyticsTracker

Logs review-related events for optimization.

#### Constructor

```typescript
constructor(analyticsHandler?: (event: AnalyticsEvent) => void)
```

**Parameters:**
- `analyticsHandler` (optional): Custom analytics handler function

#### Methods

##### trackEvent()

```typescript
trackEvent(event: string, context: Record<string, any>): void
```

Tracks a review-related event.

**Parameters:**
- `event`: Event name
- `context`: Event context data

**Example:**
```typescript
analyticsTracker.trackEvent('review_prompt_shown', {
  trigger: 'SUCCESSFUL_FOOD_LOG',
  userLevel: 5
});
```

##### setAnalyticsHandler()

```typescript
setAnalyticsHandler(handler: (event: AnalyticsEvent) => void): void
```

Sets a custom analytics handler.

**Parameters:**
- `handler`: Analytics handler function

## React Hooks

### useInAppReview

React hook for easy integration with the review system.

#### Usage

```typescript
const {
  triggerReview,
  recordAction,
  isAvailable,
  isLoading,
  error
} = useInAppReview();
```

#### Return Values

##### triggerReview

```typescript
(trigger: ReviewTrigger) => Promise<boolean>
```

Triggers a review check for the specified trigger.

**Parameters:**
- `trigger`: The trigger type

**Returns:** `Promise<boolean>` - True if review was triggered

##### recordAction

```typescript
(action: UserAction) => void
```

Records a user action for trigger evaluation.

**Parameters:**
- `action`: User action object

##### isAvailable

```typescript
boolean
```

Whether Google Play In-App Review is available.

##### isLoading

```typescript
boolean
```

Whether a review operation is in progress.

##### error

```typescript
string | null
```

Current error message, if any.

## Type Definitions

### ReviewConfig

```typescript
interface ReviewConfig {
  triggers: {
    [ReviewTrigger.APP_OPEN]: {
      minimumCount: number;
      enabled: boolean;
    };
    [ReviewTrigger.SUCCESSFUL_FOOD_LOG]: {
      minimumCount: number;
      enabled: boolean;
    };
    [ReviewTrigger.MILESTONE_ACHIEVED]: {
      milestones: string[];
      enabled: boolean;
    };
    [ReviewTrigger.STREAK_MILESTONE]: {
      streakDays: number[];
      enabled: boolean;
    };
  };
  cooldownPeriod: number; // days
  maxPromptsPerUser: number;
  debugMode: boolean;
}
```

### UserMetrics

```typescript
interface UserMetrics {
  appOpenCount: number;
  successfulFoodLogs: number;
  lastReviewPrompt: Date | null;
  lastReviewAction: ReviewAction | null;
  streakDays: number;
  milestonesAchieved: string[];
  firstAppOpen: Date;
  totalSessionTime: number; // minutes
}
```

### ReviewContext

```typescript
interface ReviewContext {
  trigger: ReviewTrigger;
  userState: Record<string, any>;
  appState: Record<string, any>;
}
```

### TriggerResult

```typescript
interface TriggerResult {
  shouldTrigger: boolean;
  reason: string;
  confidence: number; // 0-1 scale
  nextEligibleTime?: Date;
}
```

### ReviewResult

```typescript
interface ReviewResult {
  success: boolean;
  action: ReviewAction;
  error?: string;
}
```

### UserAction

```typescript
interface UserAction {
  type: string;
  timestamp: Date;
  context: Record<string, any>;
}
```

### AnalyticsEvent

```typescript
interface AnalyticsEvent {
  event: string;
  timestamp: Date;
  context: Record<string, any>;
}
```

## Enums

### ReviewTrigger

```typescript
enum ReviewTrigger {
  APP_OPEN = 'app_open',
  SUCCESSFUL_FOOD_LOG = 'successful_food_log',
  MILESTONE_ACHIEVED = 'milestone_achieved',
  GOAL_COMPLETED = 'goal_completed',
  STREAK_MILESTONE = 'streak_milestone'
}
```

### ReviewAction

```typescript
enum ReviewAction {
  COMPLETED = 'completed',
  DISMISSED = 'dismissed',
  ERROR = 'error',
  NOT_AVAILABLE = 'not_available'
}
```

### ReviewErrorType

```typescript
enum ReviewErrorType {
  PLAY_SERVICES_UNAVAILABLE = 'play_services_unavailable',
  NETWORK_ERROR = 'network_error',
  STORAGE_ERROR = 'storage_error',
  API_RATE_LIMIT = 'api_rate_limit',
  UNKNOWN_ERROR = 'unknown_error'
}
```

## Error Handling

### Error Types

The system defines specific error types for different failure scenarios:

```typescript
class ReviewError extends Error {
  constructor(
    message: string,
    public type: ReviewErrorType,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}
```

### Error Handling Patterns

#### Try-Catch with Specific Error Types

```typescript
try {
  await reviewManager.checkAndTriggerReview(context);
} catch (error) {
  if (error instanceof ReviewError) {
    switch (error.type) {
      case ReviewErrorType.PLAY_SERVICES_UNAVAILABLE:
        // Handle Play Services unavailable
        break;
      case ReviewErrorType.NETWORK_ERROR:
        // Handle network issues
        break;
      default:
        // Handle other errors
        break;
    }
  }
}
```

#### Error Recovery

```typescript
const handleReviewError = async (error: ReviewError) => {
  switch (error.type) {
    case ReviewErrorType.PLAY_SERVICES_UNAVAILABLE:
      // Fallback to external Play Store
      reviewDialog.openPlayStore();
      break;
      
    case ReviewErrorType.NETWORK_ERROR:
      // Retry with exponential backoff
      await retryWithBackoff(() => reviewManager.triggerReview(trigger));
      break;
      
    case ReviewErrorType.STORAGE_ERROR:
      // Use in-memory fallback
      await reviewManager.initializeWithDefaults();
      break;
  }
};
```

## Configuration Examples

### Development Configuration

```typescript
const developmentConfig: ReviewConfig = {
  triggers: {
    APP_OPEN: { minimumCount: 1, enabled: true },
    SUCCESSFUL_FOOD_LOG: { minimumCount: 1, enabled: true },
    MILESTONE_ACHIEVED: { milestones: ['test'], enabled: true },
    STREAK_MILESTONE: { streakDays: [1], enabled: true }
  },
  cooldownPeriod: 0, // No cooldown for testing
  maxPromptsPerUser: 10,
  debugMode: true
};
```

### Production Configuration

```typescript
const productionConfig: ReviewConfig = {
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

### Conservative Configuration

```typescript
const conservativeConfig: ReviewConfig = {
  triggers: {
    APP_OPEN: { minimumCount: 10, enabled: true },
    SUCCESSFUL_FOOD_LOG: { minimumCount: 8, enabled: true },
    MILESTONE_ACHIEVED: { milestones: ['month_1'], enabled: true },
    STREAK_MILESTONE: { streakDays: [30], enabled: true }
  },
  cooldownPeriod: 60,
  maxPromptsPerUser: 1,
  debugMode: false
};
```

## Performance Considerations

### Optimization Guidelines

1. **Lazy Loading**: Components are loaded only when needed
2. **Caching**: Review availability and user metrics are cached
3. **Background Processing**: Non-critical operations run in background
4. **Memory Management**: Proper cleanup and memory management

### Performance Monitoring

```typescript
// Monitor performance metrics
const performanceMonitor = {
  measureInitTime: async () => {
    const start = performance.now();
    await reviewManager.initialize();
    return performance.now() - start;
  },
  
  measureMemoryUsage: () => {
    return performance.memory?.usedJSHeapSize || 0;
  },
  
  measureStorageTime: async () => {
    const start = performance.now();
    await storageService.getUserMetrics();
    return performance.now() - start;
  }
};
```

## Best Practices

### Implementation Best Practices

1. **Initialize Early**: Initialize the review system during app startup
2. **Handle Errors Gracefully**: Always provide fallback mechanisms
3. **Respect User Choice**: Don't force reviews or ignore dismissals
4. **Monitor Performance**: Track impact on app performance
5. **Test Thoroughly**: Test on various devices and scenarios

### Google Play Compliance

1. **Follow Policies**: Adhere to Google Play's In-App Review policies
2. **Natural Timing**: Show prompts at natural, positive moments
3. **No Incentives**: Don't incentivize positive reviews
4. **Respect Limits**: Honor rate limits and user preferences
5. **Provide Alternatives**: Offer alternative feedback channels

### Analytics Best Practices

1. **Track Key Events**: Monitor prompt displays, interactions, and errors
2. **Respect Privacy**: Don't track personally identifiable information
3. **Aggregate Data**: Use aggregated data for analysis
4. **Monitor Trends**: Track trends over time for optimization
5. **Act on Insights**: Use analytics data to improve the system