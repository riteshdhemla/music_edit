// Clip Forge — in-browser MP4 / audio trim & join using ffmpeg.wasm (0.11 API).
// Everything runs client-side; no data is uploaded anywhere.

/* global FFmpeg */
const CORE_PATH = "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js";

// `fetchFile` is resolved from the ffmpeg.wasm library once it has loaded.
let fetchFile = null;

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const engineDot = $("engineDot");
const engineText = $("engineText");
const engineProgress = $("engineProgress");
const isolationWarn = $("isolationWarn");
const dropZone = $("dropZone");
const fileInput = $("fileInput");
const browseBtn = $("browseBtn");
const fileListSec = $("fileList");
const itemsEl = $("items");
const fileCount = $("fileCount");
const clearBtn = $("clearBtn");
const actionsSec = $("actions");
const trimStart = $("trimStart");
const trimEnd = $("trimEnd");
const reencodeTrim = $("reencodeTrim");
const reencodeJoin = $("reencodeJoin");
const trimBtn = $("trimBtn");
const joinBtn = $("joinBtn");
const outputSec = $("output");
const outMedia = $("outMedia");
const downloadLink = $("downloadLink");
const logEl = $("log");

// ---- State ----
let ffmpeg = null;
let ready = false;
let running = false;
/** @type {{id:string,file:File,name:string,size:number}[]} */
let files = [];
let selectedId = null;
let idCounter = 0;

// ---- Logging ----
function log(line) {
  logEl.textContent += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

// ---- Engine bootstrap ----
async function loadEngine() {
  if (typeof FFmpeg === "undefined" || typeof FFmpeg.createFFmpeg !== "function") {
    engineDot.className = "dot error";
    engineText.textContent =
      "Couldn't load the ffmpeg.wasm library. Check your connection and refresh.";
    return;
  }
  const { createFFmpeg, fetchFile: ff } = FFmpeg;
  fetchFile = ff;

  // ffmpeg.wasm 0.11 uses SharedArrayBuffer, which needs cross-origin isolation.
  // coi-serviceworker.js reloads the page once to enable it on the first visit.
  if (!self.crossOriginIsolated) {
    isolationWarn.classList.remove("hidden");
    engineText.textContent = "Waiting for cross-origin isolation (the page will reload once)…";
    // Give the service worker a moment; it reloads the page automatically.
    return;
  }

  ffmpeg = createFFmpeg({
    log: true,
    corePath: CORE_PATH,
    logger: ({ message }) => log(message),
    progress: ({ ratio }) => {
      if (ratio >= 0 && ratio <= 1) {
        const pct = Math.round(ratio * 100);
        engineProgress.style.width = pct + "%";
        if (running) engineText.textContent = `Working… ${pct}%`;
      }
    },
  });

  try {
    engineText.textContent = "Downloading editing engine (~25 MB, first visit only)…";
    engineProgress.style.width = "15%";
    await ffmpeg.load();
    ready = true;
    engineDot.className = "dot ready";
    engineText.textContent = "Editing engine ready.";
    engineProgress.style.width = "100%";
    isolationWarn.classList.add("hidden");
    setTimeout(() => { engineProgress.style.width = "0%"; }, 600);
    refreshButtons();
  } catch (err) {
    engineDot.className = "dot error";
    engineText.textContent = "Could not start the editing engine.";
    log("ERROR: " + (err && err.message ? err.message : String(err)));
  }
}

// ---- File handling ----
function humanSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toFixed(n < 10 ? 1 : 0) + " " + units[i];
}

function addFiles(fileList) {
  for (const file of fileList) {
    files.push({ id: "f" + idCounter++, file, name: file.name, size: file.size });
  }
  if (files.length && !selectedId) selectedId = files[0].id;
  renderFiles();
}

function removeFile(id) {
  files = files.filter((f) => f.id !== id);
  if (selectedId === id) selectedId = files[0]?.id ?? null;
  renderFiles();
}

function renderFiles() {
  fileCount.textContent = String(files.length);
  itemsEl.innerHTML = "";

  files.forEach((f) => {
    const li = document.createElement("li");
    li.className = "item" + (f.id === selectedId ? " selected" : "");
    li.draggable = true;
    li.dataset.id = f.id;

    li.innerHTML = `
      <span class="handle" title="Drag to reorder">⠿</span>
      <div class="item-main">
        <div class="item-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
        <div class="item-meta">${humanSize(f.size)}</div>
      </div>
      <button class="pick" type="button">${f.id === selectedId ? "Selected" : "Select"}</button>
      <button class="remove" type="button" title="Remove">×</button>
    `;

    li.querySelector(".pick").addEventListener("click", () => {
      selectedId = f.id;
      renderFiles();
      refreshButtons();
    });
    li.querySelector(".remove").addEventListener("click", () => {
      removeFile(f.id);
      refreshButtons();
    });

    // Drag to reorder
    li.addEventListener("dragstart", (e) => {
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", f.id);
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));

    itemsEl.appendChild(li);
  });

  const hasFiles = files.length > 0;
  fileListSec.classList.toggle("hidden", !hasFiles);
  actionsSec.classList.toggle("hidden", !hasFiles);
}

