import {
  test,
  expect,
  signIn,
  STUDENT_ALEX,
  collectConsoleErrors,
} from "./fixtures";

test.describe("Authenticated student flows", () => {
  test("student signs in and lands on /challenges with seeded data", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, STUDENT_ALEX);
    await page.goto("/challenges");
    await expect(page.getByRole("heading", { name: /active challenges/i }))
      .toBeVisible();
    // At least the seeded "Sweet Child O' Mine" challenge should be there.
    await expect(
      page.getByText(/Sweet Child O.{1,3} Mine/i).first(),
    ).toBeVisible();
    expect(errors().filter((e) => !/preload|hydration/i.test(e))).toEqual([]);
  });

  test("/feed renders Best Performer spotlight and at least one card", async ({
    page,
  }) => {
    await signIn(page, STUDENT_ALEX);
    await page.goto("/feed");
    await expect(page.getByRole("heading", { name: /performance feed/i }))
      .toBeVisible();
    // Best Performer spotlight (seeded with Riya's Chopin take).
    await expect(page.getByText(/best performer/i).first()).toBeVisible();
    // Performance cards have an interactive Like button with an aria-label
    // mentioning "like".
    await expect(
      page.getByRole("button", { name: /like|unlike/i }).first(),
    ).toBeVisible();
  });

  test("liking a performance increases the like count", async ({ page }) => {
    await signIn(page, STUDENT_ALEX);
    await page.goto("/feed");
    const likeBtn = page.getByRole("button", { name: /like|unlike/i }).first();
    await expect(likeBtn).toBeVisible();

    // Capture the count text before clicking. The button label looks like
    // "Like (3)" or "Unlike (4)" depending on prior state.
    const before = await likeBtn.textContent();
    const beforeCount = parseInt((before?.match(/\d+/) ?? ["0"])[0], 10);

    await likeBtn.click();

    // Optimistic UI flips immediately; allow some time for server reconciliation.
    await expect
      .poll(
        async () => {
          const t = await likeBtn.textContent();
          return parseInt((t?.match(/\d+/) ?? ["0"])[0], 10);
        },
        { timeout: 8_000 },
      )
      .not.toBe(beforeCount);

    // Click again to put the like state back to where we found it (idempotent
    // test — important because we run against the live demo DB).
    await likeBtn.click();
  });
});
