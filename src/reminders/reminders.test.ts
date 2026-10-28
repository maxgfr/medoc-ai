import { describe, expect, test } from "bun:test";
import type { Intake, Treatment } from "../db/model";
import { treatmentsToIcs } from "./ics";
import { activeOn, adherence, dosesOn, intakeId, nextDose } from "./schedule";

const base: Treatment = {
  id: "t1",
  profileId: "p1",
  country: "fr",
  medId: "60234100",
  name: "DOLIPRANE 1000 mg, comprimé",
  doses: [
    { time: "20:00", amount: "1", unit: "comprimé" },
    { time: "08:00", amount: "1", unit: "comprimé" },
  ],
  days: [],
  start: "2026-10-01",
  end: "2026-10-31",
  createdAt: "2026-10-01T00:00:00Z",
};

describe("schedule", () => {
  test("within its dates, on its weekdays, unless paused", () => {
    expect(activeOn(base, "2026-09-30")).toBe(false);
    expect(activeOn(base, "2026-10-15")).toBe(true);
    expect(activeOn(base, "2026-11-01")).toBe(false);
    expect(activeOn({ ...base, days: [1] }, "2026-10-26")).toBe(true); // a Monday
    expect(activeOn({ ...base, days: [1] }, "2026-10-27")).toBe(false);
    expect(activeOn({ ...base, paused: true }, "2026-10-15")).toBe(false);
  });

  test("doses of a day by time, with what was recorded", () => {
    const taken: Intake = {
      id: intakeId("t1", "2026-10-28", "08:00"),
      treatmentId: "t1",
      profileId: "p1",
      date: "2026-10-28",
      time: "08:00",
      status: "taken",
      at: "2026-10-28T08:05:00Z",
    };
    const doses = dosesOn([base], [taken], "2026-10-28");
    expect(doses.map((d) => [d.time, d.intake?.status])).toEqual([
      ["08:00", "taken"],
      ["20:00", undefined],
    ]);
    const next = nextDose([base], [taken], new Date("2026-10-28T09:00:00"));
    expect([next?.date, next?.time]).toEqual(["2026-10-28", "20:00"]);
    expect(adherence([base], [], "2026-10-28", 2)).toEqual({ taken: 0, due: 4 });
  });
});

describe("calendar file", () => {
  const ics = treatmentsToIcs(
    [
      base,
      {
        ...base,
        id: "t2",
        days: [1, 3, 5],
        end: undefined as never,
        doses: [{ time: "12:30", amount: "2", unit: "gélules" }],
      },
    ],
    { calendarName: "Médicaments", summary: (t, a, u) => `Prendre ${a} ${u} — ${t.name}` },
    new Date("2026-10-28T10:00:00Z"),
  );

  test("one event per dose time, repeating, with an alarm", () => {
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(3);
    expect(ics).toContain("DTSTART:20261001T080000");
    expect(ics).toContain("RRULE:FREQ=DAILY;UNTIL=20261031T235959");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(ics).toContain("TRIGGER:PT0M");
  });

  test("text is escaped and long lines are folded at 75 octets", () => {
    expect(ics).toContain("SUMMARY:Prendre 1 comprimé — DOLIPRANE 1000 mg\\, comprimé");
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
