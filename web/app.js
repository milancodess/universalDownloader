"use strict";

const { safeUrl, detectPlatform, normalizeMedia } = globalThis.DownloaderMedia;
const $ = (id) => document.getElementById(id);
const form = $("download-form");
const input = $("media-url");
const platformInput = $("platform");
const kinds = { video: "Video", audio: "Audio", photo: "Photos", file: "Files" };
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const scrollBehavior = () => reducedMotion.matches ? "instant" : "smooth";
const examples = {
  video: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  audio: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  photo: "https://www.instagram.com/p/DfCo97ZlL5F/",
};
let activeRequest = null;
let current = null;
let selected = null;
let activeKind = null;
let preferredKind = null;
let recent = [];
let toastTimer;
let toastExitTimer;
let toastRevision = 0;
const preparationJobs = new Map();
const preparationStates = new Set(["idle", "queued", "downloading", "merging", "validating", "ready", "failed", "cancelled"]);
let activePreparation = null;
let displayedPreparation = null;
let lastPreparationIssue = null;
const stateAnimations = new WeakMap();
const kindSelections = new Map();
let formatMotion = null;
const formatGhosts = new Map();

function animateStateChange(element) {
  stateAnimations.get(element)?.cancel();
  if (reducedMotion.matches || !element.animate) return;
  stateAnimations.set(element, element.animate([
    { opacity: .35, transform: "translateY(4px)" },
    { opacity: 1, transform: "translateY(0)" },
  ], { duration: 280, easing: "ease" }));
}

function setRecoveryOpen(element, open) {
  element.inert = !open;
  element.setAttribute("aria-hidden", String(!open));
  element.classList.toggle("is-open", open);
}

function clearSearchError() {
  if ($("search-error").contains(document.activeElement)) input.focus({ preventScroll: true });
  $("status").classList.remove("sr-only");
  $("status").parentElement.classList.remove("has-error");
  setRecoveryOpen($("search-error"), false);
}

function showSearchError(message, title = "We couldn’t find this media.") {
  $("search-error-title").textContent = title;
  $("search-error-message").textContent = message;
  $("search-error-context").hidden = !current;
  $("status").classList.add("sr-only");
  $("status").parentElement.classList.add("has-error");
  setRecoveryOpen($("search-error"), true);
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#i-" + name);
  svg.append(use);
  return svg;
}
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function setStatus(message, state = "ready") {
  $("status").textContent = message;
  $("status").dataset.state = state;
}
function toast(message) {
  const element = $("toast");
  const revision = ++toastRevision;
  clearTimeout(toastTimer);
  clearTimeout(toastExitTimer);
  element.textContent = message;
  $("toast-announcement").textContent = message;
  // Reverses an in-flight exit, without restarting an already-visible toast.
  element.classList.add("is-visible");
  toastTimer = setTimeout(() => {
    if (revision !== toastRevision) return;
    element.classList.remove("is-visible");
    const finish = () => {
      if (revision !== toastRevision) return;
      element.textContent = "";
      $("toast-announcement").textContent = "";
    };
    // Leave the content mounted until the fade has completed. A newer message
    // cancels this cleanup so an old dismissal cannot erase its replacement.
    if (reducedMotion.matches) finish();
    else toastExitTimer = setTimeout(finish, 360);
  }, 5000);
}
function platformLabel(platform, url = "") {
  if (platform === "meta" && /instagram\.com/i.test(new URL(safeUrl(url) || "https://example.com").hostname)) return "Instagram";
  return [...platformInput.options].find((option) => option.value === platform)?.textContent || "Media";
}
function fileSize(bytes) {
  if (!bytes) return "";
  if (bytes >= 1000000000) return (bytes / 1000000000).toFixed(2) + " GB";
  return bytes >= 1000000 ? (bytes / 1000000).toFixed(1) + " MB" : Math.ceil(bytes / 1000) + " KB";
}
function qualityLabel(item) {
  return item.height >= 2160 ? "4K" : item.height ? item.height + "p" : item.quality || "HD video";
}
function itemSize(item) {
  const size = fileSize(item.sizeBytes);
  return size && item.estimated ? "≈ " + size : size;
}
function prepared(item) {
  return !item.preparation || preparationJobs.get(item.url)?.status.state === "ready";
}
function expired(item) {
  const record = preparationJobs.get(item.url);
  // Active preparations can outlive their initial extraction ticket. Completed
  // jobs get a fresh server-supplied expiry, independent of the metadata request.
  if (record && ["queued", "downloading", "merging", "validating"].includes(record.status.state)) return false;
  const expiry = record?.status.expiresAt || (current.resolvedAt + 29 * 60000);
  return item.local && Date.now() >= expiry;
}
function duration(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const total = Math.floor(seconds);
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}
function updateInput() {
  clearSearchError();
  input.removeAttribute("aria-invalid");
  $("clear-button").hidden = !input.value;
  $("paste-button").hidden = !!input.value;
  const detected = detectPlatform(input.value.trim());
  const auto = platformInput.value === "auto";
  $("detected-source").hidden = !auto || !detected;
  $("detected-source").textContent = detected ? platformLabel(detected, input.value.trim()) : "";
  $("source-dot").classList.toggle("detected", !!detected);
  if (!activeRequest) setStatus(detected && auto ? platformLabel(detected, input.value.trim()) + " recognized. Ready when you are." : "Paste a public link. We’ll find the available files.");
}
input.addEventListener("input", () => { preferredKind = null; updateInput(); });
platformInput.addEventListener("change", updateInput);
$("clear-button").addEventListener("click", () => { input.value = ""; preferredKind = null; updateInput(); input.focus(); });
$("paste-button").addEventListener("click", async () => {
  try {
    const clipboard = await navigator.clipboard.readText();
    if (!clipboard.trim()) { toast("Your clipboard is empty. Copy a media link first."); return; }
    input.value = clipboard.trim().slice(0, 8192);
    preferredKind = null;
    updateInput();
    input.focus();
  } catch {
    input.focus();
    toast("Paste your link with Ctrl+V, or use your device’s paste menu.");
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !$("sources-dialog").open && !$("credits-dialog").open) {
    event.preventDefault();
    input.focus();
    input.select();
  }
});
form.addEventListener("dragover", (event) => { event.preventDefault(); if (!activeRequest) form.classList.add("drag-over"); });
form.addEventListener("dragleave", (event) => { if (!form.contains(event.relatedTarget)) form.classList.remove("drag-over"); });
form.addEventListener("drop", (event) => {
  event.preventDefault();
  form.classList.remove("drag-over");
  if (activeRequest) return;
  const raw = event.dataTransfer?.getData("text/uri-list") || event.dataTransfer?.getData("text/plain") || "";
  const url = raw.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#"))?.trim();
  if (!url || !safeUrl(url)) { toast("Drop a public media link here, rather than a file."); return; }
  input.value = url.slice(0, 8192);
  preferredKind = null;
  updateInput();
  input.focus();
});
$("cancel-button").addEventListener("click", () => activeRequest?.abort());
$("retry-button").addEventListener("click", () => form.requestSubmit());
$("edit-link").addEventListener("click", () => {
  input.focus();
  input.select();
});
function refreshCurrent() {
  if (!current || activeRequest) return;
  input.value = current.source;
  platformInput.value = current.platform;
  preferredKind = activeKind;
  updateInput();
  form.requestSubmit();
}
$("refresh-button").addEventListener("click", refreshCurrent);
document.querySelectorAll("[data-example]").forEach((button) => button.addEventListener("click", () => {
  if (activeRequest) return;
  const kind = button.dataset.example;
  input.value = examples[kind];
  platformInput.value = "auto";
  preferredKind = kind;
  updateInput();
  form.requestSubmit();
}));

