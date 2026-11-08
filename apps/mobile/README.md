# WASLA Mobile App

This workspace is the first native mobile foundation for WASLA, built with Expo and React Native for Android and iOS.

## Current foundation

- Expo SDK 58 / React Native 0.88 / React 19.3.
- Android application ID: `com.wasla.app`.
- iOS bundle identifier: `com.wasla.app`.
- Bilingual Arabic/English starter screen with an RTL/LTR language switch.
- Shared monorepo workspace under `apps/mobile`.

## Run locally

From the repository root:

```bash
pnpm install
pnpm --filter @wasla/mobile start
```

Use a compatible Expo Go version or an EAS development build for device testing. SDK 58 requires Node.js 22.13 or newer.

## Required before calling this a usable app

1. Add the mobile authentication/session flow and secure token storage. Do not assume browser cookies can be reused in React Native.
2. Add a typed API client for the existing WASLA API and configure the production API base URL through app configuration.
3. Implement real screens and navigation for the public catalogue, stores, business accounts, trade opportunities, messages, notifications and profile.
4. Add push-notification registration and server-side device-token management with user consent.
5. Verify authorization boundaries, offline/error/loading states, Arabic RTL layout, accessibility and device sizes.
6. Configure EAS development/preview/production builds, app icons, splash screens, privacy disclosures and store metadata.
7. Test on physical Android and iOS devices before any store submission.

## Safety and release boundary

This is a starter shell, not a completed or store-ready mobile application. The main web/API deployment is currently blocked by Render build-pipeline minutes. Do not trigger repeated hosted builds or enable paid automatic minute purchases without the platform owner's approval. Payment collection and autonomous supplier transactions remain disabled until their separate legal, provider and operational prerequisites are met.
