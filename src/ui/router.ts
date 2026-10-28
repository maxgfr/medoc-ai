/** Hash routes, so the app works from any folder of GitHub Pages. */
import { useEffect, useState } from "react";
import { COUNTRIES, type CountryId } from "../../shared/schema";

export type Route =
  | { name: "home" }
  | { name: "scan" }
  | { name: "search"; q?: string }
  | { name: "med"; country: CountryId; id: string; scan?: ScanInfo }
  | { name: "cabinet" }
  | { name: "item"; id: string }
  | { name: "newItem"; country: CountryId; med: string; scan?: ScanInfo }
  | { name: "treatments" }
  | { name: "treatment"; id: string }
  | { name: "newTreatment"; country: CountryId; med: string; item?: string }
  | { name: "today"; date?: string }
  | { name: "alerts" }
  | { name: "interactions" }
  | { name: "profiles" }
  | { name: "settings" }
  | { name: "more" };

/** What the DataMatrix said, carried from the scanner to the forms. */
export interface ScanInfo {
  code?: string;
  lot?: string;
  expiry?: string;
  serial?: string;
}

const COUNTRY = new RegExp(`^(${COUNTRIES.join("|")})$`);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function scanFrom(q: URLSearchParams): ScanInfo | undefined {
  const s: ScanInfo = {};
  for (const [k, p] of [
    ["code", "c"],
    ["lot", "l"],
    ["expiry", "e"],
    ["serial", "s"],
  ] as const) {
    const v = q.get(p);
    if (v) s[k] = v;
  }
  return Object.keys(s).length ? s : undefined;
}

function scanQuery(s: ScanInfo | undefined): string {
  if (!s) return "";
  const q = new URLSearchParams();
  if (s.code) q.set("c", s.code);
  if (s.lot) q.set("l", s.lot);
  if (s.expiry) q.set("e", s.expiry);
  if (s.serial) q.set("s", s.serial);
  const str = q.toString();
  return str ? `?${str}` : "";
}

export function parseRoute(hash: string): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const q = new URLSearchParams(query);
  const [name, a, b] = path.split("/").map((x) => decodeURIComponent(x));
  const scan = scanFrom(q);
  switch (name) {
    case "scan":
      return { name: "scan" };
    case "search": {
      const s = q.get("q");
      return s ? { name: "search", q: s } : { name: "search" };
    }
    case "med":
      return a && COUNTRY.test(a) && b
        ? { name: "med", country: a as CountryId, id: b, ...(scan ? { scan } : {}) }
        : { name: "home" };
    case "cabinet":
      return { name: "cabinet" };
    case "item":
      if (a === "new") {
        const c = q.get("cc");
        const med = q.get("med");
        return c && COUNTRY.test(c) && med
          ? { name: "newItem", country: c as CountryId, med, ...(scan ? { scan } : {}) }
          : { name: "cabinet" };
      }
      return a ? { name: "item", id: a } : { name: "cabinet" };
    case "treatments":
      return { name: "treatments" };
    case "treatment":
      if (a === "new") {
        const c = q.get("cc");
        const med = q.get("med");
        const item = q.get("item");
        return c && COUNTRY.test(c) && med
          ? { name: "newTreatment", country: c as CountryId, med, ...(item ? { item } : {}) }
          : { name: "treatments" };
      }
      return a ? { name: "treatment", id: a } : { name: "treatments" };
    case "today": {
      const d = q.get("date");
      return d && DATE.test(d) ? { name: "today", date: d } : { name: "today" };
    }
    case "alerts":
    case "interactions":
    case "profiles":
    case "settings":
    case "more":
      return { name };
    default:
      return { name: "home" };
  }
}

export function href(route: Route): string {
  const e = encodeURIComponent;
  switch (route.name) {
    case "home":
      return "#/";
    case "search":
      return route.q ? `#/search?q=${e(route.q)}` : "#/search";
    case "med":
      return `#/med/${route.country}/${e(route.id)}${scanQuery(route.scan)}`;
    case "item":
      return `#/item/${e(route.id)}`;
    case "newItem": {
      const s = scanQuery(route.scan);
      return `#/item/new?cc=${route.country}&med=${e(route.med)}${s ? `&${s.slice(1)}` : ""}`;
    }
    case "treatment":
      return `#/treatment/${e(route.id)}`;
    case "newTreatment":
      return `#/treatment/new?cc=${route.country}&med=${e(route.med)}${route.item ? `&item=${e(route.item)}` : ""}`;
    case "today":
      return route.date ? `#/today?date=${route.date}` : "#/today";
    default:
      return `#/${route.name}`;
  }
}

/** `replace` takes the place of the current page in the history, for a form that is done. */
export function go(route: Route, { replace = false } = {}): void {
  if (replace) location.replace(href(route));
  else location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
