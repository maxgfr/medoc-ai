import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const DATA = join(import.meta.dirname, ".data");

/** Serves the fixture index and keeps every outside request off the network. */
export async function offlineData(page: Page): Promise<void> {
  await page.route(/\/data\/.+/, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/data\//, "");
    try {
      const body = readFileSync(join(DATA, path));
      await route.fulfill({
        body,
        contentType: path.endsWith(".gz") ? "application/gzip" : "application/json",
      });
    } catch {
      await route.fulfill({ status: 404, body: "" });
    }
  });
  await page.route(/^https:\/\/(models\.dev|openrouter\.ai)\//, (route) => route.abort());
  await page.route(/^https:\/\/api\.fda\.gov\//, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: readFileSync(join(import.meta.dirname, "../shared/countries/us/fixtures/label.json")),
    }),
  );
}
