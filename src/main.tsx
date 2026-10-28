import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { startUpdateChecks } from "./app/update";
import { I18nProvider } from "./i18n/react";
import { App } from "./ui/App";
import { AppProvider } from "./ui/state";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");

startUpdateChecks();

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </I18nProvider>
  </StrictMode>,
);
