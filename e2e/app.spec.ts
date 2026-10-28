import { expect, type Page, test } from "@playwright/test";
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

/**
 * An OpenAI-compatible server on this origin, set up as the custom endpoint: a JSON answer
 * for a structured call, Server-Sent Events chunks for a streamed one, as a real server sends.
 */
async function fakeModel(page: Page, answer: { json?: unknown; chunks?: string[] }) {
  await page.route("http://localhost:4318/fake/v1/**", async (route) => {
    const body = route.request().postDataJSON() as { stream?: boolean } | null;
    if (body?.stream) {
      const events = (answer.chunks ?? []).map((content, i) => ({
        id: "x",
        object: "chat.completion.chunk",
        created: 0,
        model: "test-model",
        choices: [
          {
            index: 0,
            delta: i ? { content } : { role: "assistant", content },
            finish_reason: null,
          },
        ],
      }));
      events.push({
        id: "x",
        object: "chat.completion.chunk",
        created: 0,
        model: "test-model",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" } as never],
      });
      await route.fulfill({
        contentType: "text/event-stream",
        body: `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`,
      });
      return;
    }
    await route.fulfill({
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
            message: { role: "assistant", content: JSON.stringify(answer.json) },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    });
  });
  await page.goto("./#/settings");
  await page.getByRole("tab", { name: "Local / personnalisé" }).click();
  await page.getByLabel("Point d'accès (compatible OpenAI)").fill("http://localhost:4318/fake/v1");
  await page.getByLabel("Modèle", { exact: true }).fill("test-model");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Enregistré.")).toBeVisible();
}

test("the AI summary goes through the configured model and cites the leaflet", async ({ page }) => {
  await fakeModel(page, {
    json: {
      purpose: ["Traite la **douleur** et la fièvre."],
      howToTake: ["1 comprimé, à renouveler au bout de 6 heures si besoin."],
      doNotTake: ["Maladie grave du foie."],
      sideEffects: [],
      warnings: [],
      citations: ["notice-1", "rcp-4.3"],
    },
  });
  await page.goto("./#/med/fr/60234100");
  await page.getByRole("tab", { name: "Résumé clair" }).click();
  await page.getByRole("button", { name: "Résumer la notice" }).click();
  await expect(page.getByText("Traite la douleur et la fièvre.")).toBeVisible();
  await expect(page.locator("strong", { hasText: "douleur" })).toBeVisible();
  await page.getByRole("button", { name: /4\.3\. Contre-indications/ }).click();
  await expect(page.locator("#sec-rcp-4\\.3")).toHaveAttribute("open", "");
});

// After a reload the service worker would fetch the data itself, around the fixture routes.
test.describe("without the service worker", () => {
  test.use({ serviceWorkers: "block" });
  test("a question: the answer streams in Markdown, its citations open the leaflet", question);
});

async function question({ page }: { page: Page }) {
  await fakeModel(page, {
    chunks: [
      "Avec un anticoagulant AVK, **prudence** [rcp-4.5] :\n\n",
      "- contrôle plus fréquent de l'INR\n",
      "- au-delà de 4 g/j pendant 4 jours, risque de saignement [rcp-4.5] [rcp-99.9]",
    ],
  });
  await page.goto("./#/med/fr/60234100");
  await page.getByRole("tab", { name: "Questions" }).click();
  await page.getByLabel("Demander").fill("Et avec la warfarine ?");
  await page.getByRole("button", { name: "Demander" }).click();
  await expect(page.locator(".markdown strong", { hasText: "prudence" })).toBeVisible();
  await expect(page.locator(".markdown li")).toHaveCount(2);
  // The invented section [rcp-99.9] is dropped; the real one is a button to the leaflet.
  await expect(page.getByText("rcp-99.9")).toHaveCount(0);
  await page
    .locator(".markdown")
    .getByRole("button", { name: /4\.5\. Interactions/ })
    .first()
    .click();
  await expect(page.locator("#sec-rcp-4\\.5")).toHaveAttribute("open", "");

  // The conversation survives tab changes, a reload, and goes only when cleared.
  const answer = page.locator(".markdown strong", { hasText: "prudence" });
  await page.getByRole("tab", { name: "Résumé clair" }).click();
  await page.getByRole("tab", { name: "Informations" }).click();
  await page.getByRole("tab", { name: "Questions" }).click();
  await expect(page.getByText("Et avec la warfarine ?")).toBeVisible();
  await expect(answer).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Questions" }).click();
  await expect(answer).toBeVisible();
  await page.getByRole("button", { name: "Effacer la conversation" }).click();
  await expect(page.getByText("Et avec la warfarine ?")).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: "Questions" }).click();
  await expect(page.getByLabel("Demander")).toBeVisible();
  await expect(page.getByText("Et avec la warfarine ?")).toHaveCount(0);
}

