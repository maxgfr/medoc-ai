/**
 * Reminders that ring even when the app is closed: a calendar file with one
 * repeating event per dose time and an alarm. A web app without a server cannot
 * schedule notifications reliably; the phone's calendar can.
 */
import type { Treatment } from "../db/model";

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets are folded (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    if (new TextEncoder().encode(current + ch).length > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const compactDay = (day: string) => day.replace(/-/g, "");

export interface IcsText {
  calendarName: string;
  /** "Take {amount} {unit} of {name}" already filled in by the caller's language. */
  summary: (t: Treatment, amount: string, unit: string) => string;
  description?: (t: Treatment) => string;
}

export function treatmentsToIcs(treatments: Treatment[], text: IcsText, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//medoc-ai//treatments//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${esc(text.calendarName)}`,
  ];
  for (const t of treatments) {
    if (t.paused) continue;
    for (const d of t.doses) {
      const [hh, mm] = d.time.split(":");
      const rule = ["FREQ=DAILY"];
      if (t.days.length && t.days.length < 7) {
        rule[0] = "FREQ=WEEKLY";
        rule.push(
          `BYDAY=${[...t.days]
            .sort()
            .map((x) => DAY_CODES[x])
            .join(",")}`,
        );
      }
      if (t.end) rule.push(`UNTIL=${compactDay(t.end)}T235959`);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${t.id}-${d.time.replace(":", "")}@medoc-ai`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${compactDay(t.start)}T${hh}${mm}00`,
        "DURATION:PT15M",
        `RRULE:${rule.join(";")}`,
        `SUMMARY:${esc(text.summary(t, d.amount, d.unit))}`,
        ...(text.description ? [`DESCRIPTION:${esc(text.description(t))}`] : []),
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${esc(text.summary(t, d.amount, d.unit))}`,
        "TRIGGER:PT0M",
        "END:VALARM",
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
