# Calorie Tracker Android App

This is a React Native wrapper for the Calorie Tracker web application that allows you to publish it to the Google Play Store.

## Development Setup

1. Make sure you have Node.js and npm installed.
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm start
   ```
4. Use the Expo Go app on your Android device to scan the QR code or run in an emulator.

## Building for Google Play Store

### 1. Update the APP_URL

Before building, make sure to update the `APP_URL` in `app/(tabs)/index.tsx` to point to your deployed Next.js application.

### 2. Configure app.json

Ensure your `app.json` has the correct package name and version information.

### 3. Generate a Keystore

Generate a keystore for signing your app:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore calorie-tracker-keystore.p12 -alias calorie-tracker -keyalg RSA -keysize 2048 -validity 10000
```

Keep this keystore file safe, as you'll need it for all future updates.

### 4. Build the Android App Bundle

```bash
eas build --platform android --profile production
```

This will generate an AAB (Android App Bundle) file that you can upload to the Google Play Store.

If you haven't set up EAS (Expo Application Services), you'll need to:

```bash
npm install -g eas-cli
eas login
eas build:configure
```

### 5. Configure eas.json

Create an `eas.json` file with the following content:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

### 6. Submit to Google Play Store

1. Create a Google Play Developer account (if you don't have one already)
2. Create a new application
3. Upload the AAB file generated in step 4
4. Provide required information:
   - App icon
   - Feature graphic
   - Screenshots
   - Privacy policy URL
   - App description
   - Contact information

### 7. Publish to Production

After testing your app in the internal testing track, you can promote it to production in the Google Play Console.

## In-App Review Feature

The app includes Google Play's In-App Review API integration, which allows users to rate and review the app without leaving it.

### How It Works

1. The app prompts users to leave a review at strategic moments:
   - After opening the app multiple times (5+ opens)
   - After successful food logging
   - When viewing progress multiple times

2. The review prompt is shown with reasonable frequency to avoid annoying users:
   - No more than once every 30 days
   - Only after meaningful interactions with the app
   - Not on first launch or during onboarding

### Testing In-App Reviews

To test the in-app review functionality:

1. Make sure your app is published to at least an internal test track on Google Play
2. Install the app from Google Play (not directly via development build)
3. Use a Google account that hasn't already reviewed the app
4. Clear Google Play Store app cache if the review dialog doesn't appear

### Implementation Details

- The implementation uses the `react-native-in-app-review` package
- Review requests are managed by the `InAppReviewService` in `lib/in-app-review.ts`
- The `useInAppReview` hook in `hooks/useInAppReview.ts` provides a simple interface for components
- Review timing is tracked using AsyncStorage

### Important Notes

- The Google Play In-App Review API has quotas that limit how often the review dialog can be shown
- The API does not provide feedback on whether the user actually submitted a review
- The review dialog might not always appear even when requested due to Google's quota system
- For devices where in-app review is not available, a fallback alert is shown

## Updating Your App

When you need to update your app:

1. Update your Next.js web app
2. Update the version in `app.json`
3. Build a new bundle with `eas build`
4. Upload the new bundle to Google Play Console

## Troubleshooting

- If you experience issues with the WebView, make sure your website works well on mobile browsers
- Check that you have the proper permissions in the `app.json` file
- Ensure your app meets all Google Play Store requirements
- If in-app reviews aren't showing, check that:
  - Your app is published on Google Play (at least in internal testing)
  - You're using a Google account that hasn't already reviewed the app
  - You've cleared the Google Play Store app cache
  - You're not signed in with a GSuite/enterprise account (use a personal Gmail)
