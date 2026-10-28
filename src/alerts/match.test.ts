import { describe, expect, test } from "bun:test";
import type { Alert } from "../../shared/schema";
import type { Item } from "../db/model";
import { concerns, expiryState } from "./match";

const item = (over: Partial<Item>): Item => ({
  id: "i1",
  profileId: "p1",
  country: "fr",
  medId: "63922956",
  name: "BREVIBLOC",
  addedAt: "2026-01-01",
  ...over,
});

describe("concerns", () => {
  test("expiry states", () => {
    expect(expiryState("2026-10-27", "2026-10-28")).toBe("expired");
    expect(expiryState("2026-11-20", "2026-10-28")).toBe("soon");
    expect(expiryState("2027-06-30", "2026-10-28")).toBe("ok");
    expect(expiryState(undefined, "2026-10-28")).toBe("unknown");
  });

  test("a shortage on a box in the cabinet, an expired box, nothing for used-up boxes", () => {
    const shortage: Alert = {
      id: "a1",
      medIds: ["63922956"],
      kind: "shortage",
      title: "Rupture de stock",
    };
    const restored: Alert = {
      id: "a2",
      medIds: ["63922956"],
      kind: "restored",
      title: "Remise à disposition",
    };
    const out = concerns(
      [item({ expiry: "2026-10-01" }), item({ id: "i2", finishedAt: "2026-10-02" })],
      [],
      { fr: [shortage, restored], us: [{ ...shortage, id: "a3" }] },
      "2026-10-28",
    );
    expect(out.map((c) => c.kind)).toEqual(["shortage", "expired"]);
    expect(out[0]?.alert?.id).toBe("a1");
  });
});
