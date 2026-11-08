# WASLA Mobile App

This workspace is the first native mobile foundation for WASLA, built with Expo and React Native for Android and iOS.

## Current foundation

- Expo SDK 58 / React Native 0.88 / React 19.3.
- Android application ID: `com.wasla.app`.
- iOS bundle identifier: `com.wasla.app`.
- Bilingual Arabic/English starter screen with an RTL/LTR language switch.
- Typed API client for the public, destination-specific official-store catalogue.
- Authenticated profile API methods for reading and updating the signed-in user's profile, using the Better Auth Expo cookie from secure storage.
- Better Auth Expo integration v1.7.18 on the API and mobile client, using Expo SecureStore for native session/cookie persistence. Version 1.7.18 is above the published 1.7.16 security fix threshold.
- Initial email/password sign-in and session-aware sign-out UI; account registration and verification UX are still pending.
- Configurable API base URL via `EXPO_PUBLIC_WASLA_API_URL`; the current hosted API URL is the default.

## Run locally

From the repository root:

```bash
pnpm install
pnpm --filter @wasla/mobile start
```

For a different API environment, copy `.env.example` to `.env` and set `EXPO_PUBLIC_WASLA_API_URL`.

Use a compatible Expo Go version or an EAS development build for device testing. SDK 58 requires Node.js 22.13 or newer.

## API and authentication boundary

The mobile API client calls the public official-store catalogue using the selected two-letter destination country. The API now enables Better Auth Expo v1.7.18, trusts the `wasla://` deep-link origin, and the mobile client uses the matching v1.7.18 Expo client plugin with `expo-secure-store`. The Better Auth core and Drizzle adapter were aligned to v1.7.18 as well. The starter UI supports email/password sign-in and session-aware sign-out. This integration is source-code only until dependencies are installed and the API is successfully deployed; verify sign-in, email-verification behavior, session persistence and sign-out on physical devices before production use.

## Required before calling this a usable app

1. Validate Better Auth Expo integration, session persistence, email verification and sign-out on Android/iOS.
2. Add the profile screen and typed authenticated API methods for member shops, business accounts, trade opportunities, messages, notifications and orders.
3. Implement navigation and complete loading, empty, error and offline states for each screen.
4. Add push-notification registration and server-side device-token management with user consent.
5. Verify authorization boundaries, Arabic RTL layout, accessibility and device sizes.
6. Configure EAS development/preview/production builds, app icons, splash screens, privacy disclosures and store metadata.
7. Test on physical Android and iOS devices before any store submission.

## Safety and release boundary

This is a starter app with one public API integration, not a completed or store-ready mobile application. The main web/API deployment is currently blocked by Render build-pipeline minutes. Do not trigger repeated hosted builds or enable paid automatic minute purchases without the platform owner's approval. Payment collection and autonomous supplier transactions remain disabled until their separate legal, provider and operational prerequisites are met.
