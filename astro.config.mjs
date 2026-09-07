import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://vvan1shmz.github.io",
  outDir: "docs",
  integrations: [sitemap()],
});
