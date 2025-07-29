# In-App Review System Troubleshooting Guide

## Common Issues and Solutions

### 1. Review Prompts Not Appearing

#### Symptoms
- Review dialog never shows up
- `triggerReview()` returns false
- No review-related analytics events

#### Possible Causes & Solutions

**A. Google Play Services Not Available**
```typescript
// Check availability
const reviewDialog = new ReviewDialog();
const isAvailable = await reviewDialog.isAvailable();
console.log('Review available:', isAvailable);
```

*Solutions:*
- Ensure device has Google Play Services installed
- Test on physical device (not emulator without Play Services)
- Verify app is installed from Play Store for production testing

**B. Trigger Conditions Not Met**
```typescript
// Check user metrics
const storageService = new StorageService();
const metrics = await storageService.getUserMetrics();
console.log('Current metrics:', metrics);

// Check trigger evaluation
const triggerEngine = new TriggerEngine();
const result = await triggerEngine.evaluateTrigger({
  trigger: 'APP_OPEN',
  userState: {},
  appState: {}
});
console.log('Trigger result:', result);
```

*Solutions:*
- Verify minimum trigger thresholds are met
- Check if user is within cooldown period
- Ensure triggers are enabled in configuration

**C. Cooldown Period Active**
```typescript
// Check last review prompt date
const metrics = await storageService.getUserMetrics();
const lastPrompt = metrics.lastReviewPrompt;
const cooldownDays = 30; // Your configured cooldown

if (lastPrompt) {
  const daysSinceLastPrompt = (Date.now() - lastPrompt.getTime()) / (1000 * 60 * 60 * 24);
  console.log('Days since last prompt:', daysSinceLastPrompt);
  console.log('Cooldown remaining:', Math.max(0, cooldownDays - daysSinceLastPrompt));
}
```

*Solutions:*
- Wait for cooldown period to expire
- Reduce cooldown period in configuration for testing
- Use debug mode to bypass cooldown

### 2. Storage-Related Issues

#### Symptoms
- User metrics not persisting between app sessions
- Configuration changes not saving
- App crashes on storage operations

#### Possible Causes & Solutions

**A. AsyncStorage Not Properly Configured**
```bash
# Ensure AsyncStorage is installed
npm list @react-native-async-storage/async-storage

# Reinstall if necessary
npm install @react-native-async-storage/async-storage
```

**B. Storage Permission Issues**
```typescript
// Test storage operations
try {
  await AsyncStorage.setItem('@test_key', 'test_value');
  const value = await AsyncStorage.getItem('@test_key');
  console.log('Storage test successful:', value);
  await AsyncStorage.removeItem('@test_key');
} catch (error) {
  console.error('Storage test failed:', error);
}
```

*Solutions:*
- Check device storage permissions
- Verify app has sufficient storage space
- Clear app data and test fresh installation

**C. Data Corruption**
```typescript
// Clear corrupted data
const storageService = new StorageService();
await storageService.clearReviewData();

// Reinitialize with defaults
const reviewManager = ReviewManager.getInstance();
await reviewManager.initialize();
```

### 3. Performance Issues

#### Symptoms
- App startup delay
- UI freezing during review operations
- High memory usage

#### Diagnostic Steps

**A. Measure Performance Impact**
```typescript
// Measure initialization time
const startTime = Date.now();
await reviewManager.initialize();
const initTime = Date.now() - startTime;
console.log('Review system init time:', initTime, 'ms');

// Monitor memory usage
const memoryBefore = performance.memory?.usedJSHeapSize || 0;
// Perform review operations
const memoryAfter = performance.memory?.usedJSHeapSize || 0;
console.log('Memory impact:', memoryAfter - memoryBefore, 'bytes');
```

**B. Profile Storage Operations**
```typescript
// Profile storage performance
const profileStorage = async () => {
  const start = Date.now();
  await storageService.getUserMetrics();
  const readTime = Date.now() - start;
  
  const updateStart = Date.now();
  await storageService.updateUserMetrics({ appOpenCount: 1 });
  const updateTime = Date.now() - updateStart;
  
  console.log('Storage read time:', readTime, 'ms');
  console.log('Storage update time:', updateTime, 'ms');
};
```

*Solutions:*
- Enable lazy loading for review components
- Use background processing for non-critical operations
- Implement caching for frequently accessed data
- Batch storage operations

### 4. Google Play API Errors

#### Symptoms
- Review dialog shows error message
- API calls fail with specific error codes
- Fallback to external Play Store not working

#### Common Error Codes

**A. API_NOT_AVAILABLE (Error Code: 1)**
```typescript
// Handle API unavailability
try {
  const result = await reviewDialog.requestReview();
  if (result.action === 'ERROR' && result.error?.includes('API_NOT_AVAILABLE')) {
    // Fallback to external Play Store
    reviewDialog.openPlayStore();
  }
} catch (error) {
  console.error('Review API error:', error);
}
```

