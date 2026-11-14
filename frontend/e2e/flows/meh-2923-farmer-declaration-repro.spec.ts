import { test, expect } from "./_cloudinary-stub";

/**
 * MEH-2923 chunk 1 — reproduce the pilot finding, NO fix.
 *
 * Pilot: category «ירקות», tick 2 of the 3 STORY checkboxes, click «הצטרפו» →
 * reached the «בדקו את תיבת האימייל» screen with no message. The client gate
 * (RegisterProducerClient.jsx: farmerDeclarationRequired && !farmerConfirmed)
 * should stop that. This spec records what actually happens, per combination
 * of the box left unticked, and whether POST /auth/register/producer fired.
 *
 * Chunk 2 (server-side enforcement + its own record) is separate; whatever this
 * spec shows, the server must still enforce the grower declaration.
 */

const REGISTER_POST = "**/auth/register/producer";

async function reachStory(page) {
  await page.goto("/register/producer");
  await page.getByTestId("register-preflight-start").click();
  await page.getByTestId("register-account-name").fill("טסט מגדלת");
  await page.getByTestId("register-account-email").fill(`farmer+${Date.now()}@mehamakor.online`);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();
  await expect(page.getByTestId("register-frame-details")).toBeVisible();
  await page.getByTestId("register-details-name").fill("משק הבדיקה");
  await page.getByTestId("register-details-phone").fill("0501234567");
  await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
  await page.getByTestId("register-details-city").getByRole("option", { name: "תל אביב" }).first().click();
  await page.getByTestId("register-fulfilment-onsite").check();
  await page.getByTestId("register-details-next").click();
  await expect(page.getByTestId("register-frame-category")).toBeVisible();
  await page.getByTestId("category-chip-3").click();
  await page.getByTestId("register-category-next").click();
  await expect(page.getByTestId("register-frame-story")).toBeVisible();
  await page.getByTestId("register-story-tagline").fill("ירקות מהשדה");
}

test.describe("MEH-2923 grower declaration — 2 of 3 boxes on «ירקות»", () => {
  let posts: string[];

  test.beforeEach(async ({ page }) => {
    posts = [];
    await page.route("**/categories", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "חלב וגבינות", slug: "dairy" },
          { id: 3, name: "ירקות", slug: "veg" },
        ]),
      }),
    );
    await page.route(REGISTER_POST, (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts.push(route.request().postData() || "");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ whatsapp_sent: true }),
      });
    });
  });

  test("three boxes are shown for «ירקות» (control: the grower box exists)", async ({ page }) => {
    await reachStory(page);
    await expect(page.getByTestId("register-frame-story").getByRole("checkbox")).toHaveCount(3);
  });

  for (const skip of [0, 1, 2]) {
    test(`box #${skip + 1} left unticked → no submit, a visible message`, async ({ page }) => {
      await reachStory(page);
      const boxes = await page.getByTestId("register-frame-story").getByRole("checkbox").all();
      for (const [i, cb] of boxes.entries()) if (i !== skip) await cb.check();
      await page.getByTestId("register-story-submit").click();
      await page.waitForTimeout(1500);
      const confirm = await page.getByTestId("register-frame-confirm").isVisible();
      const alert = page.getByTestId("register-frame-story").getByRole("alert");
      const alertText = (await alert.count()) ? await alert.first().innerText() : "";
      await page.screenshot({ path: `test-results/meh-2923-skip-${skip + 1}.png`, fullPage: false });
      console.log(`MEH-2923 skip#${skip + 1}: confirm=${confirm} posts=${posts.length} alert="${alertText}" body=${posts[0] || ""}`);
      expect(confirm, "reached the inbox-check screen").toBe(false);
      expect(posts, "POST /auth/register/producer fired").toHaveLength(0);
      await expect(alert.first()).toBeVisible();
    });
  }

  test("all three ticked → one POST that carries the grower line on its own (chunk 4)", async ({ page }) => {
    await reachStory(page);
    for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) await cb.check();
    await page.getByTestId("register-story-submit").click();
    await expect.poll(() => posts.length).toBe(1);
    const body = JSON.parse(posts[0]);
    expect(body.declaration_accepted).toBe(true);
    expect(body.farmer_declaration_accepted).toBe(true);
  });
});
