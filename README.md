# Clip Forge 🎬

A free, **100% in-browser** MP4 / audio editor you can host on **GitHub Pages**.
Trim clips and join multiple files together — everything runs locally with
[ffmpeg.wasm](https://ffmpegwasm.netlify.app/), so **your files are never uploaded anywhere**.

> **Is it possible to edit MP4 files on a static host like GitHub Pages?**
> Yes. GitHub Pages only serves static files (no server-side code), so the trimming and
> joining is done entirely on the client using FFmpeg compiled to WebAssembly. No backend needed.

## Features

- **Trim** — cut a clip from any file by start/end time. Fast stream-copy, or frame-accurate re-encode.
- **Join** — concatenate several files in the order you choose (drag to reorder).
  - Fast path (stream-copy) for identical codecs.
  - Robust path (re-encode to a common 720p/30fps/AAC format) for mixed sources.
- **Drag & drop**, live progress, and an in-page engine log.
- Works with MP4, MOV, WebM, MKV, MP3, WAV, M4A, and more.
- **Private:** no uploads, no tracking, no accounts.

## How it works

ffmpeg.wasm needs `SharedArrayBuffer`, which the browser only exposes when the page is
[cross-origin isolated](https://web.dev/coop-coep/) (`COOP` + `COEP` headers). GitHub Pages
can't set custom headers, so this project includes
[`coi-serviceworker.js`](https://github.com/gzuidhof/coi-serviceworker), a tiny service worker
that adds those headers locally. On the very first visit the page reloads once to activate it.

```
index.html            # UI
css/style.css         # styling
js/app.js             # ffmpeg.wasm logic (trim + join)
coi-serviceworker.js  # cross-origin isolation shim for GitHub Pages
.nojekyll             # tell Pages to serve files as-is
.github/workflows/pages.yml  # auto-deploy on push to main
```

The FFmpeg engine (`@ffmpeg/ffmpeg@0.11`, `@ffmpeg/core@0.11`) is loaded from the
[unpkg](https://unpkg.com) CDN at runtime — there is no build step. The 0.11 UMD build is
used deliberately: it's the most reliable way to run ffmpeg.wasm on a static host without a
bundler, and it pairs cleanly with the `coi-serviceworker` isolation shim.

## Deploy to GitHub Pages

**Option A — GitHub Actions (recommended, already configured):**

1. Push to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and pick
   **GitHub Actions**.
3. The included workflow publishes the site. Your URL will be
   `https://<user>.github.io/<repo>/`.

**Option B — Deploy from a branch:**

1. **Settings → Pages → Source → Deploy from a branch**, select `main` / `root`.
2. Done. (The `.nojekyll` file ensures everything is served verbatim.)

## Run locally

Because a service worker is involved, use `http://localhost` (not `file://`):

```bash
# any static server works
python3 -m http.server 8000
# then open http://localhost:8000
```

## Notes & limits

- Everything runs in your tab, so very large files are limited by your device's RAM.
  ffmpeg.wasm typically handles files up to a few hundred MB comfortably.
- First load downloads the ~30 MB WebAssembly core (cached afterward).
- Stream-copy trims cut at the nearest keyframe; enable **Re-encode** for exact cuts.
- Best browser support: recent Chrome, Edge, and Firefox.

## Credits

- [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)
- [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) (MIT)
