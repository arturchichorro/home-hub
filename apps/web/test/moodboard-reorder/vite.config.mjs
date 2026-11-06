import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const root = dirname(fileURLToPath(import.meta.url));
const app = resolve(root, "../..");
const adapters = resolve(root, "adapters.tsx");
const mockedModules = new Set([
  "@rocicorp/zero/react",
  "@home-hub/shared/zero/queries",
  "@home-hub/shared/zero/mutators",
  "@tanstack/react-router",
]);

export default {
  root,
  plugins: [
    {
      name: "moodboard-test-adapters",
      enforce: "pre",
      resolveId(id, importer) {
        if (mockedModules.has(id)) {
          return adapters;
        }

        if (!importer || !id.startsWith(".")) {
          return;
        }

        const path = resolve(dirname(importer.split("?")[0]), id).replace(
          /\.(tsx?|jsx?)$/,
          "",
        );

        if (
          path === resolve(app, "src/lists/list-media-url") ||
          path === resolve(app, "src/zero/use-zero-mutation-enabled")
        ) {
          return adapters;
        }

        if (
          process.env.MOODBOARD_LAYOUT_SOURCE &&
          path === resolve(app, "src/lists/moodboard-layout")
        ) {
          return resolve(process.env.MOODBOARD_LAYOUT_SOURCE);
        }
      },
    },
    react(),
    tailwind(),
  ],
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [resolve(app, "../..")] },
  },
};
