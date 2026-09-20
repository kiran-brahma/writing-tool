import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./pwa";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Obelus could not start: #root is missing from index.html.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Story 115: install the offline shell in production so the app opens with the
// Library while offline.
registerServiceWorker();
