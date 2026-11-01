import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".");

export default defineConfig({
  root: "src/client",
  // Asset GLB của Kenney nằm ở <repo>/public/models → phục vụ tại /models/*
  publicDir: path.join(rootDir, "public"),
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
