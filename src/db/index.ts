import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __db: ReturnType<typeof drizzlePostgres> | undefined;
  var __dbKind: "postgres" | "pglite" | undefined;
  var __dbInitError: Error | undefined;
}

const FALLBACK_BUILD_URL = "postgresql://invalid:invalid@127.0.0.1:1/invalid";

/**
 * Picks a database backend based on env:
 *
 * - `DATABASE_URL=postgresql://…`  → real Postgres via `postgres-js`
 *                                    (Vercel + Neon, Render + Neon, Fly + Neon,
 *                                    self-hosted Postgres — all the same path).
 * - missing / empty                → embedded **PGlite** persisted to
 *                                    `./.data/pgdata` for zero-install local
 *                                    dev (same SQL dialect, no install).
 * - `DATABASE_URL=memory:`         → ephemeral in-memory PGlite (tests).
 *
 * Reused across HMR via `globalThis` to avoid pool exhaustion.
 *
 * Note: PGlite is loaded via `require()` inside `buildPgliteSync()` so it
 * never reaches the production server bundle. Serverless packagers
 * (OpenNext, Vercel's nft tracer, etc.) would otherwise pull the PGlite
 * WASM binary into the deploy and crash the Lambda cold start. By keeping
 * the require() out of the static import graph, production bundles only
 * ship postgres-js and the WASM never gets baked in.
 */
function buildPgliteSync():
  | ReturnType<typeof drizzlePostgres>
  | null {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports --
     * Intentional dynamic requires: keep PGlite (and its WASM binary) out of
     * the serverless packager's static import graph (Vercel nft, OpenNext,
     * AWS Lambda bundler, etc.) so the production bundle only ships
     * postgres-js. Without this, Lambda cold start crashes trying to load
     * PGlite's bundled WASM. See commit c5bf91c.
     */
    const { mkdirSync } = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const { drizzle: drizzlePglite } =
      require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
    const { PGlite } =
      require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
    /* eslint-enable @typescript-eslint/no-require-imports */

    const url = process.env.DATABASE_URL;
    if (url === "memory:") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return drizzlePglite(new PGlite() as any, { schema }) as unknown as ReturnType<typeof drizzlePostgres>;
    }
    const dataDir = path.join(process.cwd(), ".data", "pgdata");
    mkdirSync(dataDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return drizzlePglite(new PGlite(dataDir) as any, { schema }) as unknown as ReturnType<typeof drizzlePostgres>;
  } catch (err) {
    globalThis.__dbInitError =
      err instanceof Error ? err : new Error(String(err));
    return null;
  }
}

function buildDb(): ReturnType<typeof drizzlePostgres> {
  const url = process.env.DATABASE_URL;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  // Real Postgres path — preferred whenever a URL is set.
  if (url && url.startsWith("postgres")) {
    globalThis.__dbKind = "postgres";
    const client = postgres(url, { max: 10, prepare: false });
    return drizzlePostgres(client, { schema });
  }

  // During `next build` with no DB configured, return a benign no-op postgres
  // proxy so module evaluation succeeds. Real queries at request time will
  // surface a proper connection error.
  if (isBuildPhase && !url) {
    globalThis.__dbKind = "postgres";
    return drizzlePostgres(postgres(FALLBACK_BUILD_URL, { max: 1, prepare: false }), {
      schema,
    });
  }

  // PGlite path (local dev / tests). Loaded via require() so it stays out of
  // the production server bundle.
  globalThis.__dbKind = "pglite";
  const pglite = buildPgliteSync();
  if (pglite) return pglite;

  // Final fallback — a postgres-js handle to an unreachable URL. Keeps module
  // load successful; any real query will fail loudly with the captured
  // dbInitError, which our /api/admin/dbinit and /api/admin/debug routes
  // surface as JSON instead of crashing the function.
  globalThis.__dbKind = "postgres";
  return drizzlePostgres(postgres(FALLBACK_BUILD_URL, { max: 1, prepare: false }), {
    schema,
  });
}

export const db = (globalThis.__db ??= buildDb());
export const dbKind = globalThis.__dbKind!;
export const dbInitError = (): Error | undefined => globalThis.__dbInitError;
export { schema };