const closeDialogs = new Map();
for (const name of ["sources", "credits"]) {
  const dialog = $(name + "-dialog");
  let closeTimer;
  let focusAfterClose;
  const finishClose = () => {
    clearTimeout(closeTimer);
    dialog.classList.remove("is-closing");
    dialog.close();
    dialog.style.removeProperty("--dialog-exit-opacity");
    dialog.style.removeProperty("--dialog-exit-transform");
    dialog.style.removeProperty("--backdrop-exit-opacity");
    // The rest of the page is inert until the native modal actually closes.
    focusAfterClose?.focus();
    focusAfterClose = null;
  };
  const close = (focusTarget) => {
    if (!dialog.open || dialog.classList.contains("is-closing")) return false;
    focusAfterClose = focusTarget;
    if (reducedMotion.matches) finishClose();
    else {
      // A quick dismissal continues from the entrance's current frame.
      const appearance = getComputedStyle(dialog);
      dialog.style.setProperty("--dialog-exit-opacity", appearance.opacity);
      dialog.style.setProperty("--dialog-exit-transform", appearance.transform);
      dialog.style.setProperty("--backdrop-exit-opacity", getComputedStyle(dialog, "::backdrop").opacity);
      dialog.classList.add("is-closing");
      // Also finish if animation events are suppressed or interrupted.
      closeTimer = setTimeout(finishClose, 360);
    }
    return true;
  };
  closeDialogs.set(name, close);
  $(name + "-button").addEventListener("click", () => dialog.showModal());
  $("close-" + name).addEventListener("click", () => close());
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("animationend", (event) => {
    if (event.target === dialog && event.animationName === "dialog-leave" && dialog.classList.contains("is-closing")) finishClose();
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    clearTimeout(closeTimer);
    dialog.classList.remove("is-closing");
    focusAfterClose = null;
  });
  const motionChanged = () => {
    if (reducedMotion.matches && dialog.classList.contains("is-closing")) finishClose();
  };
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", motionChanged);
  else reducedMotion.addListener(motionChanged);
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = event.target.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
}
for (const option of [...platformInput.options].slice(1)) {
  const button = node("button", "source-choice");
  button.type = "button";
  button.append(node("span", "source-initial", option.textContent.slice(0, 1)), node("span", "", option.textContent));
  button.addEventListener("click", () => {
    if (activeRequest) { toast("Finish or cancel the current search before changing sources."); return; }
    if (!closeDialogs.get("sources")(input)) return;
    platformInput.value = option.value;
    updateInput();
    setStatus("Paste a public " + option.textContent + " link, then find your media.");
  });
  $("source-catalog").append(button);
}

function stopPreview() {
  const player = $("player-container").querySelector("video, audio");
  if (player) { player.pause(); player.removeAttribute("src"); player.load(); }
  $("player-container").replaceChildren();
  $("player-container").hidden = true;
}

function preparationMessage(record) {
  if (record.cancelling) return "Cancelling preparation and removing temporary files…";
  if (record.networkError) return record.networkError;
  const { state, phaseLabel, error } = record.status;
  if (state === "ready") return "Video and audio checked. Your file is ready.";
  if (state === "failed") return error || "Preparation failed. Try again or refresh the links.";
  if (state === "cancelled") return "Preparation cancelled. You can prepare this format again.";
  const fallback = { idle: "Ready to prepare video and audio.", queued: "Waiting for a preparation slot…", downloading: "Downloading video and audio…", merging: "Combining video and audio without re-encoding…", validating: "Checking the completed video and audio tracks…" };
  return phaseLabel || fallback[state] || "Preparing your file…";
}

