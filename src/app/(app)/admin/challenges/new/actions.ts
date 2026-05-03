"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { challenges } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { createChallengeSchema } from "@/lib/validators";

export type CreateChallengeResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server action for creating a challenge. Returns a discriminated result so
 * the client form can render inline errors instead of falling into Next.js's
 * generic 500 page on validation/db failure.
 */
export async function createChallengeAction(
  raw: unknown,
): Promise<CreateChallengeResult> {
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return { ok: false, error: "Not authorised" };
  }

  const parsed = createChallengeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join(".") || "form"}: ${i.message}`)
        .join("; "),
    };
  }

  try {
    await db.insert(challenges).values({
      title: parsed.data.title,
      description: parsed.data.description,
      deadline: parsed.data.deadline,
      points: parsed.data.points,
      coverImageUrl: parsed.data.coverImageUrl || null,
      instrumentFocus: parsed.data.instrumentFocus ?? null,
      skillLevelTarget: parsed.data.skillLevelTarget ?? null,
      createdById: session.user.id,
      status: "ACTIVE",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create challenge",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/challenges");
  redirect("/admin");
}