// Reorder support on the list container
itemsEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  const dragging = itemsEl.querySelector(".dragging");
  if (!dragging) return;
  const after = getDragAfterElement(itemsEl, e.clientY);
  if (after == null) itemsEl.appendChild(dragging);
  else itemsEl.insertBefore(dragging, after);
});
itemsEl.addEventListener("drop", (e) => {
  e.preventDefault();
  const order = [...itemsEl.querySelectorAll(".item")].map((el) => el.dataset.id);
  files.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  renderFiles();
});

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".item:not(.dragging)")];
  return els.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    },
    { offset: -Infinity, element: null }
  ).element;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "mp4";
}

const AUDIO_EXTS = new Set([
  "mp3", "wav", "m4a", "aac", "ogg", "oga", "opus", "flac", "wma", "aiff", "aif",
]);
function isAudioFile(name) {
  return AUDIO_EXTS.has(extOf(name));
}

// FFmpeg audio encoder to use for a given output extension.
function audioCodecFor(ext) {
  return ({
    mp3: "libmp3lame", m4a: "aac", aac: "aac", ogg: "libvorbis", oga: "libvorbis",
    opus: "libopus", flac: "flac", wav: "pcm_s16le",
  })[ext] || "aac";
}

function refreshButtons() {
  trimBtn.disabled = !ready || running || !selectedId;
  joinBtn.disabled = !ready || running || files.length < 2;
}

// ---- Time parsing ----
// Accepts "SS", "MM:SS", "HH:MM:SS", optionally with .fraction
function parseTime(str) {
  if (!str) return null;
  str = str.trim();
  if (!str) return null;
  const parts = str.split(":").map((p) => parseFloat(p));
  if (parts.some((p) => Number.isNaN(p))) return null;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return seconds;
}

// ---- Trim ----
async function doTrim() {
  const f = files.find((x) => x.id === selectedId);
  if (!f || !ready || running) return;

  const start = parseTime(trimStart.value);
  const end = parseTime(trimEnd.value);
  if (start == null) return alert("Please enter a valid start time (e.g. 00:00:05).");
  if (end == null) return alert("Please enter a valid end time (e.g. 00:00:20).");
  if (end <= start) return alert("End time must be after start time.");

  setRunning(trimBtn, true);
  engineText.textContent = "Trimming…";
  const ext = extOf(f.name);
  const inName = "in." + ext;
  const outName = "trimmed." + ext;

  try {
    ffmpeg.FS("writeFile", inName, await fetchFile(f.file));

    const duration = (end - start).toFixed(3);
    let args = ["-ss", String(start), "-i", inName, "-t", duration];
    if (reencodeTrim.checked) {
      if (isAudioFile(f.name)) {
        // Audio-only: pick an encoder that matches the container (no video codec).
        args = args.concat(["-c:a", audioCodecFor(ext)]);
        if (ext === "mp3") args = args.concat(["-q:a", "2"]);
      } else {
        args = args.concat(["-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac"]);
      }
    } else {
      args = args.concat(["-c", "copy"]);
    }
    args.push(outName);

    log("$ ffmpeg " + args.join(" "));
    await ffmpeg.run(...args);

    const data = ffmpeg.FS("readFile", outName);
    showResult(data, outName, mimeFor(ext), f.name.replace(/(\.[^.]+)$/, "_trimmed$1"));
    safeDelete([inName, outName]);
  } catch (err) {
    log("ERROR: " + (err?.message || String(err)));
    alert("Trim failed. See the engine log for details. If you used stream-copy, try enabling 'Re-encode'.");
  } finally {
    setRunning(trimBtn, false);
    engineText.textContent = "Editing engine ready.";
  }
}

