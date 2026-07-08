/**
 * Capture README screenshots and demo GIF from the FidusGate admin dashboard.
 *
 * Usage:
 *   npm ci && npm run bootstrap
 *   npm run dev
 *   npm run screenshots
 *
 * Rebuild GIF only from existing PNGs (no browser):
 *   npm run screenshots:rebuild-gif
 *
 * Optional: SCREENSHOT_BASE_URL=http://localhost:3000 npm run screenshots
 *
 * CI: set CI=1 to use bundled Chromium instead of system Chrome.
 */
import { chromium } from "playwright";
import gifenc from "gifenc";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const { GIFEncoder, quantize, applyPalette } = gifenc;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const outDir = path.join(repoRoot, "docs", "assets");
const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";

const tabs = [
  { label: "Ledger & Transactions", file: "ledger.png", name: "Ledger & transactions" },
  {
    label: "Compliance & Attestation",
    file: "compliance.png",
    name: "Compliance & attestation",
  },
  {
    label: "Cedar Policy & Simulator",
    file: "policy-simulator.png",
    name: "Cedar policy simulator",
  },
  {
    label: "Forensics & Verifier",
    file: "forensics.png",
    name: "Forensics & verifier",
  },
  {
    label: "Interactive Sandbox",
    file: "sandbox.png",
    name: "Interactive sandbox",
  },
];

/** README hero GIF frames (subset of dashboard tabs). */
const gifFrameFiles = [
  "ledger.png",
  "compliance.png",
  "policy-simulator.png",
  "sandbox.png",
];

/** Frame duration in milliseconds (gifenc stores delay/10 as GIF centiseconds). */
const GIF_FRAME_DELAY_MS = 2_000;

function launchOptions() {
  if (process.env.CI) {
    return { headless: true };
  }
  return { channel: "chrome", headless: true };
}

async function waitForDashboard(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Ledger & Transactions" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

async function signInDemoAdmin(page) {
  const loginButton = page.getByRole("button", { name: "Login as Administrator" });
  if (await loginButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await loginButton.click();
    await page.waitForTimeout(750);
  }
}

async function writeDemoGif(frames) {
  const encoder = GIFEncoder();
  for (const { buffer, name } of frames) {
    const { data, width, height } = PNG.sync.read(buffer);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    encoder.writeFrame(index, width, height, { palette, delay: GIF_FRAME_DELAY_MS });
    console.log(`GIF frame: ${name}`);
  }
  encoder.finish();
  const gifPath = path.join(outDir, "demo.gif");
  await writeFile(gifPath, Buffer.from(encoder.bytes()));
  console.log("Captured demo GIF -> docs/assets/demo.gif");
}

async function rebuildGifFromExisting() {
  await mkdir(outDir, { recursive: true });
  const frames = [];
  for (const file of gifFrameFiles) {
    const tabMeta = tabs.find((entry) => entry.file === file);
    const name = tabMeta?.name ?? file;
    const buffer = await readFile(path.join(outDir, file));
    frames.push({ buffer, name });
    console.log(`Loaded ${name} -> docs/assets/${file}`);
  }
  await writeDemoGif(frames);
}

async function captureLive() {
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch(launchOptions());
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("fidusgate_seen_tour", "true");
  });
  const page = await context.newPage();

  await waitForDashboard(page);
  await signInDemoAdmin(page);

  const skipTour = page.getByRole("button", { name: "Skip Tour" });
  if (await skipTour.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await skipTour.click();
    await page.waitForTimeout(300);
  }

  const gifFrames = [];

  for (const { label, file, name } of tabs) {
    const tabButton = page.getByRole("button", { name: label });
    if (!(await tabButton.evaluate((el) => el.classList.contains("active")))) {
      await tabButton.click({ force: true });
    }
    await page.waitForTimeout(900);
    const buffer = await page.screenshot({ fullPage: false });
    const dest = path.join(outDir, file);
    await writeFile(dest, buffer);
    console.log(`Captured ${name} -> docs/assets/${file}`);
    if (gifFrameFiles.includes(file)) {
      gifFrames.push({ buffer, name });
    }
  }

  await writeDemoGif(gifFrames);
  await browser.close();
}

async function main() {
  if (process.argv.includes("--from-existing")) {
    await rebuildGifFromExisting();
    return;
  }
  await captureLive();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
