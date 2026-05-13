/**
 * Idempotent schema-bootstrap statements.
 *
 * Every statement in this list is safe to run on a fresh DB AND on a DB
 * that's already had earlier versions of itself applied:
 *   - `CREATE TYPE … IF NOT EXISTS`     → wrapped in DO/EXCEPTION blocks
 *   - `CREATE TABLE IF NOT EXISTS …`
 *   - `ALTER TYPE … ADD VALUE IF NOT EXISTS …` (Postgres 12+, PGlite 16)
 *   - `ALTER TABLE … ADD CONSTRAINT …`  → wrapped in DO/EXCEPTION blocks
 *   - `CREATE INDEX IF NOT EXISTS …`
 *
 * These statements are the canonical source for:
 *   1. `src/app/api/admin/dbinit/route.ts` — the one-shot admin endpoint
 *      operators hit to bring a fresh managed Postgres (Neon / Supabase /
 *      RDS / self-hosted) up to spec.
 *   2. `src/instrumentation.ts` — auto-heals on cold start so adding a new
 *      enum value or column to the live deploy never requires manual SQL.
 *
 * If you add a new enum value or column, append the corresponding
 * `ALTER TYPE … ADD VALUE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN
 * IF NOT EXISTS` line below — the next deploy will pick it up
 * transparently without any operator action.
 */
import { sql } from "drizzle-orm";

