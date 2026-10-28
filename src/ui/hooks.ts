import { useEffect, useState } from "react";
import type { CountryId, Medicine } from "../../shared/schema";
import { medicine } from "../data/repo";

export type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; error: unknown };

/** Runs `load` when its deps change; drops answers that arrive after a newer one started. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    load().then(
      (value) => live && setState({ status: "ready", value }),
      (error: unknown) => live && setState({ status: "error", error }),
    );
    return () => {
      live = false;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: the caller lists what `load` depends on.
  }, deps);
  return state;
}

export function useMedicine(country: CountryId, id: string): Loaded<Medicine | undefined> {
  return useLoad(() => medicine(country, id), [country, id]);
}
