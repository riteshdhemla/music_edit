#!/usr/bin/env node
// Headless smoke test: serves the site with cross-origin-isolation headers,
// loads it in Chromium, and exercises the file-management UI. Verifies the app
// wires up and reacts correctly without relying on the (large) ffmpeg core download.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  try {
    const data = await readFile(resolve(root, "." + p));
    // These headers make the page cross-origin isolated (SharedArrayBuffer).
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Content-Type", types[extname(p)] || "application/octet-stream");
    res.writeHead(200);
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

const fail = (msg) => { console.error("✗ " + msg); process.exitCode = 1; };
const assert = (cond, msg) => { if (!cond) fail(msg); else console.log("✓ " + msg); };

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  await page.goto(base + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(800);

  assert(await page.evaluate(() => self.crossOriginIsolated), "page is cross-origin isolated");
  assert((await page.title()).includes("Clip Forge"), "page title is set");
  assert((await page.$("#dropZone")) !== null, "drop zone is present");

  // Add files via the real input to exercise addFiles/renderFiles.
  await page.setInputFiles("#fileInput", [
    { name: "a.mp4", mimeType: "video/mp4", buffer: Buffer.from([0, 0, 0, 1]) },
    { name: "b.mp4", mimeType: "video/mp4", buffer: Buffer.from([0, 0, 0, 2]) },
  ]);
  await page.waitForTimeout(200);
  assert((await page.$eval("#fileCount", (e) => e.textContent)) === "2", "file count updates to 2");
  assert((await page.$$eval("#items .item", (els) => els.length)) === 2, "two items rendered");
  assert(!(await page.$eval("#actions", (e) => e.classList.contains("hidden"))), "action panel is shown");
  assert(
    (await page.$eval("#items .item.selected .pick", (e) => e.textContent)) === "Selected",
    "first file is auto-selected"
  );

  // Remove one.
  await page.click("#items .item:last-child .remove");
  await page.waitForTimeout(150);
  assert((await page.$eval("#fileCount", (e) => e.textContent)) === "1", "removing a file updates the count");

  // Clear all.
  await page.click("#clearBtn");
  await page.waitForTimeout(150);
  assert(await page.$eval("#fileList", (e) => e.classList.contains("hidden")), "clear all hides the file list");

  // ffmpeg-related network errors are acceptable (large CDN core); real code errors are not.
  const realErrors = pageErrors.filter(
    (e) => !/ffmpeg|SharedArrayBuffer|core|worker|network|fetch/i.test(e)
  );
  assert(realErrors.length === 0, `no unexpected page errors${realErrors.length ? ": " + realErrors.join("; ") : ""}`);
} finally {
  await browser.close();
  server.close();
}

if (process.exitCode) {
  console.error("\nSmoke test FAILED.");
} else {
  console.log("\nSmoke test passed.");
}
