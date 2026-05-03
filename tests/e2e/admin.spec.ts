import {
  test,
  expect,
  signIn,
  TEACHER,
  collectConsoleErrors,
} from "./fixtures";

test.describe("Teacher (admin) flows", () => {
  test("teacher dashboard shows stat cards", async ({ page }) => {
    await signIn(page, TEACHER);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /teacher dashboard/i }))
      .toBeVisible();
    await expect(page.getByText(/performances/i).first()).toBeVisible();
    await expect(page.getByText(/students/i).first()).toBeVisible();
    await expect(page.getByText(/best performers/i).first()).toBeVisible();
  });

  test("/admin/evaluate exposes verify and crown actions", async ({ page }) => {
    await signIn(page, TEACHER);
    await page.goto("/admin/evaluate");
    await expect(page.getByRole("button", { name: /verify/i }).first())
      .toBeVisible();
    await expect(page.getByRole("button", { name: /crown best/i }).first())
      .toBeVisible();
    await expect(page.getByRole("button", { name: /add feedback/i }).first())
      .toBeVisible();
  });

  test.describe("Create challenge form", () => {
    test("date-time picker has a visible trigger (not a hidden icon-only one)", async ({
      page,
    }) => {
      await signIn(page, TEACHER);
      await page.goto("/admin/challenges/new");

      // Trigger is a Popover trigger; we identify it by its DOM id.
      const trigger = page.locator("#deadline-trigger");
      await expect(trigger).toBeVisible();
      // Must be a real, wide button — not a hidden icon-only slot like the
      // native datetime-local input.
      const box = await trigger.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(200);
      expect(box?.height ?? 0).toBeGreaterThan(28);
      // It must show some text (date string OR placeholder), not be empty.
      const text = (await trigger.textContent())?.trim() ?? "";
      expect(text.length, `trigger text was: "${text}"`).toBeGreaterThan(3);
    });

    test("calendar popover closes immediately on date selection", async ({
      page,
    }) => {
      await signIn(page, TEACHER);
      await page.goto("/admin/challenges/new");
      const trigger = page.locator("#deadline-trigger");
      await trigger.click();

      // react-day-picker v9 renders the calendar inside the popover content.
      const popover = page.locator("[data-slot='popover-content']");
      await expect(popover).toBeVisible();

      // react-day-picker v9 renders day buttons as plain <button> elements
      // inside <td role="gridcell">. Outside-month and past days carry both
      // `disabled` and `aria-disabled`. We pick day "15" which is always in
      // the current month and almost always selectable for "future deadline".
      const dayBtn = popover
        .locator("td button:not([disabled]):not([aria-disabled='true'])")
        .filter({ hasText: /^\d{1,2}$/ })
        .last();
      await expect(dayBtn).toBeVisible();
      await dayBtn.click();

      // The popover must be gone right after click — that's the bug fix the
      // user asked for.
      await expect(popover).toBeHidden({ timeout: 5_000 });
    });

    test("submitting the form creates a challenge and redirects to /admin", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await signIn(page, TEACHER);
      await page.goto("/admin/challenges/new");

      const stamp = Date.now();
      const title = `Playwright smoke ${stamp}`;
      await page.getByLabel("Title").fill(title);
      await page
        .getByLabel(/brief/i)
        .fill(
          "Created by the automated Playwright suite to verify the create-challenge flow. Please ignore.",
        );
      // Default deadline is already 7 days from now — no need to touch it.
      // Points default = 100; leave it.
      await page.getByRole("button", { name: /publish challenge/i }).click();

      await page.waitForURL(/\/admin(?:\b|$)/, { timeout: 30_000 });
      // The new challenge should appear on /challenges.
      await page.goto("/challenges");
      await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
      expect(errors().filter((e) => !/preload|hydration/i.test(e))).toEqual([]);
    });

    test("invalid (empty) brief surfaces an inline error, not a 500 page", async ({
      page,
    }) => {
      await signIn(page, TEACHER);
      await page.goto("/admin/challenges/new");
      // Bypass the HTML5 minLength so the server-side validator runs.
      await page.evaluate(() => {
        const t = document.querySelector(
          "textarea[name='description']",
        ) as HTMLTextAreaElement;
        if (t) t.removeAttribute("minLength");
        const ti = document.querySelector("input[name='title']") as HTMLInputElement;
        if (ti) ti.removeAttribute("minLength");
      });
      await page.getByLabel("Title").fill("ok title here");
      await page.getByLabel(/brief/i).fill("x"); // too short
      await page.getByRole("button", { name: /publish challenge/i }).click();
      // Either an inline error banner OR a toast — both are acceptable.
      await expect(
        page.getByText(/meaningful brief|too short/i).first(),
      ).toBeVisible({ timeout: 8_000 });
      // We must NOT have crashed to an Internal Server Error page.
      await expect(page.getByText(/internal server error/i)).toHaveCount(0);
    });
  });
});
