/** The cabinet, alerts, interactions, backups, a local index and the layout, end to end. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { fakeModel, offlineData } from "./helpers";

test.use({ locale: "fr-FR", viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await offlineData(page);
});

async function addToCabinet(page: Page, cis: string, quantity?: string) {
  await page.goto(`./#/item/new?cc=fr&med=${cis}`);
  if (quantity) await page.getByLabel("Quantité restante").fill(quantity);
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page).toHaveURL(/#\/cabinet$/);
}

test("a box: edit it, mark it used up, find it under Used up, delete it", async ({ page }) => {
  await addToCabinet(page, "60234100", "8 comprimés");
  await page.getByRole("link", { name: /DOLIPRANE 1000 mg/ }).click();
  await page.getByLabel("Quantité restante").fill("3 comprimés");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("3 comprimés")).toBeVisible();

  await page.getByRole("link", { name: /DOLIPRANE 1000 mg/ }).click();
  await page.getByRole("button", { name: "Terminé / jeté" }).click();
  await expect(page.getByText("Votre armoire est vide")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /DOLIPRANE 1000 mg/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Terminés" }).click();
  await page.getByRole("link", { name: /DOLIPRANE 1000 mg/ }).click();
  await page.getByRole("button", { name: "Supprimer" }).click();
  await page.getByRole("button", { name: "Oui" }).click();
  await expect(page.getByText("Votre armoire est vide")).toBeVisible();
});

test("a box under a shortage raises an alert in the header, on the home screen and in Alerts", async ({
  page,
}) => {
  await addToCabinet(page, "63922956");
  await expect(page.getByRole("link", { name: "Alertes" }).first()).toContainText("1");
  await page.goto("./#/");
  await expect(page.getByText("1 point demande votre attention")).toBeVisible();
  await page.goto("./#/alerts");
  await expect(page.getByText("Rupture de stock").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /BREVIBLOC/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lire sur la source" })).toHaveAttribute(
    "href",
    /ansm\.sante\.fr/,
  );
});

test("interactions between a profile's medicines, read by the model from both documents", async ({
  page,
}) => {
  await fakeModel(page, {
    json: {
      pairs: [
        {
          a: "DOLIPRANE 1000 mg, comprimé",
          b: "BREVIBLOC 100 mg/10 ml",
          severity: "caution",
          explanation: "Surveiller la **tension** pendant l'association.",
          citations: ["m1:rcp-4.5", "m9:rcp-1"],
        },
      ],
      notes: ["Aucune substance en double."],
    },
  });
  await addToCabinet(page, "60234100");
  await addToCabinet(page, "63922956");
  await page.goto("./#/interactions");
  await expect(page.getByRole("link", { name: /DOLIPRANE 1000 mg/ })).toBeVisible();
  await page.getByRole("button", { name: "Vérifier les interactions" }).click();
  await expect(page.getByText("Précaution d'emploi")).toBeVisible();
  await expect(page.locator(".markdown strong", { hasText: "tension" })).toBeVisible();
  await expect(page.getByText("Aucune substance en double.")).toBeVisible();
  // The cited section of a medicine the model was not given (m9) is dropped.
  await expect(page.getByText(/Sources:.*4\.5\. Interactions/)).toBeVisible();
  await expect(page.getByText("m9:rcp-1")).toHaveCount(0);
});

test("a backup restores the cabinet after everything was deleted", async ({ page }) => {
  await addToCabinet(page, "60234100", "8 comprimés");
  await page.goto("./#/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter une sauvegarde" }).click();
  const file = await (await download).path();
  const backup = JSON.parse(readFileSync(file, "utf8"));
  expect(backup).toMatchObject({ app: "medoc-ai", version: 1 });
  expect(backup.items).toHaveLength(1);

  await page.getByRole("button", { name: "Tout supprimer" }).click();
  await page.getByRole("button", { name: "Oui, tout supprimer" }).click();
  await expect(page.getByText("Tout a été supprimé.")).toBeVisible();
  await page.goto("./#/cabinet");
  await expect(page.getByText("Votre armoire est vide")).toBeVisible();

  await page.goto("./#/settings");
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(file);
  await expect(page.getByText("Sauvegarde restaurée.")).toBeVisible();
  await page.goto("./#/cabinet");
  await expect(page.getByText("8 comprimés")).toBeVisible();
});

test("the BDPM files imported in the browser become this device's index, until the published one is chosen again", async ({
  page,
}) => {
  const fixtures = join(import.meta.dirname, "../shared/countries/fr/fixtures");
  await page.goto("./#/settings");
  await page
    .locator('input[type="file"][accept=".txt,.zip"]')
    .setInputFiles(
      ["CIS_bdpm.txt", "CIS_CIP_bdpm.txt", "CIS_COMPO_bdpm.txt", "CIS_CIP_Dispo_Spec.txt"].map(
        (f) => join(fixtures, f),
      ),
    );
  await expect(page.getByText("Index construit : 3 médicaments.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Index importé sur cet appareil").first()).toBeVisible();
  await expect(page.getByText(/ne se met pas à jour tout seul/)).toBeVisible();

  await page.goto("./#/search?q=protoxyde");
  await expect(page.getByRole("link", { name: /PROTOXYDE D AZOTE TEST/ })).toBeVisible();

  await page.goto("./#/settings");
  await page.getByRole("button", { name: "Revenir à l'index publié" }).click();
  await expect(page.getByText("Index importé sur cet appareil")).toHaveCount(0);
});

test("no screen is wider than the phone", async ({ page }) => {
  const routes = [
    "",
    "scan",
    "search?q=doliprane",
    "med/fr/60234100",
    "med/de/pzn-00240365",
    "med/us/71309-001",
    "cabinet",
    "today",
    "treatments",
    "alerts",
    "interactions",
    "profiles",
    "settings",
    "more",
  ];
  for (const r of routes) {
    await page.goto(`./#/${r}`);
    await page.waitForLoadState("networkidle");
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect([r, width]).toEqual([r, 390]);
  }
});
