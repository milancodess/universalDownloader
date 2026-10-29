"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { DownloadError } = require("./downloadError");
const { mediaFilename } = require("./mediaTickets");
const merge = require("./youtubeMerge");

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const FORMAT_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const MAX_FILE_BYTES = 4 * 1024 ** 3;
const ACTIVE_STATES = new Set(["queued", "downloading", "merging", "validating"]);
const DEFAULT_ROOT = path.resolve(__dirname, "..", ".runtime", "youtube-cache");

function validateSpec(input) {
  if (!input || typeof input !== "object" || !/^[a-z0-9_-]{11}$/i.test(input.videoId || "") ||
    input.sourceUrl !== "https://www.youtube.com/watch?v=" + input.videoId ||
    !FORMAT_ID.test(input.videoFormatId || "") || !FORMAT_ID.test(input.audioFormatId || "") ||
    input.videoFormatId === input.audioFormatId ||
    !Number.isInteger(input.height) || input.height < 1 || input.height > 2160 ||
    !Number.isInteger(input.width) || input.width < 1 || input.width > 8192) {
    throw new DownloadError("This video format is invalid. Find your media again.", 400, "INVALID_MERGE_FORMAT");
  }
  const filename = mediaFilename(String(input.filename || "youtube-" + input.videoId + ".mp4")
    .replace(/[. ]+$/, "").replace(/\.mp4$/i, "") + ".mp4");
  const estimatedBytes = Number.isFinite(input.estimatedBytes) && input.estimatedBytes > 0 ? Math.ceil(input.estimatedBytes) : null;
  if (estimatedBytes > MAX_FILE_BYTES) throw new DownloadError("This format exceeds the 4 GiB preparation limit. Choose a smaller format.", 413, "MERGE_TOO_LARGE");
  return Object.freeze({
    sourceUrl: input.sourceUrl, videoId: input.videoId,
    videoFormatId: input.videoFormatId, audioFormatId: input.audioFormatId,
    width: input.width, height: input.height,
    fps: Number.isFinite(input.fps) && input.fps > 0 ? input.fps : null,
    duration: Number.isFinite(input.duration) && input.duration > 0 ? input.duration : null,
    videoCodec: String(input.videoCodec || "").slice(0, 80),
    audioCodec: String(input.audioCodec || "").slice(0, 80),
    filename, estimatedBytes,
  });
}

