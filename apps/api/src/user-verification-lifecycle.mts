type VerificationLifecycleQuery = (
  sql: string,
  values: string[],
) => Promise<unknown>;

/**
 * Email verification may activate only accounts awaiting their first
 * verification. Existing suspended accounts must remain disabled.
 */
export async function activatePendingVerification(
  query: VerificationLifecycleQuery,
  userId: string,
): Promise<void> {
  await query(
    `UPDATE users
     SET status = 'active',
         updated_at = NOW()
     WHERE id = $1
       AND status = 'pending_verification'`,
    [userId],
  );
}