export const SCHEMA_STATEMENTS: readonly string[] = [
  // Enums
  `DO $$ BEGIN
     CREATE TYPE "public"."challenge_status" AS ENUM('DRAFT','ACTIVE','CLOSED','ARCHIVED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."instrument" AS ENUM('ACOUSTIC_GUITAR','ELECTRIC_GUITAR','BASS_GUITAR','KEYBOARD','PIANO','SYNTHESIZER','DRUMS','VOCALS','VIOLIN','FLUTE','SAXOPHONE','OTHER');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."performance_status" AS ENUM('PENDING','PUBLISHED','REJECTED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."skill_level" AS ENUM('BEGINNER','INTERMEDIATE','ADVANCED','PRO');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."user_role" AS ENUM('ADMIN','STUDENT');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."video_provider" AS ENUM('LOCAL','BUNNY','VIMEO','CLOUDINARY','EMBED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // For DBs initialised before CLOUDINARY was added, top up the enum.
  // ADD VALUE IF NOT EXISTS is idempotent (Postgres 12+, PGlite 16).
  `ALTER TYPE "public"."video_provider" ADD VALUE IF NOT EXISTS 'CLOUDINARY' BEFORE 'EMBED'`,

  // Tables
  `CREATE TABLE IF NOT EXISTS "user" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "name" text,
     "email" text NOT NULL,
     "emailVerified" timestamp,
     "image" text,
     "password_hash" text,
     "role" "user_role" DEFAULT 'STUDENT' NOT NULL,
     "primary_instrument" "instrument",
     "skill_level" "skill_level",
     "bio" text,
     "points" integer DEFAULT 0 NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "account" (
     "userId" uuid NOT NULL,
     "type" text NOT NULL,
     "provider" text NOT NULL,
     "providerAccountId" text NOT NULL,
     "refresh_token" text,
     "access_token" text,
     "expires_at" integer,
     "token_type" text,
     "scope" text,
     "id_token" text,
     "session_state" text,
     CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
   )`,
  `CREATE TABLE IF NOT EXISTS "session" (
     "sessionToken" text PRIMARY KEY NOT NULL,
     "userId" uuid NOT NULL,
     "expires" timestamp NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "verificationToken" (
     "identifier" text NOT NULL,
     "token" text NOT NULL,
     "expires" timestamp NOT NULL,
     CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
   )`,
  `CREATE TABLE IF NOT EXISTS "challenge" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "title" text NOT NULL,
     "description" text NOT NULL,
     "cover_image_url" text,
     "deadline" timestamp NOT NULL,
     "status" "challenge_status" DEFAULT 'ACTIVE' NOT NULL,
     "points" integer DEFAULT 100 NOT NULL,
     "instrument_focus" "instrument",
     "skill_level_target" "skill_level",
     "created_by_id" uuid NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL,
     "updated_at" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "performance" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "challenge_id" uuid NOT NULL,
     "student_id" uuid NOT NULL,
     "title" text,
     "caption" text,
     "instrument" "instrument" NOT NULL,
     "skill_level" "skill_level" NOT NULL,
     "video_provider" "video_provider" DEFAULT 'LOCAL' NOT NULL,
     "video_url" text NOT NULL,
     "video_external_id" text,
     "video_duration_seconds" integer,
     "thumbnail_url" text,
     "status" "performance_status" DEFAULT 'PUBLISHED' NOT NULL,
     "is_verified" boolean DEFAULT false NOT NULL,
     "is_best_performer" boolean DEFAULT false NOT NULL,
     "likes_count" integer DEFAULT 0 NOT NULL,
     "submitted_at" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "feedback" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "performance_id" uuid NOT NULL,
     "teacher_id" uuid NOT NULL,
     "note" text NOT NULL,
     "timestamp_sec" integer,
     "rhythm_score" integer,
     "technique_score" integer,
     "musicality_score" integer,
     "is_private" boolean DEFAULT true NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS "performance_like" (
     "performance_id" uuid NOT NULL,
     "user_id" uuid NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL,
     CONSTRAINT "performance_like_performance_id_user_id_pk" PRIMARY KEY("performance_id","user_id")
   )`,
  `CREATE TABLE IF NOT EXISTS "top_performer" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "performance_id" uuid NOT NULL,
     "challenge_id" uuid NOT NULL,
     "selected_by_id" uuid NOT NULL,
     "reason" text,
     "period" text DEFAULT 'CHALLENGE' NOT NULL,
     "selected_at" timestamp DEFAULT now() NOT NULL
   )`,

  // Foreign keys (idempotent — wrap each in DO with EXCEPTION on duplicate_object)
  `DO $$ BEGIN
     ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "challenge" ADD CONSTRAINT "challenge_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "performance" ADD CONSTRAINT "performance_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "performance" ADD CONSTRAINT "performance_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "feedback" ADD CONSTRAINT "feedback_performance_id_performance_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performance"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "feedback" ADD CONSTRAINT "feedback_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE restrict;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "performance_like" ADD CONSTRAINT "performance_like_performance_id_performance_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performance"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "performance_like" ADD CONSTRAINT "performance_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "top_performer" ADD CONSTRAINT "top_performer_performance_id_performance_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performance"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "top_performer" ADD CONSTRAINT "top_performer_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "top_performer" ADD CONSTRAINT "top_performer_selected_by_id_user_id_fk" FOREIGN KEY ("selected_by_id") REFERENCES "public"."user"("id") ON DELETE restrict;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // Indexes
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" USING btree ("email")`,
  `CREATE INDEX IF NOT EXISTS "challenge_status_idx" ON "challenge" USING btree ("status")`,
  `CREATE INDEX IF NOT EXISTS "challenge_deadline_idx" ON "challenge" USING btree ("deadline")`,
  `CREATE INDEX IF NOT EXISTS "challenge_instrument_idx" ON "challenge" USING btree ("instrument_focus")`,
  `CREATE INDEX IF NOT EXISTS "performance_challenge_idx" ON "performance" USING btree ("challenge_id")`,
  `CREATE INDEX IF NOT EXISTS "performance_student_idx" ON "performance" USING btree ("student_id")`,
  `CREATE INDEX IF NOT EXISTS "performance_instrument_idx" ON "performance" USING btree ("instrument")`,
  `CREATE INDEX IF NOT EXISTS "performance_skill_idx" ON "performance" USING btree ("skill_level")`,
  `CREATE INDEX IF NOT EXISTS "performance_best_idx" ON "performance" USING btree ("is_best_performer")`,
  `CREATE INDEX IF NOT EXISTS "feedback_performance_idx" ON "feedback" USING btree ("performance_id")`,
  `CREATE INDEX IF NOT EXISTS "feedback_teacher_idx" ON "feedback" USING btree ("teacher_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "top_performer_performance_unique" ON "top_performer" USING btree ("performance_id")`,
  `CREATE INDEX IF NOT EXISTS "top_performer_challenge_idx" ON "top_performer" USING btree ("challenge_id")`,
];

/** Minimal shape required for execution — keeps this module free of a hard
 * dependency on the concrete Drizzle client type so it can be reused by
 * the dbinit route, the instrumentation hook, and the tests. Both the
 * `postgres-js` and the `pglite` Drizzle adapters satisfy this. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExecCapable = { execute: (query: any) => any };

/**
 * Applies every statement in `SCHEMA_STATEMENTS` to the given DB handle.
 *
 * Returns the count of statements run on success. Throws on the first SQL
 * error so the caller can decide how to surface it (the dbinit route
 * returns 500 + JSON; the instrumentation hook logs + suppresses).
 */
export async function applySchemaBootstrap(
  db: ExecCapable,
): Promise<number> {
  for (const stmt of SCHEMA_STATEMENTS) {
    await db.execute(sql.raw(stmt));
  }
  return SCHEMA_STATEMENTS.length;
}
