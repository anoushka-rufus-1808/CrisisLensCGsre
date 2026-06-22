import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "@/contexts/AuthContext";
import "leaflet/dist/leaflet.css";
import "./index.css";

// Fix Leaflet default icon paths (Vite asset handling)
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon    from "leaflet/dist/images/marker-icon.png";
import markerShadow  from "leaflet/dist/images/marker-shadow.png";

// @ts-expect-error – Leaflet internal
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No #root element found");

createRoot(rootEl).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);