import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

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

/**
 * An OpenAI-compatible server on this origin, set up as the custom endpoint: a JSON answer
 * for a structured call, Server-Sent Events chunks for a streamed one, as a real server sends.
 */
export async function fakeModel(page: Page, answer: { json?: unknown; chunks?: string[] }) {
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
