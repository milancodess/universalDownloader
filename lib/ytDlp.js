const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { DownloadError } = require("./downloadError");

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_CONCURRENT = 3;
const EXTRACT_TIMEOUT_MS = 60000;

function runtimePath() {
  return process.env.YTDLP_PATH || path.join(__dirname, "..", ".runtime", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
}

function buildArgs(url, extractor) {
  if (!["youtube", "Instagram"].includes(extractor)) throw new Error("Unsupported extractor");
  const args = [
    "--ignore-config", "--no-plugin-dirs", "--no-playlist", "--playlist-end", "20",
    "--no-cache-dir", "--no-warnings", "--no-progress", "--skip-download", "--dump-single-json",
    "--socket-timeout", "15", "--retries", "1", "--extractor-retries", "1",
    "--no-js-runtimes", "--js-runtimes", `node:${process.execPath}`,
    "--use-extractors", extractor,
  ];
  // Metadata must also succeed for videos with only separate adaptive streams.
  // Actual download jobs later request the exact format IDs selected by the user.
  if (extractor === "youtube") args.push("--format", "bv[protocol=https]+ba[protocol=https]/b[protocol=https]");
  if (extractor === "Instagram") args.push("--ignore-no-formats-error");
  // No shell, user configuration, browser cookies, or downloaded plugins.
  args.push("--", url);
  return args;
}

function extractionError(stderr) {
  if (/sign in|log[ -]?in|cookies|private video|private account|not a bot|challenge/i.test(stderr)) {
    return new DownloadError("This post requires sign-in or is restricted by the platform. Try a public, unrestricted link.", 422, "MEDIA_RESTRICTED");
  }
  if (/not available|unavailable|removed|does not exist|no video|no media|no formats|requested format/i.test(stderr)) {
    return new DownloadError("No downloadable media is available at this link. Check that the post is public and still exists.", 422, "MEDIA_UNAVAILABLE");
  }
  if (/timed out|timeout/i.test(stderr)) {
    return new DownloadError("The platform took too long to respond. Please try again.", 504, "ETIMEDOUT");
  }
  return new DownloadError("Could not retrieve media from the platform. Please try again or use another public link.");
}

function stopProcess(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const taskkill = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    const killer = spawn(taskkill, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    killer.on("error", () => child.kill());
    killer.unref();
  } else {
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
  }
}

function createExtractor({ spawnProcess = spawn, exists = existsSync, getPath = runtimePath, timeout = EXTRACT_TIMEOUT_MS, stop = stopProcess } = {}) {
  let active = 0;
  return async function extractInfo(url, { extractor, signal } = {}) {
    const args = buildArgs(url, extractor);
    const executable = getPath();
    if (!exists(executable)) throw new DownloadError("The local downloader is not installed. Run npm run setup:downloader, then try again.", 503, "DOWNLOADER_MISSING");
    if (signal?.aborted) throw new DownloadError("Request cancelled.", 499, "REQUEST_CANCELLED");
    if (active >= MAX_CONCURRENT) throw new DownloadError("The downloader is busy. Wait for another request to finish and try again.", 503, "DOWNLOADER_BUSY");
    active++;
    try {
      return await new Promise((resolve, reject) => {
        const child = spawnProcess(executable, args, {
          shell: false, windowsHide: true, detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe"],
        });
        const chunks = [];
        let bytes = 0;
        let stderr = "";
        let settled = false;
        let failure = null;
        const timer = setTimeout(() => fail(new DownloadError("The platform took too long to respond. Please try again.", 504, "ETIMEDOUT")), timeout);
        const cancel = () => fail(new DownloadError("Request cancelled.", 499, "REQUEST_CANCELLED"));
        signal?.addEventListener("abort", cancel, { once: true });

        function fail(error) {
          if (settled || failure) return;
          failure = error;
          chunks.length = 0;
          stop(child);
          // Keep this extraction slot occupied until the subprocess closes.
          // Cancellation must not allow a new process to race a still-live one.
        }

        function finish(error, info) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener("abort", cancel);
          if (error) reject(error);
          else resolve(info);
        }

        child.stdout.on("data", (chunk) => {
          if (settled || failure) return;
          bytes += chunk.length;
          if (bytes > MAX_OUTPUT_BYTES) return fail(new DownloadError("The platform returned too much metadata. Try a single post or video.", 502, "METADATA_TOO_LARGE"));
          chunks.push(chunk);
        });
        child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-65536); });
        child.on("error", () => fail(new DownloadError("The local downloader could not start. Run npm run setup:downloader and try again.", 503, "DOWNLOADER_START_FAILED")));
        child.on("close", (code) => {
          if (settled) return;
          if (failure) return finish(failure);
          if (code !== 0) return finish(extractionError(stderr));
          try {
            const info = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!info || typeof info !== "object" || Array.isArray(info)) throw new Error("Invalid metadata");
            finish(null, info);
          } catch { finish(new DownloadError("The platform returned invalid media information.")); }
        });
        if (signal?.aborted) cancel();
      });
    } finally { active--; }
  };
}

module.exports = { extractInfo: createExtractor(), createExtractor, buildArgs, extractionError, runtimePath, EXTRACT_TIMEOUT_MS };
