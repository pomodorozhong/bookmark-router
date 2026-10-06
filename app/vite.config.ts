import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    watch: {
      ignored: [
        "**/server/**",
        "**/tests/**",
        "**/.runtime/**",
        "**/backups/**",
      ],
    },
    port: Number(process.env.UI_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.API_PORT ?? 4174}`,
        changeOrigin: false,
      },
    },
  },
});
