import path from "node:path";
import { pathToFileURL } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import { defineConfig } from "vitest/config";

const electronMainExternal = ["keytar", "prebuilt-tdlib", "tdl"];

const manualChunkRules: Array<{ chunk: string; packagePaths: string[] }> = [
  { chunk: "mui-icons", packagePaths: ["@mui/icons-material"] },
  { chunk: "mui", packagePaths: ["@mui", "@emotion"] },
  { chunk: "react", packagePaths: ["react", "react-dom", "scheduler"] },
];

function includesNodeModulePackage(normalizedId: string, packagePath: string): boolean {
  return normalizedId.includes(`/node_modules/${packagePath}/`);
}

function getManualChunk(id: string) {
  const normalizedId = id.replace(/\\/g, "/");

  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  return (
    manualChunkRules.find((rule) =>
      rule.packagePaths.some((packagePath) =>
        includesNodeModulePackage(normalizedId, packagePath),
      ),
    )?.chunk ?? "vendor"
  );
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
