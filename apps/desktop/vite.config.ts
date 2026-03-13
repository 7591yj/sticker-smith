import path from "node:path";
import { pathToFileURL } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import { defineConfig } from "vitest/config";

const electronMainExternal = ["keytar", "prebuilt-tdlib", "tdl"];

function getManualChunk(id: string) {
  const normalizedId = id.replace(/\\/g, "/");

  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  if (normalizedId.includes("/node_modules/@mui/icons-material/")) {
    return "mui-icons";
  }

  if (
    normalizedId.includes("/node_modules/@mui/") ||
    normalizedId.includes("/node_modules/@emotion/")
  ) {
    return "mui";
  }

  if (
    normalizedId.includes("/node_modules/react/") ||
    normalizedId.includes("/node_modules/react-dom/") ||
    normalizedId.includes("/node_modules/scheduler/")
  ) {
    return "react";
  }

  return "vendor";
}

export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "test"
      ? []
      : [
          electron({
            main: {
              entry: "src/main/index.ts",
              vite: {
                build: {
                  rollupOptions: {
                    external: electronMainExternal,
                  },
                },
              },
              onstart(args) {
                return args.startup(
                  [".", "--no-sandbox"],
                  undefined,
                  pathToFileURL(
                    path.join(__dirname, "scripts/electron-runtime.mjs"),
                  ).href,
                );
              },
            },
            preload: {
              input: {
                preload: path.join(__dirname, "src/preload/index.ts"),
              },
            },
            renderer: {},
          }),
        ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  test: {
    environment: "jsdom",
  },
}));
