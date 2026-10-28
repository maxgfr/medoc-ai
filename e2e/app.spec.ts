import { expect, test } from "@playwright/test";
import { offlineData } from "./helpers";

test.use({ locale: "fr-FR", viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await offlineData(page);
});

test("a typed DataMatrix opens the medicine, its leaflet, and goes to the cabinet with its lot and expiry", async ({
  page,
}) => {
  await page.goto("./#/scan");
  await page
    .getByPlaceholder("3400935955838")
    .fill("(01)03400935955838(17)270400(10)LOT42(21)SN123");
  await page.getByRole("button", { name: "Chercher" }).click();
  await expect(page.getByRole("heading", { name: "DOLIPRANE 1000 mg, comprimé" })).toBeVisible();
  await expect(page.getByText("Lot LOT42 · Expire le 30 avr. 2027")).toBeVisible();

  await page.getByRole("tab", { name: "Notice" }).click();
  await page.locator("#sec-rcp-4\\.5 summary").click();
  await expect(page.getByText("+ Antivitamines K")).toBeVisible();

  await page.getByRole("link", { name: "Ajouter à l'armoire" }).click();
  await expect(page.getByLabel("Lot")).toHaveValue("LOT42");
  await expect(page.getByLabel("Date de péremption")).toHaveValue("2027-04-30");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page).toHaveURL(/#\/cabinet$/);
  await expect(page.getByText("Expire le 30 avr. 2027")).toBeVisible();
});

test("a photo of a box is read for its DataMatrix", async ({ page }) => {
  await page.goto("./#/scan");
  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/datamatrix.png");
  await expect(page.getByRole("heading", { name: "DOLIPRANE 1000 mg, comprimé" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page).toHaveURL(/l=LOT42/);
});

test("a US UPC-A finds the product and its live label", async ({ page }) => {
  await page.goto("./#/scan");
  await page.getByPlaceholder("3400935955838").fill("371309001051");
  await page.getByRole("button", { name: "Chercher" }).click();
  await expect(page.getByRole("heading", { name: /Extra Strength No-Pain/ })).toBeVisible();
  await page.getByRole("tab", { name: "Notice" }).click();
  await expect(page.getByText("Purpose", { exact: true })).toBeVisible();
});

test("search, plan a treatment, record a dose, export the calendar", async ({ page }) => {
  await page.goto("./#/search?q=doliprane");
  await page.getByRole("link", { name: /DOLIPRANE 1000 mg/ }).click();
  await page.getByRole("link", { name: "Planifier un traitement" }).click();
  await expect(page.getByLabel("Unité")).toHaveValue("comprimé");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/#\/treatments$/);
  await expect(page.getByText("1 comprimé à 08:00")).toBeVisible();

  await page.goto("./#/today");
  await page.getByRole("button", { name: "Pris" }).click();
  await expect(page.getByRole("button", { name: "Annuler" })).toBeVisible();

  await page.goto("./#/treatments");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ajouter les rappels à mon agenda" }).click();
  const file = await (await download).path();
  const ics = (await import("node:fs")).readFileSync(file, "utf8");
  expect(ics).toContain("RRULE:FREQ=DAILY");
  expect(ics).toContain("SUMMARY:Prendre 1 comprimé — DOLIPRANE 1000 mg\\, comprimé");
});

test("profiles keep their own cabinet", async ({ page }) => {
  await page.goto("./#/profiles");
  await page.getByPlaceholder("Prénom").fill("Léa");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByRole("link", { name: "Changer de profil" })).toContainText("Léa");
  await page.goto("./#/cabinet");
  await expect(page.getByText("Votre armoire est vide")).toBeVisible();
});

test("the AI summary goes through the configured model and cites the leaflet", async ({ page }) => {
  const summary = {
    purpose: ["Traite la douleur et la fièvre."],
    howToTake: ["1 comprimé, à renouveler au bout de 6 heures si besoin."],
    doNotTake: ["Maladie grave du foie."],
    sideEffects: [],
    warnings: [],
    citations: ["notice-1", "rcp-4.3"],
  };
  await page.route("http://localhost:4318/fake/v1/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "x",
        object: "chat.completion",
        created: 0,
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: JSON.stringify(summary) },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    }),
  );
  await page.goto("./#/settings");
  await page.getByRole("tab", { name: "Local / personnalisé" }).click();
  await page.getByLabel("Point d'accès (compatible OpenAI)").fill("http://localhost:4318/fake/v1");
  await page.getByLabel("Modèle", { exact: true }).fill("test-model");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Enregistré.")).toBeVisible();

  await page.goto("./#/med/fr/60234100");
  await page.getByRole("tab", { name: "Résumé clair" }).click();
  await page.getByRole("button", { name: "Résumer la notice" }).click();
  await expect(page.getByText("Traite la douleur et la fièvre.")).toBeVisible();
  await page.getByRole("button", { name: /4\.3\. Contre-indications/ }).click();
  await expect(page.locator("#sec-rcp-4\\.3")).toHaveAttribute("open", "");
});

test("English interface", async ({ page }) => {
  await page.goto("./#/settings");
  await page.getByLabel("Langue").selectOption("en");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.goto("./#/");
  await expect(page.getByText("Scan a box", { exact: true })).toBeVisible();
});

test("works offline once visited", async ({ page, context }) => {
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Scanner une boîte", { exact: true })).toBeVisible();
});
