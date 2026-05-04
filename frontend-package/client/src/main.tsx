import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Enable smooth transitions after app loads
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.documentElement.classList.add('loaded');
  }, 100);
});

createRoot(document.getElementById("root")!).render(<App />);
