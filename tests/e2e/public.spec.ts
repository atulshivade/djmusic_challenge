import { test, expect, collectConsoleErrors } from "./fixtures";

test.describe("Public pages (no auth)", () => {
  test("/ landing renders Encore branding and hero CTA", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/Encore/i);
    // Hero H1 reads "Play it. Post it. Get heard." across two coloured spans.
    await expect(
      page.getByRole("heading", { name: /play it.*post it.*get heard/i }).first(),
    ).toBeVisible();
    // The dark theme should be applied at the <html> level.
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass ?? "").toContain("dark");
    // The two main CTAs should be visible.
    await expect(page.getByRole("link", { name: /browse performances/i }))
      .toBeVisible();
    // No console errors during render.
    expect(errors().filter((e) => !e.includes("preload")).slice(0, 5)).toEqual([]);
  });

  test("/sign-in shows email + password fields", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });

  test("/sign-up exposes optional instrument + skill", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByLabel(/name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(
      page.locator("select[name='primaryInstrument'], #primaryInstrument"),
    ).toBeAttached();
    await expect(
      page.locator("select[name='skillLevel'], #skillLevel"),
    ).toBeAttached();
  });

  test("/feed redirects unauthenticated visitors to /sign-in", async ({ page }) => {
    const resp = await page.goto("/feed");
    // Layout guard either issues a 307 (caught here as the final URL) or
    // performs a client-side redirect. Either way, we end up at /sign-in.
    expect(page.url()).toMatch(/\/sign-in/);
    expect(resp?.status() ?? 200).toBeLessThan(500);
  });

  test("/admin redirects unauthenticated visitors to /sign-in", async ({ page }) => {
    await page.goto("/admin");
    expect(page.url()).toMatch(/\/sign-in/);
  });

  test("dark theme is in effect (body bg is dark, foreground is light)", async ({
    page,
  }) => {
    // Diagnostic for the user's "blacked out" report — this asserts the
    // *intended* dark palette is in effect, not a missing-stylesheet bug.
    //
    // Chromium serialises colour-mix() / oklch() tokens as `lab(L a b)` where
    // L is in 0–100 (perceptual lightness). Simpler than converting back to
    // RGB, and a stylesheet failure (=> default white body bg, black text)
    // would also flip these L values dramatically.
    await page.goto("/");
    const { bg, fg } = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      fg: getComputedStyle(document.body).color,
    }));

    function lightness(colour: string): number | null {
      const lab = colour.match(/^lab\(\s*([0-9.+-]+)/);
      if (lab) return parseFloat(lab[1]); // already 0–100
      const rgb = colour.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgb) {
        const [r, g, b] = rgb.slice(1, 4).map(Number);
        return ((r + g + b) / 3 / 255) * 100;
      }
      return null;
    }

    const bgL = lightness(bg);
    const fgL = lightness(fg);
    expect(bgL, `unexpected bg colour format: ${bg}`).not.toBeNull();
    expect(fgL, `unexpected fg colour format: ${fg}`).not.toBeNull();
    // If the stylesheet fails to load: body bg defaults to white (L≈100),
    // text to black (L≈0). The dark theme should give us bg L < 15 and
    // fg L > 85.
    expect(bgL!, `body bg should be dark, got ${bg} (L=${bgL})`).toBeLessThan(15);
    expect(fgL!, `body fg should be bright, got ${fg} (L=${fgL})`).toBeGreaterThan(85);
  });
});
