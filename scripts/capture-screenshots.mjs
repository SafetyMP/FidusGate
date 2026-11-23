/**
 * Capture README screenshots and demo GIF from the browser-only FidusGate demo.
 *
 * Usage:
 *   Build and preview the static demo: docs/github-pages-demo.md
 *   SCREENSHOT_BASE_URL=http://127.0.0.1:4173/FidusGate/ npm run screenshots
 *
 * Rebuild GIF only from existing PNGs (no browser):
 *   npm run screenshots:rebuild-gif
 *
 * Optional: SCREENSHOT_BASE_URL=http://127.0.0.1:4173/FidusGate/ npm run screenshots
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
const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:4173/FidusGate/";

const tabs = [
  { route: "#/case", file: "fg1048-case.png", name: "FG-1048 business case" },
  { route: "#/technical?packet=received&fixture=FG-1048&stage=signature", file: "fg1048-evidence.png", name: "FG-1048 evidence" },
];

const gifFrameFiles = tabs.map(({ file }) => file);

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
  await page.getByRole("heading", { name: "Can the customer fix ship today?" }).waitFor();

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
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  await waitForDashboard(page);
  const gifFrames = [];

  for (const { route, file, name } of tabs) {
    await page.goto(baseUrl.split("#")[0] + route);
    await page.getByRole("heading", { level: 1 }).waitFor();
    if (route.startsWith("#/technical")) {
      await page.getByRole("button", { name: "Check both signatures" }).click();
      await page.getByRole("cell", { name: "invalid", exact: true }).waitFor();
      await page.getByRole("cell", { name: "valid", exact: true }).waitFor();

      await page.getByRole("heading", { level: 1 }).evaluate((heading) => heading.scrollIntoView({ block: "start" }));
    }
    await page.evaluate(() => document.fonts.ready);
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
