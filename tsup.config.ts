import { defineConfig } from "tsup";
import rawPlugin from "esbuild-plugin-raw";

export default defineConfig({
  entry: {
    index: "src/cli.ts",
  },
  plugins: [rawPlugin()],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  splitting: false,
  shims: true,
  loader: {
    ".py": "text",
    ".md": "text",
  },
});
