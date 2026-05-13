/**
 * One-shot bootstrap route — applies the schema (idempotent CREATE IF NOT
 * EXISTS / DO blocks) and seeds demo data on a freshly-provisioned managed
 * Postgres (Neon / Supabase / RDS / self-hosted).
 *
 * Why this exists
 * ---------------
 * The author's machine sits behind a corporate proxy whose self-signed cert
 * chain breaks every CLI path that wants to reach the production DB
 * (`psql`, `drizzle-kit push`, vendor CLIs). To avoid leaking credentials
 * and to make the deploy fully reproducible, the bootstrap runs inside the
 * deployed serverless function, where `DATABASE_URL` is configured and the
 * upstream network works.
 *
 * On cold start the same statements are also applied automatically by the
 * instrumentation hook (`src/instrumentation.ts`) — this route remains the
 * manual escape hatch for a fresh DB or for forcing a re-seed.
 *
 * Auth: `?secret=<AUTH_SECRET>` must match the env var. The route is
 * idempotent — calling it twice is safe (it skips already-seeded rows and
 * uses CREATE IF NOT EXISTS for DDL).
 *
 * Usage:
 *   GET https://<your-deploy-host>/api/admin/dbinit?secret=...
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, challenges, performances } from "@/db/schema";
import type { Instrument, SkillLevel } from "@/db/schema";
import { applySchemaBootstrap } from "@/db/schema-bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEMO_PASSWORD = "Password123";

/**
 * Schema bootstrap statements live in `src/db/schema-bootstrap.ts` so the
 * instrumentation hook (`src/instrumentation.ts`) can run the same set on
 * cold start and self-heal any production DB that's behind on new enum
 * values / columns. This route is now a thin operator-facing wrapper.
 */
async function applySchema(): Promise<number> {
  return applySchemaBootstrap(db);
}

async function upsertUser(args: {
  name: string;
  email: string;
  role: "ADMIN" | "STUDENT";
  primaryInstrument?: Instrument;
  skillLevel?: SkillLevel;
}) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, args.email))
    .limit(1);
  if (existing) return existing;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const [created] = await db
    .insert(users)
    .values({
      name: args.name,
      email: args.email,
      role: args.role,
      passwordHash,
      primaryInstrument: args.primaryInstrument ?? null,
      skillLevel: args.skillLevel ?? null,
    })
    .returning();
  return created!;
}

async function seedIfEmpty() {
  const summary = {
    teacher: false,
    students: 0,
    challengesInsertedNow: 0,
    performancesInsertedNow: 0,
  };
  const teacher = await upsertUser({
    name: "Ms. Maya Rao",
    email: "admin@portal.dev",
    role: "ADMIN",
  });
  summary.teacher = true;
  const alex = await upsertUser({
    name: "Alex Singh",
    email: "alex@portal.dev",
    role: "STUDENT",
    primaryInstrument: "ACOUSTIC_GUITAR",
    skillLevel: "INTERMEDIATE",
  });
  const riya = await upsertUser({
    name: "Riya Patel",
    email: "riya@portal.dev",
    role: "STUDENT",
    primaryInstrument: "PIANO",
    skillLevel: "ADVANCED",
  });
  summary.students = 2;

  const existing = await db.select({ id: challenges.id }).from(challenges);
  if (existing.length > 0) return summary;

  const inserted = await db
    .insert(challenges)
    .values([
      {
        title: "Cover the riff: Sweet Child O' Mine (intro)",
        description:
          "Play the iconic opening riff. Focus on alternate picking and let each note ring. 30–60 seconds is enough.",
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        points: 200,
        instrumentFocus: "ELECTRIC_GUITAR",
        skillLevelTarget: "INTERMEDIATE",
        createdById: teacher.id,
        status: "ACTIVE",
      },
      {
        title: "Chopin Prelude in E minor — first 16 bars",
        description:
          "Bring out the melodic line over the descending chords. Watch the dynamics. 60–90 seconds.",
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        points: 250,
        instrumentFocus: "PIANO",
        skillLevelTarget: "ADVANCED",
        createdById: teacher.id,
        status: "ACTIVE",
      },
      {
        title: "Synth pad + lead — original 30-second loop",
        description:
          "Build a 30-second loop with one pad and one lead. Any synth, any DAW. Show your patch and play live on top.",
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        points: 150,
        instrumentFocus: "SYNTHESIZER",
        skillLevelTarget: "BEGINNER",
        createdById: teacher.id,
        status: "ACTIVE",
      },
    ])
    .returning();
  summary.challengesInsertedNow = inserted.length;

  const guitarChallenge = inserted[0]!;
  const pianoChallenge = inserted[1]!;
  await db.insert(performances).values([
    {
      challengeId: guitarChallenge.id,
      studentId: alex.id,
      title: "First take — opening riff",
      caption: "A bit nervous on the bend, would love feedback.",
      instrument: "ELECTRIC_GUITAR",
      skillLevel: "INTERMEDIATE",
      videoProvider: "EMBED",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      status: "PUBLISHED",
    },
    {
      challengeId: pianoChallenge.id,
      studentId: riya.id,
      title: "Chopin — slow tempo",
      caption: "Working the dynamics. Take 3.",
      instrument: "PIANO",
      skillLevel: "ADVANCED",
      videoProvider: "EMBED",
      videoUrl: "https://player.vimeo.com/video/76979871",
      status: "PUBLISHED",
      isVerified: true,
      isBestPerformer: true,
    },
  ]);
  summary.performancesInsertedNow = 2;
  return summary;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret");
  const expected = process.env.AUTH_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "AUTH_SECRET not configured" },
      { status: 500 },
    );
  }
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  try {
    const dbUrl = process.env.DATABASE_URL ?? "";
    const dbHost = (() => {
      try {
        return new URL(dbUrl).host;
      } catch {
        return "(none)";
      }
    })();

    const ddlStatements = await applySchema();
    const seedSummary = await seedIfEmpty();

    return NextResponse.json({
      ok: true,
      tookMs: Date.now() - startedAt,
      dbHost,
      ddlStatements,
      seed: seedSummary,
      demoLogins: {
        teacher: { email: "admin@portal.dev", password: DEMO_PASSWORD },
        students: [
          { email: "alex@portal.dev", password: DEMO_PASSWORD },
          { email: "riya@portal.dev", password: DEMO_PASSWORD },
        ],
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        tookMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
