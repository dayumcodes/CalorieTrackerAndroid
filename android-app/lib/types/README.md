# In-App Review Types

This directory contains all TypeScript interfaces, enums, and data models for the in-app review system.

## Overview

The type definitions are organized into several categories:

### Enums

- **ReviewTrigger**: Different events that can trigger a review prompt
- **ReviewAction**: Actions a user can take when presented with a review prompt
- **ReviewErrorType**: Types of errors that can occur in the review system

### Core Interfaces

- **ReviewContext**: Context information for evaluating review triggers
- **UserState**: Current state of the user for review evaluation
- **AppState**: Current state of the application
- **TriggerResult**: Result of trigger evaluation
- **ReviewResult**: Result of a review request
- **UserAction**: User action that can be recorded for metrics

### Data Models

- **UserMetrics**: User metrics tracked for review timing decisions
- **ReviewSettings**: Settings that control review behavior
- **ReviewConfig**: Configuration for the review system

### Service Interfaces

- **ReviewManager**: Main interface for the review management service
- **TriggerEngine**: Interface for the trigger evaluation engine
- **StorageService**: Interface for data persistence service
- **ReviewDialog**: Interface for the native review dialog wrapper
- **AnalyticsTracker**: Interface for analytics tracking
- **ErrorHandler**: Interface for error handling

### Storage Schemas

- **StoredUserMetrics**: Schema for storing user metrics in AsyncStorage
- **StoredReviewSettings**: Schema for storing review settings in AsyncStorage

### Hook Interfaces

- **UseInAppReviewReturn**: Return type for the useInAppReview hook
- **TriggerReviewOptions**: Options for triggering a review

## Usage

```typescript
import {
  ReviewTrigger,
  ReviewAction,
  UserMetrics,
  ReviewManager,
  DEFAULT_REVIEW_CONFIG
} from '@/lib/types';

// Use enums
const trigger = ReviewTrigger.APP_OPEN;
const action = ReviewAction.COMPLETED;

// Use interfaces
const metrics: UserMetrics = {
  appOpenCount: 5,
  successfulFoodLogs: 10,
  // ... other properties
};

// Use default configurations
const config = DEFAULT_REVIEW_CONFIG;
```

## Default Values

The module exports several default configurations:

- `DEFAULT_REVIEW_CONFIG`: Default configuration for the review system
- `DEFAULT_REVIEW_SETTINGS`: Default review settings
- `DEFAULT_USER_METRICS`: Default user metrics for new users

## Type Safety

All interfaces are designed to provide compile-time type safety and ensure proper data flow between components. The storage schemas (`StoredUserMetrics`, `StoredReviewSettings`) are compatible with their runtime counterparts but use string representations for dates to work with AsyncStorage.

## Validation

Run `npx tsc --noEmit` to validate all type definitions are correct.