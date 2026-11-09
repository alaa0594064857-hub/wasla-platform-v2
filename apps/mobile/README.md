# WASLA Mobile App

WASLA's native Android/iOS application is built with Expo SDK 58 and React Native 0.88. The app is bilingual (Arabic/English), supports RTL/LTR presentation, and uses the shared WASLA API.

## Implemented mobile foundations

- Expo SDK 58, React Native 0.88, React 19.3; Node.js >=22.13.
- EAS development, preview and production build profiles in `eas.json`; SecureStore plugin configured.
- Android application ID and iOS bundle identifier: `com.wasla.app`.
- Email/password sign-in, registration for buyer/company/supplier/manufacturer/trader/brand, sign-out, and password-reset email request.
- Authenticated profile read/update client and bilingual profile editor (display name, HTTPS avatar reference, bio and website).
- Business account and member-store creation.
- Member product creation and status changes.
- Member-store public catalogue view and buyer order-request flow.
- Merchant order inbox with accept/reject actions.
- Private conversations, recipient search and message sending.
- Notifications list and mark-read actions.
- Trade opportunity creation and listing for buyer requests and supplier offers.
- Typed API clients for the above services, using the Better Auth Expo cookie.
- Official-store destination catalogue API client.

## Important integration boundaries

- Registration and password reset depend on correctly configured production email delivery. Set `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, a verified `RESEND_FROM_EMAIL`, and the correct public auth URL/trusted origins. A UI confirmation does not prove that an email was delivered.
- Password-reset completion currently hands off to the existing web `/reset-password` page.
- Profile and product images currently use HTTPS image references; native image picking/upload is not implemented.
- Push-token registration and native push delivery are not implemented.
- Order requests do not collect payment or reserve stock. Merchant approval is required. Do not represent an order request as a paid or confirmed fulfilment.
- Member-store checkout is distinct from the private sourcing workflow for the official WASLA Store.
- The mobile app must never expose internal supplier identities, supplier URLs, sourcing notes, supplier purchase references or internal costs to customers.
- The official-store sourcing foundations are not a live Alibaba connector, arbitrary-site crawler or autonomous supplier purchasing system.

## Local development

From the repository root:

```bash
pnpm install
pnpm --filter @wasla/mobile typecheck
pnpm --filter @wasla/mobile exec expo config --type public
pnpm --filter @wasla/mobile start
```

Copy `.env.example` to `.env` when using non-default environments and set `EXPO_PUBLIC_WASLA_API_URL` and `EXPO_PUBLIC_WASLA_WEB_URL`.

## EAS builds

Authenticate with an Expo account, then run from the repository root:

```bash
npx eas-cli@latest build:configure --platform all
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform all
```

EAS may ask to create/link an Expo project and configure signing credentials. Review prompts before accepting. No EAS build has been triggered yet. Android production release requires Play Console and signing setup; iOS device builds and App Store submission require an eligible Apple Developer account and signing setup.

## Release gates — not yet verified

1. Install and launch an Android build on a physical device; test iOS separately when Apple signing/device access is available.
2. Verify registration, email verification delivery, sign-in, session persistence, sign-out and password reset against the deployed API.
3. Test two separate accounts end-to-end: business/store creation, public browsing, buyer order request, merchant accept/reject, private messages, notifications and trade opportunities.
4. Verify authorization and cross-account isolation for every private API route.
5. Test Arabic RTL, English LTR, small screens, accessibility, loading/error/empty states and unreliable network conditions.
6. Implement native image picking/upload and push-notification consent/token delivery.
7. Add production app icon, splash artwork, privacy disclosures, store screenshots and store metadata.
8. Re-run the full CI suite and verify successful hosted API/web deployments before public release.

## Cost and deployment boundary

No EAS build has been started by this work. Render deployments have previously been blocked by exhausted build-pipeline minutes. Do not repeatedly trigger hosted builds or enable paid automatic minute purchases without the platform owner's explicit approval. Payment collection, supplier purchasing and autonomous transactions remain disabled pending separate legal, provider and operational approval.