*Solutions:*
- Ensure app is published on Play Store
- Test with signed APK/AAB
- Verify Google Play Services version

**B. RATE_LIMIT_EXCEEDED (Error Code: 2)**
```typescript
// Implement rate limiting
const rateLimiter = {
  lastRequest: 0,
  minInterval: 24 * 60 * 60 * 1000, // 24 hours
  
  canRequest(): boolean {
    return Date.now() - this.lastRequest > this.minInterval;
  },
  
  recordRequest(): void {
    this.lastRequest = Date.now();
  }
};
```

*Solutions:*
- Implement client-side rate limiting
- Respect Google's quota limitations
- Add exponential backoff for retries

### 5. Testing and Debug Issues

#### Symptoms
- Debug mode not working
- Tests failing inconsistently
- Unable to force review prompts

#### Debug Mode Troubleshooting

**A. Enable Comprehensive Debugging**
```typescript
// Enable all debug features
const debugConfig = {
  debugMode: true,
  logLevel: 'verbose',
  bypassCooldown: true,
  forceReviewAvailable: true
};

const reviewManager = new ReviewManager(debugConfig);
```

**B. Debug Panel Not Showing**
```typescript
// Verify debug panel integration
import { ReviewConfigDebugPanel } from '../components/ReviewConfigDebugPanel';

function DebugScreen() {
  if (!__DEV__) {
    return <Text>Debug panel only available in development</Text>;
  }
  
  return <ReviewConfigDebugPanel />;
}
```

**C. Force Review for Testing**
```typescript
// Force review bypass all conditions
if (__DEV__) {
  const reviewManager = ReviewManager.getInstance();
  await reviewManager.forceReview();
}
```

### 6. Analytics and Tracking Issues

#### Symptoms
- Analytics events not firing
- Missing event data
- Incorrect event timestamps

#### Diagnostic Steps

**A. Verify Analytics Handler**
```typescript
// Test analytics integration
const reviewManager = ReviewManager.getInstance();

reviewManager.setAnalyticsHandler((event) => {
  console.log('Analytics event:', event);
  // Verify your analytics service receives this
});

// Trigger test event
reviewManager.recordUserAction({
  type: 'TEST_ACTION',
  timestamp: new Date(),
  context: { test: true }
});
```

**B. Check Event Structure**
```typescript
// Validate event data
const validateEvent = (event: AnalyticsEvent) => {
  const required = ['event', 'timestamp', 'context'];
  const missing = required.filter(field => !event[field]);
  
  if (missing.length > 0) {
    console.error('Missing event fields:', missing);
  }
  
  return missing.length === 0;
};
```

### 7. Device-Specific Issues

#### Android Version Compatibility

**A. API Level Issues**
```typescript
// Check Android API level
import { Platform } from 'react-native';

const checkCompatibility = () => {
  const apiLevel = Platform.Version;
  const minRequired = 21; // Android 5.0
  
  if (apiLevel < minRequired) {
    console.warn(`Android API ${apiLevel} may not support in-app reviews`);
    return false;
  }
  
  return true;
};
```

**B. Device-Specific Workarounds**
```typescript
// Handle known device issues
const deviceWorkarounds = {
  // Samsung devices with custom Play Store
  samsung: () => {
    // Implement Samsung-specific handling
  },
  
  // Huawei devices without Play Services
  huawei: () => {
    // Disable review system or use alternative
    return false;
  }
};
```

### 8. Network-Related Issues

#### Symptoms
- Review API calls timing out
- Intermittent connection failures
- Offline functionality not working

#### Solutions

**A. Implement Network Checking**
```typescript
import NetInfo from '@react-native-community/netinfo';

const checkNetworkAndTrigger = async () => {
  const networkState = await NetInfo.fetch();
  
  if (!networkState.isConnected) {
    console.log('No network connection, deferring review');
    return false;
  }
  
  return await reviewManager.triggerReview('APP_OPEN');
};
```

**B. Add Retry Logic**
```typescript
const retryWithBackoff = async (operation: () => Promise<any>, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};
```

## Diagnostic Tools

### 1. Review System Health Check

```typescript
const healthCheck = async () => {
  const results = {
    googlePlayServices: false,
    storage: false,
    configuration: false,
    userMetrics: false
  };
  
  try {
    // Check Google Play Services
    const reviewDialog = new ReviewDialog();
    results.googlePlayServices = await reviewDialog.isAvailable();
    
    // Check storage
    const storageService = new StorageService();
    await storageService.getUserMetrics();
    results.storage = true;
    
    // Check configuration
    const reviewManager = ReviewManager.getInstance();
    const config = reviewManager.getConfig();
    results.configuration = !!config;
    
    // Check user metrics
    const metrics = await storageService.getUserMetrics();
    results.userMetrics = typeof metrics.appOpenCount === 'number';
    
  } catch (error) {
    console.error('Health check error:', error);
  }
  
  return results;
};
```

