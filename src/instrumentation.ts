/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Used to bring up PGlite (auto-apply schema migrations) and, in dev,
 * to optionally bypass TLS verification when the workstation sits behind
 * a corporate proxy that re-signs HTTPS traffic with its own root CA.
 */
export async function register() {
  // Skip during the edge runtime (proxy.ts) — we only want the Node server.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ── Optional: trust the local TLS chain even if it's a corp-proxy
  // self-signed cert. Without this, Node `fetch()` to api.cloudinary.com
  // (and any other outbound HTTPS) fails with SELF_SIGNED_CERT_IN_CHAIN
  // when the workstation is behind a re-signing MITM proxy. We refuse
  // the bypass in production so this is impossible to ship by accident.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_INSECURE_TLS === "true"
  ) {
    try {
      const { setGlobalDispatcher, Agent } = await import("undici");
      setGlobalDispatcher(
        new Agent({ connect: { rejectUnauthorized: false } }),
      );
      console.warn(
        "[tls] ⚠ ALLOW_INSECURE_TLS=true — outbound HTTPS verification is DISABLED for this dev process. Never enable in production.",
      );
    } catch (err) {
      console.warn("[tls] failed to install insecure dispatcher:", err);
    }
  }

  const { dbKind, db } = await import("./db");

  if (dbKind === "pglite") {
    const { applyMigrations } = await import("./db/migrate");
    await applyMigrations();
    console.log("[db] PGlite ready (.data/pgdata) — migrations applied.");
    return;
  }

  // On the production postgres path (Neon / Supabase / RDS / any
  // managed Postgres) auto-apply the idempotent schema bootstrap so
  // adding a new enum value or column on a deploy never requires the
  // operator to manually hit `/api/admin/dbinit?secret=…`.
  //
  // Every statement uses `IF NOT EXISTS` or a DO/EXCEPTION block so this
  // is cheap and safe to run on every cold start. The bootstrap completes
  // in well under a second on a warm Neon, and we cache the promise on
  // `globalThis` so concurrent invocations on the same Lambda instance
  // share a single run.
  //
  // Opt out by setting `SCHEMA_AUTOHEAL=false` if you prefer to manage
  // migrations entirely out-of-band (e.g. via Drizzle Kit CI).
  if (process.env.SCHEMA_AUTOHEAL === "false") {
    console.log(
      "[db] SCHEMA_AUTOHEAL=false — skipping schema bootstrap on cold start.",
    );
    return;
  }
  try {
    const { applySchemaBootstrap } = await import("./db/schema-bootstrap");
    const n = await applySchemaBootstrap(db);
    console.log(
      `[db] postgres schema bootstrap applied — ${n} idempotent statements ran.`,
    );
  } catch (err) {
    // Don't crash the server on a bootstrap failure — the dbinit route
    // remains the manual escape hatch. Just log loudly so it's obvious
    // in the hosting platform's runtime logs.
    console.error(
      "[db] postgres schema bootstrap FAILED — fall back to /api/admin/dbinit?secret=… to recover:",
      err,
    );
  }
}