function renderPreparation() {
  if (!selected) return;
  const selectedRecord = preparationJobs.get(selected.url);
  const record = activePreparation || (lastPreparationIssue?.context === current ? lastPreparationIssue : null) || selectedRecord;
  const status = $("preparation-status");
  const progress = $("preparation-progress");
  const cancel = $("cancel-preparation");
  const feedback = $("preparation-feedback");
  const meter = $("preparation-meter");
  const fill = $("preparation-fill");
  const changedRecord = displayedPreparation !== record;
  if (changedRecord) {
    displayedPreparation = record;
    feedback.classList.remove("is-celebrating");
  }
  const previousState = feedback.dataset.state;
  feedback.hidden = !record;
  const state = record?.cancelling ? "cancelling" : record?.networkError ? "error" : record?.status.state || "idle";
  feedback.dataset.state = state;
  const needsRecovery = !!record && ["error", "failed", "cancelled"].includes(state);
  const recovery = $("preparation-recovery");
  const retry = $("retry-preparation");
  // Move focus off a recovery control before making its region inert.
  if (!needsRecovery && recovery.contains(document.activeElement)) $("save-button").focus({ preventScroll: true });
  setRecoveryOpen(recovery, needsRecovery);
  retry.disabled = !!activeRequest;
  retry.querySelector("span").textContent = record?.failureKind === "expired" ? "Refresh formats"
    : record?.failureKind === "connection" ? "Reconnect " + qualityLabel(record.item)
      : "Retry " + (record ? qualityLabel(record.item) : "preparation");
  if (record) {
    const { downloadedBytes, totalBytes, progress: percent, progressEstimated, sizeBytes } = record.status;
    const ready = state === "ready";
    const measured = state === "downloading" && Number.isFinite(percent);
    const unavailable = ["error", "failed", "cancelled"].includes(state);
    const background = record.item !== selected;
    $("preparation-title").textContent = ready ? qualityLabel(record.item) + " is ready" : state === "cancelling" ? "Cancelling preparation"
      : state === "cancelled" ? "Preparation cancelled"
        : record.failureKind === "expired" ? "Fresh links needed"
          : record.failureKind === "connection" ? "Connection interrupted"
            : unavailable ? "Couldn’t prepare " + qualityLabel(record.item) : "Preparing " + qualityLabel(record.item);
    $("preparation-metric").textContent = ready ? fileSize(sizeBytes || record.item.sizeBytes) : measured ? (progressEstimated ? "≈ " : "") + Math.floor(percent) + "%" : "";
    const message = (background ? qualityLabel(record.item) + " in the background: " : "") + preparationMessage(record);
    // Byte updates remain readable without announcing the same phase every second.
    if (status.textContent !== message) status.textContent = message;
    $("preparation-detail").textContent = ready ? "Choose Download " + qualityLabel(record.item) + " to save it to your device."
      : record.failureKind === "expired" ? "Refresh formats to get a new download link."
        : record.failureKind === "connection" ? "Reconnect to check the same job before starting anything new."
          : state === "failed" ? "Try this format again, or choose another resolution."
      : state === "downloading" && downloadedBytes > 0 ? fileSize(downloadedBytes) + (totalBytes > 0 ? " of " + (progressEstimated ? "≈ " : "") + fileSize(totalBytes) : " received")
        : "";
    meter.hidden = unavailable;
    progress.hidden = unavailable;
    meter.dataset.mode = ready || measured ? "measured" : "indeterminate";
    // A different job starts at its own progress, rather than sliding back from another file.
    meter.classList.toggle("is-resetting", changedRecord);
    if (ready || measured) fill.style.transform = "scaleX(" + (ready ? 1 : percent / 100) + ")";
    else fill.style.removeProperty("transform");
    if (changedRecord) { void fill.offsetWidth; meter.classList.remove("is-resetting"); }
    if (ready || measured) {
      progress.value = ready ? 100 : percent;
      progress.setAttribute("aria-valuetext", ready ? "Ready to download" : (progressEstimated ? "Approximately " : "") + Math.floor(percent) + " percent downloaded");
    } else {
      progress.removeAttribute("value");
      progress.removeAttribute("aria-valuetext");
    }
    progress.setAttribute("aria-label", qualityLabel(record.item) + " preparation progress");
    if (!changedRecord && previousState !== state && (needsRecovery || ["error", "failed", "cancelled"].includes(previousState))) animateStateChange(feedback);
  }
  if (cancel) {
    cancel.hidden = !activePreparation;
    cancel.disabled = !!activePreparation?.cancelling;
    cancel.textContent = activePreparation?.cancelling ? "Cancelling…" : "Cancel preparation";
  }
  const save = $("save-button");
  const busy = selectedRecord === activePreparation && (selectedRecord?.polling || selectedRecord?.cancelling);
  save.setAttribute("aria-disabled", String(!!busy));
  save.setAttribute("aria-busy", String(!!busy));
  if (selected.preparation) {
    const state = selectedRecord?.status.state;
    save.querySelector("span").textContent = prepared(selected) ? "Download " + qualityLabel(selected)
      : busy ? "Preparing " + qualityLabel(selected) + "…"
        : selectedRecord?.failureKind === "expired" ? "Refresh formats"
          : selectedRecord?.failureKind === "connection" ? "Reconnect preparation"
            : selectedRecord?.networkError || ["failed", "cancelled"].includes(state) ? "Retry " + qualityLabel(selected)
            : "Prepare " + qualityLabel(selected);
    $("result-hint").textContent = prepared(selected)
      ? "Video and audio checked. Download this file within 30 minutes of preparation."
      : "We’ll combine the original video and audio, then your download will be ready. Large files can take a few minutes.";
    if (!prepared(selected)) $("preview-button").hidden = true;
    else if ($("player-container").hidden) $("preview-button").hidden = false;
  }
}