### 2. Configuration Validator

```typescript
const validateConfiguration = (config: ReviewConfig) => {
  const issues: string[] = [];
  
  // Check trigger configuration
  Object.entries(config.triggers).forEach(([trigger, settings]) => {
    if (settings.enabled && !settings.minimumCount) {
      issues.push(`${trigger}: minimumCount not set`);
    }
  });
  
  // Check cooldown period
  if (config.cooldownPeriod < 1) {
    issues.push('Cooldown period too short');
  }
  
  // Check max prompts
  if (config.maxPromptsPerUser < 1) {
    issues.push('Max prompts per user too low');
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
};
```

### 3. User Metrics Inspector

```typescript
const inspectUserMetrics = async () => {
  const storageService = new StorageService();
  const metrics = await storageService.getUserMetrics();
  
  console.log('=== User Metrics ===');
  console.log('App Opens:', metrics.appOpenCount);
  console.log('Food Logs:', metrics.successfulFoodLogs);
  console.log('Last Review:', metrics.lastReviewPrompt);
  console.log('Last Action:', metrics.lastReviewAction);
  console.log('Streak Days:', metrics.streakDays);
  console.log('Milestones:', metrics.milestonesAchieved);
  
  // Calculate eligibility
  const triggerEngine = new TriggerEngine();
  const eligibility = await triggerEngine.evaluateTrigger({
    trigger: 'APP_OPEN',
    userState: {},
    appState: {}
  });
  
  console.log('=== Eligibility ===');
  console.log('Should Trigger:', eligibility.shouldTrigger);
  console.log('Reason:', eligibility.reason);
  console.log('Confidence:', eligibility.confidence);
};
```

## Emergency Procedures

### 1. Disable Review System

If the review system is causing critical issues:

```typescript
// Emergency disable
const emergencyDisable = async () => {
  const reviewManager = ReviewManager.getInstance();
  
  // Disable all triggers
  await reviewManager.updateConfig({
    triggers: {
      APP_OPEN: { enabled: false },
      SUCCESSFUL_FOOD_LOG: { enabled: false },
      MILESTONE_ACHIEVED: { enabled: false },
      STREAK_MILESTONE: { enabled: false }
    }
  });
  
  console.log('Review system disabled');
};
```

### 2. Reset User Data

If user data is corrupted:

```typescript
// Reset all review data
const resetReviewData = async () => {
  const storageService = new StorageService();
  await storageService.clearReviewData();
  
  const reviewManager = ReviewManager.getInstance();
  await reviewManager.initialize();
  
  console.log('Review data reset');
};
```

### 3. Fallback Mode

Enable fallback mode for critical issues:

```typescript
// Enable fallback mode
const enableFallbackMode = async () => {
  const reviewManager = ReviewManager.getInstance();
  
  await reviewManager.updateConfig({
    debugMode: true,
    fallbackToExternal: true,
    disableNativeReview: true
  });
  
  console.log('Fallback mode enabled');
};
```

## Getting Help

### 1. Enable Verbose Logging

```typescript
// Enable detailed logging
const reviewManager = ReviewManager.getInstance();
reviewManager.setLogLevel('verbose');
```

### 2. Export Debug Information

```typescript
const exportDebugInfo = async () => {
  const healthCheck = await healthCheck();
  const metrics = await storageService.getUserMetrics();
  const config = reviewManager.getConfig();
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    platform: Platform.OS,
    version: Platform.Version,
    healthCheck,
    metrics,
    config
  };
  
  console.log('Debug Info:', JSON.stringify(debugInfo, null, 2));
  return debugInfo;
};
```

### 3. Contact Support

When contacting support, include:
- Debug information export
- Device and OS version
- App version
- Steps to reproduce the issue
- Error messages and logs
- Expected vs actual behavior

## Prevention

### 1. Regular Health Checks

Implement regular health checks in your app:

```typescript
// Run health check on app start
useEffect(() => {
  if (__DEV__) {
    healthCheck().then(results => {
      console.log('Review system health:', results);
    });
  }
}, []);
```

### 2. Monitoring

Set up monitoring for key metrics:
- Review prompt success rate
- Error rates by type
- Performance impact
- User satisfaction

### 3. Testing

Regular testing procedures:
- Test on various devices and Android versions
- Test with and without Google Play Services
- Test network connectivity scenarios
- Test storage edge cases