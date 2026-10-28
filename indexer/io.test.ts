import { afterAll, describe, expect, test } from "bun:test";
import { get } from "./io";

let calls = 0;
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const path = new URL(req.url).pathname;
    calls++;
    if (path === "/flaky")
      return calls % 3 === 0 ? new Response("ok") : new Response("busy", { status: 503 });
    if (path === "/busy")
      return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
    return new Response("gone", { status: 404 });
  },
});
afterAll(() => server.stop(true));
const url = (p: string) => `http://localhost:${server.port}${p}`;

describe("downloads", () => {
  test("a server busy for a moment is tried again until it answers", async () => {
    calls = 0;
    const res = await get(url("/flaky"), { tries: 4, backoffMs: 1 });
    expect(await res.text()).toBe("ok");
    expect(calls).toBe(3);
  });

  test("it gives up after the last try, and does not retry a missing file", async () => {
    await expect(get(url("/busy"), { tries: 2, backoffMs: 1 })).rejects.toThrow("HTTP 429");
    calls = 0;
    await expect(get(url("/missing"), { tries: 5, backoffMs: 1 })).rejects.toThrow("HTTP 404");
    expect(calls).toBe(1);
  });
});