function preparationStatus(data) {
  if (!data || !preparationStates.has(data.state)) throw new Error("The app returned an invalid preparation status. Try reconnecting.");
  const result = { state: data.state };
  for (const key of ["phaseLabel", "error"]) if (typeof data[key] === "string") result[key] = data[key].slice(0, 1000);
  for (const key of ["downloadedBytes", "totalBytes", "sizeBytes", "expiresAt", "width", "height", "fps", "duration"]) {
    if (typeof data[key] === "number" && Number.isFinite(data[key]) && data[key] >= 0) result[key] = data[key];
  }
  result.progress = typeof data.progress === "number" && Number.isFinite(data.progress) && data.progress >= 0 && data.progress <= 100 ? data.progress : null;
  result.progressEstimated = data.progressEstimated === true;
  return result;
}

async function requestPreparation(record, method) {
  const endpoint = record.item.url + (method === "GET" ? "/status" : "/prepare");
  const response = await fetch(endpoint, { method, headers: { Accept: "application/json" }, signal: AbortSignal.any([record.controller.signal, AbortSignal.timeout(20000)]) });
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    const error = new Error(typeof body.error === "string" ? body.error : "Couldn’t reach the preparation service. Try again.");
    error.status = response.status;
    throw error;
  }
  return preparationStatus(body.data);
}

function finishPreparation(record, { quiet = false } = {}) {
  if (current !== record.context) return;
  const item = record.item;
  if (record.status.sizeBytes > 0) { item.sizeBytes = record.status.sizeBytes; item.estimated = false; }
  const row = [...$("download-links").children].find((element) => element.dataset.mediaUrl === item.url);
  if (row) {
    row.querySelector(".format-size").textContent = itemSize(item);
    row.querySelector(".format-ready").hidden = false;
  }
  if (activePreparation === record) activePreparation = null;
  record.polling = false;
  record.cancelling = false;
  if (lastPreparationIssue === record) lastPreparationIssue = null;
  if (selected === item) updateSelection();
  else renderPreparation();
  if (!quiet && !record.readyAnnounced) {
    record.readyAnnounced = true;
    if (selected === item) $("preparation-feedback").classList.add("is-celebrating");
    toast(qualityLabel(item) + (selected === item ? " with audio is ready to download." : " with audio is ready. Select its Ready format to download."));
  }
}

async function prepareSelected(item = selected) {
  if (!item?.preparation || !item.local || !current) return;
  if (activeRequest && document.body.classList.contains("is-loading")) { toast("Finish or cancel the current search before preparing a download."); return; }
  if (preparationJobs.get(item.url)?.failureKind === "expired" || expired(item)) { refreshCurrent(); return; }
  if (activePreparation && activePreparation.item.url !== item.url) {
    toast(qualityLabel(activePreparation.item) + " is already preparing. Cancel it before preparing another format.");
    $("cancel-preparation")?.focus();
    return;
  }
  let record = preparationJobs.get(item.url);
  if (record?.polling || record?.cancelling) return;
  const reconnect = record?.failureKind === "connection";
  record ||= { item, context: current, status: { state: "queued" } };
  if (["failed", "cancelled"].includes(record.status.state)) record.status = { state: "queued" };
  record.controller = new AbortController();
  record.networkError = null;
  record.failureKind = null;
  lastPreparationIssue = null;
  record.polling = true;
  activePreparation = record;
  preparationJobs.set(item.url, record);
  renderPreparation();
  try {
    let method = reconnect ? "GET" : "POST";
    while (activePreparation === record && current === record.context && !record.controller.signal.aborted) {
      const nextStatus = await requestPreparation(record, method);
      if (record.controller.signal.aborted || activePreparation !== record || current !== record.context) return;
      record.status = nextStatus;
      record.networkError = null;
      if (reconnect && record.status.state === "idle") {
        record.status = { state: "failed", error: "This preparation hasn’t started. Try again to begin." };
      }
      if (record.status.state === "ready") {
        finishPreparation(record);
        return;
      }
      if (["failed", "cancelled"].includes(record.status.state)) {
        if (record.status.state === "failed") lastPreparationIssue = record;
        activePreparation = null;
        break;
      }
      renderPreparation();
      await new Promise((resolve) => {
        const done = () => { clearTimeout(timer); record.controller.signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, 1000);
        record.controller.signal.addEventListener("abort", done, { once: true });
      });
      method = "GET";
    }
  } catch (error) {
    if (!record.controller.signal.aborted && current === record.context) {
      // Preserve the job identity: the server may still be working. Reconnect
      // checks its status before the user chooses whether to start a new attempt.
      const connectionLost = error instanceof TypeError || error instanceof SyntaxError || error.name === "TimeoutError";
      record.failureKind = error.status === 404 || error.status === 410 ? "expired" : connectionLost ? "connection" : "failed";
      record.networkError = connectionLost ? "We couldn’t check the download’s progress. It may still be preparing."
        : record.failureKind === "expired" ? "This format link is no longer available."
          : error.message;
      lastPreparationIssue = record;
      if (record.failureKind === "expired") activePreparation = null;
    }
  } finally {
    record.polling = false;
    if (current === record.context) renderPreparation();
  }
}

