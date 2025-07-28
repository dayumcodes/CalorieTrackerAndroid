# Design Document

## Overview

The in-app review system will be implemented as a React Native service that integrates with Google Play's In-App Review API. The design follows a trigger-based architecture where user actions and app usage patterns determine when to show review prompts. The system will be non-intrusive, respecting user preferences and Google Play policies while maximizing the likelihood of positive reviews.

## Architecture

### Core Components

1. **ReviewManager**: Central service that orchestrates review prompt logic
2. **TriggerEngine**: Evaluates user actions and determines optimal review timing
3. **StorageService**: Manages persistent data for review tracking
4. **ReviewDialog**: Native interface wrapper for Google Play's review API
5. **AnalyticsTracker**: Logs review-related events for optimization

### Data Flow

```
User Action → TriggerEngine → ReviewManager → StorageService
                                    ↓
ReviewDialog ← ReviewManager ← Google Play API
```

### Integration Points

- **React Native App**: Main integration point in the Android app
- **Google Play Services**: Native in-app review API
- **AsyncStorage**: Local persistence for user preferences and tracking
- **Analytics**: Event tracking for review prompt effectiveness

## Components and Interfaces

### ReviewManager Interface

```typescript
interface ReviewManager {
  initialize(): Promise<void>;
  checkAndTriggerReview(context: ReviewContext): Promise<boolean>;
  recordUserAction(action: UserAction): void;
  isReviewAvailable(): Promise<boolean>;
  resetReviewState(): void; // For testing
}

interface ReviewContext {
  trigger: ReviewTrigger;
  userState: UserState;
  appState: AppState;
}

enum ReviewTrigger {
  APP_OPEN = 'app_open',
  SUCCESSFUL_FOOD_LOG = 'successful_food_log',
  MILESTONE_ACHIEVED = 'milestone_achieved',
  GOAL_COMPLETED = 'goal_completed',
  STREAK_MILESTONE = 'streak_milestone'
}
```

### TriggerEngine Interface

```typescript
interface TriggerEngine {
  evaluateTrigger(context: ReviewContext): Promise<TriggerResult>;
  updateUserMetrics(action: UserAction): void;
  getNextEligibleTime(): Date | null;
}

interface TriggerResult {
  shouldTrigger: boolean;
  reason: string;
  confidence: number; // 0-1 scale
  nextEligibleTime?: Date;
}

interface UserMetrics {
  appOpenCount: number;
  successfulFoodLogs: number;
  lastReviewPrompt: Date | null;
  lastReviewAction: ReviewAction | null;
  streakDays: number;
  milestonesAchieved: string[];
}
```

### StorageService Interface

```typescript
interface StorageService {
  getUserMetrics(): Promise<UserMetrics>;
  updateUserMetrics(metrics: Partial<UserMetrics>): Promise<void>;
  getReviewSettings(): Promise<ReviewSettings>;
  updateReviewSettings(settings: Partial<ReviewSettings>): Promise<void>;
  clearReviewData(): Promise<void>;
}

interface ReviewSettings {
  minimumAppOpens: number;
  cooldownDays: number;
  enabledTriggers: ReviewTrigger[];
  debugMode: boolean;
}
```

### ReviewDialog Interface

```typescript
interface ReviewDialog {
  isAvailable(): Promise<boolean>;
  requestReview(): Promise<ReviewResult>;
  openPlayStore(): void; // Fallback method
}

interface ReviewResult {
  success: boolean;
  action: ReviewAction;
  error?: string;
}

enum ReviewAction {
  COMPLETED = 'completed',
  DISMISSED = 'dismissed',
  ERROR = 'error',
  NOT_AVAILABLE = 'not_available'
}
```

## Data Models

### User Metrics Storage Schema

```typescript
interface StoredUserMetrics {
  appOpenCount: number;
  successfulFoodLogs: number;
  lastReviewPrompt: string | null; // ISO date string
  lastReviewAction: ReviewAction | null;
  streakDays: number;
  milestonesAchieved: string[];
  firstAppOpen: string; // ISO date string
  totalSessionTime: number; // in minutes
}
```

### Review Configuration

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

## Error Handling

### Error Scenarios and Responses

1. **Google Play Services Unavailable**
   - Fallback to external Play Store link
   - Log error for analytics
   - Graceful degradation without app crash

2. **Network Connectivity Issues**
   - Cache review eligibility status
   - Retry mechanism with exponential backoff
   - Offline mode handling

3. **Storage Failures**
   - Use in-memory fallback for session
   - Attempt storage recovery on next app start
   - Default to conservative review settings

4. **API Rate Limiting**
   - Respect Google Play's rate limits
   - Implement client-side throttling
   - Queue review requests if necessary

### Error Recovery Strategies

```typescript
interface ErrorHandler {
  handleReviewError(error: ReviewError): Promise<void>;
  shouldRetry(error: ReviewError): boolean;
  getRetryDelay(attemptCount: number): number;
}

enum ReviewErrorType {
  PLAY_SERVICES_UNAVAILABLE = 'play_services_unavailable',
  NETWORK_ERROR = 'network_error',
  STORAGE_ERROR = 'storage_error',
  API_RATE_LIMIT = 'api_rate_limit',
  UNKNOWN_ERROR = 'unknown_error'
}
```

## Testing Strategy

### Unit Testing

1. **ReviewManager Tests**
   - Mock Google Play API responses
   - Test trigger logic with various user states
   - Verify cooldown period enforcement
   - Test error handling scenarios

2. **TriggerEngine Tests**
   - Test trigger evaluation logic
   - Verify user metrics calculations
   - Test edge cases (new users, heavy users)
   - Validate timing constraints

3. **StorageService Tests**
   - Test data persistence and retrieval
   - Verify data migration scenarios
   - Test storage error handling
   - Validate data integrity

### Integration Testing

1. **End-to-End Review Flow**
   - Test complete review prompt flow
   - Verify Google Play integration
   - Test fallback mechanisms
   - Validate user experience

2. **Cross-Platform Testing**
   - Test on various Android versions
   - Verify Google Play Services compatibility
   - Test on different device configurations
   - Validate performance impact

### Manual Testing Scenarios

1. **New User Journey**
   - Install app and track review eligibility
   - Test various trigger scenarios
   - Verify timing and frequency

2. **Existing User Migration**
   - Test data migration from previous versions
   - Verify preserved user preferences
   - Test upgrade scenarios

3. **Edge Cases**
   - Test with disabled Google Play Services
   - Test in airplane mode
   - Test with corrupted storage data

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**
   - Load review components only when needed
   - Defer Google Play Services initialization
   - Minimize app startup impact

2. **Caching**
   - Cache review availability status
   - Store user metrics in memory during session
   - Batch storage operations

3. **Background Processing**
   - Process user actions asynchronously
   - Use background queues for analytics
   - Minimize main thread blocking

### Performance Metrics

- Review prompt display time: < 200ms
- Storage operations: < 50ms
- Memory usage: < 1MB additional
- App startup impact: < 10ms

## Security and Privacy

### Data Protection

1. **User Data Handling**
   - Store only necessary metrics locally
   - No personal information in review data
   - Respect user privacy preferences

2. **Analytics Data**
   - Anonymize user identifiers
   - Aggregate data before transmission
   - Comply with privacy regulations

### Security Measures

1. **Input Validation**
   - Validate all user inputs
   - Sanitize stored data
   - Prevent injection attacks

2. **API Security**
   - Use secure communication channels
   - Implement proper authentication
   - Handle API keys securely