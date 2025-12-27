import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync } from "fs";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["lit", "lit/decorators.js"],
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
      },
    },
    outDir: "dist",
    emptyOutDir: true,
    copyPublicDir: false,
  },
  plugins: [
    {
      name: "copy-tokens",
      closeBundle() {
        copyFileSync(
          resolve(__dirname, "src/tokens.css"),
          resolve(__dirname, "dist/tokens.css")
        );
      },
    },
  ],
});
