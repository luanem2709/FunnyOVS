import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".");
const appVersion = (JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8")) as { version: string }).version;

export default defineConfig({
  root: "src/client",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
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
        // Bảng nhân vật: xem ngoại hình/trang phục của cả công ty trên một màn hình (dev + tài liệu).
        sheet: path.join(rootDir, "src/client/office-3d/sheet.html"),
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
