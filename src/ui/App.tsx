/** The shell: a top bar with the profile, the page, a bottom bar on phones. */
import { useEffect } from "react";
import { useT } from "../i18n/react";
import { useInAppReminders } from "../reminders/notify";
import { Alerts } from "./Alerts";
import { Cabinet } from "./Cabinet";
import { Home } from "./Home";
import { Interactions } from "./Interactions";
import { ItemEdit } from "./ItemEdit";
import { Avatar, Icon, type IconName, Spinner } from "./kit";
import { Med } from "./Med";
import { More } from "./More";
import { Profiles } from "./Profiles";
import { href, type Route, useRoute } from "./router";
import { Scan } from "./Scan";
import { Search } from "./Search";
import { Settings } from "./Settings";
import { useApp } from "./state";
import { Today } from "./Today";
import { TreatmentEdit } from "./TreatmentEdit";
import { Treatments } from "./Treatments";

const TABS: {
  route: Route;
  icon: IconName;
  label:
    | "common.navHome"
    | "common.navScan"
    | "common.navCabinet"
    | "common.navToday"
    | "common.navMore";
  match: Route["name"][];
}[] = [
  {
    route: { name: "home" },
    icon: "home",
    label: "common.navHome",
    match: ["home", "search", "med"],
  },
  { route: { name: "scan" }, icon: "scan", label: "common.navScan", match: ["scan"] },
  {
    route: { name: "cabinet" },
    icon: "cabinet",
    label: "common.navCabinet",
    match: ["cabinet", "item", "newItem"],
  },
  {
    route: { name: "today" },
    icon: "today",
    label: "common.navToday",
    match: ["today", "treatments", "treatment", "newTreatment"],
  },
  {
    route: { name: "more" },
    icon: "more",
    label: "common.navMore",
    match: ["more", "alerts", "interactions", "profiles", "settings"],
  },
];

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case "home":
      return <Home />;
    case "scan":
      return <Scan />;
    case "search":
      return <Search {...(route.q ? { q: route.q } : {})} />;
    case "med":
      return (
        <Med country={route.country} id={route.id} {...(route.scan ? { scan: route.scan } : {})} />
      );
    case "cabinet":
      return <Cabinet />;
    case "item":
      return <ItemEdit id={route.id} />;
    case "newItem":
      return (
        <ItemEdit
          country={route.country}
          med={route.med}
          {...(route.scan ? { scan: route.scan } : {})}
        />
      );
    case "treatments":
      return <Treatments />;
    case "treatment":
      return <TreatmentEdit id={route.id} />;
    case "newTreatment":
      return (
        <TreatmentEdit
          country={route.country}
          med={route.med}
          {...(route.item ? { item: route.item } : {})}
        />
      );
    case "today":
      return <Today {...(route.date ? { date: route.date } : {})} />;
    case "alerts":
      return <Alerts />;
    case "interactions":
      return <Interactions />;
    case "profiles":
      return <Profiles />;
    case "settings":
      return <Settings />;
    case "more":
      return <More />;
  }
}

export function App() {
  const t = useT();
  const route = useRoute();
  const { ready, active, profiles, concerns, online } = useApp();
  useInAppReminders();

  useEffect(() => {
    document.title = t("common.appName");
  }, [t]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
        {t("common.skip")}
      </a>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50/90 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <a href="#/" className="flex items-center gap-2 font-bold tracking-tight">
          <img src="./icon.svg" alt="" className="size-7" />
          {t("common.appName")}
        </a>
        <div className="flex items-center gap-1">
          <a
            href={href({ name: "search" })}
            className="rounded-lg p-2 text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
            aria-label={t("common.search")}
          >
            <Icon name="search" />
          </a>
          <a
            href={href({ name: "alerts" })}
            className="relative rounded-lg p-2 text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
            aria-label={t("alert.title")}
          >
            <Icon name="bell" />
            {concerns.length ? (
              <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                {concerns.length > 99 ? "99+" : concerns.length}
              </span>
            ) : null}
          </a>
          {profiles.length ? (
            <a
              href={href({ name: "profiles" })}
              className="ml-1 flex items-center gap-2 rounded-full p-1 pr-3 text-sm font-medium hover:bg-stone-200 dark:hover:bg-stone-800"
              aria-label={t("profile.switch")}
            >
              <Avatar name={active.name} color={active.color} />
              <span className="max-w-24 truncate">{active.name}</span>
            </a>
          ) : null}
        </div>
      </header>
      {!online ? (
        <div
          role="status"
          className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
        >
          {t("common.offline")}
        </div>
      ) : null}
      <main id="main" className="flex-1 px-4 pt-5 pb-28">
        {ready ? (
          <Page route={route} />
        ) : (
          <div className="grid place-items-center py-20 text-stone-500">
            <Spinner className="size-6" />
          </div>
        )}
      </main>
      <nav
        aria-label="Main"
        className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map((tab) => {
            const current = tab.match.includes(route.name);
            return (
              <li key={tab.label}>
                <a
                  href={href(tab.route)}
                  aria-current={current ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${current ? "text-brand-700 dark:text-brand-400" : "text-stone-500 dark:text-stone-400"}`}
                >
                  {tab.icon === "scan" ? (
                    <span className="-mt-5 grid size-12 place-items-center rounded-full bg-brand-700 text-white shadow-lg dark:bg-brand-500 dark:text-stone-950">
                      <Icon name="scan" className="size-6" />
                    </span>
                  ) : (
                    <Icon name={tab.icon} className="size-6" />
                  )}
                  {t(tab.label)}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