function createYouTubeJobManager({
  root = DEFAULT_ROOT, run = merge.runYouTubeMerge, checkRuntime = merge.checkRuntime,
  now = Date.now, ttlMs = 30 * 60 * 1000, timeoutMs = 30 * 60 * 1000,
  maxActive = 2, maxQueued = 4, maxJobs = 120, maxCacheBytes = 8 * 1024 ** 3,
  checkDisk = true,
} = {}) {
  root = path.resolve(root);
  const jobs = new Map();
  const queue = [];
  let active = 0;
  let pruning = null;
  let closed = false;
  function directory(id) {
    if (!UUID.test(id)) throw new Error("Invalid job directory");
    const target = path.resolve(root, id);
    if (path.dirname(target) !== root) throw new Error("Job directory escaped cache");
    return target;
  }
  async function removeFiles(job) {
    // Every recursive deletion is restricted to our generated direct child.
    const target = directory(job.id);
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
  function snapshot(job) {
    if (!job) return null;
    return {
      state: job.state, phaseLabel: job.phaseLabel, progress: job.progress, progressEstimated: !!job.progressEstimated,
      downloadedBytes: job.downloadedBytes, totalBytes: job.totalBytes,
      error: job.error || null, expiresAt: job.expiresAt,
      ...(job.result ? {
        sizeBytes: job.result.sizeBytes, width: job.result.width, height: job.result.height,
        fps: job.result.fps, videoCodec: job.result.videoCodec, audioCodec: job.result.audioCodec,
        duration: job.result.duration,
      } : {}),
    };
  }
  function get(id) {
    if (!UUID.test(id || "")) return null;
    const job = jobs.get(id);
    if (!job || job.pruning || job.expiresAt <= now() && !ACTIVE_STATES.has(job.state) && !job.promise) return null;
    return job;
  }
  function prune() {
    if (pruning) return pruning;
    pruning = (async () => {
      let cached = [...jobs.values()].reduce((sum, job) => sum + (job.result?.sizeBytes || 0), 0);
      for (const job of [...jobs.values()].sort((a, b) => a.updatedAt - b.updatedAt)) {
        if (job.promise || job.readers || ACTIVE_STATES.has(job.state)) continue;
        if (job.expiresAt > now() && !(cached > maxCacheBytes && job.result)) continue;
        // Reserve the record before asynchronous deletion so no new reader or
        // preparation can acquire a file that is already being removed.
        job.pruning = true;
        try {
          await removeFiles(job);
          cached -= job.result?.sizeBytes || 0;
          jobs.delete(job.id);
        } catch { /* A transfer may still have an OS file handle; retry next sweep. */ }
        finally { job.pruning = false; }
      }
      // Previous app processes leave only generated UUID directories. Remove stale
      // abandoned entries after a full preparation deadline plus cache lifetime.
      let entries;
      try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (!entry.isDirectory() || !UUID.test(entry.name) || jobs.has(entry.name)) continue;
        try {
          const target = directory(entry.name);
          const stat = await fs.lstat(target);
          if (!stat.isSymbolicLink() && now() - stat.mtimeMs > timeoutMs + ttlMs) await fs.rm(target, { recursive: true, force: true });
        } catch { /* Retry abandoned-directory cleanup on the next sweep. */ }
      }
    })().finally(() => { pruning = null; });
    return pruning;
  }
  const sweeper = setInterval(() => { void prune(); }, 60000);
  sweeper.unref();
  function createLink(input) {
    if (closed) throw new DownloadError("The app is shutting down.", 503);
    const spec = validateSpec(input);
    const reusable = [...jobs.values()].find((job) => !job.pruning && job.expiresAt > now() &&
      (ACTIVE_STATES.has(job.state) || job.state === "ready") &&
      job.spec.sourceUrl === spec.sourceUrl && job.spec.videoFormatId === spec.videoFormatId &&
      job.spec.audioFormatId === spec.audioFormatId && job.spec.height === spec.height && job.spec.width === spec.width &&
      job.spec.fps === spec.fps && job.spec.duration === spec.duration && job.spec.videoCodec === spec.videoCodec && job.spec.audioCodec === spec.audioCodec);
    if (reusable) return "/api/files/" + reusable.id;
    if (jobs.size >= maxJobs) {
      const oldest = [...jobs.values()].find((job) => job.state === "idle" && !job.readers && !job.pruning);
      if (oldest) jobs.delete(oldest.id);
      else throw new DownloadError("Too many prepared formats. Wait for existing downloads to finish.", 503, "MERGE_BUSY");
    }
    const id = randomUUID();
    const job = {
      id, spec, state: "idle", phaseLabel: "Ready to prepare", progress: null,
      downloadedBytes: 0, totalBytes: spec.estimatedBytes, createdAt: now(),
      updatedAt: now(), expiresAt: now() + ttlMs, result: null, error: null,
      readers: 0, controller: null, promise: null, revision: 0, pruning: false,
    };
    jobs.set(id, job);
    return "/api/files/" + id;
  }
  function drain() {
    while (!closed && active < maxActive && queue.length) {
      const job = queue.shift();
      if (job.state !== "queued") continue;
      active++;
      job.promise = execute(job).finally(() => {
        job.promise = null;
        active--;
        drain();
        void prune();
      });
    }
  }
  async function execute(job) {
    job.controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; job.controller.abort(); }, timeoutMs);
    const signal = job.controller.signal;
    try {
      const target = directory(job.id);
      await fs.mkdir(target, { recursive: true });
      const stat = await fs.lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid job directory");
      if (checkDisk) {
        const disk = await fs.statfs(root);
        const required = Math.max(512 * 1024 ** 2, (job.spec.estimatedBytes || MAX_FILE_BYTES) * 2.2);
        if (disk.bavail * disk.bsize < required) throw new DownloadError("Not enough free disk space to prepare this video. Free space or choose a smaller format.", 507, "DISK_FULL");
      }
      if (signal.aborted) throw new Error("Cancelled");
      job.state = "downloading";
      job.phaseLabel = "Downloading video and audio";
      const result = await run(job.spec, {
        directory: target, signal, maxBytes: MAX_FILE_BYTES,
        onProgress(update) {
          if (signal.aborted) return;
          if (["downloading", "merging", "validating"].includes(update.state)) job.state = update.state;
          job.phaseLabel = { downloading: "Downloading video and audio", merging: "Joining video and audio", validating: "Checking the finished file" }[job.state];
          job.progress = Number.isFinite(update.progress) ? Math.max(0, Math.min(100, update.progress)) : null;
          if (Number.isFinite(update.downloadedBytes)) job.downloadedBytes = Math.max(0, update.downloadedBytes);
          if (Number.isFinite(update.totalBytes) && update.totalBytes > 0) job.totalBytes = update.totalBytes;
          job.progressEstimated = false;
          if (job.state === "downloading" && job.progress === null && job.spec.estimatedBytes) {
            job.totalBytes = job.spec.estimatedBytes;
            job.progress = Math.min(99, job.downloadedBytes / job.totalBytes * 100);
            job.progressEstimated = true;
          }
          job.updatedAt = now();
        },
      });
      if (signal.aborted) throw new Error("Cancelled");
      if (path.resolve(result.path) !== path.join(target, "media.mp4")) throw new Error("Invalid prepared path");
      const file = await fs.lstat(result.path);
      if (signal.aborted) throw new Error("Cancelled");
      if (!file.isFile() || file.isSymbolicLink() || file.size < 1024 || file.size > MAX_FILE_BYTES ||
          result.height !== job.spec.height || result.width !== job.spec.width ||
          ![result.audioCodec, result.videoCodec].every((codec) => typeof codec === "string" && codec.trim() && codec !== "none")) throw new Error("Invalid prepared media");
      job.result = { ...result, sizeBytes: file.size };
      job.state = "ready";
      job.phaseLabel = "Video and audio ready";
      job.progress = 100;
      job.progressEstimated = false;
      job.expiresAt = now() + ttlMs;
      job.updatedAt = now();
    } catch (error) {
      job.result = null;
      job.state = signal.aborted && !timedOut ? "cancelled" : "failed";
      job.error = timedOut ? "Preparation took too long. Try again or choose a smaller format."
        : signal.aborted ? "Preparation cancelled."
          : error instanceof DownloadError ? error.publicMessage
            : "Could not prepare this video. Refresh its formats and try again.";
      job.phaseLabel = job.state === "cancelled" ? "Preparation cancelled" : "Preparation failed";
      job.progress = null;
      job.expiresAt = now() + ttlMs;
      try { await removeFiles(job); } catch { /* A later sweep retries cleanup. */ }
    } finally {
      clearTimeout(timer);
      job.controller = null;
    }
  }
  async function start(id) {
    const job = get(id);
    if (!job) throw new DownloadError("This format link has expired. Find your media again.", 404, "JOB_EXPIRED");
    if (ACTIVE_STATES.has(job.state) || job.state === "ready") return snapshot(job);
    const revision = job.revision;
    if (job.promise) await job.promise;
    if (closed) throw new DownloadError("The app is shutting down.", 503);
    await checkRuntime();
    if (closed) throw new DownloadError("The app is shutting down.", 503);
    if (get(id) !== job) throw new DownloadError("This format link has expired. Find your media again.", 404, "JOB_EXPIRED");
    if (job.revision !== revision) return snapshot(job);
    // A simultaneous prepare request may have queued this same record while the
    // runtime check yielded. Recheck before adding it to the queue.
    if (ACTIVE_STATES.has(job.state) || job.state === "ready") return snapshot(job);
    if (queue.length >= maxQueued && active >= maxActive) throw new DownloadError("The HD queue is full. Wait for a preparation to finish and try again.", 503, "MERGE_BUSY");
    job.state = "queued";
    job.phaseLabel = "Waiting for a preparation slot";
    job.error = null;
    job.progress = null;
    job.downloadedBytes = 0;
    job.totalBytes = job.spec.estimatedBytes;
    job.expiresAt = now() + timeoutMs + ttlMs;
    job.updatedAt = now();
    queue.push(job);
    drain();
    return snapshot(job);
  }
  async function cancel(id) {
    const job = get(id);
    if (!job) throw new DownloadError("This format link has expired. Find your media again.", 404);
    if (job.state === "ready") return snapshot(job);
    job.revision++;
    if (job.state === "idle" || job.state === "queued") {
      const index = queue.indexOf(job);
      if (index !== -1) queue.splice(index, 1);
      job.state = "cancelled";
      job.phaseLabel = "Preparation cancelled";
      job.error = "Preparation cancelled.";
      job.expiresAt = now() + ttlMs;
    }
    job.controller?.abort();
    if (job.promise) await job.promise;
    return snapshot(job);
  }
  function lease(id) {
    const job = get(id);
    if (!job || job.state !== "ready" || !job.result) return null;
    job.readers++;
    let released = false;
    return { path: job.result.path, filename: job.spec.filename, sizeBytes: job.result.sizeBytes,
      release() { if (!released) { released = true; job.readers--; } } };
  }
  async function close() {
    closed = true;
    clearInterval(sweeper);
    for (const job of jobs.values()) job.controller?.abort();
    await Promise.allSettled([...jobs.values()].map((job) => job.promise).filter(Boolean));
  }
  return { createLink, get, status: (id) => snapshot(get(id)), start, cancel, lease, prune, close };
}
const youtubeJobs = createYouTubeJobManager();
const createYouTubeJobLink = (spec) => youtubeJobs.createLink(spec);
module.exports = { createYouTubeJobLink, createYouTubeJobManager, youtubeJobs, validateSpec, MAX_FILE_BYTES };
