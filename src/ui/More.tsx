import { useT } from "../i18n/react";
import { Icon, type IconName, PageTitle } from "./kit";
import { href, type Route } from "./router";

export function More() {
  const t = useT();
  const links: { route: Route; icon: IconName; label: string }[] = [
    { route: { name: "treatments" }, icon: "pill", label: t("treat.title") },
    { route: { name: "alerts" }, icon: "bell", label: t("alert.title") },
    { route: { name: "interactions" }, icon: "interact", label: t("inter.title") },
    { route: { name: "profiles" }, icon: "users", label: t("profile.title") },
    { route: { name: "settings" }, icon: "gear", label: t("settings.title") },
  ];
  return (
    <>
      <PageTitle title={t("common.navMore")} />
      <ul className="card divide-y divide-stone-100 p-0 dark:divide-stone-800">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={href(l.route)}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-stone-50 dark:hover:bg-stone-800/50"
            >
              <Icon name={l.icon} className="size-5 text-brand-700 dark:text-brand-400" />
              <span className="flex-1 font-medium">{l.label}</span>
              <Icon name="right" className="size-4 text-stone-400" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-stone-500 dark:text-stone-400">{t("common.disclaimer")}</p>
    </>
  );
}
