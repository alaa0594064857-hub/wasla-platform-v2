# WASLA V2 — Authentication and Sessions

## 1. Purpose

Define the authentication and session requirements
for WASLA V2 without locking the platform to a
specific authentication provider.

## 2. Identity

- Each person has one unified user identity.
- Email is an identity attribute, not an account role.
- Authentication identifies the user.
- Authorization determines what the user can do.
- Business memberships are managed separately.

## 3. Registration

The registration process must support:

- Email address
- Password or an approved alternative
- Personal display name
- Preferred language
- Acceptance of platform terms

Business information must be collected separately
when a user creates or joins a business account.

## 4. Email Verification

- New email identities must be verified.
- Verification tokens must expire.
- Verification tokens must be single-use.
- Resending verification must invalidate or safely
  replace previous tokens.
- Unverified users must have restricted access.

## 5. Login

The authentication system must:

- Validate credentials securely.
- Return generic errors that do not reveal
  whether an email address exists.
- Apply rate limits to repeated login attempts.
- Record security-relevant events.
- Support account suspension and deactivation.

## 6. Sessions

Sessions must:

- Be created after successful authentication.
- Have configurable expiration.
- Support secure logout and revocation.
- Be revocable when an account is suspended.
- Avoid exposing session secrets to frontend logs.
- Use secure cookie settings when cookie-based
  sessions are implemented.

## 7. Password Recovery

- Users can request a password reset.
- Reset tokens must expire and be single-use.
- Password reset must revoke existing sessions
  according to the security policy.
- Responses must not reveal whether an email exists.

## 8. Account Lifecycle

Initial user states:

- pending_verification
- active
- suspended
- deactivated

State transitions must be controlled by the backend.

Suspended or deactivated users must not access
protected platform operations.

## 9. Security Requirements

- Passwords must never be stored in plaintext.
- Authentication secrets must never be committed
  to the repository.
- Production secrets must be stored in secure
  environment configuration.
- Sensitive authentication events must be audited.
- Rate limiting must protect login and recovery.
- Authorization checks remain separate from login.
- Administrative actions require explicit permission.

## 10. Future Security Enhancements

The architecture should allow:

- Multi-factor authentication.
- Passkeys.
- Additional identity providers.
- Device and session management.
- Suspicious-login detection.

These features must be introduced without
breaking the unified user identity.

## 11. Provider Decision

The authentication provider is intentionally
not selected in this document.

Provider selection requires a separate technical
evaluation before implementation.

## 12. Testing

Authentication tests must cover:

- Successful registration.
- Duplicate identity handling.
- Email verification.
- Successful and failed login.
- Session expiration and revocation.
- Password recovery.
- Suspended account access denial.
- Rate limiting.

## 13. Implementation Status

Status: Architecture requirements defined.

No authentication provider, production credentials,
or live authentication service is configured
by this document.
