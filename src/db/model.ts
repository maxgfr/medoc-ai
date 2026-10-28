/** What a person keeps on their device: profiles, their cabinet, treatments and intakes. */
import { z } from "zod";
import { CountryId } from "../../shared/schema";

export const Profile = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: z.string(),
});
export type Profile = z.infer<typeof Profile>;

/** A box in the medicine cabinet. */
export const Item = z.object({
  id: z.string(),
  profileId: z.string(),
  country: CountryId,
  medId: z.string(),
  /** The medicine's name when it was added, shown even offline. */
  name: z.string(),
  code: z.string().optional(),
  lot: z.string().optional(),
  /** YYYY-MM-DD. */
  expiry: z.string().optional(),
  serial: z.string().optional(),
  quantity: z.string().optional(),
  openedAt: z.string().optional(),
  notes: z.string().optional(),
  addedAt: z.string(),
  /** Set when the box is used up or thrown away. */
  finishedAt: z.string().optional(),
});
export type Item = z.infer<typeof Item>;

export const Dose = z.object({
  /** HH:MM, local time. */
  time: z.string().regex(/^\d{2}:\d{2}$/),
  amount: z.string(),
  unit: z.string(),
});
export type Dose = z.infer<typeof Dose>;

export const Treatment = z.object({
  id: z.string(),
  profileId: z.string(),
  country: CountryId,
  medId: z.string(),
  name: z.string(),
  itemId: z.string().optional(),
  doses: z.array(Dose),
  /** Days of the week it is taken (0 = Sunday); empty means every day. */
  days: z.array(z.number().int().min(0).max(6)),
  start: z.string(),
  end: z.string().optional(),
  notes: z.string().optional(),
  paused: z.boolean().optional(),
  createdAt: z.string(),
});
export type Treatment = z.infer<typeof Treatment>;

export const Intake = z.object({
  /** treatmentId:date:time, so a dose is recorded once. */
  id: z.string(),
  treatmentId: z.string(),
  profileId: z.string(),
  date: z.string(),
  time: z.string(),
  status: z.enum(["taken", "skipped"]),
  at: z.string(),
});
export type Intake = z.infer<typeof Intake>;

export const Backup = z.object({
  app: z.literal("medoc-ai"),
  version: z.literal(1),
  exportedAt: z.string(),
  profiles: z.array(Profile),
  items: z.array(Item),
  treatments: z.array(Treatment),
  intakes: z.array(Intake),
});
export type Backup = z.infer<typeof Backup>;

export const PROFILE_COLORS = ["#0f766e", "#b45309", "#7c3aed", "#be123c", "#1d4ed8", "#4d7c0f"];

export const uid = () => crypto.randomUUID();
