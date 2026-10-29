const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { lstat, readdir } = require("node:fs/promises");
const path = require("node:path");
const { StringDecoder } = require("node:string_decoder");
const { DownloadError } = require("./downloadError");
const { runtimePath, extractionError } = require("./ytDlp");

const MAX_BYTES = 4 * 1024 ** 3;
const STDERR_LIMIT = 65536;
const FORMAT_ID = /^[0-9A-Za-z][0-9A-Za-z_-]{0,63}$/;

function runtimePaths() {
  const binaryDirectory = path.join(__dirname, "..", ".runtime", "ffmpeg", "bin");
  const suffix = process.platform === "win32" ? ".exe" : "";
  return {
    ytDlp: runtimePath(),
    ffmpeg: process.env.FFMPEG_PATH || path.join(binaryDirectory, "ffmpeg" + suffix),
    ffprobe: process.env.FFPROBE_PATH || path.join(binaryDirectory, "ffprobe" + suffix),
  };
}
function checkRuntime(paths = runtimePaths()) {
  if (!paths.ytDlp || !existsSync(paths.ytDlp)) {
    throw new DownloadError("The local downloader is missing. Run npm run setup:downloader and try again.", 503, "DOWNLOADER_MISSING");
  }
  if (!paths.ffmpeg || !paths.ffprobe || !existsSync(paths.ffmpeg) || !existsSync(paths.ffprobe)) {
    throw new DownloadError("HD downloads need FFmpeg and ffprobe. Run npm run setup:ffmpeg, or set FFMPEG_PATH and FFPROBE_PATH.", 503, "FFMPEG_MISSING");
  }
  return paths;
}
function cancellationError() {
  return new DownloadError("Download preparation cancelled.", 499, "REQUEST_CANCELLED");
}
function limitError() {
  return new DownloadError("This download exceeds the 4 GiB file limit. Choose a lower resolution or a shorter video.", 413, "MEDIA_TOO_LARGE");
}
function stopTree(child) {
  if (!child.pid || child.exitCode !== null) return Promise.resolve();
  if (process.platform === "win32") {
    const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    return new Promise((resolve) => {
      const killer = spawn(executable, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", shell: false });
      killer.on("error", () => { child.kill(); resolve(); });
      killer.on("close", resolve);
    });
  } else {
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    return Promise.resolve();
  }
}
function buildMergeArgs(spec, directory, paths = runtimePaths(), maxBytes = MAX_BYTES) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(spec.videoId || "")
      || spec.sourceUrl !== "https://www.youtube.com/watch?v=" + spec.videoId
      || !FORMAT_ID.test(spec.videoFormatId || "") || !FORMAT_ID.test(spec.audioFormatId || "")
      || !Number.isSafeInteger(maxBytes) || maxBytes <= 0
      || !path.isAbsolute(directory)) throw new DownloadError("Invalid HD download request.", 400, "INVALID_MEDIA_REQUEST");
  return [
    "--ignore-config", "--no-plugin-dirs", "--no-playlist", "--no-cache-dir", "--no-warnings",
    "--no-colors", "--newline", "--progress", "--progress-delta", "0.5",
    "--progress-template", "download:__UD_PROGRESS__%(info.format_id)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s",
    "--socket-timeout", "20", "--retries", "3", "--fragment-retries", "3", "--extractor-retries", "1",
    "--abort-on-unavailable-fragments", "--no-continue", "--force-overwrites",
    "--no-js-runtimes", "--js-runtimes", "node:" + process.execPath, "--use-extractors", "youtube",
    "--ffmpeg-location", paths.ffmpeg,
    "--format", spec.videoFormatId + "+" + spec.audioFormatId,
    "--merge-output-format", "mp4",
    "--postprocessor-args", "Merger+ffmpeg_o:-movflags +faststart",
    "--max-filesize", String(maxBytes), "--output", path.join(directory, "media.%(ext)s"),
    "--", spec.sourceUrl,
  ];
}
function positiveNumber(value) {
  if (value === "NA" || value === "None" || value === "" || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function createProgressTracker(formatIds) {
  const records = new Map(formatIds.map((id) => [id, { downloaded: 0, total: null }]));
  return (line) => {
    const match = line.match(/^__UD_PROGRESS__([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)$/);
    if (!match || !records.has(match[1])) return null;
    const record = records.get(match[1]);
    const downloaded = positiveNumber(match[2]);
    if (downloaded !== null) record.downloaded = Math.max(record.downloaded, downloaded);
    const total = positiveNumber(match[3]) || positiveNumber(match[4]);
    if (total) record.total = Math.max(total, record.downloaded);
    const entries = [...records.values()];
    const downloadedBytes = entries.reduce((sum, item) => sum + item.downloaded, 0);
    const totalBytes = entries.every((item) => item.total) ? entries.reduce((sum, item) => sum + item.total, 0) : null;
    return {
      state: "downloading", downloadedBytes, totalBytes,
      progress: totalBytes ? Math.min(100, downloadedBytes / totalBytes * 100) : null,
      phaseLabel: match[1] === formatIds[0] ? "Downloading video" : "Downloading audio",
    };
  };
}

// Every rejected run waits for process close. On Windows, taskkill also stops the
// FFmpeg child, so the job owner can safely remove temporary files afterward.
function runChild(executable, args, { signal, cwd, onLine, inspect, maxOutputBytes = 1024 * 1024, timeoutMs = 30 * 60000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancellationError()); return; }
    const child = spawn(executable, args, {
      shell: false, windowsHide: true, detached: process.platform !== "win32",
      cwd, stdio: ["ignore", "pipe", "pipe"],
    });
    const decoder = new StringDecoder("utf8");
    let output = "";
    let lineBuffer = "";
    let outputBytes = 0;
    let stderr = "";
    let failure = null;
    let stopTask = Promise.resolve();
    let closed = false;
    let inspectTask = Promise.resolve();
    let inspecting = false;
    const fail = (error) => {
      if (failure) return;
      failure = error;
      if (!closed) stopTask = stopTree(child);
    };
    const abort = () => fail(cancellationError());
    signal?.addEventListener("abort", abort, { once: true });
    const deadline = setTimeout(() => fail(new DownloadError("Download preparation took too long. Try a shorter video or a lower resolution.", 504, "ETIMEDOUT")), timeoutMs);
    const monitor = inspect ? setInterval(() => {
      if (inspecting || closed || failure) return;
      inspecting = true;
      inspectTask = inspect().catch(fail).finally(() => { inspecting = false; });
    }, 1000) : null;
    child.stdout.on("data", (chunk) => {
      if (failure || closed) return;
      const text = decoder.write(chunk);
      if (onLine) {
        lineBuffer += text;
        if (lineBuffer.length > 65536) { fail(new DownloadError("The downloader returned too much progress data.", 502, "INVALID_DOWNLOAD_OUTPUT")); return; }
        let end;
        while ((end = lineBuffer.indexOf("\n")) !== -1) {
          const line = lineBuffer.slice(0, end).replace(/\r$/, "");
          lineBuffer = lineBuffer.slice(end + 1);
          try { onLine(line); } catch (error) { fail(error); }
        }
      } else {
        outputBytes += chunk.length;
        if (outputBytes > maxOutputBytes) { fail(new DownloadError("The media validator returned too much data.", 502, "INVALID_DOWNLOAD_OUTPUT")); return; }
        output += text;
      }
    });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-STDERR_LIMIT); });
    child.on("error", () => fail(new DownloadError("The local media tools could not start. Check the downloader and FFmpeg installation.", 503, "MEDIA_TOOL_START_FAILED")));
    child.on("close", async (code) => {
      if (closed) return;
      closed = true;
      clearTimeout(deadline);
      if (monitor) clearInterval(monitor);
      signal?.removeEventListener("abort", abort);
      await inspectTask;
      await stopTask;
      if (!failure && signal?.aborted) failure = cancellationError();
      if (failure) { reject(failure); return; }
      if (code !== 0) {
        reject(/no space left|disk.*full|not enough space/i.test(stderr)
          ? new DownloadError("There is not enough free disk space to prepare this file.", 507, "DISK_FULL")
          : extractionError(stderr));
        return;
      }
      if (onLine && lineBuffer.trim()) {
        try { onLine(lineBuffer.trim()); } catch (error) { reject(error); return; }
      }
      resolve(output + decoder.end());
    });
    if (signal?.aborted) abort();
  });
}
async function inspectScratch(directory, maxBytes) {
  let total = 0;
  let tracks = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new DownloadError("Invalid temporary media file.", 502, "INVALID_MEDIA_FILE");
    if (!entry.isFile()) continue;
    let stat;
    try { stat = await lstat(path.join(directory, entry.name)); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new DownloadError("Invalid temporary media file.", 502, "INVALID_MEDIA_FILE");
    total += stat.size;
    if (/^media\.f[0-9A-Za-z_-]+\./.test(entry.name)) tracks += stat.size;
  }
  if (tracks > maxBytes || total > 2 * maxBytes + 64 * 1024 * 1024) throw limitError();
}
function frameRate(value) {
  if (typeof value !== "string") return null;
  const parts = value.split("/").map(Number);
  const rate = parts.length === 2 && parts[1] ? parts[0] / parts[1] : Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
function codecName(value) {
  const code = String(value || "").toLowerCase();
  if (/^(avc1|avc3|h264)/.test(code)) return "h264";
  if (/^(vp09|vp9)/.test(code)) return "vp9";
  if (/^(av01|av1)/.test(code)) return "av1";
  if (/^(hvc1|hev1|hevc)/.test(code)) return "hevc";
  if (/^(mp4a|aac)/.test(code)) return "aac";
  if (/^opus/.test(code)) return "opus";
  return null;
}
function validateProbe(probe, spec) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const length = Number(probe?.format?.duration);
  const fps = frameRate(video?.avg_frame_rate) || frameRate(video?.r_frame_rate);
  if (!video || !audio || !video.codec_name || !audio.codec_name
      || !Number.isInteger(video.width) || video.width < 1 || !Number.isInteger(video.height)
      || video.height !== spec.height || (spec.width && video.width !== spec.width)
      || !Number.isFinite(length) || length <= 0
      || (spec.duration && Math.abs(length - spec.duration) > Math.max(2, spec.duration * 0.01))
      || (spec.fps && fps && Math.abs(spec.fps - fps) > 1)
      || (codecName(spec.videoCodec) && video.codec_name !== codecName(spec.videoCodec))
      || (codecName(spec.audioCodec) && audio.codec_name !== codecName(spec.audioCodec))) {
    throw new DownloadError("The prepared file did not contain the complete requested video and audio. Try preparing it again.", 502, "INVALID_MERGED_MEDIA");
  }
  return { width: video.width, height: video.height, fps, videoCodec: video.codec_name, audioCodec: audio.codec_name, duration: length };
}
async function runYouTubeMerge(spec, { directory, signal, onProgress = () => {}, maxBytes = MAX_BYTES } = {}) {
  const paths = checkRuntime();
  const args = buildMergeArgs(spec, directory, paths, maxBytes);
  if (signal?.aborted) throw cancellationError();
  const folder = await lstat(directory);
  if (!folder.isDirectory() || folder.isSymbolicLink()) throw new DownloadError("Invalid media workspace.", 502, "INVALID_MEDIA_FILE");
  const track = createProgressTracker([spec.videoFormatId, spec.audioFormatId]);
  onProgress({ state: "downloading", progress: null, downloadedBytes: 0, totalBytes: null, phaseLabel: "Connecting to YouTube" });
  let lastProgress = { downloadedBytes: 0, totalBytes: null };
  await runChild(paths.ytDlp, args, {
    signal, cwd: directory,
    inspect: () => inspectScratch(directory, maxBytes),
    onLine(line) {
      if (/larger than max-filesize|File is larger than/i.test(line)) throw limitError();
      const progress = track(line);
      if (progress) {
        lastProgress = progress;
        if (progress.downloadedBytes > maxBytes) throw limitError();
        onProgress(progress);
      } else if (line.startsWith("[Merger]") || line.startsWith("[VideoRemuxer]")) {
        onProgress({ state: "merging", progress: null, downloadedBytes: lastProgress.downloadedBytes, totalBytes: lastProgress.totalBytes, phaseLabel: "Combining video and audio" });
      }
    },
  });
  if (signal?.aborted) throw cancellationError();
  const destination = path.join(directory, "media.mp4");
  let stat;
  try { stat = await lstat(destination); }
  catch { throw new DownloadError("YouTube did not return both requested tracks. Refresh the formats and try again.", 502, "MERGED_MEDIA_MISSING"); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1024) throw new DownloadError("The prepared media file was invalid.", 502, "INVALID_MEDIA_FILE");
  if (stat.size > maxBytes) throw limitError();
  onProgress({ state: "validating", progress: null, downloadedBytes: stat.size, totalBytes: stat.size, phaseLabel: "Checking resolution and audio" });
  const output = await runChild(paths.ffprobe, [
    "-v", "error", "-show_entries",
    "stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate:format=duration,size",
    "-of", "json", destination,
  ], { signal, cwd: directory, timeoutMs: 60000 });
  let probe;
  try { probe = JSON.parse(output); }
  catch { throw new DownloadError("Could not validate the prepared media file.", 502, "INVALID_MERGED_MEDIA"); }
  return { path: destination, sizeBytes: stat.size, ...validateProbe(probe, spec) };
}

module.exports = { runYouTubeMerge, runtimePaths, checkRuntime, buildMergeArgs, createProgressTracker, validateProbe, runChild, inspectScratch };
