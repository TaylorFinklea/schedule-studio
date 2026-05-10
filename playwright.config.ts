import { defineConfig, devices } from "@playwright/test";
import { rmSync } from "fs";

const TEST_DB = ".local/e2e-test.sqlite";
for (const suffix of ["", "-shm", "-wal"]) {
  rmSync(`${TEST_DB}${suffix}`, { force: true });
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5187",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5187",
    env: { SCHEDULE_STUDIO_DB: TEST_DB },
    url: "http://127.0.0.1:5187",
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
