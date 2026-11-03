// Renders app/icons/icon.svg to the PNG sizes iOS and Android need.
// Usage: node scripts/make-icons.mjs   (needs Playwright installed)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svg = await readFile(path.join(root, "app/icons/icon.svg"), "utf8");
// iOS rounds the corners itself, so the PNGs are full-bleed squares.
const square = svg.replace('rx="114"', 'rx="0"');
// Maskable: content shrunk into the 80% safe zone on a full background.
const maskable = square.replace(/<rect x=/g, '<rect transform="translate(51.2 51.2) scale(0.8)" x=');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, source] of [
  ["icon-180.png", 180, square],
  ["icon-192.png", 192, square],
  ["icon-512.png", 512, square],
  ["icon-512-maskable.png", 512, maskable]
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
  await page.screenshot({ path: path.join(root, "app/icons", name), omitBackground: true });
  console.log("wrote", name);
}
await browser.close();