// ---- Join / concat ----
async function doJoin() {
  if (files.length < 2 || !ready || running) return;
  setRunning(joinBtn, true);
  engineText.textContent = "Joining…";

  // Audio-only joins need an audio-specific pipeline (no video streams to map).
  const audioOnly = files.every((f) => isAudioFile(f.name));
  const outExt = reencodeJoin.checked
    ? (audioOnly ? "mp3" : "mp4")
    : extOf(files[0].name);
  const outName = "joined." + outExt;
  const written = [];

  try {
    if (reencodeJoin.checked && audioOnly) {
      // Robust audio path: resample every input to a common format, then concat.
      // This produces one clean file with a correct duration — fixing the
      // "second track won't play" problem you get from stream-copying MP3s.
      const inputs = [];
      for (let i = 0; i < files.length; i++) {
        const nm = `j${i}.${extOf(files[i].name)}`;
        ffmpeg.FS("writeFile", nm, await fetchFile(files[i].file));
        written.push(nm);
        inputs.push(nm);
      }
      let args = [];
      inputs.forEach((nm) => { args.push("-i", nm); });

      let filter = "";
      inputs.forEach((_, i) => {
        filter += `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}];`;
      });
      inputs.forEach((_, i) => { filter += `[a${i}]`; });
      filter += `concat=n=${inputs.length}:v=0:a=1[outa]`;

      args = args.concat(["-filter_complex", filter, "-map", "[outa]", "-c:a", audioCodecFor(outExt)]);
      if (outExt === "mp3") args = args.concat(["-q:a", "2"]);
      args.push(outName);
      log("$ ffmpeg " + args.join(" "));
      await ffmpeg.run(...args);
    } else if (reencodeJoin.checked) {
      // Robust video path: normalise + concat filter — handles mixed codecs/resolutions.
      const inputs = [];
      for (let i = 0; i < files.length; i++) {
        const nm = `j${i}.${extOf(files[i].name)}`;
        ffmpeg.FS("writeFile", nm, await fetchFile(files[i].file));
        written.push(nm);
        inputs.push(nm);
      }
      let args = [];
      inputs.forEach((nm) => { args.push("-i", nm); });

      let filter = "";
      inputs.forEach((_, i) => {
        filter += `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}];`;
        filter += `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}];`;
      });
      inputs.forEach((_, i) => { filter += `[v${i}][a${i}]`; });
      filter += `concat=n=${inputs.length}:v=1:a=1[outv][outa]`;

      args = args.concat([
        "-filter_complex", filter,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac",
        outName,
      ]);
      log("$ ffmpeg " + args.join(" "));
      await ffmpeg.run(...args);
    } else {
      // Fast path: concat demuxer with stream copy — requires identical codecs/params.
      const listLines = [];
      for (let i = 0; i < files.length; i++) {
        const nm = `j${i}.${extOf(files[i].name)}`;
        ffmpeg.FS("writeFile", nm, await fetchFile(files[i].file));
        written.push(nm);
        listLines.push(`file '${nm}'`);
      }
      const listName = "list.txt";
      ffmpeg.FS("writeFile", listName, new TextEncoder().encode(listLines.join("\n")));
      written.push(listName);
      const args = ["-f", "concat", "-safe", "0", "-i", listName, "-c", "copy", outName];
      log("$ ffmpeg " + args.join(" "));
      await ffmpeg.run(...args);
    }

    const data = ffmpeg.FS("readFile", outName);
    showResult(data, outName, mimeFor(outExt), outName);
    safeDelete([...written, outName]);
  } catch (err) {
    log("ERROR: " + (err?.message || String(err)));
    alert(
      "Join failed. See the engine log. If you used the fast (stream-copy) path, " +
      "enable 'Re-encode to a common format' — the files likely have different codecs, " +
      "sample rates, or resolutions."
    );
  } finally {
    setRunning(joinBtn, false);
    engineText.textContent = "Editing engine ready.";
  }
}

// ---- Output ----
function mimeFor(ext) {
  const map = {
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac",
  };
  return map[ext] || "application/octet-stream";
}

function showResult(data, name, mime, downloadName) {
  const blob = new Blob([data.buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const isAudio = mime.startsWith("audio");

  outMedia.innerHTML = "";
  const el = document.createElement(isAudio ? "audio" : "video");
  el.controls = true;
  el.src = url;
  outMedia.appendChild(el);

  downloadLink.href = url;
  downloadLink.download = downloadName || name;
  downloadLink.textContent = "Download " + (downloadName || name);

  outputSec.classList.remove("hidden");
  outputSec.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function safeDelete(names) {
  for (const nm of names) {
    try { ffmpeg.FS("unlink", nm); } catch (_) { /* ignore */ }
  }
}

function setRunning(btn, isRunning) {
  running = isRunning;
  btn.classList.toggle("busy", isRunning);
  refreshButtons();
}

// ---- Wire up UI ----
browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files?.length) addFiles(e.target.files);
  fileInput.value = "";
  refreshButtons();
});

["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("drag"); })
);
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("drag"); })
);
dropZone.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  refreshButtons();
});

clearBtn.addEventListener("click", () => {
  files = [];
  selectedId = null;
  renderFiles();
  refreshButtons();
  outputSec.classList.add("hidden");
});

trimBtn.addEventListener("click", doTrim);
joinBtn.addEventListener("click", doJoin);

// ---- Go ----
renderFiles();
loadEngine();
