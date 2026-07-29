import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import dts from "vite-plugin-dts"
import { resolve } from "path"

export default defineConfig({
  plugins: [
    react({ jsxRuntime: "automatic" }),
    dts({
      include: ["src/index.tsx"],
      outDir: "dist",
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      // React is the consumer's — bundling it would give stories a second
      // React instance and break hooks/context across the alias boundary.
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
})
