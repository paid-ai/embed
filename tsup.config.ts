import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // Emit both ESM (modern bundlers) and CJS (legacy require consumers)
  // alongside a global IIFE build that can be dropped in via <script>.
  format: ["esm", "cjs", "iife"],
  globalName: "PaidEmbed",
  target: "es2020",
  sourcemap: true,
  dts: true,
  clean: true,
  minify: true,
});
