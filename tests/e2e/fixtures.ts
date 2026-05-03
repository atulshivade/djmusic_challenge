import { test as base, expect, type Page } from "@playwright/test";

/**
 * Demo credentials — these are intentionally hardcoded for the Netlify demo
 * deployment. The seed creates them via /api/admin/dbinit.
 */
export const TEACHER = {
  email: "admin@portal.dev",
  password: "Password123",
};
export const STUDENT_ALEX = {
  email: "alex@portal.dev",
  password: "Password123",
};

/**
 * Helper: signs a user in via the credentials form.
 *
 * Uses the visible form (rather than calling NextAuth's API directly) so the
 * test exercises the same code path a real user does, including CSRF and
 * cookie handshakes.
 */
export async function signIn(
  page: Page,
  creds: { email: string; password: string },
) {
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Sign-in success bounces to /challenges (or /admin for ADMIN role
  // depending on layout guard order). Any /challenges|/admin URL is fine.
  await page.waitForURL(/\/(challenges|admin)/, { timeout: 30_000 });
}

/**
 * Helper: capture all browser console errors during a test. Returns a getter
 * the test can call after navigation to assert nothing went wrong.
 */
export function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return () => errors;
}

export const test = base;
export { expect };
