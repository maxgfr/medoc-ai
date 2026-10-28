import type { CountryId } from "../../shared/schema";
import { countryModule, type Scope } from "../countries/registry";
import { useT } from "../i18n/react";
import { useApp } from "./state";

/** Where searches look: every country (the default) or one of those with an index. */
export function ScopeSelect({ className = "input" }: { className?: string }) {
  const t = useT();
  const { scope, setScope, available } = useApp();
  return (
    <select
      className={className}
      value={scope}
      onChange={(e) => void setScope(e.target.value as Scope)}
      aria-label={t("country.label")}
    >
      <option value="all">🌍 {t("country.all")}</option>
      {available.map((c: CountryId) => (
        <option key={c} value={c}>
          {countryModule(c).flag} {t(`country.${c}`)}
        </option>
      ))}
    </select>
  );
}
