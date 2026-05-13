/**
 * Pure mapping from a raw exception → user-facing `{ok:false, error}`.
 *
 * Lives in its own module (rather than inside `lib/actions.ts`) because
 * Next.js server-action files (`"use server"`) can only export *async*
 * functions. A regular synchronous mapper here is reachable both from
 * the actions file and from the Playwright tests that assert the
 * mapping table directly.
 *
 * The mappings are intentionally narrow: each branch corresponds to a
 * real failure we've actually seen in production. Add new branches as
 * new failure modes appear — but never make a branch broader than the
 * actual symptom (catch-all messages hide real bugs).
 */

export function classifyActionFailure(
  err: unknown,
): { ok: false; error: string } {
  const message = err instanceof Error ? err.message : String(err);

  // ── Postgres enum drift ───────────────────────────────────────────
  // When we ship a new enum value (e.g. CLOUDINARY) and the deployed DB
  // hasn't been refreshed yet, inserts blow up with:
  //   "invalid input value for enum video_provider: \"CLOUDINARY\""
  // The auto-heal in `instrumentation.ts` will fix this on the next
  // cold start; meanwhile we point the operator at `/api/admin/dbinit`
  // so they don't have to wait.
  if (/invalid input value for enum/i.test(message)) {
    return {
      ok: false,
      error:
        "Database schema is behind the deployed app. Trigger a fresh " +
        "deploy (the cold-start hook auto-applies the bootstrap) or " +
        "GET /api/admin/dbinit?secret=<AUTH_SECRET> once to bring the " +
        `DB to spec. Underlying: ${message}`,
    };
  }

  // ── Foreign-key violation ─────────────────────────────────────────
  // Almost always a stale challenge or student id in the client cache.
  if (/foreign key constraint/i.test(message)) {
    return {
      ok: false,
      error:
        "Could not save because a referenced row is missing (challenge " +
        "or student). Refresh and try again. " +
        `Underlying: ${message}`,
    };
  }

  // ── Generic fallback ──────────────────────────────────────────────
  // Production keeps it brief but ALWAYS includes a fragment of the
  // underlying message so a support engineer can correlate with the
  // server-log line emitted at the same moment (visible in your
  // hosting platform's function/runtime logs).
  return {
    ok: false,
    error:
      process.env.NODE_ENV === "production"
        ? `Could not complete the request. Please retry. (${message.slice(0, 200)})`
        : message,
  };
}