async function cancelPreparation({ quiet = false } = {}) {
  const record = activePreparation;
  if (!record || record.cancelling) return;
  record.cancelling = true;
  record.controller.abort();
  if (!quiet) renderPreparation();
  try {
    const response = await fetch(record.item.url + "/prepare", { method: "DELETE", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000), keepalive: quiet });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(typeof body.error === "string" ? body.error : "Couldn’t cancel preparation. Try again.");
    record.status = preparationStatus(body.data);
    record.networkError = null;
    record.failureKind = null;
    if (lastPreparationIssue === record) lastPreparationIssue = null;
    // The server may finish validation just before the cancellation reaches it.
    if (record.status.state === "ready") finishPreparation(record, { quiet });
    if (activePreparation === record) activePreparation = null;
  } catch (error) {
    record.networkError = "Couldn’t confirm cancellation. Retry Cancel preparation or reconnect to check the job.";
    record.failureKind = "connection";
  } finally {
    record.cancelling = false;
    if (current === record.context) renderPreparation();
  }
}
$("cancel-preparation")?.addEventListener("click", () => cancelPreparation());
$("retry-preparation").addEventListener("click", () => {
  if (displayedPreparation?.context === current) prepareSelected(displayedPreparation.item);
});
window.addEventListener("pagehide", () => { cancelPreparation({ quiet: true }); });
window.addEventListener("pageshow", () => { if (selected) renderPreparation(); });

function syncPreviewArtwork() {
  const audio = $("preview-stage").dataset.kind === "audio";
  const poster = $("media-poster");
  const loaded = !!poster.getAttribute("src") && poster.complete && poster.naturalWidth > 0;
  for (const [element, visible] of [[poster, !audio && loaded], [$("audio-art"), audio], [$("preview-fallback"), !audio && !loaded]]) {
    element.hidden = false;
    element.classList.add("preview-layer");
    element.classList.toggle("is-visible", visible);
    element.setAttribute("aria-hidden", String(!visible));
  }
}

function showPreview(item) {
  stopPreview();
  const poster = $("media-poster");
  const source = item.kind === "photo" ? item.url : current.media.thumbnail;
  $("preview-stage").dataset.kind = item.kind;
  $("preview-badge").textContent = (item.kind === "photo" ? "Photo" : kinds[item.kind]) + (item.format ? " / " + item.format.toUpperCase() : "");
  $("preview-button").hidden = !["video", "audio"].includes(item.kind) || !prepared(item);
  $("preview-button").querySelector("span").textContent = item.kind === "audio" ? "Listen to preview" : "Play preview";
  poster.alt = current.media.title || "Selected media preview";
  // Resolution choices share a thumbnail. Keep its loaded image (or pending
  // request) intact instead of briefly flashing the fallback on every choice.
  if (source && poster.getAttribute("src") === source) { syncPreviewArtwork(); return; }
  poster.onload = poster.onerror = null;
  if (!source) {
    poster.removeAttribute("src");
    syncPreviewArtwork();
    return;
  }
  // Photos use their own URLs, so carousel selections still replace the image.
  // Ignore a queued event from an image that was superseded by a newer choice.
  const isCurrent = () => poster.getAttribute("src") === source && poster.complete;
  poster.onload = () => {
    if (!isCurrent() || !poster.naturalWidth) return;
    syncPreviewArtwork();
  };
  poster.onerror = () => {
    if (!isCurrent() || poster.naturalWidth) return;
    syncPreviewArtwork();
  };
  poster.src = source;
  syncPreviewArtwork();
}
$("preview-button").addEventListener("click", () => {
  if (!selected || !current) return;
  if (!prepared(selected)) return;
  if (expired(selected)) {
    toast("This preview link is getting old. Refresh links to continue.");
    return;
  }
  const player = document.createElement(selected.kind === "audio" ? "audio" : "video");
  player.controls = true;
  player.preload = "none";
  player.setAttribute("playsinline", "");
  player.tabIndex = 0;
  player.setAttribute("aria-label", "Preview of " + (current.media.title || "selected media"));
  if (selected.kind === "video" && current.media.thumbnail) player.poster = current.media.thumbnail;
  player.src = selected.url;
  player.addEventListener("error", () => {
    // A replaced player may still deliver a queued network error. It must not
    // remove the new selection's player or move focus away from it.
    if (player.parentElement !== $("player-container")) return;
    stopPreview();
    $("preview-button").hidden = false;
    $("preview-button").focus({ preventScroll: true });
    toast("This file can’t be previewed here. Try downloading it, or refresh the links.");
  }, { once: true });
  $("player-container").replaceChildren(player);
  $("player-container").hidden = false;
  $("preview-button").hidden = true;
  player.focus({ preventScroll: true });
  player.play().catch(() => { /* Native controls remain available if autoplay is denied. */ });
});
function itemTitle(item, index) {
  if (item.kind === "photo") return "Photo " + (index + 1);
  if (item.kind === "audio") return item.quality && item.quality !== "Audio only" ? item.quality : "Audio only";
  if (current.platform === "meta" && item.kind === "video") return "Video " + (index + 1) + (item.quality ? " · " + item.quality : "");
  return item.quality || item.label || "Original file";
}
function settleFormatMotion() {
  if (formatMotion) {
    formatMotion.height.cancel();
    formatMotion.content.cancel();
    formatMotion = null;
  }
  for (const [ghost, animation] of formatGhosts) { animation.cancel(); ghost.remove(); }
  formatGhosts.clear();
  $("format-stage").classList.remove("is-switching", "is-resizing");
}

