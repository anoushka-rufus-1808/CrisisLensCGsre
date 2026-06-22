import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5000,
    host: "0.0.0.0",
    proxy: {
      "/api/forecast": {
        target: "http://localhost:8001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/api/facilities": {
        target: "http://localhost:8001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/api/email": {
        target: "http://localhost:8001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});