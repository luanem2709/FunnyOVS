import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".");

export default defineConfig({
  root: "src/client",
  plugins: [react()],
  // Asset GLB của Kenney nằm ở <repo>/public/models → phục vụ tại /models/*
  publicDir: path.join(rootDir, "public"),
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      // Hai trang: giao diện cổ điển (/) và văn phòng hợp nhất React + R3F (/office-3d/).
      input: {
        main: path.join(rootDir, "src/client/index.html"),
        office3d: path.join(rootDir, "src/client/office-3d/index.html"),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
