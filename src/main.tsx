import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAnalytics, installGlobalErrorHandlers } from "./lib/analytics";

initAnalytics();
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(<App />);
