import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// Self-host the brand fonts so the first paint does not block on a Google
// Fonts round-trip. Weights match what the CSS in index.css and landing.css
// actually request (400 body, 500 medium, 600 semibold, 700 bold).
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./index.css";
import { initAnalytics, installGlobalErrorHandlers } from "./lib/analytics";

initAnalytics();
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(<App />);
