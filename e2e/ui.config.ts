import { defineConfig, devices } from "@playwright/test";

const devServerPort = 3216;

export default defineConfig({
  testDir: ".",
  outputDir: "../test-results/playwright",
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${devServerPort}`,
    browserName: "chromium",
    channel: "msedge",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: `http://127.0.0.1:${devServerPort}`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      TAURI_DEV_HOST: "127.0.0.1",
      TAURI_DEV_PORT: String(devServerPort),
      TAURI_DEV_HMR_PORT: String(devServerPort + 1),
    },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Edge"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "narrow",
      use: { ...devices["Desktop Edge"], viewport: { width: 760, height: 900 } },
    },
  ],
});
