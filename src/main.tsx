import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadRemoteConfig } from "./lib/firebase";
import "./styles.css";

loadRemoteConfig();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
