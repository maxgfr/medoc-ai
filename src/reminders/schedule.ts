/** Which doses are due on a day, and the next one to remind of. */
import type { Intake, Treatment } from "../db/model";

/** YYYY-MM-DD of a local date. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** The treatment is taken on that day: within its dates, not paused, on one of its weekdays. */
export function activeOn(t: Treatment, day: string): boolean {
  if (t.paused || day < t.start || (t.end && day > t.end)) return false;
  if (!t.days.length) return true;
  return t.days.includes(new Date(`${day}T12:00:00`).getDay());
}

export interface DueDose {
  treatment: Treatment;
  date: string;
  time: string;
  amount: string;
  unit: string;
  intake?: Intake;
}

export const intakeId = (treatmentId: string, date: string, time: string) =>
  `${treatmentId}:${date}:${time}`;

/** Every dose of the day, by time, with what was recorded for it. */
export function dosesOn(treatments: Treatment[], intakes: Intake[], day: string): DueDose[] {
  const recorded = new Map(intakes.map((i) => [i.id, i]));
  const out: DueDose[] = [];
  for (const t of treatments) {
    if (!activeOn(t, day)) continue;
    for (const d of t.doses) {
      const intake = recorded.get(intakeId(t.id, day, d.time));
      out.push({
        treatment: t,
        date: day,
        time: d.time,
        amount: d.amount,
        unit: d.unit,
        ...(intake ? { intake } : {}),
      });
    }
  }
  return out.sort(
    (a, b) => a.time.localeCompare(b.time) || a.treatment.name.localeCompare(b.treatment.name),
  );
}

/** The next dose not yet recorded, today or within a week. */
export function nextDose(
  treatments: Treatment[],
  intakes: Intake[],
  now: Date,
): (DueDose & { at: Date }) | null {
  const today = localDay(now);
  for (let i = 0; i < 8; i++) {
    const day = addDays(today, i);
    for (const d of dosesOn(treatments, intakes, day)) {
      if (d.intake) continue;
      const at = new Date(`${day}T${d.time}:00`);
      if (at.getTime() > now.getTime()) return { ...d, at };
    }
  }
  return null;
}

/** Share of the doses of the past days that were taken, for adherence. */
export function adherence(
  treatments: Treatment[],
  intakes: Intake[],
  today: string,
  days = 7,
): { taken: number; due: number } {
  let due = 0;
  let taken = 0;
  for (let i = 1; i <= days; i++) {
    for (const d of dosesOn(treatments, intakes, addDays(today, -i))) {
      due++;
      if (d.intake?.status === "taken") taken++;
    }
  }
  return { taken, due };
}
