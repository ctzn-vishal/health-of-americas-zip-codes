import { defineConfig, devices } from "@playwright/test";

// Visual-regression + e2e against the dev server (serves the app and /data payloads).
// The map streams the public PMTiles over HTTPS range requests. NOTE: headless Chromium
// does not composite the WebGL map layer into element/page screenshots, so the map area is
// masked via [data-volatile]; baselines cover the (stable) UI chrome, panels, and rail.
// reducedMotion makes transitions instant for deterministic snapshots.
export default defineConfig({
  testDir: "tests-e2e",
  timeout: 90_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: false,
  retries: 0,
  use: { baseURL: "http://localhost:3100", trace: "on-first-retry", reducedMotion: "reduce" },
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    timeout: 120_000,
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1000 } } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