function captureFormatMotion() {
  const stage = $("format-stage");
  const content = $("format-content");
  if (reducedMotion.matches || !stage.animate) { settleFormatMotion(); return null; }
  // Read the current frame before cancelling, so rapid switches continue smoothly.
  const height = stage.getBoundingClientRect().height;
  const appearance = getComputedStyle(content);
  const from = { opacity: appearance.opacity, transform: appearance.transform };
  const ghost = content.cloneNode(true);
  // Snapshot ID-styled details before removing IDs. The live controls remain the
  // only accessible, interactive elements and the only targets of app updates.
  const originals = [content, ...content.querySelectorAll("[id]")];
  const copies = [ghost, ...ghost.querySelectorAll("[id]")];
  const properties = ["display", "position", "inset", "width", "height", "max-width", "max-height", "margin", "padding", "font", "line-height", "color", "background", "border", "border-radius", "text-align", "transform", "opacity", "overflow", "flex", "gap", "align-items", "justify-content"];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    if (index) for (const property of properties) copies[index].style.setProperty(property, style.getPropertyValue(property));
    copies[index].removeAttribute("id");
  });
  ghost.querySelectorAll("[aria-live]").forEach((element) => element.removeAttribute("aria-live"));
  ghost.inert = true;
  ghost.setAttribute("aria-hidden", "true");
  ghost.classList.add("format-outgoing");
  ghost.style.height = content.getBoundingClientRect().height + "px";
  if (formatMotion) {
    formatMotion.height.cancel();
    formatMotion.content.cancel();
    formatMotion = null;
  }
  stage.classList.remove("is-resizing");
  stage.classList.add("is-switching");
  stage.append(ghost);
  ghost.querySelector(".download-links").scrollTop = $("download-links").scrollTop;
  const animation = ghost.animate([from, { opacity: 0, transform: "translateY(-4px)" }], { duration: 280, easing: "ease", fill: "forwards" });
  formatGhosts.set(ghost, animation);
  animation.finished.then(() => { ghost.remove(); formatGhosts.delete(ghost); }, () => {});
  return { stage, content, height };
}

function playFormatMotion(snapshot) {
  if (!snapshot) return;
  const { stage, content, height } = snapshot;
  const targetHeight = stage.getBoundingClientRect().height;
  stage.classList.add("is-resizing");
  const timing = { duration: 280, easing: "ease" };
  const motion = {
    height: stage.animate([{ height: height + "px" }, { height: targetHeight + "px" }], timing),
    content: content.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], timing),
  };
  formatMotion = motion;
  motion.height.finished.then(() => {
    if (formatMotion !== motion) return;
    formatMotion = null;
    stage.classList.remove("is-switching", "is-resizing");
  }, () => {});
}
const settleReducedFormatMotion = () => { if (reducedMotion.matches) settleFormatMotion(); };
if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", settleReducedFormatMotion);
else reducedMotion.addListener(settleReducedFormatMotion);
window.addEventListener("resize", settleFormatMotion);

