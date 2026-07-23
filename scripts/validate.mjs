#!/usr/bin/env node
// Lightweight static validation for the Clip Forge site.
// - JS syntax is checked separately with `node --check`.
// - Here we verify that every locally-referenced asset exists and that every
//   DOM id used by app.js is actually present in index.html.
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const read = (p) => readFileSync(resolve(root, p), "utf8");

// 1. Required files exist
const required = [
  "index.html",
  "css/style.css",
  "js/app.js",
  "coi-serviceworker.js",
  ".nojekyll",
];
for (const f of required) {
  if (!existsSync(resolve(root, f))) errors.push(`Missing required file: ${f}`);
}

const html = read("index.html");

// 2. Local (non-http) href/src references resolve to real files
const refRe = /(?:href|src)="(?!https?:|data:|#)([^"]+)"/g;
let m;
while ((m = refRe.exec(html)) !== null) {
  const ref = m[1].split(/[?#]/)[0];
  if (!existsSync(resolve(root, ref))) {
    errors.push(`index.html references missing asset: ${ref}`);
  }
}

// 3. Every DOM id looked up in app.js (via the $("id") helper or getElementById)
//    has a matching id in index.html.
const app = read("js/app.js");
const ids = new Set();
let idm;
const idRe = /(?:getElementById\(|\$\()"([^"]+)"\)/g;
while ((idm = idRe.exec(app)) !== null) ids.add(idm[1]);
for (const id of ids) {
  if (!new RegExp(`id="${id}"`).test(html)) {
    errors.push(`app.js uses #${id} but no element with that id exists in index.html`);
  }
}

// 4. The ffmpeg library + coi shim are wired up in the HTML
if (!/coi-serviceworker\.js/.test(html)) {
  errors.push("index.html does not load coi-serviceworker.js (needed for SharedArrayBuffer).");
}
if (!/@ffmpeg\/ffmpeg/.test(html)) {
  errors.push("index.html does not load the ffmpeg.wasm library.");
}

if (errors.length) {
  console.error("✗ Validation failed:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(`✓ Validation passed (${ids.size} DOM ids checked, ${required.length} required files present).`);
