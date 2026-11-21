import { defineConfig } from "@playwright/test";
import path from "node:path";
import os from "node:os";

const baseURL = "http://127.0.0.1:4489";
const storeFile = path.join(
  os.tmpdir(),
  `trama-test-store-${Date.now()}.json`,
);

export default defineConfig({
  testDir: "./tests",
  testMatch: /cloud-sync\.spec\.js/,
  timeout: 60000,
  workers: 1,
  use: { baseURL, viewport: { width: 1366, height: 850 } },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4489 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      ...process.env,
      TRAMA_LOCAL_STORE: storeFile,
    },
  },
});
