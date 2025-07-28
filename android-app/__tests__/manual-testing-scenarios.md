# Manual Testing Scenarios for In-App Review System

This document provides comprehensive manual testing scenarios to validate the in-app review system functionality across different user journeys and edge cases.

## Prerequisites

Before starting manual testing:

1. **Device Setup**
   - Android device with API level 21+ (Android 5.0+)
   - Google Play Services installed and updated
   - App installed from Google Play Store (for production testing)
   - Debug build with review system enabled

2. **Test Environment**
   - Enable debug mode in review configuration
   - Set lower thresholds for testing (e.g., 3 app opens instead of 5)
   - Ensure analytics tracking is enabled
   - Have access to app logs and debug panels

3. **Test Data Reset**
   - Clear app data before each test scenario
   - Reset review system state using debug panel
   - Verify clean slate for user metrics

## Test Scenarios

### Scenario 1: New User Journey - App Open Trigger

**Objective**: Verify review prompt appears for new users after meeting app open threshold.

**Steps**:
1. Install fresh app (clear all data)
2. Open app for the first time
3. Navigate through onboarding
4. Close and reopen app 4 more times (total 5 opens)
5. On the 5th open, verify review prompt appears

**Expected Results**:
- No review prompt on opens 1-4
- Review prompt appears on 5th open
- Prompt uses native Google Play dialog
- User can rate without leaving app
- Analytics events are logged correctly

**Variations**:
- Test with different app open counts
- Test with app opens spread over multiple days
- Test with app crashes between opens

### Scenario 2: Successful Food Logging Trigger

**Objective**: Verify review prompt appears after successful food logging actions.

**Steps**:
1. Complete app setup and reach minimum app opens
2. Log food entries successfully 9 times
3. On the 10th successful food log, verify review prompt

**Expected Results**:
- Review prompt appears after 10th successful food log
- Prompt appears immediately after successful action
- Context includes food logging success information
- User engagement metrics are updated

**Variations**:
- Test with failed food logging attempts (should not count)
- Test with food logging on different screens
- Test with batch food logging

### Scenario 3: Milestone Achievement Trigger

**Objective**: Verify review prompt appears when user achieves significant milestones.

**Steps**:
1. Set up user with sufficient app usage
2. Achieve 7-day streak milestone
3. Verify review prompt appears immediately
4. Test other milestones (30-day streak, first goal completion)

**Expected Results**:
- Review prompt appears immediately after milestone
- High confidence score for milestone triggers
- Milestone information included in analytics
- Prompt appears on appropriate screen (progress/achievement)

**Variations**:
- Test different milestone types
- Test milestone achievements on different screens
- Test multiple milestones in short succession

### Scenario 4: Goal Completion Trigger

**Objective**: Verify review prompt appears when user completes goals.

**Steps**:
1. Set up user with active goals
2. Complete a significant goal (weight loss target, calorie goal)
3. Verify review prompt appears after goal completion
4. Test with different goal types

**Expected Results**:
- Review prompt appears after goal completion
- High confidence score for goal completion
- Goal completion context in analytics
- Appropriate timing (not during goal celebration)

### Scenario 5: Review Dismissal and Cooldown

**Objective**: Verify cooldown period is enforced after user dismisses review.

**Steps**:
1. Trigger review prompt using any method
2. Dismiss the review dialog
3. Attempt to trigger review again immediately
4. Verify no prompt appears
5. Wait for cooldown period to expire
6. Verify prompt can appear again

**Expected Results**:
- No review prompt during cooldown period
- Cooldown period respects configuration (default 30 days)
- Analytics track dismissal event
- Next eligible time is calculated correctly

**Variations**:
- Test different cooldown periods
- Test with configuration changes during cooldown
- Test with app updates during cooldown

### Scenario 6: Review Completion Flow

**Objective**: Verify complete review flow from prompt to completion.

**Steps**:
1. Trigger review prompt
2. Complete review in Google Play dialog
3. Verify user returns to app
4. Check that review completion is tracked
5. Verify no more prompts appear (permanent completion)

**Expected Results**:
- Native Google Play review dialog appears
- User can complete review without leaving app
- App continues normally after review
- Review completion tracked in analytics
- No future prompts for this user

### Scenario 7: Google Play Services Unavailable

**Objective**: Verify fallback behavior when Google Play Services is unavailable.

**Steps**:
1. Disable Google Play Services on device
2. Trigger review prompt
3. Verify fallback behavior
4. Test external Play Store link fallback

**Expected Results**:
- System detects Google Play Services unavailability
- Graceful fallback to external Play Store link
- Error is logged but app doesn't crash
- User experience remains smooth

**Variations**:
- Test with outdated Google Play Services
- Test with restricted/managed devices
- Test with alternative app stores

### Scenario 8: Network Connectivity Issues

**Objective**: Verify behavior during network connectivity problems.