function renderFormats(kind) {
  const items = current.media.items.filter((item) => item.kind === kind);
  if (activeKind === kind && items.includes(selected)) return;
  const list = $("download-links");
  const switching = !!selected && activeKind !== kind && !$("results").hidden;
  if (selected) kindSelections.set(activeKind, { item: selected, scroll: list.scrollTop });
  const motion = switching ? captureFormatMotion() : null;
  activeKind = kind;
  if (!items.includes(selected)) selected = items.includes(kindSelections.get(kind)?.item) ? kindSelections.get(kind).item : items[0];
  $("kind-tabs").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.kind === kind)));
  list.replaceChildren();
  const selectFormat = (index) => {
    if (selected !== items[index]) {
      selected = items[index];
      // Keep the rows mounted so the old and new selection can transition.
      [...list.children].forEach((button, row) => {
        button.setAttribute("aria-checked", String(row === index));
        button.tabIndex = row === index ? 0 : -1;
      });
      updateSelection();
    }
    list.children[index]?.focus({ preventScroll: true });
  };
  items.forEach((item, index) => {
    const button = node("button", "format-option" + (switching ? " format-stable" : ""));
    button.type = "button";
    button.dataset.mediaUrl = item.url;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(item === selected));
    button.tabIndex = item === selected ? 0 : -1;
    const dot = node("span", "format-radio");
    dot.setAttribute("aria-hidden", "true");
    const copy = node("span", "format-copy");
    const title = node("strong", "", itemTitle(item, index));
    const readyBadge = node("span", "format-ready", "Ready");
    readyBadge.hidden = !item.preparation || !prepared(item);
    title.append(document.createTextNode(" "), readyBadge);
    copy.append(title);
    const videoLabel = current.platform === "youtube" && item.kind === "video" ? "Video + audio" : "Video";
    const descriptor = [item.format.toUpperCase(), item.kind === "audio" ? "Audio only" : item.kind === "photo" ? "Image" : item.kind === "video" ? videoLabel : "File", item.fps ? Math.round(item.fps) + " fps" : ""].filter(Boolean).join(" · ");
    copy.append(node("small", "", descriptor));
    button.append(dot, copy, node("span", "format-size", itemSize(item)));
    button.addEventListener("click", () => selectFormat(index));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + items.length) % items.length;
      selectFormat(next);
    });
    list.append(button);
  });
  updateSelection();
  list.scrollTop = kindSelections.get(kind)?.scroll || 0;
  playFormatMotion(motion);
}
function updateSelection() {
  if (!selected) return;
  const save = $("save-button");
  save.href = selected.url;
  save.rel = "noopener noreferrer";
  if (selected.local) { save.setAttribute("download", ""); save.removeAttribute("target"); }
  else { save.removeAttribute("download"); save.target = "_blank"; }
  save.querySelector("span").textContent = selected.local ? "Download " + (selected.kind === "photo" ? "photo" : selected.kind === "file" ? "file" : selected.kind) : "Open " + (selected.kind === "photo" ? "photo" : selected.kind);
  $("selected-summary").replaceChildren(node("span", "", selected.format ? selected.format.toUpperCase() + " file" : "Selected file"), node("span", "", itemSize(selected) || "Size unavailable"));
  $("result-hint").textContent = selected.local ? "Ready to save to your device. Links stay active for 30 minutes." : "Opens the media source. Use your browser’s Save as if it plays.";
  showPreview(selected);
  renderPreparation();
}
$("save-button").addEventListener("click", (event) => {
  if (!selected || !current) { event.preventDefault(); return; }
  if (expired(selected)) {
    event.preventDefault();
    toast("This link has expired. Refresh links for a new download.");
    $("refresh-button").focus();
    return;
  }
  if (!prepared(selected)) { event.preventDefault(); prepareSelected(); return; }
  if (selected.local) toast("Download requested. Your browser will handle the file.");
});
function renderResult() {
  settleFormatMotion();
  kindSelections.clear();
  $("media-title").textContent = current.media.title || "Your media";
  $("media-source").textContent = [platformLabel(current.platform, current.source), duration(current.media.duration)].filter(Boolean).join(" / ");
  $("source-link").href = current.source;
  $("result-count").textContent = current.media.items.length + " available file" + (current.media.items.length === 1 ? "" : "s");
  const tabs = $("kind-tabs");
  tabs.replaceChildren();
  for (const kind of Object.keys(kinds).filter((type) => current.media.items.some((item) => item.kind === type))) {
    const button = node("button", "kind-tab");
    button.type = "button";
    button.dataset.kind = kind;
    button.setAttribute("aria-pressed", "false");
    button.append(icon(kind === "file" ? "download" : kind), node("span", "", kinds[kind]));
    button.addEventListener("click", () => renderFormats(kind));
    tabs.append(button);
  }
  selected = null;
  renderFormats(current.media.items.some((item) => item.kind === preferredKind) ? preferredKind : current.media.items[0].kind);
  preferredKind = null;
  $("raw-response").textContent = JSON.stringify(current.body, null, 2);
  $("results").querySelector("details").open = false;
  document.body.classList.add("has-result");
  $("welcome").hidden = true;
  $("output").hidden = false;
  $("output").dataset.state = "full";
  $("output").setAttribute("aria-labelledby", "results-title");
  $("output-empty").hidden = true;
  $("results").hidden = false;
  rememberSource();
}

async function revealResult(update, signal, target = $("results")) {
  const commit = () => { signal.throwIfAborted(); update(); };
  if (reducedMotion.matches || !document.startViewTransition) {
    commit();
    if (!reducedMotion.matches) animateStateChange(target);
    return;
  }
  // Snapshot the loading/previous result before committing the complete replacement.
  // The browser interpolates its position and size as the welcome area clears.
  const transition = document.startViewTransition(commit);
  const skip = () => transition.skipTransition();
  const motionChanged = () => { if (reducedMotion.matches) skip(); };
  signal.addEventListener("abort", skip, { once: true });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", motionChanged);
  else reducedMotion.addListener(motionChanged);
  // An interrupted animation must never hold the search controls indefinitely.
  const fallback = setTimeout(skip, 800);
  transition.ready.catch(() => {});
  transition.updateCallbackDone.catch(() => {});
  try { await transition.finished; }
  finally {
    clearTimeout(fallback);
    signal.removeEventListener("abort", skip);
    if (reducedMotion.removeEventListener) reducedMotion.removeEventListener("change", motionChanged);
    else reducedMotion.removeListener(motionChanged);
  }
}
function rememberSource() {
  recent = recent.filter((item) => item.source !== current.source);
  recent.unshift({ source: current.source, platform: current.platform, title: current.media.title || "Untitled media", thumbnail: current.media.thumbnail, count: current.media.items.length });
  recent = recent.slice(0, 6);
  renderRecent();
}
function renderRecent() {
  $("nav-count").textContent = recent.length;
  $("session-empty").hidden = recent.length > 0;
  $("clear-session").hidden = recent.length === 0;
  const list = $("recent-sources");
  list.replaceChildren();
  for (const item of recent) {
    const button = node("button", "recent-card");
    button.type = "button";
    button.setAttribute("aria-label", "Reopen " + item.title);
    if (item.thumbnail) {
      const image = node("img", "recent-thumb");
      image.src = item.thumbnail;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => { image.hidden = true; });
      button.append(image);
    } else {
      const placeholder = node("span", "recent-thumb recent-icon");
      placeholder.append(icon("link"));
      button.append(placeholder);
    }
    const copy = node("span", "recent-copy");
    copy.append(node("strong", "", item.title), node("small", "", platformLabel(item.platform, item.source) + " / " + item.count + " file" + (item.count === 1 ? "" : "s")));
    button.append(copy);
    button.addEventListener("click", () => {
      if (activeRequest) { toast("Finish or cancel the current search first."); return; }
      input.value = item.source;
      platformInput.value = item.platform;
      preferredKind = null;
      updateInput();
      form.requestSubmit();
      form.scrollIntoView({ block: "start", behavior: scrollBehavior() });
    });
    list.append(button);
  }
}
$("clear-session").addEventListener("click", () => { recent = []; renderRecent(); toast("Recent sources cleared from this tab."); });

