
# WASLA V2 — Authentication and Sessions

## 1. Purpose

Define the authentication and session requirements
for WASLA V2.

This document records the initial authentication
provider decision and the security requirements
for its integration.

## 2. Unified Identity

- Each person has one unified WASLA user identity.
- Email is an identity attribute, not an account role.
- Authentication identifies the user.
- Authorization determines what the user can do.
- Business memberships are managed separately.
- One user may act as a buyer and join multiple
  business accounts.

## 3. Authentication Provider Decision

Initial provider: Better Auth.

The current implementation uses:
- Better Auth.
- Better Auth Drizzle adapter.
- PostgreSQL.
- Drizzle ORM.

The provider is responsible for authentication
credentials and authentication sessions.

WASLA business accounts, memberships, roles,
permissions, and authorization remain controlled
by the WASLA backend.

Provider integration must not create separate
user identities for different business activities.

The provider decision may be revisited only
through a documented architecture decision
and migration plan.

## 4. Registration

Registration must support:

- Email address.
- Password.
- Personal display name.
- Preferred language.
- Acceptance of platform terms.

The registration process must create or associate
one unified WASLA user identity.

Business information must be collected separately
when a user creates or joins a business account.

Registration must validate all input on the server.

Duplicate email registration must not expose
sensitive account information.

## 5. Email Verification

Production requirements:

- New email identities must be verified.
- Verification tokens must expire.
- Verification tokens must be single-use.
- Resending verification must safely invalidate
  or replace previous tokens.
- Unverified users must have restricted access.

Current implementation status:

- Email/password authentication is configured.
- Email verification is enabled in Better Auth and required before normal sign-in.
- Verification and password-reset email delivery both depend on Resend configuration.
- Without a verified custom sender/domain, delivery remains restricted to the configured Resend test recipient.
- The API now has a production-safe Better Auth base URL fallback and always retains the current Render web origin in its trusted-origin list, while also merging explicitly configured origins. The purchased custom domain must be added to BETTER_AUTH_TRUSTED_ORIGINS and BETTER_AUTH_URL when it is connected.

Email delivery must be configured with a verified sender and the full registration, verification, login and password-reset flows must be tested before public production registration is opened.

## 6. Login Security

The authentication system must:

- Validate credentials securely.
- Return generic errors that do not reveal
  whether an email address exists.
- Apply rate limits to repeated login attempts.
- Record security-relevant events.
- Respect user suspension and deactivation.
- Protect authentication endpoints against abuse.

These controls must be verified through tests
before production release.

## 7. Sessions

Better Auth manages authentication sessions.

The Better Auth session persistence table
is provider-managed storage.

WASLA must not create a second independent
session-token system or duplicate session secrets.

Sessions must support:

- Configurable expiration.
- Secure logout.
- Session revocation.
- User suspension handling.
- Secure cookie settings.
- Protection against session token exposure.

Session configuration must be reviewed
before production deployment.

## 8. Password Recovery

The authentication system must support:

- Password reset requests.
- Expiring reset tokens.
- Single-use reset tokens.
- Generic responses that do not reveal
  whether an email exists.
- Session revocation according to
  the security policy after password reset.

Password recovery must not be enabled
for production until email delivery is configured
and its complete flow is tested.

## 9. User Lifecycle

Initial user states:

- pending_verification
- active
- suspended
- deactivated

WASLA backend services must enforce
user lifecycle restrictions.

Suspended or deactivated users must not access
protected platform operations.

Authentication success alone does not grant
business or administrative permissions.

## 10. Identity and Business Separation

Authentication provider records are separate
from business accounts and memberships.

The unified WASLA user is the owner of
the personal identity.

Business accounts and stores are separate
resources connected through membership records.

A company owner is not automatically
a platform administrator.

Authorization must be evaluated by the WASLA
backend using the correct resource scope.

## 11. Secrets and Environment

Production configuration must include:

- BETTER_AUTH_SECRET
- BETTER_AUTH_URL
- BETTER_AUTH_TRUSTED_ORIGINS
- DATABASE_URL

Requirements:

- Never commit production secrets.
- Never expose server secrets to frontend code.
- Use secure environment configuration.
- Use HTTPS in production.
- Restrict trusted origins to approved domains.
- Validate production configuration at startup.

## 12. Future Security Enhancements

The architecture should allow:

- Multi-factor authentication.
- Passkeys.
- Additional identity providers.
- Device and session management.
- Suspicious-login detection.

These enhancements must preserve
the unified WASLA user identity.

## 13. Testing Requirements

Authentication tests must cover:

- Successful registration.
- Duplicate identity handling.
- Email verification.
- Successful and failed login.
- Session creation and expiration.
- Logout and session revocation.
- Password recovery.
- Suspended account access denial.
- Rate limiting.
- Trusted-origin restrictions.

Tests must use isolated test data
and must never use production credentials.

## 14. Implementation Status

Implemented foundations:

- Better Auth integration.
- PostgreSQL and Drizzle adapter.
- Authentication route under /api/auth.
- Initial authentication database tables.
- Automated API and database CI checks.

Not yet production-ready:

- Verified production sender/domain and successful external delivery of verification and password-reset emails.
- Confirmation of BETTER_AUTH_URL and BETTER_AUTH_TRUSTED_ORIGINS for the final purchased domain.
- Complete authentication security tests, including rate limiting, session revocation and suspended-account denial.
- Final production deployment and custom-domain checks.

No production authentication service
or production credentials are configured
by this document.