**Steps**:
1. Trigger review prompt with no network connection
2. Verify error handling
3. Test with intermittent connectivity
4. Test retry mechanism

**Expected Results**:
- Graceful handling of network errors
- Appropriate error messages
- Retry mechanism works correctly
- No app crashes or freezes

### Scenario 9: App State Restrictions

**Objective**: Verify review prompts respect app state restrictions.

**Steps**:
1. Trigger review during app loading
2. Trigger review during error states
3. Trigger review on restricted screens (onboarding, settings)
4. Verify prompts are deferred or blocked

**Expected Results**:
- No prompts during loading states
- No prompts during error conditions
- No prompts on restricted screens
- Prompts appear when app state is appropriate

### Scenario 10: Multiple Trigger Conditions

**Objective**: Verify behavior when multiple trigger conditions are met simultaneously.

**Steps**:
1. Set up user meeting multiple trigger conditions
2. Achieve milestone while also meeting app open threshold
3. Verify only one prompt appears
4. Test priority handling

**Expected Results**:
- Only one review prompt appears
- Highest priority/confidence trigger is used
- Other triggers are properly handled
- No duplicate prompts

### Scenario 11: Configuration Changes

**Objective**: Verify system handles runtime configuration changes.

**Steps**:
1. Change review thresholds during app usage
2. Enable/disable different triggers
3. Modify cooldown periods
4. Verify changes take effect immediately

**Expected Results**:
- Configuration changes apply immediately
- No app restart required
- Existing user state is preserved
- New thresholds are respected

### Scenario 12: Performance Impact

**Objective**: Verify review system has minimal performance impact.

**Steps**:
1. Monitor app startup time with review system
2. Record user actions rapidly
3. Trigger multiple review evaluations
4. Monitor memory usage and CPU impact

**Expected Results**:
- Minimal impact on app startup (<50ms)
- Smooth user action recording
- No UI lag during review evaluation
- Reasonable memory usage

### Scenario 13: Analytics and Debugging

**Objective**: Verify analytics tracking and debugging capabilities.

**Steps**:
1. Enable debug mode and analytics
2. Perform various user actions
3. Trigger review prompts
4. Check debug panel and logs
5. Verify analytics events

**Expected Results**:
- All user actions are tracked
- Review events are logged correctly
- Debug panel shows accurate information
- Analytics data is properly formatted

### Scenario 14: Edge Cases and Error Recovery

**Objective**: Test system behavior in edge cases and error conditions.

**Steps**:
1. Test with corrupted storage data
2. Test with invalid user metrics
3. Test with system date/time changes
4. Test with app version updates

**Expected Results**:
- Graceful handling of corrupted data
- Recovery from invalid states
- Proper handling of time changes
- Smooth migration between app versions

### Scenario 15: User Privacy and Data Handling

**Objective**: Verify user privacy is maintained and data is handled properly.

**Steps**:
1. Review stored user data
2. Verify no personal information is stored
3. Test data export/deletion
4. Verify compliance with privacy policies

**Expected Results**:
- Only necessary metrics are stored
- No personal identifiable information
- Data can be cleared on request
- Privacy policies are followed

## Test Execution Guidelines

### Before Each Test
1. Clear app data and reset review state
2. Verify test environment configuration
3. Enable appropriate logging and debugging
4. Document device and OS version

### During Testing
1. Record all user interactions
2. Note timing of review prompts
3. Capture screenshots of review dialogs
4. Monitor app performance and stability
5. Check analytics events in real-time

### After Each Test
1. Verify expected analytics events
2. Check debug logs for errors
3. Document any unexpected behavior
4. Reset state for next test

### Test Data Collection
- User action timestamps
- Review prompt triggers and timing
- User responses to prompts
- Error conditions and recovery
- Performance metrics
- Analytics event data

## Automated Test Integration

While these are manual test scenarios, they should be complemented by:

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test component interactions
3. **End-to-End Tests**: Automated user journey testing
4. **Performance Tests**: Automated performance monitoring
5. **Regression Tests**: Ensure new changes don't break existing functionality

## Reporting and Documentation

For each test scenario, document:

1. **Test Environment**: Device, OS version, app version
2. **Test Steps**: Exact steps performed
3. **Expected vs Actual Results**: What happened vs what should happen
4. **Screenshots**: Visual evidence of behavior
5. **Analytics Data**: Relevant tracking events
6. **Performance Metrics**: Timing and resource usage
7. **Issues Found**: Any bugs or unexpected behavior
8. **Recommendations**: Improvements or fixes needed

## Continuous Testing

These manual tests should be performed:

1. **Before Each Release**: Full test suite execution
2. **After Configuration Changes**: Relevant scenario testing
3. **On New Devices**: Device-specific testing
4. **After OS Updates**: Compatibility testing
5. **During Beta Testing**: User feedback validation

This comprehensive manual testing approach ensures the in-app review system works correctly across all user scenarios and provides a smooth, effective user experience.