function emptyState(state, title, copy) {
  if (current) return;
  $("output").hidden = false;
  $("output").dataset.state = state;
  $("output").setAttribute("aria-labelledby", "output-state-title");
  $("output-empty").hidden = false;
  $("output-state-title").textContent = title;
  $("output-state-copy").textContent = copy;
}

function setFinding(finding) {
  for (const id of ["submit-button", "media-url", "platform", "paste-button", "clear-button"]) $(id).disabled = finding;
  $("submit-button").querySelector("span").textContent = finding ? "Finding media" : "Find my media";
  $("cancel-button").hidden = !finding;
  $("elapsed").hidden = !finding;
  $("retry-button").disabled = finding;
  $("retry-preparation").disabled = finding;
  document.body.classList.toggle("is-loading", finding);
  if (finding) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
}

function retainPreparations(next) {
  const matching = new Map(next.media.items.filter((item) => item.preparation).map((item) => [item.url, item]));
  // The server reuses active/ready jobs when a source is refreshed. Keep their
  // progress and expiry, and let the existing poller follow the replacement UI.
  if (activePreparation && !matching.has(activePreparation.item.url)) {
    cancelPreparation({ quiet: true });
    activePreparation = null;
  }
  for (const [url, record] of preparationJobs) {
    const item = matching.get(url);
    if (!item) preparationJobs.delete(url);
    else {
      record.item = item;
      record.context = next;
      if (record.status.state === "ready" && record.status.sizeBytes > 0) {
        item.sizeBytes = record.status.sizeBytes;
        item.estimated = false;
      }
    }
  }
  if (lastPreparationIssue?.context !== next) lastPreparationIssue = null;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeRequest) return;
  const fromRecovery = $("search-error").contains(document.activeElement);
  clearSearchError();
  const source = input.value.trim();
  if (source.length > 8192 || !safeUrl(source)) {
    input.setAttribute("aria-invalid", "true");
    setStatus("Add a complete public link, starting with https://.", "error");
    showSearchError("Paste the full address of a public video, photo, or audio post, starting with https://.", "Check that link.");
    input.focus();
    return;
  }
  const platform = platformInput.value === "auto" ? detectPlatform(source) : platformInput.value;
  if (!platform) {
    setStatus("We couldn’t recognize this source. Choose a platform below the link.", "error");
    showSearchError("Choose its platform below the link, or try a link from one of the supported sources.", "Which source is this from?");
    platformInput.focus();
    return;
  }
  const controller = new AbortController();
  activeRequest = controller;
  const started = Date.now();
  const timeoutMs = ["youtube", "meta"].includes(platform) ? 70000 : 35000;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  $("elapsed").textContent = "0s";
  const elapsedTimer = setInterval(() => { $("elapsed").textContent = Math.floor((Date.now() - started) / 1000) + "s"; }, 1000);
  setFinding(true);
  if (fromRecovery) $("cancel-button").focus({ preventScroll: true });
  setStatus("Finding available formats from " + platformLabel(platform, source) + "…", "loading");
  emptyState("loading", "A little closer to yours.", "Finding available files from " + platformLabel(platform, source) + ". Some sources can take up to a minute.");
  try {
    const response = await fetch("/api/" + platform + "/download?" + new URLSearchParams({ url: source }), { signal: controller.signal, headers: { Accept: "application/json" } });
    const body = await response.json();
    if (!response.ok || body.success !== true) throw new Error(typeof body.error === "string" ? body.error : "This source couldn’t return media. Try another public link.");
    const media = normalizeMedia(body.data, source);
    if (!media.items.length) throw new Error("This source returned no downloadable files. Try another public post.");
    clearTimeout(timer);
    clearInterval(elapsedTimer);
    await revealResult(() => {
      // Only replace a successful result once its replacement is ready.
      const next = { media, body, source, platform, resolvedAt: Date.now() };
      retainPreparations(next);
      current = next;
      renderResult();
      setFinding(false);
      setStatus(media.items.some((item) => item.preparation)
        ? media.items.length + " formats found. Choose one to prepare or download."
        : media.items.length + " file" + (media.items.length === 1 ? " is" : "s are") + " ready. Choose a format and make it yours.", "success");
    }, controller.signal);
    if (!document.querySelector("dialog[open]")) {
      $("results-title").focus({ preventScroll: true });
      $("output").scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
    }
  } catch (error) {
    if (controller.signal.aborted && !timedOut) {
      setStatus(current ? "Search cancelled. Your previous result is still ready." : "Search cancelled. Your link is here when you’re ready.");
      if (!current) $("output").hidden = true;
    } else {
      clearTimeout(timer);
      clearInterval(elapsedTimer);
      const message = timedOut ? "This source took too long. Your link is saved here—try again in a moment." : error instanceof SyntaxError || error instanceof TypeError ? "We couldn’t reach the app. Check your connection and that the local server is running, then try again." : error.message;
      // A timeout has already aborted its request signal; recovery must still render.
      await revealResult(() => {
        if (!current) $("output").hidden = true;
        setStatus(message + (current ? " Your previous result is still available below." : ""), "error");
        showSearchError(message, timedOut ? "This is taking longer than expected." : "We couldn’t find this media.");
      }, new AbortController().signal, $("search-error"));
    }
  } finally {
    clearTimeout(timer);
    clearInterval(elapsedTimer);
    activeRequest = null;
    const returnToInput = document.activeElement === $("cancel-button");
    setFinding(false);
    if (returnToInput) ($("search-error").classList.contains("is-open") ? $("retry-button") : input).focus({ preventScroll: true });
  }
});
updateInput();