test("the app says it is the latest version, or that a new one is out", async ({ page }) => {
  await page.goto("./#/more");
  await expect(page.getByText("Dernière version")).toBeVisible();
  await expect(
    page.getByText(/Application et données des médicaments à jour|Données pas à jour/),
  ).toHaveCount(0);
  await page.route(/\/version\.json$/, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: "9.9.9",
        commit: "abcdef0",
        builtAt: "2030-01-01T00:00:00Z",
      }),
    }),
  );
  await page.getByRole("button", { name: "Vérifier maintenant" }).click();
  await expect(page.getByText("Une nouvelle version de Medoc est disponible.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Passer à la 9.9.9 (abcdef0)" })).toBeVisible();
});

test("English interface, from the header or Settings", async ({ page }) => {
  await page.goto("./#/");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByText("Scan a box", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Passer en français" }).click();
  await expect(page.getByText("Scanner une boîte", { exact: true })).toBeVisible();
  await page.goto("./#/settings");
  await page.getByLabel("Langue").selectOption("en");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("search looks in every country by default, or in the one picked", async ({ page }) => {
  await page.goto("./#/search?q=ziagen");
  await expect(page.getByRole("link", { name: /Ziagen 20 mg\/ml/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Pays" })).toHaveValue("all");
  await page.getByRole("combobox", { name: "Pays" }).selectOption("fr");
  await expect(page.getByText("Aucun médicament ne correspond.")).toBeVisible();
  await page.getByRole("searchbox").fill("doliprane");
  await expect(page.getByRole("link", { name: /DOLIPRANE 1000 mg, comprimé/ })).toBeVisible();
  // The choice is kept, also in Settings.
  await page.goto("./#/settings");
  await expect(page.getByRole("combobox", { name: "Pays" })).toHaveValue("fr");
});

test("a German IFA DataMatrix finds the product by its PZN; an unknown PZN links out", async ({
  page,
}) => {
  await page.goto("./#/scan");
  const box = page.getByPlaceholder("3400935955838");
  await box.fill("[)><RS>06<GS>9N110024036552<GS>1TCH4711<GS>D270400<GS>S12345ABC<RS><EOT>");
  await page.getByRole("button", { name: "Chercher" }).click();
  await expect(page.getByRole("heading", { name: /Ziagen 20 mg\/ml/ })).toBeVisible();
  await expect(page.getByText("Lot CH4711 · Expire le 30 avr. 2027")).toBeVisible();

  await page.goto("./#/scan");
  await box.fill("PZN 01234562");
  await page.getByRole("button", { name: "Chercher" }).click();
  await expect(
    page.getByText(/Le PZN 01234562 n'est pas dans les données ouvertes allemandes/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Chercher le PZN sur la Gelbe Liste" }),
  ).toHaveAttribute("href", /gelbe-liste\.de\/suche\?term=01234562/);
});

test("works offline once visited", async ({ page, context }) => {
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Scanner une boîte", { exact: true })).toBeVisible();
});
