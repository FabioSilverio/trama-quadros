import { defineConfig } from "@playwright/test";
const baseURL = process.env.TRAMA_TEST_URL || "http://127.0.0.1:4488";
export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  workers: 1,
  use: { baseURL, viewport: { width: 1366, height: 850 } },
  webServer: process.env.TRAMA_TEST_URL
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 4488 --strictPort",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 60000,
      },
});
